// Proves items A, B, C, D, E, F, G, H, I, L of
// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01's own brief, against
// synthetic fixture cities only (fixtures/city-worker/synthetic-estates.json)
// — never the real London/Berlin estate.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { saveJob, loadJob } from "../../ingestion/city-worker/job-store.mjs";
import { loadSourceCheckpoints, markSourceRunning } from "../../ingestion/city-worker/checkpoint-store.mjs";
import { runCityJob } from "../../ingestion/city-worker/runner.mjs";
import { makeResolver, loadSyntheticEstateFrom, instantRetryPolicy } from "./helpers/synthetic-city.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-test-"));
}

async function makeQueuedJob(root, { jobId, country, city }) {
  const job = createCityJob({ jobId, country, city, estateRef: `${country}/${city}`, createdAt: "2026-08-29T00:00:00.000Z" });
  await saveJob(job, { root });
  return job;
}

test("A: an arbitrary synthetic city can be enqueued", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const job = await makeQueuedJob(root, { jobId: "job-a", country: "ZZ", city: "Testcity Alpha" });
  const reloaded = await loadJob("job-a", { root });
  assert.equal(reloaded.state, "QUEUED");
  assert.equal(reloaded.country, "ZZ");
  assert.equal(reloaded.city, "Testcity Alpha");
  assert.equal(job.job_id, "job-a");
});

test("B: worker processes all sources in the estate", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-b", country: "ZZ", city: "Testcity Alpha" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-alpha");
  const resolveSourceTasks = makeResolver(sourceIds);

  const finalJob = await runCityJob("job-b", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  assert.equal(finalJob.state, "COMPLETE");
  assert.equal(finalJob.total_sources, sourceIds.length);
  assert.equal(finalJob.successful_sources, sourceIds.length);

  const checkpoints = await loadSourceCheckpoints("job-b", { root });
  assert.equal(checkpoints.size, sourceIds.length);
  for (const sourceId of sourceIds) {
    assert.equal(checkpoints.get(sourceId).status, "SUCCESS");
  }
});

test("C: one source failure does not halt the rest of the city", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-c", country: "ZZ", city: "Testcity Alpha" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-alpha");
  const resolveSourceTasks = makeResolver(sourceIds, {
    "alpha-venue-3": { throws: Object.assign(new Error("permanent parse failure"), {}) },
  });

  const finalJob = await runCityJob("job-c", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  assert.equal(finalJob.completed_sources, sourceIds.length, "every source reached a terminal state, including the failing one");
  assert.equal(finalJob.failed_sources, 1);
  assert.equal(finalJob.successful_sources, sourceIds.length - 1);
  assert.equal(finalJob.state, "COMPLETE_WITH_RESIDUE", "one failed venue never fails the whole city job");
});

test("D: checkpoint survives process restart", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-d", country: "ZZ", city: "Testcity Alpha" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-alpha");
  const callLog = [];
  const resolveSourceTasks = makeResolver(sourceIds, {}, { callLog });

  // Simulate a process that dies after the first batch: stop as soon as
  // anything has been checkpointed.
  let stopAfterFirstBatch = false;
  const firstRun = await runCityJob("job-d", {
    root,
    resolveSourceTasks,
    concurrency: 1,
    retryPolicy: instantRetryPolicy,
    shouldStop: () => {
      const shouldStopNow = stopAfterFirstBatch;
      stopAfterFirstBatch = true;
      return shouldStopNow;
    },
  });

  assert.equal(firstRun.state, "RUNNING", "process died mid-job — never a terminal state");
  assert.ok(firstRun.completed_sources < sourceIds.length);
  const checkpointsAfterCrash = await loadSourceCheckpoints("job-d", { root });
  assert.ok(checkpointsAfterCrash.size >= 1, "at least one source's terminal checkpoint survived the simulated crash");

  // "Restart": a fresh call, no in-memory state carried over except what
  // runCityJob reads back from disk.
  const callsBeforeRestart = callLog.length;
  const secondRun = await runCityJob("job-d", { root, resolveSourceTasks, concurrency: 1, retryPolicy: instantRetryPolicy });

  assert.equal(secondRun.state, "COMPLETE");
  assert.equal(secondRun.total_sources, sourceIds.length);
  // Every already-checkpointed source's run() was never called again.
  const distinctSourcesCalledAfterRestart = new Set(callLog.slice(callsBeforeRestart).map((c) => c.source_id));
  const alreadyDoneBeforeRestart = new Set(checkpointsAfterCrash.keys());
  for (const sourceId of alreadyDoneBeforeRestart) {
    assert.ok(!distinctSourcesCalledAfterRestart.has(sourceId), `${sourceId} was already checkpointed and must not be re-run`);
  }
});

test("E: rerun resumes rather than repeating already-completed work", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-e", country: "ZZ", city: "Testcity Beta" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-beta");
  const callLog = [];
  const resolveSourceTasks = makeResolver(sourceIds, {}, { callLog });

  await runCityJob("job-e", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });
  assert.equal(callLog.length, sourceIds.length, "first run calls every source exactly once");

  // Re-running an already-COMPLETE job is a safe, idempotent no-op — not
  // "restart all N again".
  const rerun = await runCityJob("job-e", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });
  assert.equal(rerun.state, "COMPLETE");
  assert.equal(callLog.length, sourceIds.length, "no source was re-invoked on the idempotent rerun");
});

test("F + G: residue is retained separately and the job completes WITH residue", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-fg", country: "ZZ", city: "Testcity Alpha" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-alpha");
  const resolveSourceTasks = makeResolver(sourceIds, {
    "alpha-venue-2": { outcome: "RESIDUE", residue_reason: "BROWSER_REQUIRED", detail: "requires headless rendering" },
    "alpha-venue-4": { outcome: "RESIDUE", residue_reason: "SOCIAL_FIRST_PROGRAMME" },
  });

  const finalJob = await runCityJob("job-fg", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  assert.equal(finalJob.state, "COMPLETE_WITH_RESIDUE");
  assert.equal(finalJob.residue_sources, 2);
  assert.equal(finalJob.successful_sources, sourceIds.length - 2);

  const checkpoints = await loadSourceCheckpoints("job-fg", { root });
  assert.equal(checkpoints.get("alpha-venue-2").status, "RESIDUE");
  assert.equal(checkpoints.get("alpha-venue-2").residue_reason, "BROWSER_REQUIRED");
  assert.equal(checkpoints.get("alpha-venue-4").residue_reason, "SOCIAL_FIRST_PROGRAMME");
  // Residue never counted as a plain failure.
  assert.equal(finalJob.failed_sources, 0);
});

test("H: country/city metadata does not influence collector routing", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const sourceIds = ["shared-source-1", "shared-source-2"];
  const callLog = [];
  const resolveSourceTasks = makeResolver(sourceIds, {}, { callLog });

  await makeQueuedJob(root, { jobId: "job-h1", country: "ZZ", city: "Testcity Alpha" });
  await makeQueuedJob(root, { jobId: "job-h2", country: "YY", city: "Testcity Beta" });

  const jobOne = await runCityJob("job-h1", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });
  const jobTwo = await runCityJob("job-h2", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  // The exact same resolver, with the exact same outcome, produces the
  // exact same per-source result regardless of which job's
  // country/city it was attached to — proving the runner never
  // branches on that metadata.
  assert.equal(jobOne.successful_sources, jobTwo.successful_sources);
  assert.equal(jobOne.total_sources, jobTwo.total_sources);
});

test("I: the deterministic worker invokes an injected city acquisition interface rather than duplicating collector logic", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-i", country: "ZZ", city: "Testcity Beta" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-beta");

  // Stands in for an "existing city acquisition interface" — the runner
  // never contains this logic itself, only calls into it via
  // resolveSourceTasks.
  let existingInterfaceCallCount = 0;
  async function existingCityAcquisitionInterface(ids) {
    existingInterfaceCallCount += 1;
    return ids.map((id) => ({ source_id: id, observation_count: 7 }));
  }

  async function resolveSourceTasks() {
    const results = await existingCityAcquisitionInterface(sourceIds);
    return results.map((result) => ({
      source_id: result.source_id,
      run: async () => ({ outcome: "SUCCESS", observation_count: result.observation_count }),
    }));
  }

  const finalJob = await runCityJob("job-i", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  assert.equal(existingInterfaceCallCount, 1, "the existing interface was invoked, not reimplemented");
  assert.equal(finalJob.state, "COMPLETE");
  const checkpoints = await loadSourceCheckpoints("job-i", { root });
  for (const sourceId of sourceIds) {
    assert.equal(checkpoints.get(sourceId).observation_count, 7, "the existing interface's own result data passed through unchanged");
  }
});

test("L: a crash during a source leaves recoverable (not lost, not falsely-complete) state", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeQueuedJob(root, { jobId: "job-l", country: "ZZ", city: "Testcity Beta" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-beta");

  // Simulate exactly what a hard process kill leaves behind: a RUNNING
  // marker for one source, with no terminal checkpoint ever written for
  // it, while another source did complete before the crash.
  await markSourceRunning("job-l", sourceIds[0], { root, startedAt: "2026-08-29T00:00:00.000Z" });

  const callLog = [];
  const resolveSourceTasks = makeResolver(sourceIds, {}, { callLog });
  const finalJob = await runCityJob("job-l", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  assert.equal(finalJob.state, "COMPLETE");
  // The source left RUNNING by the "crash" was re-attempted, not skipped.
  assert.ok(callLog.some((c) => c.source_id === sourceIds[0]), "a source stuck RUNNING must be re-attempted, never assumed complete");
  const checkpoints = await loadSourceCheckpoints("job-l", { root });
  assert.equal(checkpoints.get(sourceIds[0]).status, "SUCCESS");
});
