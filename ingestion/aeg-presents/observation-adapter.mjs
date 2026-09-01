// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — shared adapter for the
// AEG-hosted UK venue events-listing platform, confirmed live-identical
// across two second-tranche sources (Watford Colosseum and Eventim
// Apollo) — see research/source-investigations/london-t2-watford-
// colosseum-02/ and research/source-investigations/london-t2-eventim-
// apollo-02/. Every card sits inside its own `<div class="search-item"
// data-start-month="..." data-end-month="...">` wrapper, carries a
// `card__title` heading and a complete text date, and links to its own
// first-party `/events/<slug>` detail page via a `class="btn ..."
// target="_self"` anchor — genuinely identical markup shape on both
// venues, so this is ONE reusable adapter (parametrized by sourceId/
// venueName/baseUrl at call time, matching ingestion/squarespace-
// eventlist/observation-adapter.mjs's own reuse pattern), not two
// bespoke copies.
//
// Every sampled card states a COMPLETE weekday+day+month+year text date
// directly — no month/year-heading combination is ever needed — but the
// two venues' own token order genuinely differs (Watford: "Saturday -
// September 12th 2026"; Eventim Apollo: "Monday 21st September 2026"),
// so parseDateText() below extracts day/month/year independently of
// their order rather than assuming one fixed pattern.
//
// This project's generic ingestion/static-cards/collector.mjs was
// deliberately NOT reused here: that module's CARD_START regex requires
// an "event|programme|calendar" keyword to appear BEFORE a "card|item"
// keyword in the same class attribute, which this platform's own
// `class="card h-full card--horizontal--event"` (event keyword LAST) and
// `class="card h-full card--horizontal"` (no such keyword at all) never
// satisfy — and that module's naive same-tag-name closing-match also
// truncates before reaching this platform's title/link, which sit past
// an earlier same-tag-name closing div. ingestion/static-cards/
// collector.mjs is also the programme-acquisition orchestrator's own
// collector, out of scope to modify for this package. Reusing only the
// stable, unique `search-item` per-card wrapper as a delimiter avoids
// both problems without touching that shared module.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const MONTH_NAME_RE = new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\b`, "i");
const DAY_RE = /(\d{1,2})(?:st|nd|rd|th)?\b/i;
const YEAR_RE = /\b(\d{4})\b/;

const CARD_DELIMITER = '<div class="search-item"';
const DATE_RE = /<p class="[^"]*\bdate[^"]*">([^<]+)<\/p>/i;
const TITLE_RE = /<h[23] class="card__title[^"]*">([^<]+)<\/h[23]>/i;
const HREF_RE = /<a class="btn[^"]*"\s+href="([^"]+)"\s+target="_self">/i;

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");
}

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 * A card missing any of date/title/detail-link is skipped, never guessed.
 */
export function extractEventCards(html, { baseUrl } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty AEG-presents events-page HTML");
  }
  if (!baseUrl) {
    throw new Error("extractEventCards requires baseUrl to resolve relative detail links");
  }
  const chunks = html.split(CARD_DELIMITER).slice(1); // first chunk is the pre-listing page shell
  const cards = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const dateMatch = DATE_RE.exec(chunk);
    const titleMatch = TITLE_RE.exec(chunk);
    const hrefMatch = HREF_RE.exec(chunk);
    if (!dateMatch || !titleMatch || !hrefMatch) continue;
    let detailUrl;
    try {
      detailUrl = new URL(hrefMatch[1], baseUrl).href;
    } catch {
      continue;
    }
    if (seen.has(detailUrl)) continue;
    seen.add(detailUrl);
    cards.push({
      title: decodeHtmlEntities(titleMatch[1].trim()),
      dateText: dateMatch[1].trim(),
      detailUrl,
    });
  }
  return cards;
}

/**
 * Mechanically extract day/month/year from a complete text date,
 * independent of token order (this platform's own two known venues
 * genuinely differ: "Month Dayth Year" vs "Dayth Month Year"). Returns
 * null if any of the three pieces cannot be found — never falls back to
 * guessing.
 */
function parseDateText(dateText) {
  const monthMatch = MONTH_NAME_RE.exec(dateText);
  const dayMatch = DAY_RE.exec(dateText);
  const yearMatch = YEAR_RE.exec(dateText);
  if (!monthMatch || !dayMatch || !yearMatch) return null;
  const month = MONTHS[monthMatch[1].toLowerCase()];
  return `${yearMatch[1]}-${month}-${dayMatch[1].padStart(2, "0")}`;
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

const SLUG_RE = /\/events\/([a-z0-9-]+)\/?$/i;

export function toObservation(card, { sourceId, venueName, retrievedAt, fixturePath } = {}) {
  if (!sourceId) {
    throw new Error("toObservation requires sourceId");
  }
  if (!card?.detailUrl) {
    throw new Error("toObservation requires card.detailUrl");
  }
  const slugMatch = SLUG_RE.exec(new URL(card.detailUrl).pathname);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /events/{slug} shape: ${card.detailUrl}`);
  }

  return createObservation({
    source_id: sourceId,
    source_record_id: slugMatch[1], // this platform's own permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.detailUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: venueName ?? null, // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this platform's own list-card shape

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
