// Converts genuinely retrieved Fama D'Alfama "Agenda de Fados" per-night
// discovery records (ingestion/fama-dalfama/discovery.mjs's
// parseFamaDAlfamaAgenda()) into the generic Observation contract
// (ingestion/observation/contract.mjs).
//
// Source: Fama D'Alfama (fado house / restaurant, Rua do Terreiro do
// Trigo 80, Alfama, Lisboa). Built entirely from the already-completed,
// READY_FOR_ACTIVATION investigation at
// research/source-investigations/fama-dalfama-lisbon-01/ — see that
// investigation's investigation.json for the full, cited evidence behind
// every honesty decision below. This module performs no network I/O.
//
// source_record_id: field_assessment.source_record_id.state is
// NOT_PRESENT — this source exposes no id token, permalink slug, or
// JSON-LD @id for any individual night. discovery.mjs already
// synthesizes the investigation's documented ALTERNATIVE IDENTITY
// STRATEGY (a composite venue-key + derived-calendar-date key, e.g.
// "fama-dalfama:2026-08-17") as each record's own source_record_id; this
// adapter only forwards it, exactly like
// ingestion/teatro-municipal-porto/observation-adapter.mjs forwards that
// source's own permalink slug — it never re-derives or second-guesses it.
//
// start.date/start.certainty: field_assessment.start_date.state is
// PROVEN, derived mechanically (DETERMINISTIC_CONTEXT — the page's own
// single month/year heading combined with each day-block's own "DD/MM"
// heading; see discovery.mjs's own doc comment and
// evidence/offline-proof.mjs/offline-proof-output.txt for the exact,
// already-reproduced combination rule). That derived date is therefore
// honestly promoted to `start.date`. field_assessment.time.state is also
// PROVEN, but ONLY as a page-level, venue-wide constant ("Fado a partir
// das 20h30") — not restated per day-block, and not qualified by any
// timezone/UTC offset anywhere in the retained evidence (the
// investigation's own notes are explicit: "Floating local time, same
// timezone caveat as start_date"). Per this task's own governed
// instruction, a shared, non-timezone-qualified time constant is NOT
// promoted into `start.iso`/a stronger certainty than the date alone
// already earns — `start.certainty` stays the honest "DATE_ONLY", and the
// shared time text is retained, clearly labelled as a page-level
// constant rather than a per-night confirmed instant, in
// `source_fields.shared_fado_start_time_text` (plus
// `source_fields.shared_opens_time_text` for the venue's separately
// stated opening time) and folded into `description` as plain text for
// any human/display consumer. This mirrors this project's existing rule
// that a PARTIAL/contextual fact is retained honestly rather than
// promoted into a clean Observation field it does not actually earn.
//
// end: field_assessment.end.state is NOT_PRESENT — no end time or
// duration is stated anywhere in the retained evidence, for the page as a
// whole or any individual night. Left as emptyDateTime(), never guessed.
//
// venue_name/location_text: this is a single-venue source — every night's
// performance is at the venue's own one physical address
// (field_assessment.venue_location.state: PROVEN, street + city only, no
// postcode/coordinates proven). venue_name is set to the venue's own
// stated name (matching this project's existing single-venue-per-source
// precedent, e.g. ingestion/la-boule-noire/observation-adapter.mjs); the
// street/city text is retained in location_text, never upgraded into
// coordinates this investigation did not prove.
//
// event_url: field_assessment.event_url.state is PARTIAL — a URL exists
// (the one shared agenda page) but is not unique per night. Per this
// project's honesty convention (matching how ingestion/duc-des-lombards
// and ingestion/le-baiser-sale/observation-adapter.mjs treat a PARTIAL
// field), this is retained as `source_url` (honestly "where this fact was
// read") but NEVER synthesized into a per-night `event_url` — that field
// stays null rather than implying a distinct per-occurrence page that
// does not exist.
//
// price: field_assessment.price.state is NOT_PRESENT — left null, never
// fabricated.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "fama-dalfama";
export const VENUE_NAME = "Fama D'Alfama";
export const VENUE_LOCATION_TEXT = "Rua do Terreiro do Trigo 80, Alfama, Lisboa, Portugal";
export const AGENDA_URL = "https://famadalfama.pt/agenda-de-fados-em-lisboa/";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

/**
 * Build this record's `start` DateTime. Only the mechanically-derived
 * calendar date is promoted to `date`; the shared page-level time
 * constant is deliberately NOT combined into `iso` — see this module's
 * own doc comment for exactly why. Never fabricates a stronger certainty
 * than the retained evidence actually proves.
 */
function deriveStart(record) {
  const start = emptyDateTime();
  if (!record?.date_iso) {
    start.raw = record?.weekday_text ?? null;
    start.certainty = start.raw ? "TEXT_ONLY" : "UNKNOWN";
    return start;
  }
  start.raw = `${record.weekday_text ?? ""} ${record.date_iso}`.trim();
  start.date = record.date_iso;
  start.is_utc = false;
  start.certainty = "DATE_ONLY";
  return start;
}

function buildDescription(record) {
  if (!record?.time_text) return null;
  return `Fado a partir das ${record.time_text}${record.opens_time_text ? ` (restaurante abre às ${record.opens_time_text})` : ""} — venue-wide nightly schedule, not restated per night on the source.`;
}

/**
 * Convert one Fama D'Alfama discovery record (discovery.mjs's
 * parseFamaDAlfamaAgenda()) into an Observation.
 */
export function toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.source_record_id),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? AGENDA_URL,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: buildDescription(record),

    start: deriveStart(record),
    end: emptyDateTime(), // NOT_PRESENT — no end time/duration stated anywhere in the retained evidence

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: VENUE_LOCATION_TEXT,

    price_text: null, // NOT_PRESENT — no price stated anywhere in the retained evidence
    // PARTIAL, not PROVEN, per field_assessment.event_url — this shared
    // agenda page is not a distinct per-night URL, so it is never
    // presented as event_url (see this module's own doc comment).
    event_url: null,

    source_fields: {
      weekday_text: record.weekday_text ?? null,
      performers_text: Array.isArray(record.performers_text) ? record.performers_text : [],
      shared_fado_start_time_text: record.time_text ?? null,
      shared_opens_time_text: record.opens_time_text ?? null,
      raw_day_block_text: record.raw_day_block_text ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // extracted facts from a shared monthly-calendar page, not a per-record raw response
    },
  });
}

/**
 * Convert every record already parsed from one agenda-page fetch
 * (ingestion/fama-dalfama/discovery.mjs's parseFamaDAlfamaAgenda()) into
 * Observations, sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
