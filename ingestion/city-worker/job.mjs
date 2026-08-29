// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the city-neutral,
// durable job state model.
//
// A "city job" represents one bounded acquisition pass over one city/area
// estate. It carries NO geography-specific logic of its own — country and
// city/area are opaque metadata a job carries, never a branch this module
// (or the runner that processes a job — see runner.mjs) takes a decision
// on. A future country-level operation enqueues one job per city/area; the
// job model already supports that (see docs/UNATTENDED_CITY_WORKER.md,
// "Country-ready job model") without any change here.
//
// This module is pure, dependency-free composition — no filesystem, no
// network, no clock reads other than accepting `now` from the caller —
// matching this project's existing convention of separating state shape
// from persistence (see job-store.mjs for the filesystem side).

export const JOB_STATES = Object.freeze([
  "QUEUED",
  "RUNNING",
  "COMPLETE",
  "COMPLETE_WITH_RESIDUE",
  "FAILED",
  "CANCELLED",
]);

// A job is done being worked on once it reaches one of these — the
// worker loop never re-processes a terminal job, and resume-job on one
// of these is a safe no-op (see runner.mjs's runCityJob()).
const TERMINAL_JOB_STATES = new Set(["COMPLETE", "COMPLETE_WITH_RESIDUE", "FAILED", "CANCELLED"]);

export function isTerminalJobState(state) {
  return TERMINAL_JOB_STATES.has(state);
}

// Per-source terminal outcomes (see checkpoint-store.mjs for how these are
// persisted, one file per source). RUNNING is a deliberately non-terminal,
// in-flight marker — never a real outcome — written just before a source's
// acquisition begins, so a hard crash mid-source leaves recoverable
// evidence of exactly what was in flight (see docs/UNATTENDED_CITY_WORKER.md,
// "Crash during a source").
export const SOURCE_CHECKPOINT_STATUSES = Object.freeze(["RUNNING", "SUCCESS", "FAILED", "RESIDUE"]);

// Structured residue reasons a source's own acquisition attempt can
// resolve to instead of SUCCESS/FAILED — each routes to a separate,
// future specialised worker (browser automation, AI research, etc.).
// This package only classifies and retains residue; it never attempts to
// resolve any of these itself (see docs/UNATTENDED_CITY_WORKER.md,
// "Residue queues" — deliberately out of scope here).
//
// PROGRAMME_EMPTY (added by BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-
// INTEGRATION-01): a supported, already-identified programme surface
// with genuinely no current listings right now — structurally different
// from SOURCE_UNRESOLVED ("we could not identify/resolve a programme at
// all"). A prior package's compatibility bridge
// (ingestion/programme-acquisition/worker-checkpoint-mapping.mjs)
// temporarily overloaded SOURCE_UNRESOLVED for this case; this dedicated
// entry replaces that overload once real integration made the
// distinction concretely useful (an operator triaging residue wants to
// tell "this source is healthy but quiet" apart from "this source's
// discovery is broken").
export const RESIDUE_REASONS = Object.freeze([
  "BROWSER_REQUIRED",
  "AI_RESEARCH_REQUIRED",
  "SOURCE_UNRESOLVED",
  "SOCIAL_FIRST_PROGRAMME",
  "IMAGE_OR_POSTER_ONLY",
  "ACCESS_BLOCKED",
  "UNSUPPORTED_COLLECTOR_FAMILY",
  "PROGRAMME_EMPTY",
]);

function zeroCounts() {
  return {
    total_sources: 0,
    completed_sources: 0,
    successful_sources: 0,
    residue_sources: 0,
    failed_sources: 0,
  };
}

/**
 * Create a new, freshly-QUEUED city job record. `estateRef` is an opaque
 * pointer (a path, a registry id, whatever the caller's own resolver
 * understands) to the input source estate — this module never reads or
 * interprets it. `configuration` is carried through unchanged to whatever
 * later reads the job (retry policy, concurrency, etc.).
 */
export function createCityJob({
  jobId,
  country,
  city,
  estateRef,
  createdAt,
  runnerVersionSha = null,
  configuration = {},
}) {
  if (!jobId) throw new Error("createCityJob: jobId is required");
  if (!country) throw new Error("createCityJob: country is required");
  if (!city) throw new Error("createCityJob: city is required");
  if (!createdAt) throw new Error("createCityJob: createdAt is required");

  return {
    job_id: jobId,
    country,
    city,
    estate_ref: estateRef ?? null,
    created_at: createdAt,
    started_at: null,
    completed_at: null,
    state: "QUEUED",
    ...zeroCounts(),
    last_checkpoint: null,
    current_source_id: null,
    cancel_requested: false,
    runner_version_sha: runnerVersionSha,
    configuration,
    final_metrics: null,
    error: null,
  };
}

/** Pure transition: QUEUED -> RUNNING. Preserves an existing started_at on resume (never resets a job's original start time just because processing resumed after a restart). */
export function markJobRunning(job, { now }) {
  return {
    ...job,
    state: "RUNNING",
    started_at: job.started_at ?? now,
  };
}

/** Pure transition: request cooperative cancellation. The runner checks this flag between sources (never mid-source) — see runner.mjs. */
export function requestJobCancel(job) {
  return { ...job, cancel_requested: true };
}

/**
 * Pure job-level terminal-state decision once every known source has
 * reached a terminal per-source checkpoint (or the runner stopped early
 * for cancellation/shutdown — see finalizeJob's own `stoppedEarly`).
 *
 *   COMPLETE               every source SUCCESS.
 *   COMPLETE_WITH_RESIDUE  every source reached a terminal state and at
 *                          least one is not SUCCESS (RESIDUE or FAILED).
 *                          One failed/unresolved venue never fails the
 *                          whole city (docs/UNATTENDED_CITY_WORKER.md).
 *   FAILED                 reserved for job-level catastrophe: a zero-
 *                          source estate, or an exception raised while
 *                          resolving the estate itself (see runner.mjs) —
 *                          never merely "some sources failed".
 *   CANCELLED               an operator-requested or shutdown-requested
 *                          stop before every source reached a terminal
 *                          state.
 */
export function determineFinalJobState({ totalSources, successfulSources, cancelledEarly }) {
  if (cancelledEarly) return "CANCELLED";
  if (totalSources === 0) return "FAILED";
  if (successfulSources === totalSources) return "COMPLETE";
  return "COMPLETE_WITH_RESIDUE";
}

export function isCatastrophicCityJob({ totalSources }) {
  return totalSources === 0;
}
