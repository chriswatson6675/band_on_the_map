// Converts Gulbenkian Música event-detail discovery records
// (ingestion/gulbenkian/discovery.mjs's parseGulbenkianEventDetail output)
// into the generic Observation contract.
//
// Source: Fundação Calouste Gulbenkian — Gulbenkian Música, based entirely
// on the retained, READY_FOR_ACTIVATION investigation at
// research/source-investigations/gulbenkian-lisbon-01/. This module makes
// no activation decision itself and never writes to sources/*.json or any
// venues/*.json registry.
//
// Datetime certainty: investigation.json's field_assessment.start_date /
// .time / .end are all PROVEN but explicitly floating-local — the JSON-LD
// startDate/endDate strings carry no timezone/offset anywhere in the
// retained HTML, and Europe/Lisbon is only "a reasonable real-world
// inference", never promoted to a fabricated UTC instant. This adapter
// therefore records certainty "FLOATING_LOCAL", matching
// ingestion/ausland/observation-adapter.mjs's precedent — never
// "UTC_INSTANT".
//
// Venue/location: this source genuinely varies location per event (mostly
// "Grande Auditório", but at least one sampled event, "Vale do Silêncio",
// is off-site at "Parque Vale do Silêncio") — venue_name is left null
// here, matching ingestion/capitolio/observation-adapter.mjs's convention
// for a source that does not pin one hardcoded hall; the source's own
// location string is preserved, unresolved, in location_text. This
// adapter creates no venue_id and performs no venue resolution.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "gulbenkian";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

function deriveFloatingLocal(isoLocal) {
  const dt = emptyDateTime();
  if (typeof isoLocal !== "string" || isoLocal.trim() === "") {
    return dt; // stays UNKNOWN — never fabricated
  }
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}$/.exec(isoLocal);
  dt.raw = isoLocal;
  dt.date = match ? match[1] : null;
  // Genuinely floating-local: the source's own JSON-LD carries no
  // timezone/offset anywhere. Never UTC_INSTANT — see module header.
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

/**
 * Convert one parseGulbenkianEventDetail() record into an Observation.
 * `options.retrievedAt` and `options.fixturePath` are passed through for
 * provenance; both default to null rather than being guessed.
 */
export function toObservation(record, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.source_record_id),
    retrieved_at: options.retrievedAt ?? null,

    source_url: record.event_url ?? null,
    content_type: DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: record.description ?? null,

    start: deriveFloatingLocal(record.start_iso),
    end: deriveFloatingLocal(record.end_iso),

    venue_name: null, // this source varies location per event — never hardcoded, see module header
    location_text: record.location_name ?? null,

    price_text: record.price_text ?? null,
    event_url: record.event_url ?? null,

    source_fields: {
      location_name: record.location_name ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_HTML",
      content_type: DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // fixture_path is a bounded excerpt, not the full raw HTTP response body
    },
  });
}

/**
 * Convert an array of parseGulbenkianEventDetail() records into
 * Observations. `optionsPerRecord`, when provided, is called with each
 * record to produce that record's own `toObservation` options (e.g. a
 * distinct fixturePath per detail page) — omit it to use the same
 * `options` for every record.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) =>
    toObservation(record, typeof options === "function" ? options(record) : options),
  );
}
