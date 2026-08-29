// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the minimum status
// surface a running (or last-run) city job needs to answer, per this
// package's own brief: is the worker alive, what city is running, source
// totals/completed/proven/residue counts, last progress timestamp,
// current source, current run SHA. CLI/JSON only — no frontend.

import { readWorkerLockStatus } from "./lock.mjs";
import { listJobs, loadJob } from "./job-store.mjs";

/** Health snapshot for one specific job — used by `show-job`/`resume-job` and by the "current city" question below. */
export function buildJobHealthSnapshot(job) {
  if (!job) return null;
  return {
    job_id: job.job_id,
    country: job.country,
    city: job.city,
    state: job.state,
    total_sources: job.total_sources,
    completed_sources: job.completed_sources,
    successful_sources: job.successful_sources,
    residue_sources: job.residue_sources,
    failed_sources: job.failed_sources,
    current_source_id: job.current_source_id,
    last_checkpoint: job.last_checkpoint,
    runner_version_sha: job.runner_version_sha,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
  };
}

/**
 * Whole-worker health: is a worker process alive on this host, and (if
 * so) what is it currently doing. `activeJob` is whichever RUNNING job
 * has the most recent `last_checkpoint` — the one the live worker is
 * actually processing, in the (normal, sequential-worker) case where at
 * most one job is RUNNING at a time on a given host.
 */
export async function getWorkerHealth({ root } = {}) {
  const lockStatus = await readWorkerLockStatus({ root });
  const jobs = await listJobs({ root });
  const running = jobs.filter((job) => job.state === "RUNNING").sort((a, b) => (b.last_checkpoint ?? "").localeCompare(a.last_checkpoint ?? ""));
  const activeJob = running[0] ?? null;

  return {
    worker_alive: lockStatus.alive,
    worker_pid: lockStatus.pid ?? null,
    worker_started_at: lockStatus.started_at ?? null,
    active_job: buildJobHealthSnapshot(activeJob),
    queued_job_count: jobs.filter((job) => job.state === "QUEUED").length,
    running_job_count: running.length,
  };
}

export async function getJobHealth(jobId, { root } = {}) {
  const job = await loadJob(jobId, { root });
  return buildJobHealthSnapshot(job);
}
