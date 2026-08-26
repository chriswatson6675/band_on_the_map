// BEATMAPPED-BERLIN-SECOND-PASS-30-40-VENUE-COMPLETION-01 — silent green
// Kulturquartier (Berlin). See
// research/source-investigations/silent-green-kulturquartier-berlin-01/
// and ingestion/silent-green-kulturquartier/discovery.mjs (calendar-grid
// discovery layer this module is paired with).
//
// Converts one already-fetched event DETAIL page
// (https://www.silent-green.net/en/programme/detail/{slug}) into the
// generic Observation contract. This is where `time`, `end`,
// `venue_location` (a named room within this venue's single Gerichtstraße
// 35 building — e.g. "Kuppelhalle"), and the canonical `event_url` are
// genuinely available — none of them are present on the calendar-grid
// list page (see discovery.mjs's own doc comment).
//
// Every sampled detail page (7 real, live, retained/inspected
// 2026-08-26: htrk, hanno-leichtmann-oscillazioni,
// silent-green-open-lab-9-jkzq-franna, goat-jp,
// hub-pres-doorman-franco-franco,
// island-of-time-exhibition-and-concerts-feat-pole-jakojako-ruben-nsue-sunroof-nicolas-bougaeiff,
// tehran-contemporary-sounds-festival-2026) renders the same consistent
// CSS-classed spans:
//   <h1 itemprop="headline">TITLE</h1>
//   <span class="event-detail-date-begin">Sun 08/02/2026</span>            (single-day)
//   <span class="event-detail-date-begin">Fri 11/13/2026 -</span>         (multi-day, trailing "-")
//   <span class="event-detail-date-end">Sun 11/15/2026</span>             (multi-day only)
//   <span class="event-detail-time-begin">07:45 pm Start</span>           (single point in time)
//   <span class="event-detail-time-begin">02:00 pm -</span>               (paired with time-end)
//   <span class="event-detail-time-end">08:00 pm</span>                  (only when a range is stated)
//   <span class="event-detail-time-entry">07:00 pm Doors</span>           (only for some concerts)
//   <span class="d-block event-detail-location">Kuppelhalle</span>
//   <link rel="canonical" href="https://www.silent-green.net/en/programme/detail/{slug}">
//
// No UTC offset/timezone is stated anywhere on any sampled page — Berlin
// local time is implied, never proven — so every start/end this module
// produces is FLOATING_LOCAL when a time is present, DATE_ONLY when it is
// not. This matches the venue's own retained field_assessment exactly
// (basis: DIRECT_SOURCE — every value here is read directly off one
// retained page, never combined/derived from separate context).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "silent-green-kulturquartier-berlin";
export const VENUE_NAME = "silent green Kulturquartier";

const HEADLINE_RE = /<h1 itemprop="headline">([^<]*)<\/h1>/;
const CANONICAL_RE = /<link rel="canonical" href="([^"]+)">/;
const DATE_BEGIN_RE = /<span class="event-detail-date-begin">([^<]*)<\/span>/;
const DATE_END_RE = /<span class="event-detail-date-end">([^<]*)<\/span>/;
const TIME_BEGIN_RE = /<span class="event-detail-time-begin">([^<]*)<\/span>/;
const TIME_END_RE = /<span class="event-detail-time-end">([^<]*)<\/span>/;
const TIME_ENTRY_RE = /<span class="event-detail-time-entry">([^<]*)<\/span>/;
const LOCATION_RE = /<span class="d-block event-detail-location">([^<]*)<\/span>/;

const DATE_SPAN_RE = /^(\w{3})\s(\d{2})\/(\d{2})\/(\d{4})\s*-?\s*$/; // "Sun 08/02/2026" or "Fri 11/13/2026 -"
const TIME_PREFIX_RE = /^(\d{2}):(\d{2})\s*(am|pm)/i;

function unescapeHtml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function firstMatch(html, re) {
  const m = re.exec(html);
  return m ? m[1] : null;
}

/**
 * "Sun 08/02/2026" (US-style MM/DD/YYYY, as this site's own TYPO3
 * rendering emits it) -> "2026-08-02". Returns null if the text does not
 * match the exact shape every sampled page used — never a partial guess.
 */
function isoDateFromSpan(text) {
  if (typeof text !== "string") return null;
  const m = DATE_SPAN_RE.exec(text.trim());
  if (!m) return null;
  const [, , month, day, year] = m;
  return `${year}-${month}-${day}`;
}

/**
 * "07:45 pm Start" / "02:00 pm -" / "07:00 pm Doors" -> "19:45" / "14:00" /
 * "19:00". Only the leading "HH:MM am|pm" is load-bearing — the trailing
 * word ("Start"/"Doors") or dash varies by record and is not itself part
 * of the time value. Returns null if no such prefix is present.
 */
function time24hFromSpan(text) {
  if (typeof text !== "string") return null;
  const m = TIME_PREFIX_RE.exec(text.trim());
  if (!m) return null;
  let [, hh, mm, ampm] = m;
  let hour = Number(hh);
  if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${mm}`;
}

/**
 * Parse one event detail page's HTML into a small, structured record.
 * Throws on genuinely malformed/empty input; throws if the page's own
 * required fields (headline, canonical URL, date-begin) are absent —
 * every real sampled detail page carries all three, so an absent one
 * signals a genuinely broken/unexpected page, not a legitimate gap to
 * silently paper over.
 */
export function extractEventDetail(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty silent green event-detail HTML");
  }

  const title = firstMatch(html, HEADLINE_RE);
  const eventUrl = firstMatch(html, CANONICAL_RE);
  const dateBeginRaw = firstMatch(html, DATE_BEGIN_RE);

  if (!title || !eventUrl || !dateBeginRaw) {
    throw new Error("silent green event-detail page is missing headline, canonical URL, or date-begin");
  }

  const startDate = isoDateFromSpan(dateBeginRaw);
  const dateEndRaw = firstMatch(html, DATE_END_RE);
  const endDate = dateEndRaw ? isoDateFromSpan(dateEndRaw) : null;

  const timeBeginRaw = firstMatch(html, TIME_BEGIN_RE);
  const timeEndRaw = firstMatch(html, TIME_END_RE);
  const doorsRaw = firstMatch(html, TIME_ENTRY_RE);

  return {
    title: unescapeHtml(title),
    eventUrl,
    location: firstMatch(html, LOCATION_RE) ? unescapeHtml(firstMatch(html, LOCATION_RE)) : null,
    startDate,
    startDateRaw: dateBeginRaw,
    endDate,
    endDateRaw: dateEndRaw,
    startTime: timeBeginRaw ? time24hFromSpan(timeBeginRaw) : null,
    startTimeRaw: timeBeginRaw,
    endTime: timeEndRaw ? time24hFromSpan(timeEndRaw) : null,
    endTimeRaw: timeEndRaw,
    doorsTime: doorsRaw ? time24hFromSpan(doorsRaw) : null,
    doorsTimeRaw: doorsRaw,
  };
}

function deriveStart(detail) {
  const dt = emptyDateTime();
  if (!detail.startDate) return dt;
  dt.date = detail.startDate;
  if (detail.startTime) {
    dt.raw = `${detail.startDateRaw} ${detail.startTimeRaw}`.trim();
    // No timezone/offset is stated anywhere on the page — a floating
    // local time, never upgraded to a UTC instant (matches this
    // investigation's own honest field_assessment.time notes).
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = detail.startDateRaw;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

function deriveEnd(detail) {
  const dt = emptyDateTime();
  // "end" is honestly PARTIAL at the source level (this venue's own
  // field_assessment): present only for multi-day
  // installations/exhibitions/festivals, absent entirely for a normal
  // single-evening concert — never inferred when absent.
  if (!detail.endDate && !detail.endTime) return dt;
  if (detail.endDate) {
    dt.date = detail.endDate;
    dt.raw = detail.endTime ? `${detail.endDateRaw} ${detail.endTimeRaw}`.trim() : detail.endDateRaw;
    dt.certainty = detail.endTime ? "FLOATING_LOCAL" : "DATE_ONLY";
  } else {
    // A same-day end TIME with no separate end-date span means the event
    // ends the same calendar day it starts.
    dt.date = detail.startDate;
    dt.raw = detail.endTimeRaw;
    dt.certainty = "FLOATING_LOCAL";
  }
  return dt;
}

const SLUG_RE = /\/programme\/detail\/([a-z0-9-]+)$/;

/**
 * Convert one event's { card, detailHtml } pair into an Observation.
 * `card` is a discovery.mjs card (used only for `slug` fallback/cross
 * -check and `retrievedAt`/`fixturePath` passthrough); `detailHtml` is
 * that same event's already-fetched detail-page HTML — the actual source
 * of every field value (see module doc comment for why the calendar-grid
 * page alone is never enough).
 */
export function toObservation({ card, detailHtml, retrievedAt, fixturePath } = {}) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("toObservation requires detailHtml (this source's fields only exist on the event detail page)");
  }
  const detail = extractEventDetail(detailHtml);

  const slugMatch = SLUG_RE.exec(detail.eventUrl);
  const slug = slugMatch ? slugMatch[1] : card?.slug ?? null;
  if (!slug) {
    throw new Error(`could not resolve a stable slug from canonical URL: ${detail.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slug, // this source's own canonical URL slug (rel="canonical" on the same page) — the same "permalink slug as source_record_id" rule already accepted elsewhere in this project (see investigation.json field_assessment.source_record_id)
    retrieved_at: retrievedAt ?? null,

    source_url: detail.eventUrl,
    content_type: "text/html",

    title: detail.title,
    description: null,

    start: deriveStart(detail),
    end: deriveEnd(detail),

    venue_name: VENUE_NAME, // single-source venue, resolved by source_id
    location_text: detail.location, // this venue's own named room, e.g. "Kuppelhalle" — NOT a separate venue

    price_text: null, // confirmed NOT_PRESENT on every sampled detail page (see investigation.json field_assessment.price)
    event_url: detail.eventUrl,

    source_fields: {
      category: card?.category ?? null,
      doors_time: detail.doorsTime,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

/**
 * Batch-convert a list of { card, detailHtml, fixturePath } entries into
 * Observations, sharing one `retrievedAt` across all of them.
 */
export function toObservations(entries, { retrievedAt } = {}) {
  return (entries ?? []).map(({ card, detailHtml, fixturePath }) =>
    toObservation({ card, detailHtml, retrievedAt, fixturePath }),
  );
}
