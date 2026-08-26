// BARCELONA-30-VENUE-POPULATION-01 — converts Sant Jordi Club discovery
// records (./discovery.mjs) into the generic Observation contract.
//
// Date/time: reuses ingestion/json-ld/observation-adapter.mjs's
// deriveDateTimeFromIso() — the exact same ISO-datetime-shape logic
// applies (this source's own `startDate`/`endDate` values are plain
// "YYYY-MM-DDTHH:MM:SS" local strings with no offset at all, which that
// function already handles as FLOATING_LOCAL, never guessed into UTC).

import { createObservation } from "../observation/contract.mjs";
import { deriveDateTimeFromIso } from "../json-ld/observation-adapter.mjs";

export const SOURCE_ID = "sant-jordi-club-barcelona";

export function toObservation(record, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? "text/html",

    title: record.title ?? null,
    description: null,

    start: deriveDateTimeFromIso(record.start_local),
    end: deriveDateTimeFromIso(record.end_local),

    venue_name: null, // resolved by source_id — this source is already pre-filtered to this one hall
    location_text: null,

    price_text: null, // not exposed by this source
    event_url: record.event_url ?? null,

    source_fields: {
      hall: record.hall ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_HTML",
      content_type: options.contentType ?? "text/html",
      byte_faithful: false,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
