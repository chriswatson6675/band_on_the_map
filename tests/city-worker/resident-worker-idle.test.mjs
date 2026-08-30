// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — the empty-queue /
// idle behaviour the operator model depends on.
//
// The whole "wake" design rests on one measured fact: runWorkerLoop() is
// RESIDENT. It does not exit when the queue drains — it sleeps and polls
// again. That is why the operator control starts the worker only when it
// is inactive and never restarts it: an already-running worker picks up a
// newly-enqueued job by itself. These tests prove that property directly
// rather than leaving the operator control resting on an assumption.
//
// (This package deliberately did NOT redesign the loop into a one-shot
// model. It documents and proves the resident behaviour instead — see
// docs/UNATTENDED_CITY_WORKER.md, "Idle behaviour and the operator wake".)

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { loadJob, saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob } from "../../ingestion/city-worker/queue.mjs";
import { runWorkerLoop } from "../../ingestion/city-worker/worker-loop.mjs";
import { makeResolver } from "./helpers/synthetic-city.mjs";

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "resident-worker-test-"));
}

async function enqueue(root, jobId) {
  const job = createCityJob({ jobId, country: "ZZ", city: "Synthetica", estateRef: `runtime/city-jobs/${jobId}/estate.json`, createdAt: new Date().toISOString() });
  await saveJob(job, { root });
  await enqueueJob(jobId, { root });
}

test("an empty queue does NOT end the worker — it sleeps and polls again, until asked to stop", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let polls = 0;
  const outcome = await runWorkerLoop({
    root,
    resolveSourceTasksForJob: makeResolver([]),
    pollIntervalMs: 1,
    sleepFn: async () => {
      polls += 1;
    },
    shouldStop: () => polls >= 4,
    log: () => {},
  });

  assert.deepEqual(outcome, { started: true });
  assert.equal(polls, 4, "the loop must keep polling an empty queue rather than exiting after the first drain");
});

test("a job enqueued AFTER the worker is already running is picked up on a later poll — no restart, no second worker", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const callLog = [];
  let polls = 0;
  await runWorkerLoop({
    root,
    resolveSourceTasksForJob: makeResolver(["alpha-venue", "beta-venue"], {}, { callLog }),
    pollIntervalMs: 1,
    sleepFn: async () => {
      polls += 1;
      // The operator dispatches an enqueue while this worker is mid-idle.
      if (polls === 2) await enqueue(root, "late-job");
    },
    shouldStop: () => polls >= 5,
    log: () => {},
  });

  const job = await loadJob("late-job", { root });
  assert.equal(job.state, "COMPLETE", "the resident worker must find and finish the later job on its own");
  // Sorted: sources WITHIN one city run under runner.mjs's own bounded
  // concurrency, so their completion order is legitimately not fixed. What
  // matters here is that the later job was found and every source ran.
  assert.deepEqual(
    callLog.map((entry) => entry.source_id).sort(),
    ["alpha-venue", "beta-venue"],
  );
});

test("idle polling is genuinely idle — no source task is resolved or run while the queue is empty", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let resolverCalls = 0;
  let polls = 0;
  await runWorkerLoop({
    root,
    resolveSourceTasksForJob: async () => {
      resolverCalls += 1;
      return [];
    },
    pollIntervalMs: 1,
    sleepFn: async () => {
      polls += 1;
    },
    shouldStop: () => polls >= 6,
    log: () => {},
  });

  assert.equal(resolverCalls, 0, "an idle worker must do no acquisition work at all — its cost is one queue read per poll");
});

test("two cities queued at once are processed sequentially by the one resident worker, never in parallel", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await enqueue(root, "city-one");
  await enqueue(root, "city-two");

  const order = [];
  let polls = 0;
  await runWorkerLoop({
    root,
    resolveSourceTasksForJob: (job) => {
      order.push(job.job_id);
      return makeResolver(["alpha-venue"])();
    },
    pollIntervalMs: 1,
    sleepFn: async () => {
      polls += 1;
    },
    shouldStop: () => polls >= 2,
    log: () => {},
  });

  assert.deepEqual(order, ["city-one", "city-two"], "in enqueue order, one at a time");
  assert.equal((await loadJob("city-one", { root })).state, "COMPLETE");
  assert.equal((await loadJob("city-two", { root })).state, "COMPLETE");
});

test("a second worker process refuses to start rather than competing — the single-worker lock is what makes an accidental double `systemctl start` harmless", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let outerPolls = 0;
  let secondOutcome = null;
  await runWorkerLoop({
    root,
    resolveSourceTasksForJob: makeResolver([]),
    pollIntervalMs: 1,
    sleepFn: async () => {
      outerPolls += 1;
      if (outerPolls === 1) {
        // Exactly what a redundant `systemctl start` would attempt while a
        // worker already holds the lock.
        secondOutcome = await runWorkerLoop({ root, resolveSourceTasksForJob: makeResolver([]), pollIntervalMs: 1, sleepFn: async () => {}, shouldStop: () => true, log: () => {} });
      }
    },
    shouldStop: () => outerPolls >= 2,
    log: () => {},
  });

  assert.equal(secondOutcome.started, false, "the second worker must refuse, not run alongside the first");
  assert.match(secondOutcome.reason, /ANOTHER_WORKER_RUNNING|LOCK_CONTENDED/);
});
