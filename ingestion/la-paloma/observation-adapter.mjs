// BARCELONA-30-VENUE-POPULATION-01 — converts La Paloma discovery
// records (./discovery.mjs) into the generic Observation contract.
//
// Date/time: the source's own Catalan text is parsed into a calendar
// date + local time-of-day with NO timezone/offset information — this
// is honestly FLOATING_LOCAL (Europe/Madrid, never resolved against a
// timezone database here), matching ingestion/paral-lel-62's own
// identical judgement for the same kind of source data.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "la-paloma-barcelona";

function deriveStart(record) {
  const dt = emptyDateTime();
  if (!record.date_iso) {
    dt.raw = record.date_text ?? null;
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = record.date_iso;
  dt.raw = record.date_text;
  dt.certainty = record.time_text ? "FLOATING_LOCAL" : "DATE_ONLY";
  return dt;
}

export function toObservation(record, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  // Title + subtitle: this source's own "name" is often a series/brand
  // ("LA PALOMA PRES."), and "subtitle" carries the actual named
  // performer/DJ ("TSHA") as a SEPARATE field — combined here (never
  // fabricated) into one honest, human-readable title, matching this
  // project's "absence preserved, presence combined mechanically"
  // convention elsewhere (see ingestion/events-calendar-api/
  // observation-adapter.mjs's adjacent-value collapsing rule).
  const title = record.subtitle ? `${record.title} — ${record.subtitle}` : record.title;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? "application/json",

    title: title ?? null,
    description: null,

    start: deriveStart(record),
    end: emptyDateTime(), // this source never exposes an end time

    venue_name: null, // resolved by source_id — a single physical venue
    location_text: null,

    price_text: null, // this source's own "preu" field was observed as 0 for every sampled record (external ticketing) — never fabricated as free
    event_url: record.event_url ?? null,

    source_fields: {
      category_text: record.category_text ?? null,
      sold_out: record.sold_out ?? null,
      image_url: record.image_url ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: options.contentType ?? "application/json",
      byte_faithful: false,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
