// BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01, reconciled by
// BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01 — the
// compatibility contract between this repository's own per-source
// acquisition engine (source-execution.mjs's `acquireSource()`) and the
// city worker's checkpoint contract (`ingestion/city-worker/checkpoint-
// store.mjs`'s `recordSourceResult()`), now actually wired together by
// `ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs`.
//
// Both compatibility gaps this file originally documented (against
// worker candidate 8411a8d, built on an old isolated base) are now
// CLOSED on this integration branch:
//   1. job.mjs gained a dedicated `PROGRAMME_EMPTY` residue reason —
//      no longer overloading `SOURCE_UNRESOLVED`.
//   2. runner.mjs gained a third non-throwing SourceTask outcome kind,
//      `FAILED` — a mapped checkpoint here is passed straight through as
//      terminal, never triggering the worker's own outer retry (see
//      runner.mjs's own "ONE RETRY OWNER" header note).
// This file's own mapping table needed no other change for either fix —
// both were closed one layer away (job.mjs's vocabulary, runner.mjs's
// contract), which is itself a small proof that this mapping was
// correctly scoped to begin with.
//
// The worker's own checkpoint contract needs, per terminal source:
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
//   PROGRAMME_EMPTY                          -> RESIDUE, residue_reason PROGRAMME_EMPTY
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
// RETRY LAYERING (now architecturally enforced, not just documented): this
// repository's collector engine already retries each individual fetch
// (homepage/programme/detail) up to 3 times internally (see
// source-execution.mjs's `fetchBounded`) BEFORE `acquireSource()` ever
// returns NETWORK_FAILURE — that budget is fully exhausted by the time
// this mapping runs. `mapAcquisitionResultToCheckpoint()`'s own `attempts`
// is therefore always fixed at 1 (this collector engine's own
// `retry_count` is preserved separately inside `detail`, never conflated
// with the worker's own attempt counter) — the real adapter
// (programme-acquisition-resolver.mjs) passes this mapping's result
// straight through as a non-throwing SourceTask outcome, so runner.mjs's
// own outer retry never fires a second time for an already-terminal
// result (see tests/city-worker/one-retry-owner.test.mjs).

const RESIDUE_REASON_BY_STATE = {
  ACCESS_BLOCKED: "ACCESS_BLOCKED",
  BROWSER_REQUIRED: "BROWSER_REQUIRED",
  SOCIAL_FIRST_PROGRAMME: "SOCIAL_FIRST_PROGRAMME",
  IMAGE_OR_POSTER_ONLY: "IMAGE_OR_POSTER_ONLY",
  SOURCE_FINGERPRINT_UNSUPPORTED: "UNSUPPORTED_COLLECTOR_FAMILY",
  PROGRAMME_SOURCE_UNRESOLVED: "SOURCE_UNRESOLVED",
  PROGRAMME_EMPTY: "PROGRAMME_EMPTY",
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
