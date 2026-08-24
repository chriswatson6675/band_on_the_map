// Converts genuinely retrieved Teatro Municipal do Porto (Rivoli / Campo
// Alegre) programme-entry records
// (ingestion/teatro-municipal-porto/discovery.mjs) into the generic
// Observation contract (ingestion/observation/contract.mjs).
//
// Source: Teatro Municipal do Porto, registry id
// "teatro-municipal-do-porto". Acquisition path: bounded, server-rendered
// HTML, month-grouped, already filtered to the site's own música
// category by the fetched URL's own query parameter.
//
// Multiple dated occurrences per entry (important, deliberate design
// choice): some programme entries genuinely run on more than one date
// (e.g. Fri 18 + Sat 19 Set 2026). This adapter follows the same honest
// pattern already established for AgendaLX's recurring-occurrence series
// (docs/OBSERVATION_PIPELINE.md): ONE Observation per entry, `start` set
// from the FIRST occurrence only, `end` left empty (a later occurrence is
// not that occurrence's "end time"), and the FULL occurrence list
// preserved verbatim in `source_fields.occurrences` rather than either
// silently dropped or expanded into several same-looking Observations
// with no independently stable per-occurrence identity.
//
// Date/time certainty: the containing article's own data-value (e.g.
// "Setembro 2026") supplies month+year; the occurrence's own ".dia_dia"/
// ".hora" supply day and time-of-day. All three are explicit, unambiguous
// source text — no timezone/UTC offset is ever stated, so certainty is
// honestly FLOATING_LOCAL (a real, known local date-time, not a confirmed
// UTC instant), matching ingestion/casa-da-musica/observation-adapter.mjs's
// identical reasoning for the same underlying ambiguity.
//
// Venue: '.local-p' is genuinely multi-valued across this feed (unlike
// Casa da Música). Canonical resolution
// (ingestion/venue/resolver.mjs's resolveTeatroMunicipalPortoObservation())
// keys on the exact retained venue_name string, the same explicit,
// non-fuzzy exact-match convention as Hot Clube/BOTA/Capitólio — an
// off-site location such as "Biblioteca Municipal Almeida Garrett" is
// deliberately left unmapped, not guessed at.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "teatro-municipal-do-porto";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const PT_MONTHS = {
  janeiro: "01",
  fevereiro: "02",
  março: "03",
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

/**
 * Parse this source's own "Month YYYY" article grouping text (e.g.
 * "Setembro 2026") into a { year, month } pair, or null if the month name
 * is not recognised — never guessed.
 */
export function parseMonthYear(monthYear) {
  if (typeof monthYear !== "string") return null;
  const match = /^([A-Za-zçÇ]+)\s+(\d{4})$/.exec(monthYear.trim());
  if (!match) return null;
  const month = PT_MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  return { year: match[2], month };
}

function deriveStart(record) {
  const start = emptyDateTime();
  const firstOccurrence = Array.isArray(record?.occurrences) ? record.occurrences[0] : null;
  const monthYear = parseMonthYear(record?.month_year);

  if (!firstOccurrence || !monthYear) {
    start.raw = record?.month_year ?? null;
    start.certainty = start.raw ? "TEXT_ONLY" : "UNKNOWN";
    return start;
  }

  const day = firstOccurrence.day.padStart(2, "0");
  start.raw = `${firstOccurrence.weekday} ${day} ${record.month_year}, ${firstOccurrence.time}`;
  start.date = `${monthYear.year}-${monthYear.month}-${day}`;
  start.certainty = "FLOATING_LOCAL";
  return start;
}

/**
 * Convert one retrieved Teatro Municipal do Porto programme-entry record
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
    description: record.subtitle ?? null, // this listing exposes no separate long-form description

    start: deriveStart(record),
    end: emptyDateTime(), // see module doc comment — a later occurrence is not this occurrence's "end"

    venue_name: record.venue_name ?? null,
    location_text: record.sub_location ?? null,

    price_text: null, // not exposed by this listing
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.source_record_id,
      subtitle: record.subtitle ?? null,
      month_year: record.month_year ?? null,
      occurrences: Array.isArray(record.occurrences) ? record.occurrences : [],
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
 * Convert every record already parsed from one programme-listing fetch
 * (ingestion/teatro-municipal-porto/discovery.mjs's
 * parseTeatroMunicipalPortoAgenda()) into Observations, sharing one
 * retrieval timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
