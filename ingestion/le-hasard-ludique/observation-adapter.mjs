// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Hasard Ludique's own
// Observation mapping over discovery.mjs's parsed cards. See
// research/source-investigations/le-hasard-ludique-paris-01/ for the
// governed investigation this is built on.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "le-hasard-ludique-paris";
export const BASE_URL = "https://www.lehasardludique.paris";

// Matches the source's own single-date card format ("30.08.2026"). A card
// stating an inclusive multi-day range instead (e.g. "12-13.09.2026") does
// NOT match this pattern and is honestly left TEXT_ONLY below, never
// guessed down to a single day.
const SINGLE_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

function deriveStartDateTime(dateText) {
  const dt = emptyDateTime();
  dt.raw = dateText ?? null;
  const match = typeof dateText === "string" ? SINGLE_DATE_RE.exec(dateText.trim()) : null;
  if (!match) {
    dt.certainty = dateText ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  const [, day, month, year] = match;
  dt.date = `${year}-${month}-${day}`;
  // No time-of-day is present on this source's own list/API card shape
  // (confirmed present on a per-event detail page by the governed
  // investigation's own bounded sample, but not exercised here) — a
  // calendar date only, never upgraded to a UTC instant.
  dt.certainty = "DATE_ONLY";
  return dt;
}

/**
 * Adapt one parsed card (see discovery.mjs's parseEventCardHtml) into an
 * Observation. `card.eventUrl` (the site's own permalink path) is used
 * directly as source_record_id, per this investigation's documented
 * stable-identifier judgement.
 */
export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }

  const absoluteEventUrl = new URL(card.eventUrl, BASE_URL).toString();

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.eventUrl,
    retrieved_at: retrievedAt ?? null,

    source_url: absoluteEventUrl,
    content_type: "application/json",

    title: card.title ?? null,
    description: null,

    start: deriveStartDateTime(card.dateText),
    end: emptyDateTime(),

    // Single-venue source; every card belongs to this one venue. `place`
    // (e.g. "La Salle", "La Gare", "Le Quai") is a named sub-room WITHIN
    // the venue, not a separate venue — recorded as location_text, same
    // pattern already established for Zenner Berlin's 'place' field.
    venue_name: "Le Hasard Ludique",
    location_text: card.place ?? null,

    // NOT_PRESENT on this source's own list/API card shape — confirmed
    // present on a per-event detail page by the governed investigation's
    // bounded sample, but not fetched here.
    price_text: null,
    event_url: absoluteEventUrl,

    source_fields: {
      category: card.category ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
