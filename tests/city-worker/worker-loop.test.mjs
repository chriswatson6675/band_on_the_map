// Proves item K: the worker can process two queued cities sequentially —
// plus that drainQueueOnce() is finite/deterministic and that a
// mid-drain stop leaves the second job untouched for a later resume.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { saveJob, loadJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob } from "../../ingestion/city-worker/queue.mjs";
import { drainQueueOnce } from "../../ingestion/city-worker/worker-loop.mjs";
import { makeResolver, loadSyntheticEstateFrom, instantRetryPolicy } from "./helpers/synthetic-city.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-queue-test-"));
}

async function enqueueSyntheticCity(root, { jobId, country, city }) {
  const job = createCityJob({ jobId, country, city, estateRef: `${country}/${city}`, createdAt: "2026-08-29T00:00:00.000Z" });
  await saveJob(job, { root });
  await enqueueJob(jobId, { root });
}

test("K: the worker processes two queued cities sequentially, in enqueue order", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await enqueueSyntheticCity(root, { jobId: "city-1", country: "ZZ", city: "Testcity Alpha" });
  await enqueueSyntheticCity(root, { jobId: "city-2", country: "YY", city: "Testcity Beta" });

  const startOrder = [];
  const estatesByJob = {
    "city-1": await loadSyntheticEstateFrom(REPO_ROOT, "testcity-alpha"),
    "city-2": await loadSyntheticEstateFrom(REPO_ROOT, "testcity-beta"),
  };

  async function resolveSourceTasksForJob(job) {
    startOrder.push(job.job_id);
    return makeResolver(estatesByJob[job.job_id])();
  }

  const processed = await drainQueueOnce({ root, resolveSourceTasksForJob, retryPolicy: instantRetryPolicy });

  assert.deepEqual(processed.map((job) => job.job_id), ["city-1", "city-2"]);
  assert.deepEqual(startOrder, ["city-1", "city-2"], "cities are started strictly in enqueue order, one at a time");
  for (const job of processed) {
    assert.equal(job.state, "COMPLETE");
  }

  const finalCityOne = await loadJob("city-1", { root });
  const finalCityTwo = await loadJob("city-2", { root });
  assert.equal(finalCityOne.state, "COMPLETE");
  assert.equal(finalCityTwo.state, "COMPLETE");
});

test("drainQueueOnce is finite: an empty queue returns immediately with no jobs processed", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const processed = await drainQueueOnce({ root, resolveSourceTasksForJob: async () => [] });
  assert.deepEqual(processed, []);
});

test("a shutdown request mid-drain leaves the not-yet-started second job untouched", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await enqueueSyntheticCity(root, { jobId: "city-1", country: "ZZ", city: "Testcity Alpha" });
  await enqueueSyntheticCity(root, { jobId: "city-2", country: "YY", city: "Testcity Beta" });

  const sourceIds = await loadSyntheticEstateFrom(REPO_ROOT, "testcity-alpha");
  const resolveSourceTasksForJob = makeResolver(sourceIds);

  // Stop as soon as city-1 has made any progress at all — before city-2 ever starts.
  let stop = false;
  const processed = await drainQueueOnce({
    root,
    resolveSourceTasksForJob,
    concurrency: 1,
    retryPolicy: instantRetryPolicy,
    shouldStop: () => {
      const value = stop;
      stop = true;
      return value;
    },
  });

  assert.equal(processed.length, 1);
  assert.equal(processed[0].job_id, "city-1");
  assert.equal(processed[0].state, "RUNNING", "city-1 stopped mid-flight, not terminal");

  const city2 = await loadJob("city-2", { root });
  assert.equal(city2.state, "QUEUED", "city-2 was never started");
});
