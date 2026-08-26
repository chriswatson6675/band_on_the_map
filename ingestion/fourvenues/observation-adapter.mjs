// BARCELONA-30-VENUE-POPULATION-01 — generic mapping from one normalized
// Fourvenues event record (./client.mjs's normalizeEventRecord()) into
// the project's generic Observation contract
// (ingestion/observation/contract.mjs).
//
// Deliberately generic: never references a specific venue. The only
// per-source input is `config.source_id`; venue identity is resolved by
// source_id (one Fourvenues organizer_slug == one physical venue in
// every case observed so far), matching the existing "fixed single
// venue, resolved by source_id" precedent already used for
// Casa da Música / MEO Arena / LAV (see ingestion/lav/observation-adapter.mjs's
// own doc comment).
//
// Date/time: the source's own `start`/`end` fields are genuine Unix-
// SECOND timestamps (confirmed live — see
// research/source-investigations/opium-barcelona-01/investigation.json)
// — converting a Unix timestamp to a UTC ISO instant is a deterministic,
// mechanical arithmetic operation, never inference, so certainty is
// honestly UTC_INSTANT whenever the source supplies one.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

const DEFAULT_CONTENT_TYPE = "application/json";

/**
 * Derive one `start`/`end`-shaped datetime from a Unix-second timestamp.
 * Exported for direct unit testing.
 */
export function deriveDateTimeFromUnixSeconds(unixSeconds) {
  const dt = emptyDateTime();
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const iso = new Date(unixSeconds * 1000).toISOString();
  dt.raw = String(unixSeconds);
  dt.iso = iso;
  dt.is_utc = true;
  dt.date = iso.slice(0, 10);
  dt.certainty = "UTC_INSTANT";
  return dt;
}

/**
 * Convert one normalized Fourvenues record into an Observation.
 *
 * `config` — `{ source_id }` at minimum.
 * `options` — `{ retrievedAt, sourceUrl, contentType, fixturePath }`.
 */
export function toObservation(record, config, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }
  if (!config?.source_id) {
    throw new Error("toObservation requires config.source_id");
  }

  return createObservation({
    source_id: config.source_id,
    source_record_id: String(record.source_record_id),
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: null, // not exposed by this source's events list endpoint

    start: deriveDateTimeFromUnixSeconds(record.start_unix),
    end: deriveDateTimeFromUnixSeconds(record.end_unix),

    venue_name: null, // resolved by source_id — see module doc comment
    location_text: null,

    price_text: null, // not exposed by this source's events list endpoint
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.slug ?? null,
      genres: record.genres ?? [],
      artists: record.artists ?? [],
      age_restriction: record.age_restriction ?? null,
      is_private: record.is_private ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false,
    },
  });
}

/**
 * Convert every record from one fetchFourvenuesEvents() run into
 * Observations, sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(records, config, options = {}) {
  return (records ?? []).map((record) => toObservation(record, config, options));
}
