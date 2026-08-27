// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — La Boule Noire's own mapping
// from ingestion/la-boule-noire/discovery.mjs's extracted cards (+
// optionally a per-event detail-page price) into the project's generic
// Observation contract (ingestion/observation/contract.mjs). See
// research/source-investigations/la-boule-noire-paris-01/ for the governed
// investigation this is proven against.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "la-boule-noire-paris";
export const VENUE_NAME = "La Boule Noire";

function deriveDateTime(parsedDate) {
  const dt = emptyDateTime();
  if (!parsedDate) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  dt.raw = `${parsedDate.date} ${parsedDate.hour}:${parsedDate.minute}`;
  dt.date = parsedDate.date;
  dt.iso = `${parsedDate.date}T${parsedDate.hour}:${parsedDate.minute}:00`;
  dt.is_utc = false;
  // No timezone/offset is stated anywhere on this source — a floating
  // local time, never upgraded to a UTC instant.
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

/**
 * Combine a detail page's own bare numeric price (extractEventPrice()) with
 * this site's own retained CSS rule (`.prix-event p:after{content:"€"}`)
 * into a currency-qualified string — the one DETERMINISTIC_CONTEXT
 * combination this adapter performs (two retained first-party inputs: the
 * numeral, and the site's own CSS declaring what currency symbol it always
 * appends to that exact element). Returns null when no price was supplied.
 */
export function deriveEuroPriceText(bareNumber) {
  if (bareNumber == null) return null;
  return `${bareNumber} EUR`;
}

export function toObservation(card, { priceNumber, retrievedAt, fixturePath } = {}) {
  if (!card?.slug) {
    throw new Error("toObservation requires card.slug");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.slug, // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card.parsedDate),
    end: emptyDateTime(), // NOT_PRESENT — no end time stated anywhere on this source

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: null,

    price_text: deriveEuroPriceText(priceNumber ?? null),
    event_url: card.eventUrl,

    source_fields: {
      raw_date_text: card.dateText ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

/**
 * Batch-adapt every card. `priceByEventUrl` is an optional
 * `{ [eventUrl]: bareNumber }` map for callers that fetched a subset of
 * detail pages — a card with no matching entry simply has null price_text,
 * never fabricated.
 */
export function toObservations(cards, { priceByEventUrl = {}, ...options } = {}) {
  return (cards ?? []).map((card) =>
    toObservation(card, { ...options, priceNumber: priceByEventUrl[card.eventUrl] ?? null }),
  );
}
