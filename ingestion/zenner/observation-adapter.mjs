// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Zenner's own
// bespoke field mapping over its Gatsby build-time page-data.json (backed
// by Sanity via gatsby-source-sanity, but NOT the same runtime GROQ CDN
// query mechanism ingestion/sanity/client.mjs was built for in the
// Barcelona trial — this is a static, pre-built query result, not a
// live query response) — see research/source-investigations/zenner-berlin-01/.
// Genuinely bespoke: this exact page-data.json shape/path is unique to
// this venue in this trial.
//
// Placeholder-title honesty: a minority of nodes in this source's own
// retained dataset (mostly historical/past events) carry a literal
// "XXXXX" title rather than a real one. toObservations() below filters
// those out explicitly rather than publishing a fake "XXXXX" title.
//
// source_record_id: this source's own 'id' field is a Gatsby GraphQL node
// id gatsby-source-sanity conventionally derives deterministically from
// the underlying Sanity document _id — but per the governed
// investigation's own honest field assessment, this was NOT independently
// re-verified against Sanity's own raw API within the bounded
// investigation, so it is used here as the best available identifier
// with that caveat preserved, not represented as independently PROVEN.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "zenner-berlin";

const PLACEHOLDER_TITLE = "XXXXX";

function deriveDateTimeFromIsoUtc(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;
  if (typeof rawValue !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(rawValue)) {
    dt.certainty = rawValue ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.iso = rawValue;
  dt.date = rawValue.slice(0, 10);
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

export function toObservation(record, { retrievedAt, fixturePath } = {}) {
  if (!record?.id) {
    throw new Error("toObservation requires record.id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.id),
    retrieved_at: retrievedAt ?? null,

    source_url: null, // this source's own dataset carries no per-event Zenner-owned page URL
    content_type: "application/json",

    title: record.title ?? null,
    description: null,

    start: deriveDateTimeFromIsoUtc(record.eventDate),
    end: emptyDateTime(), // NOT_PRESENT on this source's own field shape

    // 'place' is a named room WITHIN the single Zenner complex (Saal,
    // Wintergarten, Klub, ...) — a sub-location, not a separate venue.
    venue_name: "Zenner",
    location_text: record.place ?? null,

    price_text: null, // NOT_PRESENT — pricing lives on the third-party ticketing platform
    // linkEvent points to a third-party platform (Resident Advisor, DICE,
    // ...), stated directly by this source itself — honestly recorded as
    // this Observation's event_url, never presented as a Zenner-owned page.
    event_url: record.linkEvent ?? null,

    source_fields: {
      gatsby_node_id: record.id,
      type_of_event: record.typeOfEvent ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false,
    },
  });
}

/**
 * Adapt every real node, EXCLUDING the source's own literal placeholder
 * title ("XXXXX") — never published as a fabricated real event.
 */
export function toObservations(records, options = {}) {
  return (records ?? [])
    .filter((record) => record.title && record.title !== PLACEHOLDER_TITLE)
    .map((record) => toObservation(record, options));
}
