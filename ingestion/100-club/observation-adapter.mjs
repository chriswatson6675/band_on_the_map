// BEATMAPPED-LONDON-ALL-VENUE-RECOVERY-AND-FIRST-LIVE-TRANCHE-01 — 100 Club
// own bespoke static-HTML card parser — see
// research/source-investigations/beatmapped-london-all-venue-recovery-01/.
// Elementor (WordPress page builder)-rendered events list; every card's
// title `<h2>` link is immediately followed (within the same loop-item
// block) by a plain-text "Weekday, Dth Month YYYY" date string in an
// elementor-widget-text-editor block — genuinely static, server-rendered
// HTML, not JS-injected. See fixtures/100-club/100club-events.html.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "100-club-london";

const CARD_RE =
  /<a href="(https:\/\/www\.the100club\.co\.uk\/clubevents\/[a-z0-9-]+\/)">([^<]+)<\/a><\/h2>[\s\S]{0,400}?elementor-widget-text-editor"[\s\S]{0,200}?<div class="elementor-widget-container">\s*([^<]+?)\s*<\/div>/g;

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const DATE_TEXT_RE = /(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})/;

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty 100 Club events-page HTML");
  }
  const cards = [];
  const seen = new Set();
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, detailUrl, rawTitle, dateText] = match;
    if (seen.has(detailUrl)) continue;
    seen.add(detailUrl);
    cards.push({
      title: decodeHtmlEntities(rawTitle.trim()),
      dateText: dateText.trim(),
      detailUrl,
    });
  }
  return cards;
}

/**
 * Mechanically parse a "Weekday, Dth Month YYYY" date string into a
 * calendar date. Returns null if the text does not match this exact,
 * unambiguous shape — never falls back to guessing.
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
    // No time-of-day or timezone captured by this adapter — day-level
    // only, matching what the list page's date string genuinely states.
    dt.certainty = "DATE_ONLY";
  } else {
    dt.certainty = "TEXT_ONLY";
  }
  return dt;
}

const SLUG_RE = /\/clubevents\/([a-z0-9-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.detailUrl) {
    throw new Error("toObservation requires card.detailUrl");
  }
  const slugMatch = SLUG_RE.exec(card.detailUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /clubevents/{slug}/ shape: ${card.detailUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress post slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.detailUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "100 Club", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own card shape

    event_url: card.detailUrl,

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
