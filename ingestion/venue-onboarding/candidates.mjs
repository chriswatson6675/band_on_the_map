// VENUE-AUTO-ONBOARDING-01 — deterministic venue-candidate extraction.
//
// Turns unresolved (and already-resolved, for inventory purposes)
// Observations into a grouped inventory of venue CANDIDATES — a
// candidate is a distinct real-world place implied by one source's own
// data, identified by the most stable field that source actually
// provides. This module never creates a canonical Venue, never
// resolves an Observation, and never fuzzy-matches across sources —
// see ingestion/venue-onboarding/admission.mjs for the separate,
// evidence-gated decision of whether a candidate is safe to admit, and
// ingestion/venue/resolver.mjs / venues/source-venue-mappings.json for
// how an admitted candidate actually resolves future Observations.
//
// Candidate identity preference order (this task's brief, section 1):
//   1. stable source-provided venue ID       (Observation.source_fields.venue_id)
//   2. stable source-provided location/entity ID (Observation.source_fields.location_id)
//   3. exact source-provided venue_name
//   4. exact source-provided location_text
// A candidate key MUST retain source context: grouping is always scoped
// to (source_id, key_type, key) — never merged across sources, and
// never fuzzy/similarity-matched even within one source. Harmless
// normalisation (trim/collapse internal whitespace) is applied only to
// the key used for grouping/lookup; every distinct raw string actually
// observed is preserved verbatim in `raw_keys`.
//
// A 5th, deliberately last-resort key type (SOURCE_ID) is used only
// when an Observation carries NONE of the four fields above — every
// Observation always has a non-empty source_id (see
// ingestion/observation/contract.mjs's REQUIRED_FIELDS), so this never
// leaves a candidate ungrouped. This is not one of the task's four
// preference types; it exists because this repository's resolver
// already has a proven precedent for a source whose own real-world
// identity IS one physical place (SOURCE_ID_TO_FIXED_CANONICAL_VENUE in
// ingestion/venue/resolver.mjs, e.g. casa-da-musica, meo-arena). This
// module never assumes that on its own — grouping several thousand
// no-signal records from a genuinely multi-venue city feed (e.g.
// cm-odivelas-agenda-cultura) under one SOURCE_ID candidate is safe
// PRECISELY BECAUSE extraction never itself admits anything: whether
// that candidate is ever mapped to a venue is entirely gated on
// documented, independently-researched evidence in
// venues/candidate-research.json (see admission.mjs) — extraction just
// gives every observation a place in the inventory, honestly.
//
// Dependency-free (no Node built-ins), matching every other module this
// package extends.

export const CANDIDATE_KEY_TYPES = new Set([
  "SOURCE_VENUE_ID",
  "SOURCE_LOCATION_ID",
  "VENUE_NAME",
  "LOCATION_TEXT",
  "SOURCE_ID",
]);

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Deterministic candidate-inventory ID — never random/incrementing, so
 * the same (source_id, key_type, key) always produces the same
 * candidate_id across separate runs (proves "candidate extraction is
 * deterministic" — see tests/venue-onboarding-candidates.test.mjs).
 */
export function buildCandidateId(sourceId, keyType, key) {
  return `cand-${slugify(sourceId)}-${slugify(keyType)}-${slugify(key)}`;
}

/**
 * Derive the single best-available candidate key for one Observation,
 * in the priority order documented above, or `null` only if the
 * Observation itself has no source_id at all (should not happen for a
 * valid Observation — see ingestion/observation/contract.mjs).
 *
 * Returns `{ key_type, key, raw }` — `key` is the harmlessly
 * whitespace-normalised form used for grouping/lookup; `raw` is the
 * exact, unmodified source string/value this was derived from.
 */
export function deriveCandidateKey(observation) {
  const venueId = observation?.source_fields?.venue_id;
  if (venueId !== undefined && venueId !== null && String(venueId).trim() !== "") {
    const raw = String(venueId);
    return { key_type: "SOURCE_VENUE_ID", key: raw.trim(), raw };
  }

  const locationId = observation?.source_fields?.location_id;
  if (locationId !== undefined && locationId !== null && String(locationId).trim() !== "") {
    const raw = String(locationId);
    return { key_type: "SOURCE_LOCATION_ID", key: raw.trim(), raw };
  }

  if (nonEmptyString(observation?.venue_name)) {
    return { key_type: "VENUE_NAME", key: normaliseWhitespace(observation.venue_name), raw: observation.venue_name };
  }

  if (nonEmptyString(observation?.location_text)) {
    return {
      key_type: "LOCATION_TEXT",
      key: normaliseWhitespace(observation.location_text),
      raw: observation.location_text,
    };
  }

  if (nonEmptyString(observation?.source_id)) {
    return { key_type: "SOURCE_ID", key: observation.source_id, raw: observation.source_id };
  }

  return null;
}

/**
 * Group a list of Observations (any mix of already-resolved and
 * currently-unresolved — see docs comment above) into a deterministic
 * venue-candidate inventory.
 *
 *   observations       - Observation[]
 *   options.resolveFn  - optional (observation) => resolution, used only
 *                         to record `existing_canonical_mapping` /
 *                         `existing_venue_id` per candidate (e.g.
 *                         ingestion/venue/resolver.mjs's
 *                         resolveObservation) — never used to filter or
 *                         alter grouping itself.
 *
 * Output order is deterministic: candidates first-appear in the same
 * order their first Observation appears in the input array, so a fixed
 * input order (already guaranteed by every adapter — see
 * docs/OBSERVATION_PIPELINE.md) always produces the same candidate
 * inventory, in the same order.
 */
export function extractVenueCandidates(observations, { resolveFn } = {}) {
  const groups = new Map();

  for (const observation of observations ?? []) {
    const derived = deriveCandidateKey(observation);
    if (!derived) continue; // no source_id at all — not a valid Observation, never guessed at

    const groupKey = `${observation.source_id} ${derived.key_type} ${derived.key}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        candidate_id: buildCandidateId(observation.source_id, derived.key_type, derived.key),
        source_id: observation.source_id,
        key_type: derived.key_type,
        key: derived.key,
        raw_keys: [],
        observation_count: 0,
        example_event_titles: [],
        example_source_record_ids: [],
        existing_canonical_mapping: false,
        existing_venue_id: null,
        observations: [],
      });
    }

    const group = groups.get(groupKey);
    group.observation_count += 1;
    group.observations.push(observation);
    if (!group.raw_keys.includes(derived.raw)) group.raw_keys.push(derived.raw);
    if (
      group.example_event_titles.length < 3 &&
      nonEmptyString(observation.title) &&
      !group.example_event_titles.includes(observation.title)
    ) {
      group.example_event_titles.push(observation.title);
    }
    if (group.example_source_record_ids.length < 3) {
      group.example_source_record_ids.push(observation.source_record_id);
    }

    if (typeof resolveFn === "function") {
      const resolution = resolveFn(observation);
      if (resolution?.resolution_status === "RESOLVED") {
        group.existing_canonical_mapping = true;
        group.existing_venue_id = resolution.venue_id;
      }
    }
  }

  return [...groups.values()];
}
