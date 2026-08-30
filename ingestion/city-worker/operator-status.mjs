// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — the read-only
// operator status surface behind the "Check BeatMapped City Jobs"
// control.
//
// READ-ONLY BY CONSTRUCTION, not by convention: this module imports only
// reader functions (loadSourceCheckpoints, listJobs, readWorkerLockStatus)
// and never imports saveJob, enqueueJob, runCityJob, drainQueueOnce,
// requestJobCancel, or anything from lock.mjs that acquires. There is no
// code path here that can change a job, the queue, or the worker — proven
// structurally by tests/city-worker/operator-status.test.mjs.
//
// PROJECTION, NEVER PASS-THROUGH. Per-source checkpoints carry whatever
// outcome detail a collector produced. Rather than forwarding a checkpoint
// record wholesale, this module copies a fixed ALLOW-LIST of fields onto a
// fresh object, and truncates free-text error messages. An operator
// summary therefore cannot start leaking raw page bodies (or anything
// else a future collector decides to record) just because a checkpoint's
// shape grew — a new field is invisible here until it is deliberately
// added to the allow-list.

import { loadSourceCheckpoints } from "./checkpoint-store.mjs";
import { listJobs, loadJob } from "./job-store.mjs";
import { readWorkerLockStatus } from "./lock.mjs";
import { readJobCityEstateKey } from "./city-estate-catalogue.mjs";
import { isTerminalJobState } from "./job.mjs";

/** Free-text collector messages are the only unbounded strings that reach an operator summary; bound them so a status report can never become a page dump. */
const MAX_ERROR_CHARS = 300;

function truncate(value) {
  if (typeof value !== "string") return value ?? null;
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_ERROR_CHARS ? `${oneLine.slice(0, MAX_ERROR_CHARS)}…[truncated]` : oneLine;
}

/** The fixed allow-list — see this module's header on why this is a copy, never a spread. */
function projectCheckpoint(record) {
  return {
    source_id: record.source_id ?? null,
    status: record.status ?? null,
    attempts: record.attempts ?? null,
    residue_reason: record.residue_reason ?? null,
    source_state: record.source_state ?? null,
    collector: record.collector ?? null,
    normalized_event_count: record.normalized_event_count ?? null,
    proven_event_count: record.proven_event_count ?? null,
    retry_count: record.retry_count ?? null,
    error: truncate(record.error ?? null),
  };
}

/** Every operator-visible field for one job — exactly the field list this package's operator control is required to expose, and nothing else off the job record. */
export function projectJobForOperator(job) {
  return {
    job_id: job.job_id,
    country: job.country,
    city: job.city,
    city_estate_key: readJobCityEstateKey(job),
    estate_ref: job.estate_ref ?? null,
    state: job.state,
    created_at: job.created_at ?? null,
    started_at: job.started_at ?? null,
    completed_at: job.completed_at ?? null,
    total_sources: job.total_sources ?? 0,
    completed_sources: job.completed_sources ?? 0,
    successful_sources: job.successful_sources ?? 0,
    residue_sources: job.residue_sources ?? 0,
    failed_sources: job.failed_sources ?? 0,
    last_checkpoint: job.last_checkpoint ?? null,
    current_source_id: job.current_source_id ?? null,
    runner_version_sha: job.runner_version_sha ?? null,
    cancel_requested: job.cancel_requested === true,
  };
}

/**
 * Residue/failure breakdown for a job. Only produced for a TERMINAL job:
 * a running job's per-source picture is still moving, and reporting a
 * partial breakdown as if it were the outcome would be misleading. The
 * per-source list is restricted to the non-SUCCESS sources — those are
 * what an operator triages — with counts by reason alongside.
 */
export async function buildResidueSummary(jobId, { root } = {}) {
  const checkpoints = await loadSourceCheckpoints(jobId, { root });
  const records = [...checkpoints.values()];
  const residue = records.filter((record) => record.status === "RESIDUE").map(projectCheckpoint);
  const failed = records.filter((record) => record.status === "FAILED").map(projectCheckpoint);

  const byReason = {};
  for (const record of residue) {
    const reason = record.residue_reason ?? "UNCLASSIFIED";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }

  const bySourceId = (a, b) => String(a.source_id).localeCompare(String(b.source_id));
  return {
    residue_by_reason: byReason,
    residue: residue.sort(bySourceId),
    failed: failed.sort(bySourceId),
  };
}

async function withOptionalSummary(job, { root }) {
  const projected = projectJobForOperator(job);
  if (!isTerminalJobState(job.state)) return { ...projected, terminal_summary: null };
  return { ...projected, terminal_summary: await buildResidueSummary(job.job_id, { root }) };
}

/**
 * The whole operator status report: worker liveness plus every job (or a
 * single job when `jobId` is given), newest first. `generated_at` is
 * supplied by the caller so this module stays clock-free and its output
 * fully deterministic under test.
 */
export async function buildOperatorStatusReport({ root, jobId = null, generatedAt } = {}) {
  const lockStatus = await readWorkerLockStatus({ root });
  const worker = {
    worker_alive: lockStatus.alive,
    worker_pid: lockStatus.pid ?? null,
    worker_started_at: lockStatus.started_at ?? null,
  };

  if (jobId) {
    const job = await loadJob(jobId, { root });
    if (!job) {
      return { generated_at: generatedAt ?? null, worker, requested_job_id: jobId, job_count: 0, jobs: [], note: `NO_SUCH_JOB: ${jobId}` };
    }
    return { generated_at: generatedAt ?? null, worker, requested_job_id: jobId, job_count: 1, jobs: [await withOptionalSummary(job, { root })] };
  }

  const jobs = await listJobs({ root });
  jobs.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const projected = [];
  for (const job of jobs) projected.push(await withOptionalSummary(job, { root }));

  return {
    generated_at: generatedAt ?? null,
    worker,
    requested_job_id: null,
    job_count: projected.length,
    jobs: projected,
    note: projected.length === 0 ? "NO_CITY_JOBS_ON_THIS_HOST" : null,
  };
}
