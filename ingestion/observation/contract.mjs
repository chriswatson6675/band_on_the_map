// Source-agnostic Observation contract.
//
// An Observation represents "what one source said about one source record
// at one retrieval point." It is NOT a canonical Event (see
// docs/ARCHITECTURE.md): multiple Observations may later resolve to one
// Event. This module never creates Event identity, never deduplicates
// across sources or records, never resolves Venue identity/coordinates,
// and never fabricates a value a source record did not genuinely provide.
//
// Deliberately dependency-free and source-agnostic: this module must
// never reference any specific source by name. Source-specific mapping
// lives in per-source adapters (e.g. ingestion/agendalx/observation-adapter.mjs,
// ingestion/hot-clube/observation-adapter.mjs) that call createObservation().

export const REQUIRED_FIELDS = ["source_id", "source_record_id", "retrieved_at"];

/**
 * A generic, honest date/time representation used for `start`/`end`.
 * Never fabricates an instant the source did not genuinely provide — an
 * adapter that only has a calendar date, or only free text, must leave
 * the stronger fields null rather than guessing.
 *
 *   raw       - the source's own representation, preserved for provenance
 *   date      - calendar date "YYYY-MM-DD" if genuinely known, else null
 *   iso       - a full ISO 8601 UTC instant, only if confirmed UTC, else null
 *   is_utc    - true only if `iso` is a confirmed UTC instant
 *   tzid      - a source-declared timezone identifier, left unresolved
 *   certainty - "UTC_INSTANT" | "DATE_ONLY" | "TZID_QUALIFIED_UNRESOLVED"
 *               | "FLOATING_LOCAL" | "TEXT_ONLY" | "UNKNOWN"
 */
export function emptyDateTime() {
  return {
    raw: null,
    date: null,
    iso: null,
    is_utc: null,
    tzid: null,
    certainty: "UNKNOWN",
  };
}

/**
 * Descriptor for the genuine retained evidence behind an Observation.
 *
 *   fixture_path   - repo-relative path to the retained evidence file
 *   evidence_kind  - what kind of evidence this is, e.g.
 *                     "RAW_HTTP_RESPONSE_BYTES" (byte-identical to what the
 *                     collector received) or "PARSED_STRUCTURED_JSON" (the
 *                     source's structured record, already parsed/re-
 *                     serialized — genuinely useful, but not byte-identical)
 *   content_type   - the retained content type, if known
 *   byte_faithful  - true only if fixture_path is proven byte-identical to
 *                     the original response; false when it is not, or when
 *                     that has not been established — always a boolean,
 *                     never null/undefined; there is no third/unknown state
 */
export function emptyRawEvidence() {
  return {
    fixture_path: null,
    evidence_kind: null,
    content_type: null,
    byte_faithful: false,
  };
}

/**
 * Build one Observation. Any field the caller omits defaults to null (or
 * an empty object for source_fields) rather than being fabricated —
 * absence is preserved explicitly. Throws if the record does not satisfy
 * REQUIRED_FIELDS; callers that want the error list without throwing
 * should call validateObservation() directly.
 */
export function createObservation(fields) {
  const observation = {
    source_id: fields.source_id ?? null,
    source_record_id: fields.source_record_id ?? null,
    retrieved_at: fields.retrieved_at ?? null,

    source_url: fields.source_url ?? null,
    content_type: fields.content_type ?? null,

    title: fields.title ?? null,
    description: fields.description ?? null,
    start: fields.start ?? emptyDateTime(),
    end: fields.end ?? emptyDateTime(),

    venue_name: fields.venue_name ?? null,
    location_text: fields.location_text ?? null,

    price_text: fields.price_text ?? null,
    event_url: fields.event_url ?? null,

    source_fields: fields.source_fields ?? {},

    raw_evidence: fields.raw_evidence ?? emptyRawEvidence(),
  };

  const errors = validateObservation(observation);
  if (errors.length > 0) {
    throw new Error(`Invalid Observation: ${errors.join("; ")}`);
  }

  return observation;
}

/**
 * Return an array of validation error strings (empty if valid). Does not
 * throw — callers that want a hard failure should use createObservation().
 */
export function validateObservation(observation) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    const value = observation?.[field];
    if (value === null || value === undefined || value === "") {
      errors.push(`${field} must be a non-empty value`);
    }
  }

  if (observation?.source_id != null && typeof observation.source_id !== "string") {
    errors.push("source_id must be a string when present");
  }

  if (observation?.source_record_id != null && typeof observation.source_record_id !== "string") {
    errors.push("source_record_id must be a string when present");
  }

  if (observation?.raw_evidence != null && typeof observation.raw_evidence.byte_faithful !== "boolean") {
    errors.push("raw_evidence.byte_faithful must be a boolean (true or false), never null/unknown");
  }

  return errors;
}
