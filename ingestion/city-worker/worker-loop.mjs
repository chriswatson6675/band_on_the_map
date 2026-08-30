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
//   runWorkerUntilQueueDrained()
//                     the DRAIN-AND-EXIT DigitalOcean shape: takes the
//                     single-worker lock, drains every runnable job, and
//                     then exits cleanly. This is what deploy/systemd/
//                     beatmapped-city-worker.service actually runs (see
//                     worker-loop-main.mjs).
//
// BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 replaced the
// previous ALWAYS-ON shape (drain, sleep pollIntervalMs, drain again,
// forever) with drain-and-exit. The always-on shape was not wrong in
// isolation — but combined with the sanctioned deployment path it produced
// an unusable operating lifecycle, because deployment deliberately fails
// closed while beatmapped-city-worker.service is active:
//
//     first city job -> worker starts -> queue drains
//       -> worker stays active idle FOREVER
//       -> every subsequent normal deployment fails closed FOREVER
//
// ...unless someone stopped it out of band, which is exactly the kind of
// manual intervention this whole line of work exists to remove. Under
// drain-and-exit the interaction becomes self-resolving instead: city work
// running blocks deployment; the queue finishes; the worker exits; systemd
// reports inactive; deployment is allowed again. No deployment drain/
// restart redesign is needed (see deploy/README.md, "Deploying while a
// city job is active").
//
// The exit is DELIBERATELY not "idle for a while, then give up": there is
// no grace sleep here, because a timer-like idle window is exactly the
// always-on behaviour in a smaller costume. The queue-empty condition is
// the exit condition. The (real, narrow) race this opens — a job enqueued
// in the instant between the final empty-queue check and process exit — is
// closed at the OPERATOR CONTROL layer, which re-issues an idempotent
// `systemctl start` until it has observed a stably-active worker or no
// remaining runnable work (see .github/workflows/enqueue-beatmapped-city-job.yml).
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
      // again in this same drain pass; the next systemd start resumes it,
      // under its original job id, from its own durable checkpoints.
      break;
    }
  }
  return processed;
}

/**
 * The drain-and-exit worker. Acquires the single-worker lock, drains every
 * currently-runnable job (drainQueueOnce is itself a loop — it keeps
 * picking the next runnable job until none remains, so a job enqueued
 * WHILE this worker is processing an earlier city is still picked up in
 * this same run, and multiple cities drain sequentially in one process),
 * then releases the lock and returns so the process can exit 0.
 *
 * Never throws for an ordinary empty queue — a worker started against an
 * already-empty queue does no acquisition work at all and simply exits
 * successfully. The lock is released in a `finally`, so neither a clean
 * exit, a cooperative shutdown, nor a thrown job-level error can leave a
 * stale lock behind.
 *
 * `shouldStop()` (normally flipped by a SIGTERM/SIGINT handler installed
 * by the caller — see worker-loop-main.mjs) still stops the drain
 * cooperatively between sources; a run stopped that way is reported with
 * `stopped_early: true` and is NOT a failure — the in-flight job stays
 * durable and RUNNING and is resumed, under its original job id, by the
 * next worker start.
 */
export async function runWorkerUntilQueueDrained({
  root,
  resolveSourceTasksForJob,
  concurrency,
  retryPolicy,
  shouldStop = () => false,
  log = (...args) => console.log(...args),
}) {
  const lock = await acquireWorkerLock({ root });
  if (!lock.ok) {
    // Another worker already holds the lock — "refused, not failed". The
    // caller maps this to a distinct exit code (see worker-loop-main.mjs).
    log(`[city-worker] refusing to start: ${lock.reason}`);
    return { started: false, reason: lock.reason };
  }

  try {
    const processed = await drainQueueOnce({ root, resolveSourceTasksForJob, concurrency, retryPolicy, shouldStop, log });
    const stoppedEarly = shouldStop();
    log(`[city-worker] queue drained (${processed.length} job(s) processed${stoppedEarly ? ", stopped early on shutdown request" : ""}) — exiting cleanly`);
    return { started: true, drained: !stoppedEarly, stopped_early: stoppedEarly, processed_job_count: processed.length };
  } finally {
    await releaseWorkerLock({ root });
  }
}
