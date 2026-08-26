// BARCELONA-30-VENUE-POPULATION-02 — converts one Sala Upload
// discovery+event-page record pair (./discovery.mjs) into the generic
// Observation contract.
//
// Date/time: this source gives a calendar date (a Spanish "D de mes YYYY"
// string, mechanically parsed to "YYYY-MM-DD" by ./discovery.mjs's
// parseSpanishDate()) and a separate local time-of-day ("HH:MM"), with NO
// timezone/offset information at all — honestly FLOATING_LOCAL
// (Europe/Madrid, per this project's bounded Barcelona scope, never
// resolved against a timezone database), matching
// ingestion/paral-lel-62/observation-adapter.mjs's identical judgement
// for the same shape.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "sala-upload-barcelona";

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function deriveStart(pageRecord) {
  const dt = emptyDateTime();
  if (!pageRecord.date_iso) {
    dt.raw = pageRecord.date_text ?? null;
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = pageRecord.date_iso;
  if (TIME_RE.test(pageRecord.time_text ?? "")) {
    dt.raw = `${pageRecord.date_text} ${pageRecord.time_text}`;
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = pageRecord.date_text;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

/**
 * `listRecord` — from fetchSalaUploadEventLinks() ({source_record_id,
 * title, event_url}). `pageRecord` — from parseSalaUploadEventPage()
 * ({date_text, date_iso, time_text}).
 */
export function toObservation(listRecord, pageRecord, options = {}) {
  if (!listRecord?.source_record_id) {
    throw new Error("toObservation requires a listRecord with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: listRecord.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? listRecord.event_url ?? null,
    content_type: options.contentType ?? "text/html",

    title: listRecord.title ?? null,
    description: null,

    start: deriveStart(pageRecord ?? {}),
    end: emptyDateTime(), // this source never exposes an end time

    venue_name: null, // resolved by source_id — a single physical venue
    location_text: null,

    price_text: null,
    event_url: listRecord.event_url ?? null,

    source_fields: {},

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_HTML",
      content_type: "text/html",
      byte_faithful: false,
    },
  });
}
