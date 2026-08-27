// Parses genuinely retained Teatro São Luiz (Lisbon, EGEAC-managed
// municipal theatre) public programme/event-detail HTML into structured
// discovery facts, and mechanically derives each event's full calendar
// date from them.
//
// Built ENTIRELY on the READY_FOR_ACTIVATION investigation at
// research/source-investigations/teatro-sao-luiz-lisbon-02/
// (investigation.json + evidence/) -- which explicitly SUPERSEDES the
// earlier teatro-sao-luiz-lisbon-01 investigation. This module reproduces
// that investigation's own retained, empirically-validated
// offline-proof.mjs derivation logic EXACTLY; it does not re-derive or
// reinterpret the season/year rule independently.
//
// STRUCTURE (per the investigation): the public English programme page
// (https://www.teatrosaoluiz.pt/en/programme/) is plain, fully
// server-rendered HTML -- no JS execution is required to read it. Its own
// <body data-temporada-actual="YYYY-YYYY[-lang-suffix]"> attribute states
// the current season label (the English page's own attribute carries a
// "-en" suffix after the two-year label, e.g. "2026-2027-en" -- genuinely
// observed, not assumed uniform across languages); the page also renders
// 26 `<div class='card event-item'>` blocks, one per event, each linking
// to that event's own detail page. NEITHER the list page NOR any detail
// page states a calendar year anywhere in its visible date text -- only a
// day-of-month + month name (see investigation.json field_assessment,
// probe_history[0]).
//
// YEAR DERIVATION (the investigation's central DETERMINISTIC_CONTEXT
// finding -- see investigation.json field_assessment.start_date.derivation
// and evidence/offline-proof.mjs Step 4): the theatre's own public theme
// JavaScript bundle (wp-content/themes/tsl/js/main.js) hardcodes an
// unconditional, non-time-dependent rule in its season-selector 'change'
// handler:
//
//   if (currentMonth >= 8 && currentMonth <= 12) {
//     selectedMonth = `${selectedSeason.split("-")[0]}-${currentMonth}`;  // season's OWN start year
//   } else {
//     selectedMonth = `${selectedSeason.split("-")[1]}-${currentMonth}`;  // season's OWN end year
//   }
//
// i.e. month 8-12 (Aug-Dec) maps to the season label's own START year;
// month 1-7 (Jan-Jul) maps to the season label's own END year. This was
// empirically re-confirmed against every month (01-12) of the season's own
// auxiliary calendar API with ZERO contradictions across 46 real returned
// date entries (investigation.json probe_history[1]). deriveSeasonYear()
// below implements EXACTLY this rule and NOTHING else -- never a
// plausibility guess, never today's real-world date.
//
// STABLE IDENTIFIER: no numeric id is ever rendered anywhere in a detail
// page's own HTML body (independently confirmed here: grepping the
// retained body-detail-batucadeiras.html for its own known id, "35378",
// finds zero matches). Every detail page's HTTP response instead carries a
// standard WordPress `Link: <.../?p=NNNNN>; rel=shortlink` header --
// proven stable across two independent fetches within -02, and again
// against the superseded -01 investigation's own recorded id, two days
// apart (investigation.json field_assessment.source_record_id). Because
// this value genuinely lives only in response headers, never in the HTML
// body, extractTeatroSaoLuizEventFacts() below accepts the retained header
// text as a second, optional argument -- this is a deliberate, documented
// departure from a body-only signature, not an invention: guessing the id
// from the HTML body would mean fabricating a stable record id the source
// simply does not expose there.

// ---------------------------------------------------------------------
// 1. Programme list page -> detail-page URLs
// ---------------------------------------------------------------------

const CARD_HREF_RE = /<div class='card event-item'>\s*<a href="([^"]+)"/g;

/**
 * Parse the public programme list page's HTML into a deduplicated array of
 * detail-page URLs, in document order. Throws on empty/non-string input
 * (mirrors every other discovery module's convention); returns an empty
 * array (never throws) if the page genuinely contains no event cards.
 */
export function parseTeatroSaoLuizProgrammeLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Teatro São Luiz programme HTML");
  }
  const hrefs = [...html.matchAll(CARD_HREF_RE)].map((m) => m[1]);
  return [...new Set(hrefs)];
}

// ---------------------------------------------------------------------
// 2. Season label extraction
// ---------------------------------------------------------------------

// Deliberately the SAME shape as investigation.json's own retained
// evidence/offline-proof.mjs Step 1a regex: matches the two leading
// "YYYY-YYYY" digits of data-temporada-actual and stops there, so a
// trailing language suffix ("-en") never has to be special-cased.
const SEASON_LABEL_RE = /data-temporada-actual="([0-9]{4})-([0-9]{4})/;

/**
 * Extract the site's own season label (e.g. "2026-2027") from a retained
 * programme-page HTML document's `<body data-temporada-actual="...">`
 * attribute. Throws if the attribute is missing, or if the two year
 * components are not consecutive years (the same sanity check
 * offline-proof.mjs Step 1b performs) -- never guesses a season label.
 */
export function extractTeatroSaoLuizSeasonLabel(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Teatro São Luiz programme HTML");
  }
  const match = SEASON_LABEL_RE.exec(html);
  if (!match) {
    throw new Error("Could not find a data-temporada-actual season label on this page");
  }
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) {
    throw new Error(
      `Season label "${match[1]}-${match[2]}" does not carry two consecutive years -- refusing to guess`,
    );
  }
  return `${startYear}-${endYear}`;
}

// ---------------------------------------------------------------------
// 3. Detail page fact extraction
// ---------------------------------------------------------------------

const TITLE_TAG_RE = /<title>([^<]*)<\/title>/;
const CANONICAL_RE = /<link rel="canonical" href="([^"]+)"\s*\/>/;
const DATES_AND_SCHEDULES_RE = /Dates and Schedules\s*<\/span>\s*<p>([\s\S]*?)<\/p>/;
const VENUE_RE = /Venue\s*<\/span>\s*<p>\s*([\s\S]*?)\s*<\/p>/;
const SHORTLINK_HEADER_RE = /<[^>]*\?p=(\d+)>;\s*rel=shortlink/;

function splitOnBr(text) {
  const parts = text.split(/<br\s*\/?>/);
  return parts.map((p) => p.trim());
}

/**
 * Extract one Teatro São Luiz event detail page's own facts.
 *
 * `headersText` is the retained raw HTTP response headers for the SAME
 * fetch that produced `detailHtml` (see module doc comment for why this is
 * required for `wp_shortlink_post_id` -- the id never appears in the HTML
 * body itself). Passing no headers, or headers with no shortlink Link, is
 * NOT an error here (the caller may not always have retained headers) --
 * `wp_shortlink_post_id` is simply `null` in that case; a null shortlink
 * id is caught downstream by observation-adapter.mjs's own required-field
 * check instead, matching this project's fail-closed-not-fail-loud-here
 * convention for optional-context inputs.
 *
 * Throws if `detailHtml` is missing a required element this project
 * considers essential to identify the event at all (title, event URL, or
 * the "Dates and Schedules" day+month text) -- never guesses a missing
 * value.
 */
export function extractTeatroSaoLuizEventFacts(detailHtml, { headersText = null } = {}) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("Expected non-empty Teatro São Luiz event detail HTML");
  }

  const titleMatch = TITLE_TAG_RE.exec(detailHtml);
  if (!titleMatch) {
    throw new Error("Could not find a <title> tag on this Teatro São Luiz detail page");
  }
  // The <title> tag is "{Event Title} - Teatro São Luiz"; strip the fixed
  // site-name suffix the source itself always appends.
  const title = titleMatch[1].replace(/\s*-\s*Teatro São Luiz\s*$/, "").trim();
  if (title === "") {
    throw new Error("Detail page <title> tag resolved to an empty event title");
  }

  const canonicalMatch = CANONICAL_RE.exec(detailHtml);
  if (!canonicalMatch) {
    throw new Error("Could not find a <link rel=\"canonical\"> event URL on this detail page");
  }
  const eventUrl = canonicalMatch[1];

  const datesMatch = DATES_AND_SCHEDULES_RE.exec(detailHtml);
  if (!datesMatch) {
    throw new Error(
      `Could not find a "Dates and Schedules" field on the detail page for "${title}"`,
    );
  }
  const [dayMonthTextRaw, weekdayAndTimeTextRaw = ""] = splitOnBr(datesMatch[1]);
  const dayMonthText = dayMonthTextRaw;
  if (!dayMonthText) {
    throw new Error(`"Dates and Schedules" field for "${title}" had no day+month text`);
  }

  // The weekday/time line is free text -- sometimes a simple
  // "Weekday, HH:MMam/pm", sometimes a compound, weekday-conditional
  // schedule for a multi-day run (e.g. "Wednesday to Saturday, 8.00 pm;
  // Sunday, 5.30 pm"). This project does not invent structure the source
  // does not give: split only at the FIRST comma into a weekday_text /
  // time_text pair, preserving the full original text across both halves
  // rather than silently dropping the weekday-conditional detail.
  const commaIndex = weekdayAndTimeTextRaw.indexOf(",");
  const weekdayText = commaIndex === -1 ? (weekdayAndTimeTextRaw || null) : weekdayAndTimeTextRaw.slice(0, commaIndex).trim();
  const timeText = commaIndex === -1 ? null : weekdayAndTimeTextRaw.slice(commaIndex + 1).trim();

  const venueMatch = VENUE_RE.exec(detailHtml);
  const venueText = venueMatch ? venueMatch[1].trim() : null;

  let wpShortlinkPostId = null;
  if (typeof headersText === "string" && headersText.trim() !== "") {
    const shortlinkMatch = SHORTLINK_HEADER_RE.exec(headersText);
    wpShortlinkPostId = shortlinkMatch ? shortlinkMatch[1] : null;
  }

  return {
    title,
    day_month_text: dayMonthText,
    weekday_text: weekdayText || null,
    time_text: timeText || null,
    venue_text: venueText,
    event_url: eventUrl,
    wp_shortlink_post_id: wpShortlinkPostId,
  };
}

// ---------------------------------------------------------------------
// 4. Season-year derivation (the investigation's proven rule, verbatim)
// ---------------------------------------------------------------------

// The theme JS's own literal boundary integers (investigation.json
// field_assessment.start_date.derivation; evidence/offline-proof.mjs Step
// 4b confirms these are exactly 8 and 12). Named constants, not magic
// numbers, so any future re-verification against a freshly re-fetched
// main.js has one obvious place to check.
const SEASON_START_YEAR_MONTH_MIN = 8; // August
const SEASON_START_YEAR_MONTH_MAX = 12; // December

const SEASON_LABEL_STRICT_RE = /^([0-9]{4})-([0-9]{4})$/;

/**
 * Mechanically map a calendar month number (1-12) to one of a season
 * label's two years, using EXACTLY the rule hardcoded in Teatro São
 * Luiz's own public theme JavaScript
 * (wp-content/themes/tsl/js/main.js, retained at
 * research/source-investigations/teatro-sao-luiz-lisbon-02/evidence/body-theme-main-js.js):
 *
 *   month 8-12 (Aug-Dec) -> seasonLabel's own START year
 *   month 1-7  (Jan-Jul) -> seasonLabel's own END year
 *
 * This is a fixed, non-time-dependent comparison against literal integers
 * -- it never reads the real-world "current" date, and it is never used to
 * predict a value outside a season's own two years. `seasonLabel` must be
 * exactly "YYYY-YYYY" with consecutive years (see
 * extractTeatroSaoLuizSeasonLabel(), which already normalizes a raw
 * `data-temporada-actual` attribute into this shape). Throws on a
 * malformed season label or an out-of-range month number -- never guesses.
 */
export function deriveSeasonYear(seasonLabel, monthNumber) {
  const match = SEASON_LABEL_STRICT_RE.exec(String(seasonLabel ?? ""));
  if (!match) {
    throw new Error(`deriveSeasonYear: expected a "YYYY-YYYY" season label, got ${JSON.stringify(seasonLabel)}`);
  }
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) {
    throw new Error(`deriveSeasonYear: season label "${seasonLabel}" does not carry two consecutive years`);
  }

  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`deriveSeasonYear: expected a month number 1-12, got ${JSON.stringify(monthNumber)}`);
  }

  if (monthNumber >= SEASON_START_YEAR_MONTH_MIN && monthNumber <= SEASON_START_YEAR_MONTH_MAX) {
    return startYear;
  }
  return endYear;
}

// ---------------------------------------------------------------------
// 5. Combine an event's own day+month text with the season label
// ---------------------------------------------------------------------

const MONTH_NUMBER_BY_NAME = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Detail-page "Dates and Schedules" day+month text observed live in two
// shapes (research/source-investigations/teatro-sao-luiz-lisbon-02/evidence/
// body-detail-*.html): a single day ("9 September", "14 January") or an
// inclusive same-month range ("16 to 27 September", "28 to 31 January").
// No cross-month range was observed in the retained evidence for this
// investigation's sampled events; this parser only claims the single-month
// shape it has actually seen, and throws rather than mis-parsing anything
// else (e.g. a genuinely cross-month range, which would need its own,
// separately-proven handling before being trusted).
const DAY_MONTH_RE = /^(\d{1,2})(?:\s*(?:to|-)\s*(\d{1,2}))?\s+([A-Za-zÀ-ÿ]+)\s*$/i;

/**
 * Combine one event's own `day_month_text` (from
 * extractTeatroSaoLuizEventFacts(), e.g. "9 September" or "16 to 27
 * September") with the page's own `seasonLabel` (from
 * extractTeatroSaoLuizSeasonLabel(), e.g. "2026-2027") into a full
 * "YYYY-MM-DD" start date, using deriveSeasonYear()'s proven rule for the
 * year. Always returns the RANGE'S OWN START day (the investigation's
 * field_assessment.end remains PARTIAL -- no end date is derived here or
 * anywhere in this module; see observation-adapter.mjs). Throws on
 * unparseable day/month text, an unrecognised month name, or a malformed
 * season label -- never guesses a year outside deriveSeasonYear()'s own
 * proven 8-12/1-7 rule.
 */
export function combineDateWithSeasonYear(dayMonthText, seasonLabel) {
  if (typeof dayMonthText !== "string" || dayMonthText.trim() === "") {
    throw new Error("combineDateWithSeasonYear: expected non-empty day_month_text");
  }
  const match = DAY_MONTH_RE.exec(dayMonthText.trim());
  if (!match) {
    throw new Error(`combineDateWithSeasonYear: could not parse day_month_text ${JSON.stringify(dayMonthText)}`);
  }
  const [, startDayText, , monthNameText] = match;
  const monthNumber = MONTH_NUMBER_BY_NAME[monthNameText.toLowerCase()];
  if (!monthNumber) {
    throw new Error(`combineDateWithSeasonYear: unrecognised month name "${monthNameText}" in ${JSON.stringify(dayMonthText)}`);
  }
  const startDay = Number(startDayText);
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) {
    throw new Error(`combineDateWithSeasonYear: unparseable start day in ${JSON.stringify(dayMonthText)}`);
  }

  const year = deriveSeasonYear(seasonLabel, monthNumber);
  const mm = String(monthNumber).padStart(2, "0");
  const dd = String(startDay).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
