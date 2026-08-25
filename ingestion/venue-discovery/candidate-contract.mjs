// VENUE-DISCOVERY-ENGINE-01 — generic candidate-venue contract.
//
// A discovery Candidate is a plausible live-music venue surfaced by a
// discovery source, in exactly one managed Area (see
// ingestion/area/contract.mjs). It is deliberately NOT a canonical Venue
// (ingestion/venue/contract.mjs) — a candidate:
//   - is never itself created as a Venue registry entry;
//   - is never treated as an active Source;
//   - never causes an Observation/Event/collector to be created;
//   - always retains WHY it was surfaced (source_evidence), so a human
//     can answer "why does BeatMapped think this might be a music
//     venue?" for any candidate at any time.
// Promoting a candidate into the existing onboarding/investigation
// pipeline (ingestion/venue-onboarding/, ingestion/source-investigation/)
// is a deliberately separate, later, explicitly-authorised step — see
// docs/VENUE_DISCOVERY.md.
//
// Dependency-free, matching every other ingestion module in this
// repository.

export const DISCOVERY_STATUSES = new Set([
  "LIKELY_LIVE_MUSIC_VENUE",
  "POSSIBLE_LIVE_MUSIC_VENUE",
  "WEAK_CANDIDATE",
  "EXCLUDED",
]);

function slug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Deterministic discovery-candidate ID, scoped to (area, source kind,
 * source id, source record id) — never random/incrementing, and never
 * merged across sources at this stage (see dedupe.mjs for the separate,
 * later, evidence-gated merge step). Distinct namespace/prefix
 * ("dcand-") from venue-onboarding's "cand-" IDs
 * (ingestion/venue-onboarding/candidates.mjs) — these are a different
 * concept: an onboarding candidate groups existing Observations, a
 * discovery candidate is a raw lead from a geographic/registry source
 * that has never been an Observation at all.
 */
export function buildDiscoveryCandidateId(areaId, sourceKind, sourceId, sourceRecordId) {
  return `dcand-${slug(areaId)}-${slug(sourceKind)}-${slug(sourceId)}-${slug(sourceRecordId)}`;
}

/**
 * Build one discovery Candidate.
 *
 * `source_evidence` always holds at least one entry — the full,
 * multi-source provenance trail this candidate carries. Before any
 * deduplication merge, that is exactly one entry (this candidate's own
 * originating record); dedupe.mjs may later concatenate several
 * candidates' source_evidence into one merged candidate, but never
 * discards any of it. The top-level source_kind/source_id/
 * source_record_id/source_url/source_tags fields always mirror
 * source_evidence[0] (the primary/first-seen evidence) purely for quick
 * filtering — source_evidence[] is the authoritative record.
 *
 * candidate_id defaults to buildDiscoveryCandidateId() from
 * (area_id, source_kind, source_id, source_record_id) when not supplied.
 * Throws if the resulting candidate fails validateCandidate().
 */
export function createCandidate(fields) {
  const primaryEvidence = {
    source_kind: fields.source_kind ?? null,
    source_id: fields.source_id ?? null,
    source_record_id: fields.source_record_id ?? null,
    source_url: fields.source_url ?? null,
    source_tags: fields.source_tags ?? {},
    retrieved_at: fields.first_seen_at ?? null,
  };

  const candidate = {
    candidate_id:
      fields.candidate_id ??
      buildDiscoveryCandidateId(fields.area_id, fields.source_kind, fields.source_id, fields.source_record_id),
    area_id: fields.area_id ?? null,
    name: fields.name ?? null,
    normalised_name: fields.normalised_name ?? null,
    country: fields.country ?? null,
    country_code: fields.country_code ?? null,
    city: fields.city ?? null,
    address: fields.address ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    website_url: fields.website_url ?? null,
    normalised_domain: fields.normalised_domain ?? null,
    source_kind: primaryEvidence.source_kind,
    source_id: primaryEvidence.source_id,
    source_record_id: primaryEvidence.source_record_id,
    source_url: primaryEvidence.source_url,
    source_tags: primaryEvidence.source_tags,
    source_evidence: fields.source_evidence ?? [primaryEvidence],
    discovery_status: fields.discovery_status ?? "EXCLUDED",
    discovery_status_reasons: fields.discovery_status_reasons ?? [],
    first_seen_at: fields.first_seen_at ?? null,
    last_seen_at: fields.last_seen_at ?? fields.first_seen_at ?? null,
    merged_candidate_ids: fields.merged_candidate_ids ?? [],
  };

  const errors = validateCandidate(candidate);
  if (errors.length > 0) {
    throw new Error(`Invalid discovery Candidate: ${errors.join("; ")}`);
  }
  return candidate;
}

/**
 * Return an array of validation error strings (empty if valid).
 * Deliberately conservative/fail-closed, matching
 * ingestion/venue/contract.mjs's validateVenue() style: coordinates
 * must be both-present-or-both-null and in-range; every required
 * identity/provenance field must be non-empty; source_evidence must
 * never be empty (a candidate with no evidence at all should never have
 * been created).
 */
export function validateCandidate(candidate) {
  const errors = [];

  if (!nonEmptyString(candidate?.candidate_id)) errors.push("candidate_id is required");
  if (!nonEmptyString(candidate?.area_id)) errors.push("area_id is required");
  if (!nonEmptyString(candidate?.name)) errors.push("name is required");
  if (!nonEmptyString(candidate?.country_code)) errors.push("country_code is required");
  if (!nonEmptyString(candidate?.city)) errors.push("city is required");
  if (!nonEmptyString(candidate?.source_kind)) errors.push("source_kind is required");
  if (!nonEmptyString(candidate?.source_id)) errors.push("source_id is required");
  if (!nonEmptyString(candidate?.source_record_id)) errors.push("source_record_id is required");
  if (!nonEmptyString(candidate?.first_seen_at)) errors.push("first_seen_at is required");
  if (!nonEmptyString(candidate?.last_seen_at)) errors.push("last_seen_at is required");

  if (!candidate?.discovery_status || !DISCOVERY_STATUSES.has(candidate.discovery_status)) {
    errors.push(`discovery_status must be one of ${[...DISCOVERY_STATUSES].join(", ")}`);
  }

  const hasLat = candidate?.latitude !== null && candidate?.latitude !== undefined;
  const hasLng = candidate?.longitude !== null && candidate?.longitude !== undefined;
  if (hasLat !== hasLng) {
    errors.push("latitude and longitude must both be present or both be null");
  }
  if (hasLat) {
    if (!isFiniteNumber(candidate.latitude) || candidate.latitude < -90 || candidate.latitude > 90) {
      errors.push("latitude must be a number between -90 and 90");
    }
    if (!isFiniteNumber(candidate.longitude) || candidate.longitude < -180 || candidate.longitude > 180) {
      errors.push("longitude must be a number between -180 and 180");
    }
  }

  if (!Array.isArray(candidate?.source_evidence) || candidate.source_evidence.length === 0) {
    errors.push("source_evidence must be a non-empty array");
  }

  if (!Array.isArray(candidate?.discovery_status_reasons)) {
    errors.push("discovery_status_reasons must be an array");
  }

  if (!Array.isArray(candidate?.merged_candidate_ids)) {
    errors.push("merged_candidate_ids must be an array");
  }

  return errors;
}
