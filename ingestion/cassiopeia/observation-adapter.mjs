// BEATMAPPED-BERLIN-SECOND-PASS-30-40-VENUE-COMPLETION-01 — Cassiopeia
// Berlin's own bespoke static-HTML card parser — see
// research/source-investigations/cassiopeia-berlin-01/. Webflow, with the
// event list server-side-rendered directly into the initial HTML as a
// Webflow CMS Collection List. Finsweet cmsfilter/cmsload/cmsselect
// attributes only add client-side filter/sort UI on top of the
// already-rendered items — the events themselves are present without any
// JS execution, genuinely bespoke to this exact markup.
//
// The listing paginates across multiple server-rendered pages
// (?f74de34a_page=2, =3, ... — a plain query-string GET, still Level 1
// PASSIVE_STATIC, not a separate API or browser-required path). This
// module extracts cards from ONE retained page's HTML at a time; a caller
// that wants the full future programme calls extractEventCards() once per
// retained page fixture and concatenates the results (see
// tests/cassiopeia.test.mjs for a worked multi-page harvest example).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cassiopeia-berlin";

// Each event card, in the order it appears in the retained markup:
//   <a href="/event/{slug}" class="event-wrapper ...">
//     ... <div class="event-text first">Beginn </div><div class="event-text">HH:MM</div> ...
//     <div class="event-date-wrapper">
//       <h2 class="event-date">DD</h2><h2 class="event-date">.</h2>
//       <h2 class="event-date">MM</h2><h2 class="event-date">.</h2>
//       <h2 fs-cmsfilter-field="date" class="event-date faker">MonthName YYYY</h2>
//     </div>
//     <div class="event-title-wrapper">
//       <h2 fs-cmsfilter-field="title" class="subheading event">TITLE</h2>
const CARD_RE =
  /<a href="\/event\/([a-z0-9-]+)" class="event-wrapper[^>]*>[\s\S]*?<div class="event-text first">Beginn\s*<\/div><div class="event-text">(\d{2}):(\d{2})<\/div>[\s\S]*?<div class="event-date-wrapper"><h2 class="event-date">(\d{2})<\/h2><h2 class="event-date">\.<\/h2><h2 class="event-date">(\d{2})<\/h2><h2 class="event-date">\.<\/h2><h2 fs-cmsfilter-field="date" class="event-date faker">([^<]+)<\/h2><\/div><div class="event-title-wrapper"><h2 fs-cmsfilter-field="title" class="subheading event">([^<]+)<\/h2>/g;

// German month name -> two-digit month, exactly as this source's own
// hidden "faker" filter node spells it out. Used only to cross-check the
// numeric month already present on the same card, and to supply the year
// the numeric digits alone do not carry — never to guess a month/year the
// card does not itself state.
const GERMAN_MONTHS = {
  Januar: "01",
  Februar: "02",
  März: "03",
  April: "04",
  Mai: "05",
  Juni: "06",
  Juli: "07",
  August: "08",
  September: "09",
  Oktober: "10",
  November: "11",
  Dezember: "12",
};

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Extract every event card from one retained Cassiopeia club-page HTML
 * document (page 1, or any later ?f74de34a_page=N page — same markup
 * shape). Never throws on zero matches — a genuinely empty page is
 * legitimate. A card whose numeric month and "faker" month-name context
 * disagree (or whose faker text cannot be parsed at all) is skipped
 * rather than guessed, per this project's date/time honesty rule.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Cassiopeia club events-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, slug, hour, minute, day, numericMonth, fakerText, rawTitle] = match;

    const fakerMatch = /^([A-Za-zÄÖÜäöü]+)\s+(\d{4})$/.exec(fakerText.trim());
    if (!fakerMatch) {
      // The sibling "faker" node did not parse as "MonthName YYYY" — the
      // deterministic combination this source's markup normally supports
      // is unavailable for this card. Skip rather than invent a year.
      continue;
    }
    const [, monthName, year] = fakerMatch;
    const monthFromName = GERMAN_MONTHS[monthName];
    if (!monthFromName || monthFromName !== numericMonth) {
      // Month name and numeric month disagree (or the name is unknown) —
      // the combination is not single-valued. Skip rather than guess.
      continue;
    }

    cards.push({
      date: `${year}-${numericMonth}-${day}`,
      time: `${hour}:${minute}`,
      eventUrl: `https://cassiopeia-berlin.de/event/${slug}`,
      title: decodeEntities(rawTitle),
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  // No timezone/offset is stated anywhere on the page — a floating local
  // time, never upgraded to a UTC instant (matches this investigation's
  // own honest PARTIAL/FLOATING_LOCAL field assessment).
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

const URL_SLUG_RE = /\/event\/([a-z0-9-]+)$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = URL_SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /event/{slug} shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own Webflow CMS item slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Cassiopeia", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own card shape
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
