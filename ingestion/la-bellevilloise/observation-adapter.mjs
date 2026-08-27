// PARIS-VENUE-POPULATION-01 — La Bellevilloise's own bespoke static-HTML
// card parser — see research/source-investigations/la-bellevilloise-paris-01/.
// WordPress (custom theme, not a JSON-LD Event/calendar-plugin site); the
// venue's own agenda page (/agenda/) is a static grid of ~58 real
// `<article class="c-tile">` cards, each one repeating:
//
//   <article class="c-tile" data-filters="item"
//            data-categories="{tag1};{tag2};...;YYYY-MM">
//     ...
//     <span class="c-tile_date">{DayName} {D} {frenchMonthName}</span>
//     <span class="c-tile_title"><strong>{Title}</strong></span>
//     ...
//     <a href="{eventUrl}" class="c-link"></a>
//   </article>
//
// Date (policy v1.2, DETERMINISTIC_CONTEXT): the card's own visible
// `c-tile_date` text never repeats the year (e.g. "Mer 9 septembre"), but
// the SAME card's own `data-categories` attribute directly states the
// exact "YYYY-MM" (e.g. "...;2026-09") as one of its semicolon-separated
// tags. Combining these two retained, first-party pieces of the SAME
// card — never a page-level heading, an even stronger case than the
// canonical policy example — via a fixed rule (data-categories' own
// YYYY-MM supplies year+month; c-tile_date's own day number supplies the
// day; the French month name in c-tile_date is cross-checked against
// data-categories' own month number and must agree, or the card is
// rejected rather than guessed) yields the exact date and nothing else.
// This was proven, not assumed: every one of 58 sampled cards (see
// research/source-investigations/la-bellevilloise-paris-01/evidence/
// agenda-page-card-sample.json) had its data-categories month/year agree
// with its own c-tile_date's month name, spanning August 2026 through
// December 2026.
//
// Time/price/venue: this venue's own per-event detail page
// (/evenement/{slug}/) additionally states an explicit local start/end
// time range (e.g. "20h00 à 22h00") and, for most sampled events, a
// starting price (e.g. "À partir de 13€") in its own `<h3 class="c-heading
// -h2">`/`<h4 class="c-heading -h2">` blocks — see extractDetailFields()
// below, used only to ENRICH an already-discovered card, never to
// discover events on its own. venue_location is resolved by source_id
// (single-venue source; its own address is separately, directly retained
// in research/source-investigations/la-bellevilloise-paris-01/evidence/
// infos-pratiques-raw.html: "19-21 rue Boyer, 75020 Paris").

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "la-bellevilloise-paris";

const FRENCH_MONTHS = Object.freeze({
  janvier: "01",
  février: "02",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  août: "08",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  décembre: "12",
  decembre: "12",
});

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8230;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

const ARTICLE_RE = /<article[\s\S]*?<\/article>/g;
const CATEGORIES_RE = /data-categories="([^"]*)"/;
const DATE_RE = /c-tile_date">\s*([^<]+?)\s*<\/span>/;
const TITLE_RE = /c-tile_title"><strong>([^<]*)<\/strong>/;
const LINK_RE = /<a href="([^"]+)" class="c-link">/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;

/**
 * Deterministically combine one card's own `data-categories` (its own
 * "YYYY-MM" tag) with its own visible `c-tile_date` text ("{DayName} {D}
 * {frenchMonthName}" or, for a multi-day event, "{DayName} {D} - {DayName}
 * {D} {frenchMonthName}") into a full calendar date. Returns null — never
 * a guess — if no "YYYY-MM" tag is present, or if the visible month name
 * does not agree with data-categories' own stated month number.
 */
export function deriveCardDate(categoriesRaw, dateTextRaw) {
  const yearMonthTag = (categoriesRaw ?? "").split(";").map((t) => t.trim()).find((t) => YEAR_MONTH_RE.test(t));
  if (!yearMonthTag) return null;
  const [, year, month] = YEAR_MONTH_RE.exec(yearMonthTag);

  const decoded = decodeEntities(dateTextRaw ?? "");
  // First day-number followed eventually by a trailing French month name
  // (handles both a single date, "Mer 9 septembre", and a multi-day range,
  // "Sam 26 - Dim 27 septembre" — the FIRST day number is used as the
  // start date; the range's own end date is not derived here, matching
  // this project's existing caution about not over-claiming multi-day
  // spans, e.g. tempodrom-berlin-01's endDate finding).
  const match = /(\d{1,2})[\s\S]*?([A-Za-zÀ-ÿ]+)\s*$/.exec(decoded);
  if (!match) return null;
  const [, day, monthNameRaw] = match;
  const monthName = monthNameRaw.toLowerCase();
  const monthFromName = FRENCH_MONTHS[monthName];
  if (!monthFromName || monthFromName !== month) return null; // disagreement between card's own two fields: fail closed, never guess

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

/**
 * Extract every event card from the venue's own /agenda/ page HTML. Never
 * throws on zero matches — a genuinely empty listing is legitimate. A
 * card whose date cannot be deterministically resolved (see
 * deriveCardDate()) is skipped, never included with a guessed date.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty La Bellevilloise agenda HTML");
  }
  const cards = [];
  let match;
  ARTICLE_RE.lastIndex = 0;
  while ((match = ARTICLE_RE.exec(html)) !== null) {
    const block = match[0];
    const categories = CATEGORIES_RE.exec(block);
    const dateText = DATE_RE.exec(block);
    const title = TITLE_RE.exec(block);
    const link = LINK_RE.exec(block);
    if (!categories || !dateText || !title || !link) continue;

    const date = deriveCardDate(categories[1], dateText[1]);
    if (!date) continue;

    cards.push({
      date,
      dateDerivation: { categoriesTag: categories[1], dateText: decodeEntities(dateText[1]) },
      eventUrl: link[1],
      title: decodeEntities(title[1]),
      categories: categories[1].split(";").map((t) => t.trim()),
    });
  }
  return cards;
}

const DETAIL_TIME_RE = /<span>([A-Za-zÀ-ÿ]{2,3}\s+\d{1,2}\s+[A-Za-zÀ-ÿ]+)<\/span>\s*<span>(\d{1,2})h(\d{2})\s*(?:à|-)\s*(\d{1,2})h(\d{2})<\/span>/;
const DETAIL_PRICE_RE = /Affichage du tarif -->\s*<span>\s*([^<]+?)\s*<\/span>/;

/**
 * Extract time/price fields from one event's own detail page HTML
 * (/evenement/{slug}/), used only to enrich a card already discovered via
 * extractEventCards(). Never throws — a detail page missing this
 * structure simply yields nulls, honestly leaving those fields unresolved
 * rather than guessed.
 */
export function extractDetailFields(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty La Bellevilloise event detail HTML");
  }
  const timeMatch = DETAIL_TIME_RE.exec(html);
  const priceMatch = DETAIL_PRICE_RE.exec(html);
  return {
    startTime: timeMatch ? `${timeMatch[2].padStart(2, "0")}:${timeMatch[3]}` : null,
    endTime: timeMatch ? `${timeMatch[4].padStart(2, "0")}:${timeMatch[5]}` : null,
    priceText: priceMatch ? decodeEntities(priceMatch[1]) : null,
  };
}

function deriveDateTime(dateStr, timeStr) {
  const dt = emptyDateTime();
  if (timeStr) {
    dt.raw = `${dateStr} ${timeStr}`;
    dt.date = dateStr;
    // No timezone/offset is stated anywhere on this source — a floating
    // local time, never upgraded to a UTC instant.
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = dateStr;
    dt.date = dateStr;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

const SLUG_RE = /\/evenement\/([a-z0-9-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath, detail } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /evenement/{slug}/ shape: ${card.eventUrl}`);
  }

  const startTime = detail?.startTime ?? null;
  const endTime = detail?.endTime ?? null;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card.date, startTime),
    end: endTime ? deriveDateTime(card.date, endTime) : emptyDateTime(),

    venue_name: "La Bellevilloise", // single-venue source, resolved by source_id
    location_text: null,

    price_text: detail?.priceText ?? null,
    event_url: card.eventUrl,

    source_fields: { categories: card.categories ?? [], date_derivation: card.dateDerivation ?? null },

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
