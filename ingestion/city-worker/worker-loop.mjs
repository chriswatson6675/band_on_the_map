// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the queue-draining
// worker. Two entry points, same core:
//
//   drainQueueOnce()  processes every currently-runnable job in the
//                     queue, sequentially, then returns. Deterministic
//                     and finite — this is what tests use (see item K:
//                     "worker can process two queued cities
//                     sequentially"), and also what a systemd oneshot-
//                     style invocation could use directly.
//
//   runWorkerLoop()   the always-on DigitalOcean shape: repeatedly calls
//                     drainQueueOnce(), sleeping between polls once the
//                     queue is empty, until a clean-shutdown signal is
//                     received. This is what deploy/systemd/
//                     beatmapped-city-worker.service actually runs (see
//                     worker-loop-main.mjs).
//
// Process safety requirements this module owns:
//   - bounded concurrency / bounded retries: delegated entirely to
//     runner.mjs / retry.mjs per job — this module adds no concurrency
//     of its own beyond "one job at a time per worker process" (multiple
//     cities process sequentially, never in parallel, so one city's
//     resource use is always bounded and predictable).
//   - clean shutdown: SIGTERM/SIGINT set a cooperative stop flag; the
//     in-flight job finishes its CURRENT batch of sources (never killed
//     mid-source) and persists its own resumable state, then this loop
//     exits. No job is ever silently abandoned mid-write.
//   - restart-safe state: entirely runner.mjs/checkpoint-store.mjs's
//     responsibility — this module never holds state that isn't already
//     durable on disk.
//   - single worker instance: lock.mjs.

import { acquireWorkerLock, releaseWorkerLock } from "./lock.mjs";
import { pickNextRunnableJobId } from "./queue.mjs";
import { runCityJob } from "./runner.mjs";

/** Process every currently-runnable job in the queue, one at a time, until none remain. Returns the array of final job records, in processing order. */
export async function drainQueueOnce({ root, resolveSourceTasksForJob, concurrency, retryPolicy, shouldStop = () => false, log = () => {} }) {
  const processed = [];
  for (;;) {
    if (shouldStop()) break;
    const jobId = await pickNextRunnableJobId({ root });
    if (!jobId) break;

    log(`[city-worker] starting job ${jobId}`);
    const job = await runCityJob(jobId, {
      root,
      resolveSourceTasks: (jobRecord) => resolveSourceTasksForJob(jobRecord),
      concurrency,
      retryPolicy,
      shouldStop,
    });
    log(`[city-worker] job ${jobId} -> ${job.state} (${job.successful_sources}/${job.total_sources} successful, ${job.residue_sources} residue, ${job.failed_sources} failed)`);
    processed.push(job);

    if (job.state === "RUNNING") {
      // Stopped early for shutdown — do not spin trying the same job
      // again in this same drain pass; the next invocation (next systemd
      // start, or the next poll of runWorkerLoop) will resume it.
      break;
    }
  }
  return processed;
}

/**
 * The always-on loop. Acquires the single-worker lock for its whole
 * lifetime, then repeatedly drains the queue, sleeping `pollIntervalMs`
 * between drains once nothing is runnable, until `shouldStop()` is true
 * (normally flipped by a SIGTERM/SIGINT handler installed by the caller —
 * see worker-loop-main.mjs, which is the actual systemd entry point).
 * Never throws for an ordinary empty queue; releases the lock in a
 * `finally` so a clean shutdown never leaves a stale lock behind.
 */
export async function runWorkerLoop({
  root,
  resolveSourceTasksForJob,
  concurrency,
  retryPolicy,
  pollIntervalMs = 5000,
  shouldStop = () => false,
  sleepFn = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
  log = (...args) => console.log(...args),
}) {
  const lock = await acquireWorkerLock({ root });
  if (!lock.ok) {
    log(`[city-worker] refusing to start: ${lock.reason}`);
    return { started: false, reason: lock.reason };
  }

  try {
    while (!shouldStop()) {
      await drainQueueOnce({ root, resolveSourceTasksForJob, concurrency, retryPolicy, shouldStop, log });
      if (shouldStop()) break;
      await sleepFn(pollIntervalMs);
    }
    return { started: true };
  } finally {
    await releaseWorkerLock({ root });
  }
}
