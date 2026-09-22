// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — corrects
// package-02's (BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01)
// failure semantics for the 15 coverage units it recorded PERMANENT_FAILURE.
//
// Those 15 units did not fail because of anything wrong with their own
// geography or OSM data — package-02's retained research artifact
// (research/venue-discovery/uk-national-expansion-01/coverage-progress.json)
// exhausted MAX_ATTEMPTS_PER_UNIT retries for exactly the units queried
// during a documented, externally-verified Overpass API outage (every
// Overpass endpoint and mirror returned connection failures while
// sibling services — GitHub, Nominatim — responded normally; see that
// package's own final report). "PERMANENT_FAILURE" is the wrong label for
// a transient PROVIDER outage — this module reclassifies those 15 units
// to RETRYABLE_PROVIDER_FAILURE, a distinct, non-terminal status meaning
// "this unit's own geography was never actually determined to be a
// problem — the campaign just needs to try it again."
//
// History is never deleted: package-02's original coverage-progress.json
// is left completely untouched at its own path (the authentic record of
// what package-02 actually observed). This module only ever produces a
// NEW, separate artifact carrying the correction, with an explicit
// `reclassification` block on every corrected entry recording the
// original status, the reason, and a pointer back to the original record
// — so the correction is itself auditable, not a silent rewrite.
//
// Pure module — no network. Caller supplies the already-loaded package-02
// coverage-progress.json contents.

export const RETRYABLE_PROVIDER_FAILURE = "RETRYABLE_PROVIDER_FAILURE";

const OVERPASS_OUTAGE_REASON =
  "BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 exhausted its per-unit retries during a verified Overpass API outage (overpass-api.de and two independent mirrors all returned connection failures while sibling services GitHub/Nominatim responded normally). This was a provider-availability failure, not a geographic or data-quality failure of the coverage unit itself.";

/**
 * Reclassify every PERMANENT_FAILURE entry in a package-02-shaped
 * coverage-progress.json payload ({ coverage_units: [{coverage_unit_id,
 * nation_hint, status}, ...] }) to RETRYABLE_PROVIDER_FAILURE. Every other
 * status (COMPLETE, PENDING) passes through completely unchanged. Never
 * mutates the input object.
 */
export function reclassifyPermanentFailures(coverageProgress, { reclassifiedAt = new Date().toISOString(), sourceArtifactPath } = {}) {
  const units = coverageProgress?.coverage_units ?? [];
  let reclassifiedCount = 0;
  const coverage_units = units.map((unit) => {
    if (unit.status !== "PERMANENT_FAILURE") return { ...unit };
    reclassifiedCount += 1;
    return {
      ...unit,
      status: RETRYABLE_PROVIDER_FAILURE,
      reclassification: {
        original_status: "PERMANENT_FAILURE",
        reclassified_status: RETRYABLE_PROVIDER_FAILURE,
        reclassified_at: reclassifiedAt,
        reason: OVERPASS_OUTAGE_REASON,
        source_artifact: sourceArtifactPath ?? "research/venue-discovery/uk-national-expansion-01/coverage-progress.json",
        corrected_by: "BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02",
      },
    };
  });
  return {
    corrected: { coverage_units },
    reclassified_count: reclassifiedCount,
    reclassified_unit_ids: coverage_units.filter((u) => u.status === RETRYABLE_PROVIDER_FAILURE).map((u) => u.coverage_unit_id),
  };
}

/** Every coverage_unit_id eligible for (re)processing by this package's own bulk-OSM sweep: PENDING and RETRYABLE_PROVIDER_FAILURE units. COMPLETE units are still reconciled against (never re-derived from scratch, never skipped from dedup) but are not "newly eligible" in the same sense. */
export function eligibleForReprocessing(correctedCoverageProgress) {
  return correctedCoverageProgress.coverage_units
    .filter((u) => u.status === "PENDING" || u.status === RETRYABLE_PROVIDER_FAILURE)
    .map((u) => u.coverage_unit_id);
}
