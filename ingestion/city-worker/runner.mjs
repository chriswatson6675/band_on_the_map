// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01, reconciled onto the
// modern collector line by BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-
// INTEGRATION-01 — the generic city-job processor. This is the missing
// execution layer between a "city job" (job.mjs) and a "city batch
// runner": something that can take an arbitrary city job, resolve its
// own source estate through an INJECTED, geography-neutral interface, and
// drive every source to a terminal, checkpointed result — surviving a
// process restart partway through.
//
// GEOGRAPHY NEUTRALITY (do not weaken this): this module never imports a
// collector, never branches on job.country/job.city, and never contains a
// hostname or venue name. The only way it learns what to acquire is
// `resolveSourceTasks(job)` — an injected async function returning
// `SourceTask[]`:
//
//   type SourceTask = {
//     source_id: string,
//     run: (attempt: number) => Promise<
//       { outcome: "SUCCESS", ...detail } |
//       { outcome: "RESIDUE", residue_reason: string, ...detail } |
//       { outcome: "FAILED",  ...detail }
//     > // or throws — see "ONE RETRY OWNER" below for when that is
//       // actually appropriate
//   }
//
// In production, `resolveSourceTasks` is the real adapter
// (ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs)
// that turns this repository's real, existing per-source acquisition
// interface (`acquireSource()`,
// ingestion/programme-acquisition/source-execution.mjs) into this shape —
// this module stays deliberately ignorant of what's on the other side of
// that function; a synthetic resolver (resolvers/example-synthetic-
// resolver.mjs) exercises the exact same contract for tests.
//
// ONE RETRY OWNER (BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01):
// `acquireSource()` already owns a complete, bounded retry policy for
// every fetch it makes — by the time it returns ANY result, including a
// failure, that budget is fully exhausted. This runner must never
// interpret an already-terminal source result as something to retry
// again itself. Concretely: a `SourceTask.run()` that RETURNS
// `{outcome: "FAILED", ...}` (rather than throwing) is recorded as a
// FAILED checkpoint on the FIRST call, with no outer retry — exactly like
// SUCCESS and RESIDUE. Throwing is reserved for a genuinely unexpected
// runtime exception the caller wants this runner's own small, bounded
// outer retry (`retryPolicy`, below) to cover — a DIFFERENT, orthogonal
// concern from a source-execution engine's own internal retry budget,
// and one no real adapter built on `acquireSource()` should ever need
// (see ingestion/programme-acquisition/worker-checkpoint-mapping.mjs's
// own "COMPATIBILITY GAP" note, now closed by this exact change). See
// tests/city-worker/one-retry-owner.test.mjs for explicit proof of this
// distinction.
//
// DETERMINISTIC ONLY: nothing in this module ever launches a browser or
// calls an AI model. A source that needs either reports itself as
// RESIDUE (see job.mjs's RESIDUE_REASONS) through the exact same SourceTask
// contract above — the runner treats RESIDUE (and now FAILED) as just
// another terminal, non-retried outcome, never as something to resolve
// itself.

import { loadJob, saveJob, updateJob } from "./job-store.mjs";
import { loadSourceCheckpoints, markSourceRunning, recordSourceResult, isTerminalCheckpoint } from "./checkpoint-store.mjs";
import { markJobRunning, determineFinalJobState, isCatastrophicCityJob } from "./job.mjs";
import { withRetries, DEFAULT_MAX_ATTEMPTS, DEFAULT_RETRY_DELAY_MS } from "../unattended-runner/retry.mjs";

const DEFAULT_CONCURRENCY = 4;

/**
 * BEATMAPPED-CITY-JOB-OPERATOR-CANCEL-CONTROL-01 — cancellation is owned by
 * WHOEVER HOLDS THE JOB FILE, not by this process's memory.
 *
 * An operator's cancel request arrives as `cancel_requested: true` written
 * to `job.json` by a DIFFERENT process (`cli.mjs cancel-job`) while this
 * runner is mid-city. Before this helper existed, runCityJob() read
 * `job.cancel_requested` from the in-memory record it loaded once at the
 * start, so it could never see that request — and worse, its own
 * progress saves wrote that stale `false` straight back over the
 * operator's `true`, silently erasing the request. Both were reproduced:
 * every source kept running and the job finished COMPLETE.
 *
 * So every loop boundary and every progress save re-reads the flag from
 * disk. The merge is deliberately MONOTONIC — it can only ever turn
 * cancellation ON. This runner must never "un-cancel" a job just because
 * its own in-memory copy predates the request.
 */
async function mergePersistedCancelRequest(job, { root }) {
  const persisted = await loadJob(job.job_id, { root });
  return persisted?.cancel_requested === true ? { ...job, cancel_requested: true } : job;
}

/** Bounded-concurrency map: never more than `limit` calls to `worker(item)` in flight at once. Order of completion is unconstrained; order of dispatch follows `items`. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function lane() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const laneCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: laneCount }, lane));
  return results;
}

/**
 * Process one source task to a terminal checkpoint. Never throws — a
 * genuine bug inside `task.run` surfaces as a FAILED checkpoint (via this
 * runner's own outer retry, `withRetries`), matching this project's
 * existing per-source isolation convention ("one failed venue never
 * blocks the whole city"). A `task.run()` that instead RETURNS
 * `{outcome: "FAILED"|"RESIDUE", ...}` is terminal on the first call —
 * see this file's own "ONE RETRY OWNER" header note.
 */
async function processSourceTask(jobId, task, { root, retryPolicy, now }) {
  await markSourceRunning(jobId, task.source_id, { root, startedAt: now() });
  const startedAt = now();

  let nonThrownOutcome = null;
  const attemptResult = await withRetries(
    async (attempt) => {
      const outcome = await task.run(attempt);
      if (outcome?.outcome === "RESIDUE" || outcome?.outcome === "FAILED") {
        // A structured, non-error terminal outcome — never retried by
        // this runner's own outer policy. Captured via closure rather
        // than withRetries' own return value so it is never mistaken for
        // a thrown error.
        nonThrownOutcome = outcome;
        return outcome;
      }
      return outcome;
    },
    retryPolicy,
  );

  const completedAt = now();

  if (nonThrownOutcome) {
    const { outcome: status, ...detail } = nonThrownOutcome;
    return recordSourceResult(
      jobId,
      task.source_id,
      { status, attempts: attemptResult.attempts, startedAt, completedAt, ...detail },
      { root },
    );
  }

  if (!attemptResult.ok) {
    return recordSourceResult(
      jobId,
      task.source_id,
      { status: "FAILED", attempts: attemptResult.attempts, startedAt, completedAt, error: attemptResult.error?.message ?? String(attemptResult.error) },
      { root },
    );
  }

  const { outcome: _outcome, ...detail } = attemptResult.result ?? {};
  return recordSourceResult(
    jobId,
    task.source_id,
    { status: "SUCCESS", attempts: attemptResult.attempts, startedAt, completedAt, ...detail },
    { root },
  );
}

/**
 * Process a city job to completion (or as far as a cooperative stop
 * request allows). Safe to call repeatedly for the same job — already-
 * terminal sources (from a prior process's checkpoints) are never
 * re-run; a source left RUNNING by a crashed prior process is retried,
 * never assumed complete (see checkpoint-store.mjs).
 *
 * Returns the job's own final record.
 */
export async function runCityJob(
  jobId,
  {
    root,
    resolveSourceTasks,
    concurrency = DEFAULT_CONCURRENCY,
    retryPolicy = { maxAttempts: DEFAULT_MAX_ATTEMPTS, retryDelayMs: DEFAULT_RETRY_DELAY_MS },
    now = () => new Date().toISOString(),
    shouldStop = () => false,
  },
) {
  let job = await loadJob(jobId, { root });
  if (!job) throw new Error(`runCityJob: no such job "${jobId}"`);

  if (job.state !== "QUEUED" && job.state !== "RUNNING") {
    // Already terminal (COMPLETE / COMPLETE_WITH_RESIDUE / FAILED / CANCELLED) — idempotent no-op.
    return job;
  }

  job = markJobRunning(job, { now: now() });
  await saveJob(job, { root });

  let sourceTasks;
  try {
    sourceTasks = await resolveSourceTasks(job);
  } catch (error) {
    job = { ...job, state: "FAILED", completed_at: now(), error: `estate resolution failed: ${error?.message ?? error}` };
    await saveJob(job, { root });
    return job;
  }

  if (isCatastrophicCityJob({ totalSources: sourceTasks.length })) {
    job = { ...job, total_sources: 0, state: "FAILED", completed_at: now(), error: "empty source estate" };
    await saveJob(job, { root });
    return job;
  }

  const checkpoints = await loadSourceCheckpoints(jobId, { root });
  const pending = sourceTasks.filter((task) => !isTerminalCheckpoint(checkpoints.get(task.source_id)));

  job = { ...job, total_sources: sourceTasks.length, last_checkpoint: now() };
  await saveJob(job, { root });

  let stoppedEarly = false;

  // Sequential-yet-bounded-concurrency processing, with a cooperative
  // stop check between dispatch batches — never mid-source (a source
  // already RUNNING always finishes its own current attempt before a
  // stop request takes effect, so a checkpoint is never abandoned
  // half-written by a deliberate stop; only a hard process kill can do
  // that, and that is exactly what the RUNNING-marker recovery path is
  // for — see checkpoint-store.mjs).
  const remaining = [...pending];
  while (remaining.length > 0) {
    // Re-read the operator-owned cancel flag from disk, never trust our own
    // in-memory copy of it (see mergePersistedCancelRequest above).
    job = await mergePersistedCancelRequest(job, { root });
    if (shouldStop() || job.cancel_requested) {
      stoppedEarly = true;
      break;
    }
    const batch = remaining.splice(0, concurrency);
    await mapWithConcurrency(batch, concurrency, async (task) => {
      await processSourceTask(jobId, task, { root, retryPolicy, now });
      // Read-modify-write INSIDE job-store's own per-path serialisation, so
      // this progress write can never clobber a cancel request that landed
      // while the batch was in flight, and its read can never overlap
      // another lane's rename onto the same job.json.
      const snapshot = { ...job, last_checkpoint: now(), current_source_id: task.source_id };
      job =
        (await updateJob(
          jobId,
          (persisted) => ({ ...snapshot, cancel_requested: persisted?.cancel_requested === true ? true : snapshot.cancel_requested }),
          { root },
        )) ?? snapshot;
    });
  }

  const finalCheckpoints = await loadSourceCheckpoints(jobId, { root });
  const terminal = sourceTasks.map((task) => finalCheckpoints.get(task.source_id)).filter(isTerminalCheckpoint);
  const successfulSources = terminal.filter((c) => c.status === "SUCCESS").length;
  const residueSources = terminal.filter((c) => c.status === "RESIDUE").length;
  const failedSources = terminal.filter((c) => c.status === "FAILED").length;

  const allTerminal = terminal.length === sourceTasks.length;
  // BEATMAPPED-CITY-JOB-OPERATOR-CANCEL-CONTROL-01: a CANCELLED job is
  // terminal with only PART of its estate done — that is the whole point of
  // cancelling. Gating the terminal decision on `allTerminal` alone (as this
  // did) meant a cancelled job could never reach CANCELLED: it fell through
  // to "RUNNING", where queue.mjs then permanently skips it for having
  // cancel_requested set, stranding it as RUNNING forever.
  //
  // The two early-stop reasons are genuinely different and must stay so:
  //   cancellation -> TERMINAL (CANCELLED). Deliberate; never resumed.
  //   shutdown     -> RUNNING. Resumable; the next worker start continues it
  //                   under the same job id from its own checkpoints.
  const cancelledEarly = stoppedEarly && job.cancel_requested === true;
  const finalState =
    allTerminal || cancelledEarly
      ? determineFinalJobState({ totalSources: sourceTasks.length, successfulSources, cancelledEarly })
      : "RUNNING"; // stopped early by shutdown, not cancellation — resumable, never terminal

  job = {
    ...job,
    completed_sources: terminal.length,
    successful_sources: successfulSources,
    residue_sources: residueSources,
    failed_sources: failedSources,
    current_source_id: null,
    last_checkpoint: now(),
    state: finalState,
    completed_at: allTerminal || cancelledEarly ? now() : job.completed_at,
    final_metrics: allTerminal
      ? { total_sources: sourceTasks.length, successful_sources: successfulSources, residue_sources: residueSources, failed_sources: failedSources }
      : job.final_metrics,
  };
  await saveJob(job, { root });
  return job;
}
