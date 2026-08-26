// Junction Bar Berlin — bespoke hand-authored static-HTML parser. See
// research/source-investigations/junction-bar-berlin-01/. No CMS of any
// kind: one physical HTML file exists per calendar month
// (/program/{MM}_{YYYY}/{MM}_{YY}.html), hand-authored with deeply
// malformed, unclosed/mismatched <strong> markup left over from a very old
// WYSIWYG editor. Each physical month-page states its own month/year
// exactly once in a page heading ("<Month> <Year> music program"); each
// dated row states its own day+month ("D.M.", no year) plus a weekday
// name. Some (not all) rows also embed an inline showtime, split across
// nested empty <strong> tags as literal "----" ... "HH:MM" ... "----" text
// fragments — never contiguous text, so any parser must tag-strip before
// matching it. A "PRIVAT PARTY" row is a real calendar entry but is not a
// music event (no band/act name is present) and is intentionally not
// extracted as a card.
//
// This source has NO per-event permalink/slug/id of any kind — see
// field_assessment.source_record_id in investigation.json. This adapter
// derives a composite id (date + slugified title) as an honestly-documented
// alternative identity strategy; it is NOT claimed PROVEN/stable, only
// reproducible from this adapter's own deterministic rule.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "junction-bar-berlin";

// The page's own single heading, e.g. "August 2026 music program" —
// governs the YEAR for every dated row on this one physical month-page.
// (The MONTH is never taken from this heading — see below.)
const MONTH_HEADING_RE = /<strong>\s*([A-Za-z]+)\s+(\d{4})\s+music program\s*<\/strong>/;

// Each dated row's own "<D>.<M>." (day.month, no year) plus weekday name.
// Deliberately does NOT assume the row's month matches the page heading's
// month: real retained evidence (the September 2026 page) shows rows that
// spill into the following calendar month (e.g. "2.10." / "3.10." rows
// appear on the physical 09_2026 page) — the row's own month digit is what
// is actually used, only the year comes from the page heading.
const DATE_ROW_RE =
  /<strong class="datum">\s*(\d{1,2})\.(\d{1,2})\.\s*(?:<br\s*\/?>)?\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)/g;

// Every sampled act/band name is stated in a <p class="Stil122..."> block
// (Stil1222 / Stil12221 / Stil122211 / Stil12222 — the site's own
// auto-generated WYSIWYG style-class family; confirmed the only classes of
// this shape present in either retained/live month page). A "PRIVAT PARTY"
// row's own <p> never carries one of these classes (either no class at
// all, or the text is wrapped in a plain, unclassed <p>), so it is
// naturally excluded rather than needing special-case filtering.
const TITLE_RE = /<p[^>]*class="[^"]*\bStil122\d*\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g;

// One-off fallback for a real named event whose title is not wrapped in a
// Stil122x paragraph but is stated as a quoted &quot;Title&quot; inside a
// <strong> (observed on the retained September page's "ABSCHLUSSKONZERT"
// showcase row).
const QUOTED_TITLE_RE = /<strong>&quot;([^&<]+?)&quot;<\/strong>/;

// Inline showtime, e.g. "---- 21:00 ----". The dashes and the digits are
// frequently separated by nested empty <strong class="datum"> tags in the
// raw markup, so this must only ever be matched after tag-stripping.
const TIME_RE = /-{2,}\s*(\d{1,2}):(\d{2})\s*-{2,}/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ");
}

function cleanTitle(rawInner) {
  let s = rawInner;
  // Drop nested genre/style spans first (e.g. "Post-Metal / Prog /
  // Alternative") so they never leak into the extracted act name.
  s = s.replace(/<span[^>]*class="[^"]*two_bands_musikstil[^"]*"[^>]*>[\s\S]*?<\/span>/g, "");
  s = stripTags(s);
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function slugify(title) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (e.g. ä -> a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract every real music-event card from one retained/live Junction Bar
 * month-page HTML document. Never throws on zero matched date rows within
 * an otherwise-parseable page — a genuinely quiet month is legitimate.
 * Throws only when the page cannot even establish its own year context
 * (no month heading found), since a date can never be honestly derived
 * without it — never invented.
 */
export function extractEventCards(html, { sourceUrl } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Junction Bar month-page HTML");
  }
  const heading = MONTH_HEADING_RE.exec(html);
  if (!heading) {
    throw new Error(
      "Expected a Junction Bar month-page heading ('<Month> <Year> music program') to derive the year context — refusing to invent one"
    );
  }
  const year = heading[2];

  DATE_ROW_RE.lastIndex = 0;
  const rowMatches = [...html.matchAll(DATE_ROW_RE)];

  const cards = [];
  for (let i = 0; i < rowMatches.length; i++) {
    const m = rowMatches[i];
    const segStart = m.index + m[0].length;
    const segEnd = i + 1 < rowMatches.length ? rowMatches[i + 1].index : html.length;
    const segment = html.slice(segStart, segEnd);
    const [, day, month, weekday] = m;
    const date = `${year}-${pad2(month)}-${pad2(day)}`;

    // The inline showtime, when present, lives inside the same date row's
    // own header table cell — bound the search to before that table
    // closes so a coincidental "----" later in an act's bio text can never
    // be mistaken for a showtime.
    const tableEndIdx = segment.indexOf("</table>");
    const headerArea = tableEndIdx === -1 ? segment : segment.slice(0, tableEndIdx);
    const headerText = stripTags(headerArea);
    const timeMatch = TIME_RE.exec(headerText);
    const time = timeMatch ? `${pad2(timeMatch[1])}:${timeMatch[2]}` : null;

    TITLE_RE.lastIndex = 0;
    let titles = [...segment.matchAll(TITLE_RE)].map((tm) => cleanTitle(tm[1])).filter(Boolean);
    if (titles.length === 0) {
      const quoted = QUOTED_TITLE_RE.exec(segment);
      if (quoted) titles = [quoted[1].trim()];
    }
    // No real act/title found (e.g. "PRIVAT PARTY", or a genuinely empty
    // trailing row) — not a music event; do not fabricate one.
    if (titles.length === 0) continue;

    for (const title of titles) {
      cards.push({ date, time, title, weekday, sourceUrl: sourceUrl ?? null });
    }
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.date = card.date;
  if (card.time) {
    dt.raw = `${card.date} ${card.time}`;
    // No timezone/offset is stated anywhere on the page, and the page's
    // own general SHOWTIMES block ("SUN-THU 21:00 / FRI & SAT 22:00")
    // directly contradicts at least one sampled explicit override (a
    // Friday row stating 21:00 inline) — so only an explicit per-row time
    // is ever used, and even then only as a floating local time.
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = card.date;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

/**
 * This source exposes no per-event permalink/slug/id of any kind (see
 * field_assessment.source_record_id.notes in investigation.json — honestly
 * left UNKNOWN, not PROVEN). This composite key (date + slugified title)
 * is a documented, reproducible alternative identity strategy, not a
 * claim of source-verified stability.
 */
function deriveSourceRecordId(card) {
  return `${card.date}__${slugify(card.title)}`;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.date || !card?.title) {
    throw new Error("toObservation requires card.date and card.title");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: deriveSourceRecordId(card),
    retrieved_at: retrievedAt ?? null,

    source_url: card.sourceUrl ?? null,
    content_type: "text/html",

    title: card.title,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Junction Bar", // single-venue source, resolved by source_id
    location_text: null,

    // No per-event canonical detail URL exists on this source's own
    // domain (see field_assessment.event_url: NOT_PRESENT) — some rows
    // link out to the venue's own ticket-shop subdomain instead, which is
    // a ticket-purchase link, not a stable canonical event page.
    price_text: null,
    event_url: null,

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
