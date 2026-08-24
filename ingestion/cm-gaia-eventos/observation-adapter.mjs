// Converts genuinely retrieved CM Gaia "Eventos" listing records
// (ingestion/cm-gaia-eventos/discovery.mjs) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Câmara Municipal de Vila Nova de Gaia, registry id
// "cm-gaia-eventos". Acquisition path: bounded, server-rendered HTML
// listing (its own multi-category "Eventos" page), filtered to the
// source's own "# música" tag — see discovery.mjs's filterMusicRecords().
// This adapter is only ever called with already-music-filtered records
// (ingestion/lisbon-porto/run.mjs's collectCmGaiaEventos()); it does not
// re-filter, matching the same division of responsibility already used
// for AgendaLX/Teatro Municipal do Porto (the URL-level category filter
// is the filtering step there; here the filtering step is applied to the
// parsed record set instead, because no server-side filtered listing URL
// was found to work for this source within this task's bounded search —
// see sources/porto.json's own acquisition_path_detail for cm-gaia-eventos).
//
// Date/time certainty (important, deliberate choice — see discovery.mjs's
// own doc comment for the source text shapes this handles): this
// municipal feed exposes only a calendar date (sometimes a date RANGE),
// never a time-of-day. Per docs/OBSERVATION_PIPELINE.md's certainty
// model this is honestly "DATE_ONLY" whenever a real, unambiguous
// calendar date is derived — never "FLOATING_LOCAL" (that certainty
// implies a real time-of-day was also read, which this source never
// provides) and never fabricated into a UTC instant. A date range
// (e.g. "19 Set a 17 Out 2026") is a multi-day-or-longer engagement, not
// several independently dated occurrences the way Teatro Municipal do
// Porto's are — this adapter follows the SAME "one Observation, `start`
// from the range's own FIRST stated day" honest pattern already
// established there, retaining the complete, unmodified `date_text` in
// `source_fields` rather than inventing an `end` this source's own text
// does not actually assert as a distinct calendar instant.
//
// Venue: this general municipal listing exposes no venue/location field
// at all anywhere this task's bounded search reached (unlike Teatro
// Municipal do Porto's per-entry ".local-p", or even Odivelas's
// "Contacto:" free text) — venue_name and location_text are honestly
// null for every Observation from this source, exactly matching the
// precedent already established for cm-odivelas-agenda-cultura
// (ODIVELAS_LOCATION_TEXT_TO_CANONICAL in ingestion/venue/resolver.mjs
// starts empty for the identical reason). Every cm-gaia-eventos
// Observation is therefore UNRESOLVED via ingestion/venue/resolver.mjs's
// existing NO_RESOLVER_FOR_SOURCE fallthrough — no resolver branch is
// added for this source, per this task's own "no venue-specific resolver
// branches" rule; a future task may add one once a specific referenced
// venue is independently address-evidenced, exactly as Odivelas's own
// Centro Cultural Malaposta/Biblioteca D.Dinis mappings were later added
// via venues/source-venue-mappings.json, not this file.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cm-gaia-eventos";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const PT_MONTH_ABBR = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};

// Tried in this exact order — most specific (year appears twice) first,
// so a cross-year range is never mis-parsed by a looser, shorter pattern.
const CROSS_YEAR_RANGE_RE =
  /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+a\s+(\d{1,2})\s+[A-Za-z]+\s+\d{4}$/;
const CROSS_MONTH_RANGE_RE = /^(\d{1,2})\s+([A-Za-z]+)\s+a\s+(\d{1,2})\s+[A-Za-z]+\s+(\d{4})$/;
const SAME_MONTH_RANGE_RE = /^(\d{1,2})\s+[ae]\s+\d{1,2}\s+([A-Za-z]+)\s+(\d{4})$/;
const SINGLE_DAY_RE = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/;

/**
 * Parse this source's own free-text date field into a { day, month, year }
 * triple naming the FIRST calendar day the text asserts, or null if the
 * text is empty or does not match any of the shapes this module's own doc
 * comment documents as actually observed live — never guessed at.
 * Exported for direct unit testing of every real shape independently of
 * the full Observation-building path.
 */
export function parseGaiaDateText(dateText) {
  if (typeof dateText !== "string") return null;
  const text = dateText.trim();
  if (text === "") return null;

  let match = CROSS_YEAR_RANGE_RE.exec(text);
  if (match) {
    const [, day, monthWord, year] = match;
    const month = PT_MONTH_ABBR[monthWord.toLowerCase()];
    return month ? { day: day.padStart(2, "0"), month, year } : null;
  }

  match = CROSS_MONTH_RANGE_RE.exec(text);
  if (match) {
    const [, day, monthWord, , year] = match; // group 3 is the range's second day — not needed for start
    const month = PT_MONTH_ABBR[monthWord.toLowerCase()];
    return month ? { day: day.padStart(2, "0"), month, year } : null;
  }

  match = SAME_MONTH_RANGE_RE.exec(text);
  if (match) {
    const [, day, monthWord, year] = match;
    const month = PT_MONTH_ABBR[monthWord.toLowerCase()];
    return month ? { day: day.padStart(2, "0"), month, year } : null;
  }

  match = SINGLE_DAY_RE.exec(text);
  if (match) {
    const [, day, monthWord, year] = match;
    const month = PT_MONTH_ABBR[monthWord.toLowerCase()];
    return month ? { day: day.padStart(2, "0"), month, year } : null;
  }

  return null; // an unrecognised shape — fails closed, never guessed
}

function deriveStart(record) {
  const start = emptyDateTime();
  const rawText = typeof record?.date_text === "string" && record.date_text.trim() !== "" ? record.date_text : null;
  start.raw = rawText;

  const parsed = rawText ? parseGaiaDateText(rawText) : null;
  if (!parsed) {
    start.certainty = rawText ? "TEXT_ONLY" : "UNKNOWN";
    return start;
  }

  start.date = `${parsed.year}-${parsed.month}-${parsed.day}`;
  start.certainty = "DATE_ONLY"; // a real calendar date, but this source never states a time-of-day
  return start;
}

/**
 * Convert one already-music-filtered CM Gaia eventos record into an
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
    description: record.description ?? null,

    start: deriveStart(record),
    end: emptyDateTime(), // see module doc comment — a stated range is not a confirmed distinct end instant

    venue_name: null, // see module doc comment — this listing exposes no venue field at all
    location_text: null,

    price_text: null, // not exposed by this listing
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.source_record_id,
      tag: record.tag ?? null,
      date_text: record.date_text ?? null,
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
 * Convert every already-music-filtered record from one listing-page fetch
 * (ingestion/cm-gaia-eventos/discovery.mjs's parseCmGaiaEventosAgenda(),
 * then filterMusicRecords()) into Observations, sharing one retrieval
 * timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
