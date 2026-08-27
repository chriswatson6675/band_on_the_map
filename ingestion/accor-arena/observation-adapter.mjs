// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Accor Arena observation
// mapping. See ./discovery.mjs and
// research/source-investigations/accor-arena-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "accor-arena-paris";

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const DATE_RE = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/;

/**
 * This source's own card date ("09 September 2026") is a plain English
 * day/month-name/year with NO time-of-day exposed on the list view — a
 * calendar date only, never upgraded to a time or UTC instant it did not
 * genuinely provide.
 */
function deriveDateTime(dateText) {
  const dt = emptyDateTime();
  dt.raw = dateText ?? null;
  const m = DATE_RE.exec((dateText ?? "").trim());
  if (!m) {
    dt.certainty = dateText ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  const [, day, monthName, year] = m;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  dt.date = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
  dt.certainty = "DATE_ONLY";
  return dt;
}

const SLUG_RE = /\/en\/events-and-tickets\/([a-z0-9-]+)$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /en/events-and-tickets/{slug} shape: ${card.eventUrl}`);
  }
  const eventUrl = `https://www.accorarena.com${card.eventUrl}`;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card.dateText),
    end: emptyDateTime(), // NOT_PRESENT — this list view never shows an end date/time

    venue_name: "Accor Arena", // single-venue source, resolved by source_id
    location_text: null,

    price_text: card.priceText ? `From ${card.priceText}` : null,
    event_url: eventUrl,

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
