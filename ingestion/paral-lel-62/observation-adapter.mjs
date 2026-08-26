// BARCELONA-30-VENUE-POPULATION-01 — converts Paral·lel 62 discovery
// records (./discovery.mjs) into the generic Observation contract.
//
// Date/time: this source gives a calendar date ("DD-MM-YYYY", parsed by
// discovery.mjs into "YYYY-MM-DD") and a separate local time-of-day
// ("HH:MM"), with NO timezone/offset information at all — this is
// honestly a FLOATING_LOCAL datetime (Europe/Madrid, per this project's
// bounded Barcelona scope, but never resolved against a timezone
// database here), never upgraded to a fabricated UTC instant.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "paral-lel-62-barcelona";

const TIME_RE = /^(\d{2}):(\d{2})$/;

function deriveStart(record) {
  const dt = emptyDateTime();
  if (!record.date_iso) {
    dt.raw = record.date_text ?? null;
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }

  dt.date = record.date_iso;
  const timeMatch = TIME_RE.exec(record.time_text ?? "");
  if (timeMatch) {
    dt.raw = `${record.date_text} ${record.time_text}`;
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = record.date_text;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
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

    title: record.title ?? null,
    description: record.description ?? null,

    start: deriveStart(record),
    end: emptyDateTime(), // this source never exposes an end time

    venue_name: null, // resolved by source_id — a single physical venue
    location_text: null,

    price_text: record.price_text ?? null,
    event_url: record.event_url ?? record.ticket_url ?? null,

    source_fields: {
      room: record.room ?? null,
      doors_time_text: record.doors_time_text ?? null,
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
