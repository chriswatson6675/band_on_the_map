// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Trabendo observation
// adapter. See ingestion/le-trabendo/discovery.mjs and
// research/source-investigations/le-trabendo-paris-01/ for the source
// investigation this is built against.
//
// venue_location is DETERMINISTIC_CONTEXT per the governed investigation:
// this dedicated single-venue domain never names any other venue, and its
// own sitewide footer states the address directly — so it is hardcoded
// here as the investigation's own proven derivation, not re-derived from
// per-card text (the card itself never repeats it).
//
// time/end are honestly NOT_PRESENT/PARTIAL per the investigation (only a
// door-opening time was found, on the event's own detail page, which this
// list-page-only collector does not fetch) — never fabricated.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "le-trabendo-paris";

const VENUE_NAME = "Le Trabendo";
const VENUE_LOCATION_TEXT = "211 Avenue Jean Jaurès, 75019 Paris (Parc de la Villette)";

const SLUG_RE = /\/programmation\/([a-z0-9-]+)\/?$/;

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.date;
  dt.date = card.date;
  // Only a calendar date is directly stated on this source's own card; no
  // time-of-day is present on the listing page itself.
  dt.certainty = "DATE_ONLY";
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /programmation/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(), // NOT_PRESENT on this source's own card shape

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: VENUE_LOCATION_TEXT,

    price_text: null, // NOT_PRESENT — ticketing delegated entirely to a third party (shotgun.live)
    event_url: card.eventUrl,

    source_fields: {},

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
