// BARCELONA-30-VENUE-POPULATION-01 — converts City Hall Barcelona
// discovery records (./discovery.mjs) into the generic Observation
// contract.
//
// Date/time: this source's own `scheduling.config.startDate`/`endDate`
// already carry an explicit UTC "Z" offset (Wix's own server-side
// computed instant) — reuses ingestion/json-ld/observation-adapter.mjs's
// deriveDateTimeFromIso() rather than a third independent ISO-parsing
// implementation, since the exact same mechanical offset-to-UTC
// conversion applies.

import { createObservation } from "../observation/contract.mjs";
import { deriveDateTimeFromIso } from "../json-ld/observation-adapter.mjs";

export const SOURCE_ID = "city-hall-barcelona";

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

    start: deriveDateTimeFromIso(record.start_iso),
    end: deriveDateTimeFromIso(record.end_iso),

    venue_name: null, // resolved by source_id — a single physical venue
    location_text: null,

    price_text: null, // not exposed by this embedded event summary
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.slug ?? null,
      // Retained for provenance only — this project's canonical Venue
      // coordinates (venues/barcelona.json) are the ones actually used
      // for map placement; this first-party value independently
      // corroborates them (see that venue's own CONFIRMED evidence).
      location_name: record.location_name ?? null,
      location_address: record.location_address ?? null,
      location_lat: record.location_lat ?? null,
      location_lng: record.location_lng ?? null,
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
