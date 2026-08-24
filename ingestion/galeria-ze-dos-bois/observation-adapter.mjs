// Converts genuinely retrieved Galeria Zé dos Bois (ZDB) programme-entry
// records (ingestion/galeria-ze-dos-bois/discovery.mjs) into the generic
// Observation contract (ingestion/observation/contract.mjs).
//
// Source: Galeria Zé dos Bois (ZDB), registry id "galeria-ze-dos-bois".
// Acquisition path: bounded, server-rendered HTML — the single
// https://zedosbois.org/en/programme/ listing page, filtered to this
// venue's own "Music" area + "Concerts" category (see discovery.mjs's
// filterMusicRecords()). This adapter is only ever called with
// already-music-filtered records, matching the cm-gaia-eventos/
// super-bock-arena precedent's division of responsibility.
//
// Date/time: every live music entry carries this venue's own "DD.MM.YY"
// `day_text` plus a 12-hour `hour_text` ("HH:MMAM"/"HH:MMPM") — a
// genuine, unambiguous calendar date and time-of-day, retained verbatim
// in `start.raw`. The two-digit year is a direct, literal transcription
// of exactly what this venue's own markup states (this project's live
// listings only ever run in the 2020s) — prefixing it with "20" is not
// inferring a missing value the way filling a genuinely ABSENT year from
// today's date would be (this task's absolute date rule); it is reading
// the same two digits the source itself printed, the same way a human
// reader of "09.09.26" on this venue's own site would. Certainty is
// honestly "FLOATING_LOCAL" (a real date AND time-of-day, no confirmed
// UTC offset), matching Casa da Música/Super Bock Arena. A record
// carrying only a `date_range_text` (this venue's own multi-day
// Exhibitions/Workshops entries — never observed on a "Music"/"Concerts"
// entry live) is NOT parsed into a date here: its own leading portion
// (e.g. "23.05") genuinely omits its own year, so no safe unambiguous
// date can be derived — this fails closed to TEXT_ONLY, never guessed.
//
// Venue: this is a genuinely multi-location listing (own building plus
// occasional off-site venues) — this venue's own per-entry `local` text
// is retained as `venue_name`, resolved via an exact-string data-driven
// mapping (venues/source-venue-mappings.json) for the one string
// independently evidenced ("Galeria Zé dos Bois"); every other exact
// string (e.g. "Igreja St. George", "LAV - Lisboa Ao Vivo", "ZDB 8
// MARVILA") is deliberately left unmapped rather than guessed at,
// matching the Teatro Municipal do Porto precedent exactly.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "galeria-ze-dos-bois";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const DAY_TEXT_RE = /^(\d{2})\.(\d{2})\.(\d{2})$/;
const HOUR_TEXT_RE = /^(\d{1,2}):(\d{2})(AM|PM)$/i;

/**
 * Parse this source's own "DD.MM.YY" `day_text` into an ISO "YYYY-MM-DD"
 * calendar date, or null if it does not match that exact shape — never
 * guessed. Exported for direct unit testing.
 */
export function parseZdbDayText(dayText) {
  if (typeof dayText !== "string") return null;
  const match = DAY_TEXT_RE.exec(dayText.trim());
  if (!match) return null;
  const [, day, month, twoDigitYear] = match;
  return `20${twoDigitYear}-${month}-${day}`;
}

/**
 * Parse this source's own 12-hour `hour_text` ("HH:MMAM"/"HH:MMPM") into
 * 24-hour "HH:MM", or null if it does not match that exact shape.
 * Exported for direct unit testing; used only to enrich `start.raw`'s
 * combined text — the Observation contract has no dedicated time field.
 */
export function parseZdbHourText(hourText) {
  if (typeof hourText !== "string") return null;
  const match = HOUR_TEXT_RE.exec(hourText.trim());
  if (!match) return null;
  let [, hour, minute, meridiem] = match;
  let h = Number(hour) % 12;
  if (meridiem.toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

function deriveStart(record) {
  const start = emptyDateTime();

  if (record?.day_text) {
    const time24 = parseZdbHourText(record.hour_text);
    start.raw = time24
      ? `${record.week_text ? `${record.week_text} ` : ""}${record.day_text} ${time24}`.trim()
      : record.day_text;
    const date = parseZdbDayText(record.day_text);
    if (date) {
      start.date = date;
      start.certainty = "FLOATING_LOCAL";
      return start;
    }
    start.certainty = "TEXT_ONLY";
    return start;
  }

  if (record?.date_range_text) {
    // The range's own leading portion never carries its own year on this
    // source (e.g. "23.05 — 26.09.26") — fails closed, never guessed.
    start.raw = record.date_range_text;
    start.certainty = "TEXT_ONLY";
    return start;
  }

  return start; // UNKNOWN — no date text at all on this entry
}

/**
 * Convert one already-music-filtered ZDB programme record into an
 * Observation.
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
    description: null, // not exposed by this bounded listing (only each entry's own sub-page carries one)

    start: deriveStart(record),
    end: emptyDateTime(), // no end/duration exposed by this listing for a single dated entry

    venue_name: record.local ?? null,
    location_text: null,

    price_text: null, // not exposed by this listing
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.source_record_id,
      area: record.area ?? null,
      categories: record.categories ?? [],
      week_text: record.week_text ?? null,
      day_text: record.day_text ?? null,
      hour_text: record.hour_text ?? null,
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
 * Convert every already-music-filtered record from one programme-listing
 * fetch (ingestion/galeria-ze-dos-bois/discovery.mjs's parseZdbProgramme(),
 * then filterMusicRecords()) into Observations, sharing one retrieval
 * timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
