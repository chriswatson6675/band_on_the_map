// Converts genuinely retrieved Casa da Música agenda-card records
// (ingestion/casa-da-musica/discovery.mjs) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Fundação Casa da Música, registry id "casa-da-musica".
// Acquisition path: bounded, server-rendered schema.org Event microdata —
// the public https://casadamusica.com/agenda/ listing (and, at a
// caller's own bounded discretion, its rel="next" continuation pages).
//
// Date/time (important, deliberate certainty choice): each card's own
// `<time datetime="YYYY-MM-DD HH:MM:SS">` attribute is a genuine,
// unambiguous local Portugal wall-clock date and time — independently
// confirmed twice per card (machine attribute + human-readable text in
// the same shape) — but carries no UTC offset or "Z" suffix. Per this
// project's honest certainty model (docs/OBSERVATION_PIPELINE.md) that is
// exactly "FLOATING_LOCAL": a real, known local date-time, not a
// confirmed UTC instant. Unlike the more conservative ICS-adapter
// precedent (ingestion/village-underground, ingestion/bota), which leaves
// `start.date` null for a FLOATING_LOCAL value because a bare ICS local
// time carries no independent corroboration of which calendar date it
// names, this source's calendar date is not actually ambiguous — it is
// stated twice, in two independent forms, on the same card — so
// `start.date` is set from it directly. `start.raw` retains the full,
// unmodified datetime text.
//
// Venue: every card on this listing is a session inside the one Casa da
// Música building (a per-card room/auditorium sub-location, e.g. "Sala
// 2", is retained in source_fields.room but is not a separate venue).
// Canonical Venue resolution happens by source_id in
// ingestion/venue/resolver.mjs's resolveCasaDaMusicaObservation(), the
// same deliberate fixed-single-venue pattern already used for MEO Arena
// and Village Underground.
//
// Genre: the card's own descriptive subtitle line (e.g. "Fado e Música
// Tradicional Portuguesa") is retained verbatim in source_fields.subtitle
// as source-provided descriptive text — never asserted as a governed
// taxonomy the way AgendaLX's explicit category filter is.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "casa-da-musica";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

function deriveStart(record) {
  const start = emptyDateTime();
  start.raw = record?.datetime_text ?? null;
  if (typeof record?.datetime_text === "string") {
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(record.datetime_text);
    if (dateMatch) {
      start.date = dateMatch[1];
      start.certainty = "FLOATING_LOCAL";
    } else {
      start.certainty = "TEXT_ONLY";
    }
  }
  return start;
}

/**
 * Convert one retrieved Casa da Música agenda-card record into an
 * Observation.
 */
export function toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.source_record_id),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: record.description ?? null,

    start: deriveStart(record),
    end: emptyDateTime(), // no end/duration exposed by this listing

    venue_name: null, // see module doc comment — resolved by source_id, not fabricated per-record
    location_text: null,

    price_text: record.price_text ?? null,
    event_url: record.event_url ?? null,

    source_fields: {
      room: record.room ?? null,
      subtitle: record.subtitle ?? null,
      session_id: record.source_record_id,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // extracted facts from a shared listing page, not a per-record raw response
    },
  });
}

/**
 * Convert every record already parsed from one agenda-listing fetch
 * (ingestion/casa-da-musica/discovery.mjs's parseCasaDaMusicaAgenda())
 * into Observations, sharing one retrieval timestamp/source URL/fixture
 * path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
