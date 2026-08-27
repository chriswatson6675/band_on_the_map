// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Café de la Danse (Paris).
// See research/source-investigations/cafe-de-la-danse-paris-01/.
//
// WordPress running the "eventchamp" theme (wp-theme-eventchamp /
// eventchamp-theme / gt-* CSS classes). The venue's own official
// programmation page (https://www.cafedeladanse.com/programmation/)
// carries NO schema.org JSON-LD Event data at all (0 <script
// type=application/ld+json> blocks on that page) — every field this
// module extracts comes from the page's own repeated static HTML card
// markup:
//
//   <div class="gt-title"><a href="{eventUrl}">{TITLE}</a></div>
//   ...
//   <div class="gt-date">...<span>{D MONTH_FR YYYY}</span></div>
//   <div class="gt-time">...<span>{HHhMM}</span></div>
//
// Both the full day AND the full 4-digit year are stated directly on
// every card (e.g. "5 septembre 2026") — a genuinely complete date,
// never requiring contextual derivation from a separate heading. No
// price value is ever printed on a card or its own detail page — only a
// "TICKET" button/label linking to one of several third-party ticketing
// platforms (SeeTickets, Weezevent, Ticketmaster, dice.fm — confirmed
// across several sampled cards), so `price_text` is honestly null
// (NOT_PRESENT), matching this venue's own governed field_assessment.
//
// Deliberately regex/string-based (no DOM dependency), matching every
// other HTML-discovery module in this project (e.g.
// ingestion/badehaus/observation-adapter.mjs,
// ingestion/json-ld/parse.mjs). Extraction works by locating every
// `gt-title` card heading, then scanning FORWARD only as far as the next
// card's own heading (never backward, never across an unrelated card) for
// that same card's date/time — proven against the full retained fixture
// (fixtures/cafe-de-la-danse-paris/programmation.html) to correctly
// recover all 47 real cards on the page, including several whose
// surrounding image markup varies (lazy-loaded vs. not), which a
// naive "nearest gt-image" anchor missed.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cafe-de-la-danse-paris";
export const VENUE_NAME = "Café de la Danse";

const TITLE_RE = /<div class="gt-title"><a href="([^"]+)">([^<]+)<\/a><\/div>/g;
const DATE_RE = /<div class="gt-date">[\s\S]*?<span>([^<]+)<\/span>/;
const TIME_RE = /<div class="gt-time">[\s\S]*?<span>([^<]+)<\/span>/;

// A bounded, deterministic, non-inferential mapping — this is literal
// translation of a name the source itself already fully states (e.g.
// "septembre" -> "09"), never a guess about which month/year is meant.
const FR_MONTHS = new Map([
  ["janvier", "01"],
  ["février", "02"],
  ["fevrier", "02"],
  ["mars", "03"],
  ["avril", "04"],
  ["mai", "05"],
  ["juin", "06"],
  ["juillet", "07"],
  ["août", "08"],
  ["aout", "08"],
  ["septembre", "09"],
  ["octobre", "10"],
  ["novembre", "11"],
  ["décembre", "12"],
  ["decembre", "12"],
]);

const FR_DATE_RE = /^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/i;
const TIME_H_RE = /^(\d{1,2})h(\d{2})$/;

function decodeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&#8211;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

/**
 * "5 septembre 2026" -> "2026-09-05". Returns null if the text does not
 * match this site's own consistently-observed "D MONTH_FR YYYY" shape —
 * never a partial guess.
 */
function isoDateFromFrenchText(text) {
  if (typeof text !== "string") return null;
  const m = FR_DATE_RE.exec(text.trim());
  if (!m) return null;
  const [, day, monthName, year] = m;
  const month = FR_MONTHS.get(monthName.toLowerCase());
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

/** "20h00" -> "20:00". Returns null if the text does not match. */
function time24hFromCardText(text) {
  if (typeof text !== "string") return null;
  const m = TIME_H_RE.exec(text.trim());
  if (!m) return null;
  const [, hh, mm] = m;
  return `${hh.padStart(2, "0")}:${mm}`;
}

const SLUG_RE = /\/event\/([a-z0-9-]+)\/?$/;

/**
 * Extract every event card from the venue's own programmation page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 * Each card: { eventUrl, slug, title, dateRaw, date, timeRaw, time }.
 *
 * This page's own markup carries the same event card TWICE for a
 * minority of events: the main chronological listing (`gt-event-listing`)
 * plus a separate "Nouvelles dates !" ("New dates!") promotional widget
 * (`gt-events-widget`) further down the same page, which re-renders a
 * subset of already-listed events with byte-identical title/date/time —
 * confirmed live, 2026-08-26 (12 of 47 raw card matches were exact
 * duplicates by slug). Deduplicated here by slug, keeping the FIRST
 * (main-listing) occurrence — matching this project's existing
 * "same event may render more than once, dedupe by slug" precedent
 * (ingestion/silent-green-kulturquartier/discovery.mjs).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Café de la Danse programmation-page HTML");
  }

  const titleMatches = [];
  let m;
  TITLE_RE.lastIndex = 0;
  while ((m = TITLE_RE.exec(html)) !== null) {
    titleMatches.push({ index: m.index, end: TITLE_RE.lastIndex, eventUrl: m[1], title: decodeHtmlEntities(m[2]) });
  }

  const seenSlugs = new Set();
  const cards = [];
  for (let i = 0; i < titleMatches.length; i += 1) {
    const current = titleMatches[i];
    const segmentEnd = i + 1 < titleMatches.length ? titleMatches[i + 1].index : html.length;
    const segment = html.slice(current.end, segmentEnd);

    const dateMatch = DATE_RE.exec(segment);
    const timeMatch = TIME_RE.exec(segment);
    const dateRaw = dateMatch ? dateMatch[1].trim() : null;
    const timeRaw = timeMatch ? timeMatch[1].trim() : null;

    const slugMatch = SLUG_RE.exec(current.eventUrl);
    const slug = slugMatch ? slugMatch[1] : null;
    if (slug) {
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
    }

    cards.push({
      eventUrl: current.eventUrl,
      slug,
      title: current.title,
      dateRaw,
      date: isoDateFromFrenchText(dateRaw),
      timeRaw,
      time: time24hFromCardText(timeRaw),
    });
  }
  return cards;
}

function deriveStart(card) {
  const dt = emptyDateTime();
  if (!card.date) return dt;
  dt.date = card.date;
  if (card.time) {
    dt.raw = `${card.dateRaw} ${card.timeRaw}`;
    // No timezone/offset is stated anywhere on the page — a floating
    // local time, never upgraded to a UTC instant (matches this
    // investigation's own honest field_assessment.time notes).
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = card.dateRaw;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  if (!card.slug) {
    throw new Error(`event URL does not match the expected /event/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.slug, // this source's own WordPress permalink slug, its canonical path (same rule already accepted for badehaus-berlin/tempodrom-berlin)
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveStart(card),
    end: emptyDateTime(), // NOT_PRESENT on this source's own card/detail shape

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT — only a "TICKET" button linking to one of several third-party platforms (SeeTickets/Weezevent/Ticketmaster/dice.fm), never a first-party price value
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
