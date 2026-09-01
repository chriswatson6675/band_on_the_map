// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — Jamboree (King's Cross,
// London) bespoke static-HTML card parser — see
// research/source-investigations/london-t2-jamboree-03/. WordPress site
// running the "Events Manager" plugin: the /upcoming-events/ page
// server-renders a static list of `<div class="event-item" id="event-
// ...">` cards (no client-side rendering required). Every card states a
// COMPLETE weekday+day+month+year date directly in its own
// `<span class="event-date-dn">` (e.g. "Tuesday 1 September 2026" — no
// ordinal suffix on the day, unlike some other sources this project has
// investigated), and links to its own first-party `/events/<slug>/`
// detail page via its `<h3><a href=...>` title link.
//
// Every card ALSO carries its own `<h4>` programme-note text, which is
// this source's own genuine, deterministic music-vs-non-music signal —
// see ./filter.mjs.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "jamboree-london";

const CARD_DELIMITER = '<div class="event-item" id="event-';
const TITLE_RE = /<h3><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>/i;
const DATE_RE = /<span class="event-date-dn">([^<]+)<\/span>/i;
const NOTE_RE = /<h4>([^<]*)<\/h4>/i;

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const DATE_TEXT_RE = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/;

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&");
}

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 * A card missing a title, date, or detail link is skipped, never guessed.
 * `programmeNote` (the card's own <h4> text) is preserved verbatim in
 * source_fields for the deterministic music-gate filter (./filter.mjs) —
 * this adapter itself never decides music relevance.
 */
export function extractEventCards(html, { baseUrl } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Jamboree events-page HTML");
  }
  const chunks = html.split(CARD_DELIMITER).slice(1); // first chunk is the pre-listing page shell
  const cards = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const titleMatch = TITLE_RE.exec(chunk);
    const dateMatch = DATE_RE.exec(chunk);
    if (!titleMatch || !dateMatch) continue;
    let detailUrl;
    try {
      detailUrl = new URL(titleMatch[1], baseUrl).href;
    } catch {
      continue;
    }
    if (seen.has(detailUrl)) continue;
    seen.add(detailUrl);
    const noteMatch = NOTE_RE.exec(chunk);
    cards.push({
      title: decodeHtmlEntities(titleMatch[2].trim()),
      dateText: dateMatch[1].trim(),
      detailUrl,
      programmeNote: noteMatch ? decodeHtmlEntities(noteMatch[1].trim()) : null,
    });
  }
  return cards;
}

/**
 * Mechanically parse "D Month YYYY" (no ordinal suffix on this source's
 * own day-of-month, unlike some other adapters) into a calendar date.
 * Returns null if the text does not match this exact shape — never
 * falls back to guessing.
 */
function parseDateText(dateText) {
  const match = DATE_TEXT_RE.exec(dateText);
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.dateText;
  const date = parseDateText(card.dateText);
  if (date) {
    dt.date = date;
    dt.certainty = "DATE_ONLY";
  } else {
    dt.certainty = "TEXT_ONLY";
  }
  return dt;
}

const SLUG_RE = /\/events\/([a-z0-9-]+)\/?$/i;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.detailUrl) {
    throw new Error("toObservation requires card.detailUrl");
  }
  const slugMatch = SLUG_RE.exec(new URL(card.detailUrl).pathname);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /events/{slug}/ shape: ${card.detailUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.detailUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Jamboree", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own card shape

    event_url: card.detailUrl,

    source_fields: { programme_note: card.programmeNote ?? null },

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
