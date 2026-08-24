// VENUE-AUTO-ONBOARDING-01 — data-driven Source -> canonical Venue
// resolution, governed entirely by venues/source-venue-mappings.json.
//
// This is the mechanism that lets a NEW venue be onboarded without
// writing new if/else or hardcoded constants into
// ingestion/venue/resolver.mjs: it computes the exact same candidate
// key ingestion/venue-onboarding/candidates.mjs would derive for an
// Observation, and looks it up in a plain data array. Adding a new
// venue is adding a new mapping entry to that JSON file — never a code
// change here.
//
// No fuzzy fallback: a candidate key with no exact (source_id,
// source_key_type, source_key) match in `mappings` is UNRESOLVED, full
// stop — mirroring ingestion/venue/resolver.mjs's own "never a best
// guess" rule exactly.
//
// Dependency-free; safe to import from a browser bundle (no Node
// built-ins here).

import { deriveCandidateKey } from "./candidates.mjs";

/**
 * One mapping entry's required shape (see venues/source-venue-mappings.json):
 *   { source_id, source_key_type, source_key, venue_id, evidence[], ... }
 * Extra provenance fields (created_at, retrieved_at, method, notes) are
 * carried in the data file for governance/audit but are not read here.
 */
export function findMapping(mappings, sourceId, keyType, key) {
  return (
    (mappings ?? []).find(
      (mapping) =>
        mapping?.source_id === sourceId && mapping?.source_key_type === keyType && mapping?.source_key === key,
    ) ?? null
  );
}

/**
 * Resolve one Observation purely from a supplied mappings array — the
 * SAME shape ingestion/venue/resolver.mjs's resolveObservation() returns
 * ({ venue_id, resolution_status, resolution_method }), so callers never
 * need to distinguish "resolved via the old hardcoded tables" from
 * "resolved via a new data-driven mapping".
 */
export function resolveFromMappings(observation, mappings) {
  const derived = deriveCandidateKey(observation);
  if (!derived) {
    return { venue_id: null, resolution_status: "UNRESOLVED", resolution_method: "NO_CANDIDATE_KEY" };
  }

  const match = findMapping(mappings, observation?.source_id, derived.key_type, derived.key);
  if (!match) {
    return { venue_id: null, resolution_status: "UNRESOLVED", resolution_method: "NO_DATA_DRIVEN_MAPPING" };
  }

  return {
    venue_id: match.venue_id,
    resolution_status: "RESOLVED",
    resolution_method: `DATA_DRIVEN_MAPPING:${derived.key_type}`,
  };
}
