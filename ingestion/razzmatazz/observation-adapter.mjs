// BARCELONA-30-VENUE-POPULATION-02 — converts Razzmatazz discovery
// records (./discovery.mjs) into the generic Observation contract.
//
// Date/time: this source gives a calendar date ("YYYY-MM-DD") and a
// separate local event-start time-of-day ("HH:MM"), with no timezone/
// offset information at all — honestly FLOATING_LOCAL (Europe/Madrid, per
// this project's bounded Barcelona scope, never resolved against a
// timezone database), matching ingestion/paral-lel-62/observation-adapter.mjs's
// identical judgement for the same shape.
//
// venue_name is deliberately left null (this source resolves to ONE
// physical venue, Razzmatazz — its 3 numbered concert rooms are not
// separate venues, matching this project's existing Casa da Música/
// Jamboree "room is not a separate venue" precedent) — resolution keys on
// source_id via venues/source-venue-mappings.json (SOURCE_ID key type).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "razzmatazz-barcelona";

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function deriveStart(record) {
  const dt = emptyDateTime();
  if (!record.date_iso) {
    dt.raw = record.date_iso ?? null;
    dt.certainty = "UNKNOWN";
    return dt;
  }
  dt.date = record.date_iso;
  if (TIME_RE.test(record.start_time_text ?? "")) {
    dt.raw = `${record.date_iso} ${record.start_time_text}`;
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = record.date_iso;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

function combinedTitle(record) {
  if (!record.title) return null;
  return record.subtitle ? `${record.title}${record.subtitle}` : record.title;
}

export function toObservation(record, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? "application/json",

    title: combinedTitle(record),
    description: null,

    start: deriveStart(record),
    end: emptyDateTime(), // this source never exposes an end time

    venue_name: null, // resolved by source_id — a single physical venue (see doc comment)
    location_text: null,

    price_text: null,
    event_url: record.event_url ?? record.ticket_url ?? null,

    source_fields: {
      room: record.room ?? null,
      door_time_text: record.door_time_text ?? null,
      ticket_url: record.ticket_url ?? null,
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
