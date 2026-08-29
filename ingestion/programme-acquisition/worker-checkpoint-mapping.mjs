// BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01 — the compatibility
// contract this package promised the unattended city-worker foundation
// (branch work/beatmapped-unattended-city-worker-foundation-01, candidate
// SHA 8411a8d): a pure, deterministic mapping from one
// source-execution.mjs `SourceAcquisitionResult` to the exact checkpoint
// shape that worker's `checkpoint-store.mjs`'s `recordSourceResult()`
// expects.
//
// THIS FILE DOES NOT ALTER 8411a8d. It lives entirely on THIS branch, and
// documents (rather than silently works around) the one small
// compatibility adjustment that worker will still need at real
// integration time — see "COMPATIBILITY GAP" below.
//
// The worker's own checkpoint contract (job.mjs / checkpoint-store.mjs on
// that branch) needs, per terminal source:
//   status       "SUCCESS" | "FAILED" | "RESIDUE"
//   attempts     number of times the worker's OWN SourceTask.run() was
//                called for this source
//   startedAt / completedAt
//   ...detail    outcome-specific payload (observation_count,
//                residue_reason, error, ...)
//
// MAPPING RULES (this repository's own real terminal-state vocabulary —
// see source-execution.mjs's own header comment for what produces each):
//
//   ACQUISITION_PROVEN                      -> SUCCESS
//   ACCESS_BLOCKED                           -> RESIDUE, residue_reason ACCESS_BLOCKED
//   BROWSER_REQUIRED                         -> RESIDUE, residue_reason BROWSER_REQUIRED
//   SOCIAL_FIRST_PROGRAMME                   -> RESIDUE, residue_reason SOCIAL_FIRST_PROGRAMME
//   IMAGE_OR_POSTER_ONLY                     -> RESIDUE, residue_reason IMAGE_OR_POSTER_ONLY
//   SOURCE_FINGERPRINT_UNSUPPORTED           -> RESIDUE, residue_reason UNSUPPORTED_COLLECTOR_FAMILY
//   PROGRAMME_SOURCE_UNRESOLVED              -> RESIDUE, residue_reason SOURCE_UNRESOLVED
//   PROGRAMME_EMPTY                          -> RESIDUE, residue_reason SOURCE_UNRESOLVED
//                                                (closest existing worker
//                                                category — see gap below)
//   NETWORK_FAILURE                          -> FAILED
//   STABLE_IDENTITY_PROOF_FAILED             -> FAILED
//   SUPPORTED_COLLECTOR_NO_VALID_EVENTS      -> FAILED
//                                                (a supported collector
//                                                ran but could not prove
//                                                anything — a per-run
//                                                acquisition problem, not
//                                                "needs a browser/AI/social
//                                                worker instead")
//
// COMPATIBILITY GAP (worker candidate 8411a8d — document, do not fix here):
//
// 1. job.mjs's RESIDUE_REASONS has no exact equivalent for PROGRAMME_EMPTY
//    ("a supported programme surface was found but genuinely has no
//    current listings right now" — structurally different from "we could
//    not resolve/identify a programme source at all"). Mapped to
//    SOURCE_UNRESOLVED here as the closest existing category; if this
//    reason proves common in real integration, worker's own
//    RESIDUE_REASONS should gain a dedicated PROGRAMME_EMPTY entry rather
//    than keep overloading SOURCE_UNRESOLVED.
//
// 2. RETRY LAYERING: this repository's own collector engine already
//    retries each individual fetch (homepage/programme/detail) up to 3
//    times internally (see source-execution.mjs's `fetchBounded`) BEFORE
//    acquireSource() ever returns NETWORK_FAILURE — that budget is fully
//    exhausted by the time this mapping runs. Worker candidate 8411a8d's
//    own `runner.mjs` retries a SourceTask by re-calling `task.run()`
//    whenever it THROWS (never when it returns a structured result). A
//    real adapter built on `acquireSource()` should therefore never throw
//    — every outcome (including NETWORK_FAILURE) is already terminal by
//    the time it reaches the worker, and should map through this file's
//    `mapAcquisitionResultToCheckpoint()` directly on the FIRST call, with
//    `attempts` fixed at 1 (this collector engine's own `retry_count` is
//    preserved separately inside `detail`, never conflated with the
//    worker's own attempt counter). No code change to 8411a8d is required
//    for this — it is a property of how the adapter must be written, not
//    a defect in either branch — but it is worth stating explicitly so a
//    future integrator does not accidentally wrap `acquireSource()` in a
//    second, redundant outer retry loop.

const RESIDUE_REASON_BY_STATE = {
  ACCESS_BLOCKED: "ACCESS_BLOCKED",
  BROWSER_REQUIRED: "BROWSER_REQUIRED",
  SOCIAL_FIRST_PROGRAMME: "SOCIAL_FIRST_PROGRAMME",
  IMAGE_OR_POSTER_ONLY: "IMAGE_OR_POSTER_ONLY",
  SOURCE_FINGERPRINT_UNSUPPORTED: "UNSUPPORTED_COLLECTOR_FAMILY",
  PROGRAMME_SOURCE_UNRESOLVED: "SOURCE_UNRESOLVED",
  PROGRAMME_EMPTY: "SOURCE_UNRESOLVED", // see "COMPATIBILITY GAP" item 1 above
};

const FAILED_STATES = new Set(["NETWORK_FAILURE", "STABLE_IDENTITY_PROOF_FAILED", "SUPPORTED_COLLECTOR_NO_VALID_EVENTS"]);

/**
 * Map one source-execution.mjs SourceAcquisitionResult to the checkpoint
 * shape worker candidate 8411a8d's `recordSourceResult()` expects. Pure —
 * no I/O, no clock reads (every timestamp comes from the result itself).
 */
export function mapAcquisitionResultToCheckpoint(result) {
  if (!result?.state) throw new Error("mapAcquisitionResultToCheckpoint: result.state is required");

  const detail = {
    collector: result.collector ?? null,
    normalized_event_count: result.normalized_event_count ?? 0,
    proven_event_count: result.proven_event_count ?? 0,
    retry_count: result.retry_count ?? 0,
    source_state: result.state, // the original, un-collapsed repository state — never discarded, even once mapped to the worker's coarser vocabulary
  };
  if (result.error) detail.error = result.error;

  if (result.state === "ACQUISITION_PROVEN") {
    return { status: "SUCCESS", attempts: 1, startedAt: result.started_at, completedAt: result.completed_at, ...detail };
  }
  if (RESIDUE_REASON_BY_STATE[result.state]) {
    return { status: "RESIDUE", attempts: 1, startedAt: result.started_at, completedAt: result.completed_at, residue_reason: RESIDUE_REASON_BY_STATE[result.state], ...detail };
  }
  if (FAILED_STATES.has(result.state)) {
    return { status: "FAILED", attempts: 1, startedAt: result.started_at, completedAt: result.completed_at, error: result.error ?? result.state, ...detail };
  }
  throw new Error(`mapAcquisitionResultToCheckpoint: unrecognised state "${result.state}" — this repository's terminal-state vocabulary changed; this mapping needs a matching update`);
}
