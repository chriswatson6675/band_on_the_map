// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Dôme de Paris (Palais
// des Sports)'s own bespoke two-page static-HTML adapter — see
// research/source-investigations/dome-de-paris-paris-01/.
//
// The venue's own official "À l'affiche" listing page
// (https://www.ledomedeparis.com/fr/spectacles/a-laffiche) is genuinely
// static HTML: every show is one repeated card with its own title, a
// self-stated category ("Concert" / "Comédie musicale" / "One man show" /
// "Spectacle"), a stable numeric-id permalink
// (/fr/spectacle/{id}/{slug}), and its own date text. Booking itself
// happens on Ticketmaster (an external platform, linked from each detail
// page), but the FACTS this adapter extracts — title, date, category,
// price — are the venue's own first-party data, not scraped from
// Ticketmaster.
//
// Date-text honesty (policy v1.2 `DETERMINISTIC_CONTEXT`): a single-day
// card states its date fully ("05 septembre 2026" — DIRECT_SOURCE). A
// multi-day run's own card text ("Du 12 septembre au 18 octobre 2026", or
// "Du 06 au 07 novembre 2026") states its trailing month/year exactly
// once, governing the leading (day-only, or day+month-only) first date of
// the SAME row — verified mechanically reproducible across every one of
// the 26 real cards retained in this investigation's fixture (see
// tests/dome-de-paris.test.mjs). `parseListingDateText()` below implements
// exactly that one fixed rule and nothing else; an unrecognised shape
// yields nulls rather than a guess.
//
// The listing page alone does not state a time-of-day or price; those are
// stated on each show's own detail page instead ("Horaires et dates des
// représentations" / "Prix des places" blocks). `extractDetailSchedule()`
// parses that page when retained; a caller with only the listing card
// still gets a fully PROVEN title+date, just no time/price (left null,
// never guessed) — matching this source's own genuinely two-page
// structure rather than fabricating a single-page shortcut.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "dome-de-paris";

const MONTHS_FR = Object.freeze({
  janvier: "01",
  fevrier: "02",
  février: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  août: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
  décembre: "12",
});

function monthNumber(name) {
  return MONTHS_FR[String(name).toLowerCase()] ?? null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

const RANGE_DATE_RE = /^Du\s+(\d{1,2})(?:\s+(\S+))?\s+au\s+(\d{1,2})\s+(\S+)\s+(\d{4})$/i;
const SINGLE_DATE_RE = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/i;

/**
 * Parse this source's own listing-card date text. See this module's
 * header comment for the exact, mechanically-verified `DETERMINISTIC_CONTEXT`
 * rule governing the range shape. Never fabricates a value: an
 * unrecognised shape or month name yields nulls.
 */
export function parseListingDateText(dateText) {
  const raw = typeof dateText === "string" ? dateText.trim() : "";
  if (raw === "") return { startDate: null, endDate: null, isRange: false };

  const rangeMatch = RANGE_DATE_RE.exec(raw);
  if (rangeMatch) {
    const [, d1, month1Raw, d2, month2Raw, year2] = rangeMatch;
    const month2 = monthNumber(month2Raw);
    // The trailing "Month YYYY" (from the second date) governs the first
    // date's own month/year whenever the first date omits them — the one
    // fixed combination rule this source's own row format always follows.
    const month1 = month1Raw ? monthNumber(month1Raw) : month2;
    if (!month1 || !month2) return { startDate: null, endDate: null, isRange: true };
    return {
      startDate: `${year2}-${pad2(month1)}-${pad2(d1)}`,
      endDate: `${year2}-${pad2(month2)}-${pad2(d2)}`,
      isRange: true,
    };
  }

  const singleMatch = SINGLE_DATE_RE.exec(raw);
  if (singleMatch) {
    const [, d, monthRaw, year] = singleMatch;
    const month = monthNumber(monthRaw);
    if (!month) return { startDate: null, endDate: null, isRange: false };
    return { startDate: `${year}-${pad2(month)}-${pad2(d)}`, endDate: null, isRange: false };
  }

  return { startDate: null, endDate: null, isRange: false };
}

const CARD_RE =
  /<a href="(https:\/\/www\.ledomedeparis\.com\/fr\/spectacle\/(\d+)\/[^"]+)">([^<]+)<\/a><\/h4><\/div>\s*<p>([^<]+)<br>\s*<small>[\s\S]*?<\/i>\s*([^<]+?)\s*<\/small>/g;

/**
 * Extract every event card from the venue's own official "À l'affiche"
 * listing page HTML. Never throws on zero matches — a genuinely empty
 * listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Dôme de Paris listing-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, eventUrl, spectacleId, title, category, dateText] = match;
    cards.push({
      eventUrl,
      spectacleId,
      title: title.trim(),
      category: category.trim(),
      dateText: dateText.trim(),
    });
  }
  return cards;
}

// This source's own single self-stated category value that IS the direct
// music category (its own classification, never a keyword guess).
// "Comédie musicale" (musical theatre) and "One man show"/"Spectacle" are
// deliberately left out — they are this source's own DIFFERENT declared
// categories, not the "Concert" one.
export function isConcertCard(category) {
  return String(category ?? "").trim() === "Concert";
}

const SCHEDULE_LINE_RE = /<strong>([^<]+?)\s*-\s*(\d{1,2}):(\d{2})<\/strong>/;
const DOORS_RE = /Ouverture des portes\s*(?:&agrave;|à)\s*(\d{1,2})[:h](\d{2})/i;
const PRICE_BLOCK_RE = /Prix des places<\/h6>\s*([\s\S]*?)<\/div>/;

/**
 * Extract time-of-day/doors-time/price text from one event's own detail
 * page HTML, when retained. Returns nulls for whatever the page does not
 * state — never guessed from the listing page's own (time-less) date
 * text.
 */
export function extractDetailSchedule(html) {
  if (typeof html !== "string" || html.trim() === "") {
    return { time: null, doorsTime: null, priceText: null };
  }

  let time = null;
  const scheduleMatch = SCHEDULE_LINE_RE.exec(html);
  if (scheduleMatch) {
    time = `${pad2(scheduleMatch[2])}:${scheduleMatch[3]}`;
  }

  let doorsTime = null;
  const doorsMatch = DOORS_RE.exec(html);
  if (doorsMatch) {
    doorsTime = `${pad2(doorsMatch[1])}:${doorsMatch[2]}`;
  }

  let priceText = null;
  const priceMatch = PRICE_BLOCK_RE.exec(html);
  if (priceMatch) {
    priceText = priceMatch[1]
      .replace(/<br\s*\/?>/gi, "; ")
      .replace(/&eacute;/gi, "é")
      .replace(/&euro;/gi, "€")
      .replace(/&agrave;/gi, "à")
      .replace(/\s+/g, " ")
      .trim();
  }

  return { time, doorsTime, priceText };
}

function buildDateTime(date, time, raw) {
  const dt = emptyDateTime();
  dt.raw = raw;
  if (!date) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  dt.date = date;
  // No explicit UTC offset/timezone is ever stated on this source's own
  // pages — a genuinely floating local value even when a time-of-day is
  // known from the detail page, never upgraded to a UTC instant.
  dt.certainty = time ? "FLOATING_LOCAL" : "DATE_ONLY";
  return dt;
}

/**
 * `detail` is optional — `{ time, doorsTime, priceText }` from
 * extractDetailSchedule(), when that page was also retained/fetched.
 * Without it, `start`/`end` still carry a PROVEN date (DATE_ONLY
 * certainty) and `price_text` stays null, never fabricated.
 */
export function toObservation(card, { retrievedAt, fixturePath, detail } = {}) {
  if (!card?.spectacleId) {
    throw new Error("toObservation requires card.spectacleId");
  }

  const { startDate, endDate } = parseListingDateText(card.dateText);
  const time = detail?.time ?? null;

  return createObservation({
    source_id: SOURCE_ID,
    // This source's own permalink uses a numeric spectacle id
    // (/fr/spectacle/{id}/{slug}) as its own canonical path — the same
    // stable-identifier judgement already established for
    // tempodrom-berlin-01/badehaus-berlin-01.
    source_record_id: card.spectacleId,
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: buildDateTime(startDate, time, card.dateText),
    end: endDate ? buildDateTime(endDate, time, card.dateText) : emptyDateTime(),

    // Single-venue source: this source's own pages state its own name and
    // address only at site level (see this investigation's identity.notes),
    // never repeated per event card — resolved by source_id at activation
    // time, matching the badehaus-berlin-01/zenner-berlin-01 precedent.
    venue_name: "Le Dôme de Paris",
    location_text: null,

    price_text: detail?.priceText ?? null,
    event_url: card.eventUrl,

    source_fields: {
      category: card.category,
      is_concert: isConcertCard(card.category),
      doors_time: detail?.doorsTime ?? null,
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
