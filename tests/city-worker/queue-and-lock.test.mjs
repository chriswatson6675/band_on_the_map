import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob, listQueueOrder, pickNextRunnableJobId } from "../../ingestion/city-worker/queue.mjs";
import { acquireWorkerLock, releaseWorkerLock, readWorkerLockStatus } from "../../ingestion/city-worker/lock.mjs";

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-queue-lock-test-"));
}

async function queuedJob(root, jobId, state = "QUEUED") {
  const job = createCityJob({ jobId, country: "ZZ", city: "Testcity", createdAt: "2026-08-29T00:00:00.000Z" });
  await saveJob({ ...job, state }, { root });
  await enqueueJob(jobId, { root });
}

test("enqueueJob is idempotent and preserves enqueue order", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await enqueueJob("job-1", { root });
  await enqueueJob("job-2", { root });
  await enqueueJob("job-1", { root }); // duplicate enqueue

  assert.deepEqual(await listQueueOrder({ root }), ["job-1", "job-2"]);
});

test("pickNextRunnableJobId skips terminal jobs and returns the earliest still-runnable one", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await queuedJob(root, "done-job", "COMPLETE");
  await queuedJob(root, "cancelled-job", "CANCELLED");
  await queuedJob(root, "runnable-job", "QUEUED");

  assert.equal(await pickNextRunnableJobId({ root }), "runnable-job");
});

test("pickNextRunnableJobId returns null once the queue is fully drained", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await queuedJob(root, "done-job", "COMPLETE");
  assert.equal(await pickNextRunnableJobId({ root }), null);
});

test("acquireWorkerLock refuses a second concurrent worker, and release makes it available again", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await acquireWorkerLock({ root, pid: process.pid });
  assert.equal(first.ok, true);

  const second = await acquireWorkerLock({ root, pid: process.pid });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "ANOTHER_WORKER_RUNNING");

  const status = await readWorkerLockStatus({ root });
  assert.equal(status.alive, true);

  await releaseWorkerLock({ root });
  const third = await acquireWorkerLock({ root, pid: process.pid });
  assert.equal(third.ok, true);
});

test("a stale lock (dead pid) is reclaimed automatically", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // A pid essentially guaranteed not to be alive on this host.
  const deadPid = 999999;
  const first = await acquireWorkerLock({ root, pid: deadPid });
  assert.equal(first.ok, true);

  const reclaimed = await acquireWorkerLock({ root, pid: process.pid });
  assert.equal(reclaimed.ok, true, "a lock held by a dead pid must be reclaimed, never block forever");
});
