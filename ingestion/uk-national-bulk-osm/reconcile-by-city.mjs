// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — a
// performance-only wrapper around ingestion/venue-discovery/reconcile.mjs's
// reconcileCandidates(), which is REUSED completely UNCHANGED (this
// package's brief). That function's own strongMatch()/possibleMatch()
// both hard-gate on an exact city match before comparing anything else
// (ingestion/venue-discovery/reconcile.mjs: "if (a.country_code !==
// b.country_code || normaliseText(a.city) !== normaliseText(b.city))
// return false") — so two candidates in different cities can NEVER be
// grouped together, regardless of every other field. reconcileCandidates()
// itself is O(n^2) over its FULL input with no such bucketing, which is
// fine at package-02's per-run-of-a-few-cells scale but not at this
// package's whole-country scale (tens of thousands of raw candidates
// nationally): the two-city-can-never-match guarantee means running it
// once per city bucket produces IDENTICAL groups to running it once
// globally, while replacing one O(n^2) pass with the much smaller sum of
// each city's own O(n_city^2) — see
// tests/uk-national-bulk-osm-reconcile-by-city.test.mjs's equivalence
// test against the unmodified function on a mixed-city fixture.

import { reconcileCandidates } from "../venue-discovery/reconcile.mjs";
import { normaliseText } from "../venue-discovery/normalise.mjs";

/**
 * Bucket by normalised city, call the UNCHANGED reconcileCandidates() once
 * per bucket, then concatenate. A candidate with no city at all (should
 * never happen — city is a required VenueDiscoveryCandidate field — but
 * handled defensively) falls into its own "" bucket rather than being
 * dropped.
 */
export function reconcileCandidatesByCity(candidates) {
  const byCity = new Map();
  for (const candidate of candidates) {
    const key = normaliseText(candidate.city);
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(candidate);
  }
  const groups = [];
  for (const bucket of byCity.values()) {
    groups.push(...reconcileCandidates(bucket));
  }
  return groups;
}
