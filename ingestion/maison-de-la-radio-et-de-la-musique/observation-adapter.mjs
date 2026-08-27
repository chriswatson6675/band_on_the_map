// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Maison de la Radio et de la
// Musique's own Observation mapping over discovery.mjs's parsed cards. See
// research/source-investigations/maison-de-la-radio-et-de-la-musique-paris-01/
// for the governed investigation this is built on.
//
// venue_name is taken DIRECTLY from each card's own 'location' text
// (never hardcoded to one fixed venue name) — this complex's own /agenda
// genuinely lists both on-site concerts (location text naming the
// complex + a specific hall, e.g. "Maison de la Radio et de la Musique -
// Studio 105") AND off-site tour dates by its own resident orchestra
// (e.g. "Cathédrale de Laon", "Royal Albert Hall, Londres") — recording a
// single fixed venue name for every card would misrepresent the latter.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "maison-de-la-radio-et-de-la-musique-paris";
export const BASE_URL = "https://www.maisondelaradioetdelamusique.fr";

const TIME_RE = /^(\d{1,2})h(\d{2})$/;

/**
 * Convert this source's own "HHhMM" time text (e.g. "20h30") into
 * "HH:MM". Returns null for anything else, rather than guessing.
 */
export function parseTimeText(timeText) {
  if (typeof timeText !== "string") return null;
  const match = TIME_RE.exec(timeText.trim());
  if (!match) return null;
  const [, hour, minute] = match;
  return `${hour.padStart(2, "0")}:${minute}`;
}

function deriveStartDateTime(card) {
  const dt = emptyDateTime();
  const time = parseTimeText(card.time);
  dt.raw = time ? `${card.date} ${card.time}` : card.date;
  dt.date = card.date ?? null;
  // No timezone/UTC offset is stated anywhere on this source's own list
  // card — a floating local date+time (or date-only, when no time is
  // present, e.g. the off-site Nancy book-festival entry), never upgraded
  // to a UTC instant.
  dt.certainty = card.date ? (time ? "FLOATING_LOCAL" : "DATE_ONLY") : "UNKNOWN";
  return dt;
}

/**
 * Adapt one parsed card (see discovery.mjs's extractEventCards) into an
 * Observation. `card.sourceRecordId` (the site's own '?s=' permalink
 * query parameter) is used directly as source_record_id, per this
 * investigation's documented stable-identifier judgement.
 */
export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.sourceRecordId) {
    throw new Error("toObservation requires card.sourceRecordId");
  }

  const absoluteEventUrl = new URL(card.eventUrl, BASE_URL).toString();

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.sourceRecordId,
    retrieved_at: retrievedAt ?? null,

    source_url: absoluteEventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveStartDateTime(card),
    end: emptyDateTime(),

    // Taken directly from the card's own location text — see this
    // module's own top-of-file note on why this is never hardcoded.
    venue_name: card.location ?? null,
    location_text: null,

    // "Gratuit" (free) is the only price signal this source's own list
    // card states directly; anything else requires a per-event detail-
    // page fetch this adapter does not perform (see the governed
    // investigation's own PARTIAL price field_assessment) — never
    // fabricated into a numeric price here.
    price_text: card.isFree ? "Gratuit" : null,
    event_url: absoluteEventUrl,

    source_fields: {
      event_type: card.eventType ?? null,
      weekday: card.weekday ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_HTML",
      content_type: "text/html",
      byte_faithful: false,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
