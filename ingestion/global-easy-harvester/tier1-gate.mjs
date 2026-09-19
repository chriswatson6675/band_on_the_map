// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — the Tier-1 eligibility gate
// and deterministic proof step. Reuses acquireSource()
// (ingestion/programme-acquisition/source-execution.mjs) as the ONLY
// acquisition mechanism — no new collector, no browser, no AI. Every
// branch below is a single, bounded pass: no retries beyond what
// acquireSource() already owns internally, no escalation, no recursive
// research. A candidate this gate cannot prove terminates in exactly one
// defer/repair state and control returns to the caller immediately.

import { acquireSource } from "../programme-acquisition/source-execution.mjs";
import { preGateAcquisitionClass, mapAcquisitionResultToTier1Verdict } from "./contract.mjs";

// No source in this repository's registries has ever reached lifecycle
// ENABLED yet (see this controller's own admission.mjs header comment —
// rights review is a separate, not-yet-taken step); TECHNICALLY_REVIEWED
// is the real "acquisition path already proven" bar in practice today.
// PAUSED/RETIRED are deliberate human decisions this controller must
// leave alone entirely — never re-proven, never repaired, never
// re-admitted.
const ALREADY_REGISTERED_LIFECYCLE_STATUSES = new Set(["DISCOVERED", "TECHNICALLY_REVIEWED", "RIGHTS_REVIEWED", "ENABLED"]);

/**
 * A candidate that already has a matching registered source (found via
 * candidate-pool.mjs's own venue_id/website cross-reference) is not a NEW
 * Tier-1 win — it's either already live, broken (belongs in the repair
 * queue), or deliberately paused/retired (left alone). The live/broken
 * check re-uses the SAME acquireSource() call the Tier-1 gate itself
 * uses, against the REGISTERED source's own official_website/events_url
 * (never the candidate-provider's own, possibly-stale, hint).
 *
 * Returns null when the candidate is NOT already registered (i.e. the
 * caller should proceed to evaluateTier1Candidate below).
 */
export async function checkExistingRegistration(candidate, { fetchDocument, detailLimit } = {}) {
  const source = candidate.existing_source;
  if (!source) return null;

  if (!ALREADY_REGISTERED_LIFECYCLE_STATUSES.has(source.lifecycle_status)) {
    return { status: "SKIP_ALREADY_LIVE", acquisition_result: null, note: `lifecycle_status is ${source.lifecycle_status} — left alone` };
  }

  const result = await acquireSource(
    { source_id: source.id, venue: source.name, website: source.official_website ?? null, programme_url: source.events_url ?? null },
    { fetchDocument, detailLimit },
  );

  if (result.state === "ACQUISITION_PROVEN") {
    return { status: "SKIP_ALREADY_LIVE", acquisition_result: result };
  }
  return { status: "REPAIR_REQUIRED", acquisition_result: result };
}

/**
 * Evaluate one candidate NOT already fully registered. Returns
 * { status: "T1_PROVEN", acquisition_result } or
 * { status: "T1_DEFER_*", defer_reason, acquisition_result? }.
 */
export async function evaluateTier1Candidate(candidate, { fetchDocument, detailLimit } = {}) {
  // Condition 1: identity clarity (venue name/city already required to
  // reach the pool; location is the remaining check).
  if (!candidate.has_admissible_location) {
    return { status: "T1_DEFER_IDENTITY", defer_reason: "NO_RETAINED_LOCATION_EVIDENCE" };
  }

  // Condition 2: official source known.
  if (!candidate.website && !candidate.programme_url) {
    return { status: "T1_DEFER_SOURCE_DISCOVERY", defer_reason: "NO_KNOWN_WEBSITE_OR_PROGRAMME_URL" };
  }

  // Condition 8 (no new collector): a retained investigation already
  // classifying this source as browser/social/adaptation-required is
  // deferred WITHOUT spending a network call — acquireSource() would only
  // rediscover the same fact.
  if (candidate.acquisition_class) {
    const preGateDefer = preGateAcquisitionClass(candidate.acquisition_class);
    if (preGateDefer) {
      return { status: preGateDefer, defer_reason: `RETAINED_ACQUISITION_CLASS_${candidate.acquisition_class}` };
    }
  }

  const result = await acquireSource(
    { source_id: candidate.source_id, venue: candidate.canonical_name, website: candidate.website, programme_url: candidate.programme_url },
    { fetchDocument, detailLimit },
  );

  const verdict = mapAcquisitionResultToTier1Verdict(result);
  if (verdict.proven) {
    return { status: "T1_PROVEN", acquisition_result: result };
  }
  return { status: verdict.defer_state, defer_reason: verdict.defer_reason, acquisition_result: result };
}
