// BEATMAPPED-CITY-JOB-OPERATOR-CANCEL-CONTROL-01 — cooperative
// cancellation of one city job.
//
// THE DEFECT THIS PACKAGE FOUND AND CLOSED. Before it, `cancel-job` on a
// RUNNING job was silently ineffective, twice over:
//
//   1. runCityJob() checked `job.cancel_requested` on the record it had
//      loaded ONCE at the start, so a request written by the operator's
//      separate CLI process was never observed; and
//   2. its own progress saves wrote that stale `false` back over the
//      operator's `true`, erasing the request from disk.
//
// ...and even had the flag survived, the terminal decision was gated on
// `allTerminal`, so a partially-done cancelled job fell through to
// "RUNNING" — where queue.mjs then permanently skips it for having
// cancel_requested set, stranding it as RUNNING forever.
//
// The first two tests below reproduce exactly those failure modes against
// the real runner, so they can never silently return.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { loadJob, saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob, pickNextRunnableJobId } from "../../ingestion/city-worker/queue.mjs";
import { runCityJob } from "../../ingestion/city-worker/runner.mjs";
import { drainQueueOnce } from "../../ingestion/city-worker/worker-loop.mjs";
import { loadSourceCheckpoints, recordSourceResult } from "../../ingestion/city-worker/checkpoint-store.mjs";
import { materialiseJobEstate } from "../../ingestion/city-worker/city-estate-catalogue.mjs";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../ingestion/city-worker/cli.mjs", import.meta.url));

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "cancel-control-"));
}

/** A durable job with a real frozen estate snapshot, exactly as the governed enqueue creates one. */
async function seedJob(root, { jobId, city = "Alpha", sourceIds, state = "QUEUED", key = "synthetic-estate" }) {
  const estateRef = await materialiseJobEstate({
    jobId,
    estate: { key, country: "ZZ", city, selection: "ALL_ACTIVE", registry: "sources/synthetic-city.json", source_ids: sourceIds },
    materialisedAt: "2026-08-30T00:00:00.000Z",
    root,
  });
  const job = createCityJob({ jobId, country: "ZZ", city, estateRef, createdAt: "2026-08-30T00:00:00.000Z", runnerVersionSha: "abc1234", configuration: { city_estate_key: key } });
  await saveJob({ ...job, state }, { root });
  await enqueueJob(jobId, { root });
  return estateRef;
}

/** The operator's cancel, exercised through the REAL CLI subprocess (what the Action runs over SSH). */
async function cliCancel(root, jobId) {
  const { stdout } = await execFileAsync(process.execPath, [CLI, "cancel-job", jobId, `--root=${root}`]);
  return JSON.parse(stdout);
}

/**
 * Source tasks that pause long enough for a cancel to land mid-city, and
 * record the exact order sources were STARTED — the only way to prove
 * "source N+1 never began".
 */
function delayedTasks(sourceIds, started, { delayMs = 120, onStart } = {}) {
  return async () =>
    sourceIds.map((id) => ({
      source_id: id,
      run: async () => {
        started.push(id);
        if (onStart) await onStart(id);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
        return { outcome: "SUCCESS", observation_count: 1 };
      },
    }));
}

// ---------------------------------------------------------------------------
// §20 — RUNNING cancellation (the defect, and the fix)
// ---------------------------------------------------------------------------

test("20: a cancel written to disk WHILE a source is in flight is observed — the in-flight source finishes, the next never starts, and the job becomes CANCELLED", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-run", sourceIds: ["s1", "s2", "s3", "s4"] });

  const started = [];
  // The operator's cancel lands during source 2, from a separate process.
  const onStart = async (id) => {
    if (id === "s2") await cliCancel(root, "job-run");
  };

  const final = await runCityJob("job-run", { root, resolveSourceTasks: delayedTasks(["s1", "s2", "s3", "s4"], started, { onStart }), concurrency: 1 });

  assert.deepEqual(started, ["s1", "s2"], "s1 and s2 ran; s3 and s4 must never have started after the cancellation boundary");
  assert.equal(final.state, "CANCELLED", "a cancelled job must reach the canonical CANCELLED state, never be stranded as RUNNING");
  assert.equal(final.cancel_requested, true);
  assert.ok(final.completed_at, "a terminal job must carry a completion timestamp");

  // The in-flight source was NOT killed — it checkpointed normally.
  const checkpoints = await loadSourceCheckpoints("job-run", { root });
  assert.equal(checkpoints.get("s1").status, "SUCCESS");
  assert.equal(checkpoints.get("s2").status, "SUCCESS", "the source in flight at cancellation time must finish its own attempt, never be abandoned");
  assert.equal(checkpoints.has("s3"), false, "no checkpoint may exist for a source that never started");
});

test("20: the worker's own progress saves can never erase an operator's cancel request", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-clobber", sourceIds: ["s1", "s2", "s3"] });

  const started = [];
  const onStart = async (id) => {
    if (id === "s1") {
      // Write the request directly, mid-source, and let the runner's own
      // per-source save race it — the lost-update this package fixed.
      const job = await loadJob("job-clobber", { root });
      await saveJob({ ...job, cancel_requested: true }, { root });
    }
  };

  await runCityJob("job-clobber", { root, resolveSourceTasks: delayedTasks(["s1", "s2", "s3"], started, { onStart }), concurrency: 1 });

  const onDisk = await loadJob("job-clobber", { root });
  assert.equal(onDisk.cancel_requested, true, "the request must survive the worker's own writes");
  assert.equal(onDisk.state, "CANCELLED");
  assert.deepEqual(started, ["s1"], "no source may start after the request was persisted");
});

test("20: cancellation is cooperative, not a kill — a source is never interrupted mid-attempt", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-coop", sourceIds: ["s1", "s2"] });

  let s1Finished = false;
  const tasks = async () => [
    {
      source_id: "s1",
      run: async () => {
        await cliCancel(root, "job-coop"); // cancel arrives at the very start of s1
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
        s1Finished = true;
        return { outcome: "SUCCESS" };
      },
    },
    { source_id: "s2", run: async () => ({ outcome: "SUCCESS" }) },
  ];

  const final = await runCityJob("job-coop", { root, resolveSourceTasks: tasks, concurrency: 1 });
  assert.equal(s1Finished, true, "the in-flight source must be allowed to complete its attempt");
  assert.equal((await loadSourceCheckpoints("job-coop", { root })).get("s1").status, "SUCCESS");
  assert.equal(final.state, "CANCELLED");
});

// ---------------------------------------------------------------------------
// §19 — QUEUED cancellation
// ---------------------------------------------------------------------------

test("19: a QUEUED job is cancelled atomically by the CLI — no acquisition runs and no worker is needed", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const estateRef = await seedJob(root, { jobId: "job-q", sourceIds: ["s1", "s2"] });

  const result = await cliCancel(root, "job-q");
  assert.equal(result.result, "CANCELLED_IMMEDIATELY");
  assert.equal(result.before.state, "QUEUED");
  assert.equal(result.after.state, "CANCELLED");
  assert.equal(result.mutated, true);

  const job = await loadJob("job-q", { root });
  assert.equal(job.state, "CANCELLED");
  assert.ok(job.completed_at);
  assert.equal(job.estate_ref, estateRef, "the frozen estate snapshot reference is retained");
  assert.ok(JSON.parse(await readFile(join(root, estateRef), "utf8")).source_ids.length === 2, "and the snapshot itself still exists");

  // The queue must never hand a cancelled job to a worker.
  assert.equal(await pickNextRunnableJobId({ root }), null);

  // And a worker that does run finds nothing to do and never acquires.
  let resolverCalls = 0;
  const processed = await drainQueueOnce({
    root,
    resolveSourceTasksForJob: async () => {
      resolverCalls += 1;
      return [];
    },
  });
  assert.equal(processed.length, 0);
  assert.equal(resolverCalls, 0, "a cancelled QUEUED job must never trigger source acquisition");
  assert.equal((await loadSourceCheckpoints("job-q", { root })).size, 0);
});

// ---------------------------------------------------------------------------
// §12 — checkpoint / evidence preservation
// ---------------------------------------------------------------------------

test("12: cancellation preserves every checkpoint, the frozen estate, provenance and the runner SHA", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const estateRef = await seedJob(root, { jobId: "job-keep", sourceIds: ["s1", "s2", "s3"] });

  // Pre-existing evidence from an earlier pass: one success, one residue, one failure.
  await recordSourceResult("job-keep", "s1", { status: "SUCCESS", attempts: 1, completedAt: "2026-08-30T00:10:00.000Z", proven_event_count: 7 }, { root });
  await recordSourceResult("job-keep", "s2", { status: "RESIDUE", attempts: 1, completedAt: "2026-08-30T00:11:00.000Z", residue_reason: "BROWSER_REQUIRED" }, { root });
  await recordSourceResult("job-keep", "s3", { status: "FAILED", attempts: 1, completedAt: "2026-08-30T00:12:00.000Z", error: "NETWORK_FAILURE" }, { root });

  const before = await loadSourceCheckpoints("job-keep", { root });
  await cliCancel(root, "job-keep");
  const after = await loadSourceCheckpoints("job-keep", { root });

  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [id, record] of before) assert.deepEqual(after.get(id), record, `${id}'s checkpoint must be byte-identical after cancellation`);

  const job = await loadJob("job-keep", { root });
  assert.equal(job.estate_ref, estateRef);
  assert.equal(job.runner_version_sha, "abc1234");
  assert.deepEqual(job.configuration, { city_estate_key: "synthetic-estate" });
  assert.equal(job.created_at, "2026-08-30T00:00:00.000Z", "job history is not rewritten");
  assert.deepEqual(JSON.parse(await readFile(join(root, estateRef), "utf8")).source_ids, ["s1", "s2", "s3"]);
});

// ---------------------------------------------------------------------------
// §7 / §22 — terminal-state policy
// ---------------------------------------------------------------------------

for (const state of ["COMPLETE", "COMPLETE_WITH_RESIDUE", "FAILED"]) {
  test(`22: cancelling an already-${state} job is a reported no-op that rewrites nothing`, async (t) => {
    const root = await freshRoot();
    t.after(() => rm(root, { recursive: true, force: true }));
    await seedJob(root, { jobId: "job-done", sourceIds: ["s1"] });
    const original = { ...(await loadJob("job-done", { root })), state, completed_at: "2026-08-30T01:00:00.000Z", successful_sources: 1 };
    await saveJob(original, { root });

    const result = await cliCancel(root, "job-done");
    assert.equal(result.result, "ALREADY_TERMINAL");
    assert.equal(result.mutated, false);
    assert.equal(result.before.state, state);
    assert.deepEqual(await loadJob("job-done", { root }), original, "a finished job is durable evidence and must not be rewritten");
  });
}

test("22: cancelling an already-CANCELLED job reports ALREADY_CANCELLED and changes nothing", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-c", sourceIds: ["s1"] });
  await cliCancel(root, "job-c");
  const afterFirst = await loadJob("job-c", { root });

  const second = await cliCancel(root, "job-c");
  assert.equal(second.result, "ALREADY_CANCELLED");
  assert.equal(second.mutated, false);
  assert.deepEqual(await loadJob("job-c", { root }), afterFirst);
});

test("8: repeated cancellation of a RUNNING job reports ALREADY_CANCEL_REQUESTED and creates no duplicate transition", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-r", sourceIds: ["s1"], state: "RUNNING" });

  const first = await cliCancel(root, "job-r");
  assert.equal(first.result, "CANCELLATION_REQUESTED");
  assert.equal(first.after.state, "RUNNING", "a running job is not force-marked CANCELLED by the request itself");
  assert.equal(first.after.cancel_requested, true);
  assert.match(first.note, /COOPERATIVE/);

  const snapshot = await loadJob("job-r", { root });
  for (let i = 0; i < 3; i += 1) {
    const repeat = await cliCancel(root, "job-r");
    assert.equal(repeat.result, "ALREADY_CANCEL_REQUESTED");
    assert.equal(repeat.mutated, false);
  }
  assert.deepEqual(await loadJob("job-r", { root }), snapshot, "repeated cancellation must not corrupt the record");
});

test("cancelling a job that does not exist fails closed and creates nothing", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(() => cliCancel(root, "11111111-2222-3333-4444-555555555555"));
});

// ---------------------------------------------------------------------------
// §15 / §21 — multi-city isolation
// ---------------------------------------------------------------------------

test("21: cancelling city A leaves city B intact — B still processes, the worker drains and exits normally", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-berlin", city: "Berlin", key: "berlin", sourceIds: ["b1", "b2", "b3"] });
  await seedJob(root, { jobId: "job-paris", city: "Paris", key: "paris", sourceIds: ["p1", "p2"] });

  const started = [];
  const processed = await drainQueueOnce({
    root,
    concurrency: 1,
    resolveSourceTasksForJob: (job) => {
      const ids = job.job_id === "job-berlin" ? ["b1", "b2", "b3"] : ["p1", "p2"];
      return delayedTasks(ids, started, {
        delayMs: 10,
        // Cancel Berlin while its second source is in flight.
        onStart: async (id) => {
          if (id === "b2") await cliCancel(root, "job-berlin");
        },
      })();
    },
  });

  const berlin = await loadJob("job-berlin", { root });
  const paris = await loadJob("job-paris", { root });
  assert.equal(berlin.state, "CANCELLED");
  assert.equal(paris.state, "COMPLETE", "the other queued city must be entirely unaffected");
  assert.equal(paris.cancel_requested, false);
  assert.deepEqual(started, ["b1", "b2", "p1", "p2"], "Berlin stops at the boundary; Paris then runs in full");
  assert.deepEqual(processed.map((job) => job.job_id), ["job-berlin", "job-paris"]);

  // Queue drained: the worker would now exit 0.
  assert.equal(await pickNextRunnableJobId({ root }), null);
});

test("15: a cancelled job is never picked up again by the queue, and is not resumable", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-x", sourceIds: ["s1", "s2"] });
  await cliCancel(root, "job-x");

  assert.equal(await pickNextRunnableJobId({ root }), null);
  // runCityJob on a terminal job is an idempotent no-op.
  const again = await runCityJob("job-x", { root, resolveSourceTasks: async () => [{ source_id: "s1", run: async () => ({ outcome: "SUCCESS" }) }] });
  assert.equal(again.state, "CANCELLED");
  assert.equal((await loadSourceCheckpoints("job-x", { root })).size, 0, "no acquisition may happen for a cancelled job");
});

// ---------------------------------------------------------------------------
// §14 / §23 — a new cycle after cancellation
// ---------------------------------------------------------------------------

test("23: after cancellation a new explicit enqueue is a NEW cycle — new job id, new frozen estate, old record untouched", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // A real governed root so the real enqueue path is exercised.
  const { mkdir, writeFile, copyFile } = await import("node:fs/promises");
  const REPO = fileURLToPath(new URL("../..", import.meta.url));
  await mkdir(join(root, "ingestion/city-worker"), { recursive: true });
  await mkdir(join(root, "sources"), { recursive: true });
  await copyFile(join(REPO, "ingestion/city-worker/city-estate-catalogue.json"), join(root, "ingestion/city-worker/city-estate-catalogue.json"));
  await writeFile(
    join(root, "sources/berlin.json"),
    JSON.stringify({ country_code: "DE", entries: ["a", "b"].map((id) => ({ id, name: id, official_website: "https://x.example/", events_url: "https://x.example/e", active_status: "ACTIVE" })) }),
    "utf8",
  );

  const first = JSON.parse((await execFileAsync(process.execPath, [CLI, "enqueue-city-estate", "berlin-all-active", `--root=${root}`])).stdout);
  const cancelled = await cliCancel(root, first.job_id);
  assert.equal(cancelled.after.state, "CANCELLED");
  const firstRecord = await loadJob(first.job_id, { root });

  const second = JSON.parse((await execFileAsync(process.execPath, [CLI, "enqueue-city-estate", "berlin-all-active", `--root=${root}`])).stdout);
  assert.equal(second.enqueued, true, "CANCELLED is terminal, so a new cycle is allowed");
  assert.notEqual(second.job_id, first.job_id);
  assert.notEqual(second.estate_ref, first.estate_ref, "the new cycle freezes its own estate snapshot");
  assert.deepEqual(await loadJob(first.job_id, { root }), firstRecord, "the cancelled record is left exactly as it was");
});

// ---------------------------------------------------------------------------
// §13 — the read-only status control already surfaces cancellation
// ---------------------------------------------------------------------------

test("13: the existing read-only status projection already reports cancel_requested and CANCELLED, unchanged", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-s", sourceIds: ["s1"], state: "RUNNING" });
  await cliCancel(root, "job-s");

  const { stdout } = await execFileAsync(process.execPath, [CLI, "city-jobs-status", "--job-id=job-s", `--root=${root}`]);
  const job = JSON.parse(stdout).jobs[0];
  assert.equal(job.cancel_requested, true);
  assert.equal(job.state, "RUNNING");

  await saveJob({ ...(await loadJob("job-s", { root })), state: "CANCELLED", completed_at: "2026-08-30T02:00:00.000Z" }, { root });
  const second = JSON.parse((await execFileAsync(process.execPath, [CLI, "city-jobs-status", "--job-id=job-s", `--root=${root}`])).stdout).jobs[0];
  assert.equal(second.state, "CANCELLED");
  assert.ok(second.terminal_summary, "a CANCELLED job is terminal, so it gets the residue/failure projection like any other terminal job");
});

// ---------------------------------------------------------------------------
// §9 — a shutdown is still NOT a cancellation
// ---------------------------------------------------------------------------

test("9: a cooperative SHUTDOWN still leaves the job RUNNING and resumable — only a cancel request makes it terminal", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-sd", sourceIds: ["s1", "s2", "s3"] });

  const started = [];
  let stop = false;
  const final = await runCityJob("job-sd", {
    root,
    concurrency: 1,
    resolveSourceTasks: delayedTasks(["s1", "s2", "s3"], started, {
      delayMs: 5,
      onStart: () => {
        stop = true;
      },
    }),
    shouldStop: () => stop,
  });

  assert.equal(final.state, "RUNNING", "a shutdown is resumable, never terminal — this distinction must not regress");
  assert.equal(final.cancel_requested, false);
  assert.equal(await pickNextRunnableJobId({ root }), "job-sd", "and the queue must still offer it to the next worker");
});
