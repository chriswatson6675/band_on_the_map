// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Duc des Lombards' own
// mapping from ingestion/duc-des-lombards/discovery.mjs's extracted
// (title, date, time, node-id) occurrences into the project's generic
// Observation contract (ingestion/observation/contract.mjs). See
// research/source-investigations/duc-des-lombards-paris-01/ for the
// governed investigation this is proven against.
//
// source_record_id: this source's own Drupal node id (`data-nid`) — a
// stable, platform-native content identifier (Drupal node ids are never
// reassigned to a different node), distinct per showtime even within one
// multi-night run.
//
// Price: this source's own body-class taxonomy shows presence varies
// per event ("has-tarifs"/"no-tarifs"); no per-card price text was found
// on the listing page itself within this bounded investigation — honestly
// left null here, never fabricated.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "duc-des-lombards-paris";
export const VENUE_NAME = "Le Duc des Lombards";

function deriveDateTime(occurrence) {
  const dt = emptyDateTime();
  const rawParts = [occurrence?.rawDateText, occurrence?.rawTimeText].filter(Boolean);
  dt.raw = rawParts.length > 0 ? rawParts.join(" ") : null;

  if (!occurrence?.date) {
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = occurrence.date;

  if (occurrence.hour) {
    dt.iso = `${occurrence.date}T${occurrence.hour}:${occurrence.minute}:00`;
    dt.is_utc = false;
    // No timezone/offset is stated anywhere on this source — a floating
    // local time, never upgraded to a UTC instant.
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.is_utc = false;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

export function toObservation(occurrence, { retrievedAt, fixturePath } = {}) {
  if (!occurrence?.nodeId) {
    throw new Error("toObservation requires occurrence.nodeId");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: occurrence.nodeId,
    retrieved_at: retrievedAt ?? null,

    source_url: occurrence.eventUrl,
    content_type: "text/html",

    title: occurrence.title ?? null,
    description: null,

    start: deriveDateTime(occurrence),
    end: emptyDateTime(), // NOT_PRESENT — no end time stated on this source

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own listing-page card shape (see this module's own doc comment)
    event_url: occurrence.eventUrl,

    source_fields: {
      drupal_node_id: occurrence.nodeId,
      raw_date_text: occurrence.rawDateText ?? null,
      raw_time_text: occurrence.rawTimeText ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(occurrences, options = {}) {
  return (occurrences ?? []).map((occurrence) => toObservation(occurrence, options));
}
