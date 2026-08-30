// BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01 — explicit proof
// of section 4's mandate: once a per-source acquisition engine (like
// ingestion/programme-acquisition/source-execution.mjs's acquireSource())
// has already exhausted its own bounded retry budget and returned a
// terminal result, this worker must NEVER interpret that as an exception
// requiring another outer acquisition retry. A SourceTask.run() that
// RETURNS `{outcome: "FAILED", ...}` (never throws) is recorded on the
// FIRST call; only a THROWN exception is subject to this runner's own,
// separate, orthogonal outer retry policy.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { loadSourceCheckpoints } from "../../ingestion/city-worker/checkpoint-store.mjs";
import { runCityJob } from "../../ingestion/city-worker/runner.mjs";
import { instantRetryPolicy } from "./helpers/synthetic-city.mjs";

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-one-retry-owner-"));
}

async function queuedJob(root, jobId) {
  const job = createCityJob({ jobId, country: "ZZ", city: "Testcity", createdAt: "2026-08-29T00:00:00.000Z" });
  await saveJob(job, { root });
}

test("a SourceTask.run() that RETURNS {outcome:\"FAILED\"} is terminal on the first call — never outer-retried", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await queuedJob(root, "job-failed-terminal");

  let callCount = 0;
  const resolveSourceTasks = async () => [
    {
      source_id: "src-already-exhausted",
      run: async () => {
        callCount += 1;
        // Simulates acquireSource() having already retried internally and
        // returned a terminal NETWORK_FAILURE, mapped by
        // mapAcquisitionResultToCheckpoint() to a non-throwing FAILED
        // outcome — this worker must accept that as-is.
        return { outcome: "FAILED", error: "NETWORK_FAILURE (already retried 3x internally)", source_state: "NETWORK_FAILURE" };
      },
    },
  ];

  const finalJob = await runCityJob("job-failed-terminal", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });

  assert.equal(callCount, 1, "run() must be called exactly once — the worker's own outer retry must never fire for a returned (non-thrown) FAILED outcome");
  assert.equal(finalJob.failed_sources, 1);
  assert.equal(finalJob.state, "COMPLETE_WITH_RESIDUE");

  const checkpoints = await loadSourceCheckpoints("job-failed-terminal", { root });
  const record = checkpoints.get("src-already-exhausted");
  assert.equal(record.status, "FAILED");
  assert.equal(record.attempts, 1, "the checkpoint's own attempts count must reflect ONE worker-level call, not the source engine's own internal retry count");
  assert.equal(record.source_state, "NETWORK_FAILURE", "the original repository state is preserved in the checkpoint detail");
});

test("a SourceTask.run() that RETURNS {outcome:\"RESIDUE\"} is likewise terminal on the first call", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await queuedJob(root, "job-residue-terminal");

  let callCount = 0;
  const resolveSourceTasks = async () => [
    { source_id: "src-residue", run: async () => { callCount += 1; return { outcome: "RESIDUE", residue_reason: "BROWSER_REQUIRED" }; } },
  ];

  const finalJob = await runCityJob("job-residue-terminal", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });
  assert.equal(callCount, 1);
  assert.equal(finalJob.residue_sources, 1);
});

test("contrast case: a SourceTask.run() that THROWS is still subject to this runner's OWN separate outer retry policy", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await queuedJob(root, "job-throws");

  let callCount = 0;
  const resolveSourceTasks = async () => [
    {
      source_id: "src-throws",
      run: async () => {
        callCount += 1;
        if (callCount < 3) throw new Error("transport failure: simulated");
        return { outcome: "SUCCESS" };
      },
    },
  ];

  const finalJob = await runCityJob("job-throws", { root, resolveSourceTasks, retryPolicy: { ...instantRetryPolicy, maxAttempts: 3 } });
  assert.equal(callCount, 3, "an actually-thrown exception is a genuinely different, orthogonal concern from an already-terminal returned result, and IS retried by this runner's own bounded policy");
  assert.equal(finalJob.successful_sources, 1);
});

test("a fake multi-attempt acquisition engine's OWN internal retries are invisible to (never doubled by) the worker's outer call count", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await queuedJob(root, "job-internal-retries-hidden");

  let workerLevelCalls = 0;
  // Simulates a real acquireSource()-shaped adapter: internally it might
  // have made several fetch attempts (not observable here), but from the
  // worker's perspective this is exactly ONE call to run().
  async function fakeAcquireSourceAdapter() {
    let internalAttempts = 0;
    for (let i = 0; i < 3; i += 1) internalAttempts += 1; // stands in for acquireSource()'s own internal withRetries loop
    return { outcome: "FAILED", error: "NETWORK_FAILURE", internal_attempts_hidden_from_worker: internalAttempts };
  }

  const resolveSourceTasks = async () => [
    { source_id: "src-adapter", run: async () => { workerLevelCalls += 1; return fakeAcquireSourceAdapter(); } },
  ];

  await runCityJob("job-internal-retries-hidden", { root, resolveSourceTasks, retryPolicy: instantRetryPolicy });
  assert.equal(workerLevelCalls, 1, "the worker's own call count must reflect ONE invocation regardless of how many attempts the source engine made internally");

  const checkpoints = await loadSourceCheckpoints("job-internal-retries-hidden", { root });
  assert.equal(checkpoints.get("src-adapter").attempts, 1);
});
