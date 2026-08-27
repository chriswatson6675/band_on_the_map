// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — generic Observation mapping
// for the shared wp-evenement-cards family (see ./discovery.mjs). Every
// per-venue caller (Le Trianon, Élysée Montmartre) passes its own
// source_id/venueName — this module never hardcodes a specific venue.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { parseCardDateText } from "./discovery.mjs";

function deriveStartDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.dateText ?? null;
  const date = parseCardDateText(card.dateText);
  if (!date) {
    dt.certainty = card.dateText ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = date;
  // No time-of-day is present on the list/archive card itself — this
  // source's own per-event detail page DOES additionally state a local
  // time (e.g. "at 20h00" / "à 20h00", confirmed live on both Le Trianon's
  // and Élysée Montmartre's own detail pages), but that requires a
  // separate per-event fetch this collector does not perform, so time is
  // honestly left unresolved here rather than silently fetched/guessed.
  dt.certainty = "DATE_ONLY";
  return dt;
}

export function toObservation(card, { source_id, venueName, retrievedAt, fixturePath } = {}) {
  if (!source_id) throw new Error("toObservation requires options.source_id");
  if (!card?.sourceRecordId) throw new Error("toObservation requires card.sourceRecordId");
  if (!card?.eventUrl) throw new Error("toObservation requires card.eventUrl");

  return createObservation({
    source_id,
    source_record_id: card.sourceRecordId, // this theme's own WordPress post ID (data-id on the card's own root element)
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveStartDateTime(card),
    end: emptyDateTime(), // NOT_PRESENT — never shown on this theme's card or detail page

    venue_name: venueName ?? null,
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own first-party pages (pricing lives only behind the Hubber ticketing checkout)
    event_url: card.eventUrl,

    source_fields: {
      sold_out: card.soldOut ?? false,
    },

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
