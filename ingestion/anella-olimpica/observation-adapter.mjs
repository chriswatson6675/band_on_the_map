// BARCELONA-30-VENUE-POPULATION-02 — converts Anella Olímpica discovery
// records (./discovery.mjs) into the generic Observation contract.
// Deliberately generic over `config.source_id` (matching
// ingestion/json-ld/observation-adapter.mjs's own convention) since THREE
// independently-registered sources (Sant Jordi Club — via the older,
// unchanged ingestion/sant-jordi-club/ module — plus this package's own
// Palau Sant Jordi and Estadi Olímpic Lluís Companys) share this same
// underlying site/record shape but are never the same canonical venue.
//
// Date/time: reuses ingestion/json-ld/observation-adapter.mjs's
// deriveDateTimeFromIso() — identical ISO-datetime-shape logic as
// ingestion/sant-jordi-club/observation-adapter.mjs already established
// for this exact site (plain "YYYY-MM-DDTHH:MM:SS" local strings, no
// offset — FLOATING_LOCAL, never guessed into UTC).

import { createObservation } from "../observation/contract.mjs";
import { deriveDateTimeFromIso } from "../json-ld/observation-adapter.mjs";

export function toObservation(record, config, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }
  if (!config?.source_id) {
    throw new Error("toObservation requires config.source_id");
  }

  return createObservation({
    source_id: config.source_id,
    source_record_id: record.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? "text/html",

    title: record.title ?? null,
    description: null,

    start: deriveDateTimeFromIso(record.start_local),
    end: deriveDateTimeFromIso(record.end_local),

    venue_name: null, // resolved by source_id — each source is bucketed to exactly one hall (see run.mjs)
    location_text: null,

    price_text: null,
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

export function toObservations(records, config, options = {}) {
  return (records ?? []).map((record) => toObservation(record, config, options));
}
