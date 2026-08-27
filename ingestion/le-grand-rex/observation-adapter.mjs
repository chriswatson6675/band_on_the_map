// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Grand Rex's own bespoke
// static-HTML card parser — see
// research/source-investigations/le-grand-rex-paris-01/. Le Grand Rex is
// primarily a historic single-screen cinema that ALSO hosts concerts and
// other stage shows on its own official "Spectacles & Concerts" listing
// page; a separate nightclub in its basement ("Rex Club") is a DIFFERENT
// venue/source, investigated separately
// (research/source-investigations/rex-club-paris-01/).
//
// The venue's own official events page (https://www.legrandrex.com/evenement)
// is genuinely static HTML: every listed show is one repeated
// `<div id='rowN' class='row row-fe row-event ... date-YYYY-MM-DD ...'>`
// block, and — critically — the row's own `class` attribute directly
// embeds the show's full calendar date(s) (e.g. `date-2026-09-19`, or two
// tokens `date-2027-01-09 date-2027-01-10` for a multi-day run), while the
// row's own visible `<h5 class='date-tout'>` text ALSO states the full
// date directly, in French, always including the year (e.g.
// "Le 19 Septembre 2026 à 15:00", or "Du 9 Janvier 2027 au 10 Janvier
// 2027"). Because the complete fact (day+month+year, and day+month+year
// twice for a range) is always stated directly in a single field, this is
// `basis: DIRECT_SOURCE` per docs/SOURCE_INVESTIGATION_POLICY.md — never a
// DETERMINISTIC_CONTEXT combination of separate fragments.
//
// Not every row is a concert: the venue's own row `class` attribute also
// carries a literal `concerts` token (as a whole, standalone class —
// distinct from the always-present, non-discriminating compound class
// `concerts-spectacles`) for rows the venue itself tags as a concert,
// versus other stage-show categories (conferences, ballet, comedy) that
// share the same "Concerts & Spectacles" page heading but do NOT carry
// that `concerts` token. `isConcertCard()` below exposes this real,
// source-stated signal so a caller can filter to music-relevant listings
// — mirroring ingestion/json-ld/parse.mjs's filterMusicEventNodes()
// convention of keeping music-relevance filtering separate, explicit, and
// never silently applied inside extraction itself.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "le-grand-rex-paris";

const ROW_RE = /<div id='row(\d+)' class='([^']*row-event[^']*)'>/g;

const CARD_RE =
  /<h3 class='title-movie-tout'><a href='([^']+)' class='nostylea'>\s*([^<]+?)\s*<\/a><\/h3>\s*<h5 class='date-tout'>([^<]*)<\/h5>[\s\S]*?<span class='price[^']*'[^>]*>([^<]*)<\/span>/;

const EVENT_ID_RE = /\/evenement\/(\d+)/;

// French month names as they genuinely appear on this page (no accent on
// "Fevrier" in this source's own markup — retained exactly as observed,
// never "corrected"). Any month name not in this fixed, exhaustive map
// leaves the date unparsed (null), never guessed.
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
  return MONTHS_FR[name.toLowerCase()] ?? null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Matches a trailing "à 20:00" or "à 20h" time suffix. Both shapes are
// genuinely observed on this one source's own retained page.
const TIME_SUFFIX_RE = /\s+à\s+(\d{1,2})(?::(\d{2}))?h?\s*$/i;
const SINGLE_DATE_RE = /^Le\s+(\d{1,2})\s+(\S+)\s+(\d{4})$/i;
const RANGE_DATE_RE = /^Du\s+(\d{1,2})\s+(\S+)\s+(\d{4})\s+au\s+(\d{1,2})\s+(\S+)\s+(\d{4})$/i;

/**
 * Parse this source's own `date-tout` text directly (DIRECT_SOURCE — see
 * this module's header comment). Never fabricates a value: an
 * unrecognised month name or shape yields nulls rather than a guess.
 */
export function parseDateText(dateText) {
  const raw = typeof dateText === "string" ? dateText.trim() : "";
  if (raw === "") return { startDate: null, endDate: null, time: null };

  let time = null;
  let datePart = raw;
  const timeMatch = TIME_SUFFIX_RE.exec(raw);
  if (timeMatch) {
    const hour = pad2(timeMatch[1]);
    const minute = timeMatch[2] ?? "00";
    time = `${hour}:${minute}`;
    datePart = raw.slice(0, timeMatch.index).trim();
  }

  const rangeMatch = RANGE_DATE_RE.exec(datePart);
  if (rangeMatch) {
    const [, d1, mon1, y1, d2, mon2, y2] = rangeMatch;
    const m1 = monthNumber(mon1);
    const m2 = monthNumber(mon2);
    if (!m1 || !m2) return { startDate: null, endDate: null, time };
    return {
      startDate: `${y1}-${m1}-${pad2(d1)}`,
      endDate: `${y2}-${m2}-${pad2(d2)}`,
      time,
    };
  }

  const singleMatch = SINGLE_DATE_RE.exec(datePart);
  if (singleMatch) {
    const [, d, mon, y] = singleMatch;
    const m = monthNumber(mon);
    if (!m) return { startDate: null, endDate: null, time };
    return { startDate: `${y}-${m}-${pad2(d)}`, endDate: null, time };
  }

  return { startDate: null, endDate: null, time };
}

/**
 * True only when this row's own `class` attribute carries the literal,
 * standalone `concerts` token (never matches on the always-present
 * compound class `concerts-spectacles`, which does not discriminate
 * concerts from other stage-show categories on this one page).
 */
export function isConcertCard(classAttr) {
  return String(classAttr ?? "")
    .split(/\s+/)
    .includes("concerts");
}

/**
 * Extract every event card from the venue's own official events listing
 * page HTML. Never throws on zero matches — a genuinely empty listing is
 * legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Le Grand Rex events-page HTML");
  }

  const rows = [];
  let rowMatch;
  ROW_RE.lastIndex = 0;
  while ((rowMatch = ROW_RE.exec(html)) !== null) {
    rows.push({ classAttr: rowMatch[2], start: rowMatch.index + rowMatch[0].length });
  }

  const cards = [];
  for (let i = 0; i < rows.length; i++) {
    const start = rows[i].start;
    const end = i + 1 < rows.length ? rows[i + 1].start : html.length;
    const chunk = html.slice(start, end);
    const cardMatch = CARD_RE.exec(chunk);
    if (!cardMatch) continue; // a row this template does not carry the expected fields — skip, never fabricate

    const [, eventUrl, title, dateText, priceText] = cardMatch;
    const idMatch = EVENT_ID_RE.exec(eventUrl);
    if (!idMatch) continue;

    cards.push({
      eventUrl,
      eventId: idMatch[1],
      title: title.trim(),
      dateText: dateText.trim(),
      priceText: priceText.trim() || null,
      classAttr: rows[i].classAttr,
      isConcert: isConcertCard(rows[i].classAttr),
    });
  }
  return cards;
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
  // page — a genuinely floating local value even when a time-of-day is
  // present, never upgraded to a UTC instant.
  dt.certainty = time ? "FLOATING_LOCAL" : "DATE_ONLY";
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventId) {
    throw new Error("toObservation requires card.eventId");
  }

  const { startDate, endDate, time } = parseDateText(card.dateText);

  return createObservation({
    source_id: SOURCE_ID,
    // This source's own permalink uses a numeric event id
    // (/evenement/{id}) as its own canonical path — the same
    // stable-identifier judgement already established for
    // tempodrom-berlin-01/badehaus-berlin-01 (a documented, self-consistent
    // permalink scheme this source itself uses as its own identity).
    source_record_id: card.eventId,
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: buildDateTime(startDate, time, card.dateText),
    end: endDate ? buildDateTime(endDate, time, card.dateText) : emptyDateTime(),

    // Single-venue source: this source's own page states its own name and
    // address only at site level (see identity.notes in this
    // investigation's investigation.json), never repeated per event card —
    // resolved by source_id at activation time, matching the documented
    // badehaus-berlin-01/zenner-berlin-01 precedent rather than claiming a
    // per-record DETERMINISTIC_CONTEXT venue_location this source does not
    // actually structurally prove per card.
    venue_name: "Le Grand Rex",
    location_text: null,

    price_text: card.priceText,
    event_url: card.eventUrl,

    source_fields: {
      is_concert: card.isConcert,
      row_class: card.classAttr,
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
