// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the minimum durable
// queue abstraction needed for future city jobs — any city or area a
// future country-onboarding operation enqueues. Deliberately the simplest thing
// that fits this repository's existing architecture: one plain JSON file
// (runtime/city-jobs/queue.json) holding an append-only, ordered list of
// job ids — no Kafka, Kubernetes, Redis, or database, matching this
// project's existing "boring local file" convention (see job-store.mjs,
// ingestion/unattended-runner/lock.mjs).
//
// The queue file only ever records ENQUEUE ORDER. A job's own record
// (job-store.mjs) is the single source of truth for its current state —
// the queue is never mutated when a job starts, finishes, or is
// cancelled; "what's runnable next" is computed by walking the order and
// asking each job's own record. This avoids any possibility of the queue
// file and a job's real state ever disagreeing.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { loadJob } from "./job-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveQueuePath({ root = ROOT } = {}) {
  return resolve(root, "runtime/city-jobs/queue.json");
}

async function readQueueOrder({ root = ROOT } = {}) {
  try {
    const raw = await readFile(resolveQueuePath({ root }), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.order) ? parsed.order : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    return []; // corrupt queue file: treated as empty rather than a hard crash — every job's own record still exists independently in job-store.
  }
}

async function writeQueueOrder(order, { root = ROOT } = {}) {
  const path = resolveQueuePath({ root });
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = resolve(dirname(path), `.queue.${randomUUID()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify({ order }, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

/** Append a job id to the queue's enqueue order (no-op if already present — enqueueing the same job twice is never a duplicate work item). */
export async function enqueueJob(jobId, { root = ROOT } = {}) {
  const order = await readQueueOrder({ root });
  if (!order.includes(jobId)) {
    order.push(jobId);
    await writeQueueOrder(order, { root });
  }
  return order;
}

export async function listQueueOrder({ root = ROOT } = {}) {
  return readQueueOrder({ root });
}

/**
 * The next job the worker should process: the earliest-enqueued job id
 * whose own record is still QUEUED, or RUNNING with cancel_requested
 * false and no completed_at (i.e. a job left mid-flight by a prior
 * process that died — resumed, never restarted from scratch; see
 * runner.mjs). Terminal/cancelled jobs are skipped. Returns null when
 * nothing is runnable.
 */
export async function pickNextRunnableJobId({ root = ROOT } = {}) {
  const order = await readQueueOrder({ root });
  for (const jobId of order) {
    const job = await loadJob(jobId, { root });
    if (!job) continue;
    if (job.state === "QUEUED") return jobId;
    if (job.state === "RUNNING" && !job.cancel_requested) return jobId;
  }
  return null;
}

export { ROOT as QUEUE_ROOT };
