// Converts genuinely retrieved Super Bock Arena — Pavilhão Rosa Mota
// agenda-card records (ingestion/super-bock-arena/discovery.mjs) into the
// generic Observation contract (ingestion/observation/contract.mjs).
//
// Source: Super Bock Arena — Pavilhão Rosa Mota, registry id
// "super-bock-arena". Acquisition path: bounded, server-rendered "The
// Events Calendar" WordPress plugin list view — the single
// https://www.superbockarena.pt/agenda/ listing page.
//
// Date/time (important, deliberate certainty choice): each card's own
// `tribe-event-date-start` text is "D Month, HH:MM" for an event in the
// SAME calendar year the plugin currently considers "this year" (no year
// digits at all), or "D Month YYYY, HH:MM" for an event in a different
// year (the plugin's own formatter includes the year whenever it is not
// the current one) — see discovery.mjs's own doc comment for the live
// evidence. Neither shape alone is safe: a bare "4 Setembro, 14:30" names
// no year at all. This adapter combines it with the page's OWN governing
// `<h2 class='tribe-events-list-separator-month'><span>Month YYYY</span></h2>`
// section header the card was found under (also read directly from the
// same document, never inferred from today's date) — the two pieces of
// text are independently corroborated (the card's own month word must
// match the header's month word) before a date is ever derived; on any
// mismatch, or a header this module cannot parse, or a date_text this
// module cannot parse, this fails closed to TEXT_ONLY/UNKNOWN certainty,
// never guessed. Whenever the card's own date_text already carries an
// explicit year digit, that year is used directly (the header year is
// only ever a fallback for the AMBIGUOUS case, never an override of an
// unambiguous one). Certainty is honestly "FLOATING_LOCAL" once a full
// calendar date is derived (both the calendar date and a time-of-day are
// known, but no confirmed UTC offset is stated anywhere on this source) —
// matching the same certainty already used for Casa da Música
// (ingestion/casa-da-musica/observation-adapter.mjs), never fabricated to
// UTC_INSTANT.
//
// Venue: this listing page (https://www.superbockarena.pt/agenda/) covers
// only this one physical arena — venue_name/location_text are left
// honestly null (never fabricated per-record); canonical Venue resolution
// happens by source_id, the same deliberate fixed-single-venue pattern
// already used for Casa da Música / MEO Arena / Village Underground (see
// ingestion/venue/resolver.mjs's SOURCE_ID_TO_FIXED_CANONICAL_VENUE
// table).
//
// Music filtering: callers must pass only records already filtered by
// discovery.mjs's filterMusicRecords() — this adapter does not re-filter
// (matching the cm-gaia-eventos precedent's division of responsibility).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "super-bock-arena";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const PT_MONTHS = {
  janeiro: "01",
  fevereiro: "02",
  "março": "03",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

const DATE_TEXT_RE = /^(\d{1,2})\s+([A-Za-zçÇãÃ]+)(?:\s+(\d{4}))?,\s*(\d{1,2}):(\d{2})$/;
const HEADER_RE = /^([A-Za-zçÇãÃ]+)\s+(\d{4})$/;

function monthNumber(word) {
  return PT_MONTHS[String(word ?? "").toLowerCase()] ?? null;
}

/**
 * Combine this source's own per-card `date_text` ("D Month[, YYYY],
 * HH:MM") with its governing `month_header_text` ("Month YYYY") into a
 * `{ date }` (an ISO "YYYY-MM-DD" string), or `null` if either text is
 * unparseable, the two disagree on which month is meant, or the year
 * cannot be established from either. Exported for direct unit testing of
 * every real shape independently of the full Observation-building path —
 * see discovery.mjs's own doc comment for why both inputs are needed.
 */
export function parseSuperBockArenaDate(dateText, monthHeaderText) {
  if (typeof dateText !== "string") return null;
  const dateMatch = DATE_TEXT_RE.exec(dateText.trim());
  if (!dateMatch) return null;

  const [, day, monthWord, yearInText] = dateMatch;
  const month = monthNumber(monthWord);
  if (!month) return null;

  let year = yearInText ?? null;
  if (!year) {
    if (typeof monthHeaderText !== "string") return null;
    const headerMatch = HEADER_RE.exec(monthHeaderText.trim());
    if (!headerMatch) return null;
    const [, headerMonthWord, headerYear] = headerMatch;
    if (monthNumber(headerMonthWord) !== month) return null; // card/header disagree — fail closed, never guessed
    year = headerYear;
  }

  return { date: `${year}-${month}-${day.padStart(2, "0")}` };
}

function deriveStart(record) {
  const start = emptyDateTime();
  start.raw = record?.date_text ?? null;

  const parsed = parseSuperBockArenaDate(record?.date_text, record?.month_header_text);
  if (!parsed) {
    start.certainty = start.raw ? "TEXT_ONLY" : "UNKNOWN";
    return start;
  }

  start.date = parsed.date;
  start.certainty = "FLOATING_LOCAL"; // a real date AND time-of-day, but no confirmed UTC offset anywhere on this source
  return start;
}

/**
 * Convert one already-music-filtered Super Bock Arena agenda-card record
 * into an Observation.
 */
export function toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.source_record_id),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: null, // not exposed by this bounded listing (only each event's own sub-page carries one)

    start: deriveStart(record),
    end: emptyDateTime(), // no end/duration exposed by this listing

    venue_name: null, // see module doc comment — resolved by source_id, not fabricated per-record
    location_text: null,

    price_text: record.price_text ?? null,
    event_url: record.event_url ?? null,

    source_fields: {
      wp_post_id: record.source_record_id,
      categories: record.categories ?? [],
      month_header_text: record.month_header_text ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // extracted facts from a shared listing page, not a per-record raw response
    },
  });
}

/**
 * Convert every already-music-filtered record from one agenda-listing
 * fetch (ingestion/super-bock-arena/discovery.mjs's
 * parseSuperBockArenaAgenda(), then filterMusicRecords()) into
 * Observations, sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
