// Converts Teatro São Luiz (Lisbon, EGEAC-managed) event-detail facts
// (ingestion/teatro-sao-luiz/discovery.mjs) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Teatro São Luiz, registry id "teatro-sao-luiz" (a NEW
// sources/lisbon.json registry entry someone else is adding separately —
// this string must match it exactly). This is a DIFFERENT venue/source
// from the existing, unrelated "tnsc-sao-carlos" registry id — never
// confuse the two.
//
// Built ENTIRELY on the READY_FOR_ACTIVATION investigation at
// research/source-investigations/teatro-sao-luiz-lisbon-02/investigation.json
// (which supersedes teatro-sao-luiz-lisbon-01). See discovery.mjs's own doc
// comment for the full derivation this adapter relies on.
//
// source_record_id: the WordPress shortlink post id
// (facts.wp_shortlink_post_id from discovery.mjs's
// extractTeatroSaoLuizEventFacts()) — proven stable across independent
// fetches, including across the two independent investigations
// (investigation.json field_assessment.source_record_id). Never the URL
// slug, which is editorial text, not a source-guaranteed stable id.
//
// start.date / start.certainty: field_assessment.start_date is PROVEN with
// basis DETERMINISTIC_CONTEXT — a genuine, mechanically-reproducible
// derivation (see discovery.mjs's deriveSeasonYear()/
// combineDateWithSeasonYear()), NOT a direct source statement. This
// adapter still never promotes the result to UTC_INSTANT:
// field_assessment.time itself remains PARTIAL (a local time-of-day is
// usually present in the "Dates and Schedules" text, but no UTC offset or
// IANA timezone is stated anywhere on this source). Certainty is therefore
// "FLOATING_LOCAL" whenever a derived date AND a raw time-of-day text are
// both present, "DATE_ONLY" when only the date derivation succeeds with no
// time text at all, and fails closed to "TEXT_ONLY"/"UNKNOWN" — never
// throws — when the date cannot be derived (e.g. no seasonLabel supplied,
// or day_month_text does not match this source's own observed shapes).
//
// end: deliberately always empty. field_assessment.end is PARTIAL, not
// PROVEN — a multi-day run's own last day is only ever a proxy for an
// "end", per investigation.json's own honest caveat — so no end
// date/time is fabricated here, matching the AgendaLX precedent for a
// recurring/ranged schedule (docs/OBSERVATION_PIPELINE.md).
//
// venue_name / location_text: this theatre has several distinct internal
// rooms (Largo do Picadeiro, Sala Bernardo Sassetti, Sala Luis Miguel
// Cintra, Sala Mário Viegas, ...), not one fixed single venue — unlike the
// Super Bock Arena / Casa da Música pattern. facts.venue_text is each
// event's own room name, kept honestly in location_text only;
// venue_name stays null (never canonicalized here — that is Venue
// resolution's job, out of scope for this adapter per
// docs/ARCHITECTURE.md).
//
// price_text: deliberately always null. discovery.mjs's
// extractTeatroSaoLuizEventFacts() does not extract a price field (out of
// this task's explicit facts shape) — never fabricated here from nothing.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { combineDateWithSeasonYear } from "./discovery.mjs";

export const SOURCE_ID = "teatro-sao-luiz";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

function deriveStart(facts, seasonLabel) {
  const start = emptyDateTime();
  const rawParts = [facts?.day_month_text, facts?.weekday_text, facts?.time_text].filter(Boolean);
  start.raw = rawParts.length > 0 ? rawParts.join(", ") : null;

  if (facts?.day_month_text && seasonLabel) {
    try {
      start.date = combineDateWithSeasonYear(facts.day_month_text, seasonLabel);
    } catch {
      start.date = null; // fails closed — never guesses a year outside the proven rule
    }
  }

  if (start.date) {
    start.certainty = facts?.time_text ? "FLOATING_LOCAL" : "DATE_ONLY";
  } else {
    start.certainty = start.raw ? "TEXT_ONLY" : "UNKNOWN";
  }

  return start;
}

/**
 * Convert one Teatro São Luiz detail-page facts record (from
 * discovery.mjs's extractTeatroSaoLuizEventFacts()) into an Observation.
 *
 * `seasonLabel` (from discovery.mjs's extractTeatroSaoLuizSeasonLabel(),
 * e.g. "2026-2027") is required to derive `start.date` — its absence is
 * NOT an error here (this adapter never throws on a missing/unparseable
 * date; see deriveStart() above), it simply leaves the date undetermined.
 */
export function toObservation(
  facts,
  {
    seasonLabel = null,
    retrievedAt = null,
    sourceUrl = null,
    contentType = DEFAULT_CONTENT_TYPE,
    fixturePath = null,
    evidenceKind = "RAW_HTTP_RESPONSE_BYTES",
    byteFaithful = false,
  } = {},
) {
  if (!facts?.wp_shortlink_post_id) {
    throw new Error(
      "toObservation requires facts with a non-empty wp_shortlink_post_id " +
        "(see discovery.mjs's own doc comment: this id only ever appears in the " +
        "detail page's own retained HTTP response headers, never in its HTML body)",
    );
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(facts.wp_shortlink_post_id),
    retrieved_at: retrievedAt,

    source_url: sourceUrl ?? facts.event_url ?? null,
    content_type: contentType,

    title: facts.title ?? null,
    description: null, // not exposed by the facts shape this adapter consumes

    start: deriveStart(facts, seasonLabel),
    end: emptyDateTime(), // see module doc comment — field_assessment.end is PARTIAL, never fabricated

    venue_name: null, // see module doc comment — multiple internal rooms, not canonicalized here
    location_text: facts.venue_text ?? null,

    price_text: null, // see module doc comment — not part of this adapter's facts shape

    event_url: facts.event_url ?? null,

    source_fields: {
      wp_shortlink_post_id: facts.wp_shortlink_post_id,
      day_month_text: facts.day_month_text ?? null,
      weekday_text: facts.weekday_text ?? null,
      time_text: facts.time_text ?? null,
      season_label: seasonLabel ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath,
      evidence_kind: evidenceKind,
      content_type: contentType,
      byte_faithful: byteFaithful,
    },
  });
}

/**
 * Convert every facts record in `factsList` (each from discovery.mjs's
 * extractTeatroSaoLuizEventFacts()) into Observations, sharing one
 * seasonLabel/retrievedAt/sourceUrl/fixturePath context.
 */
export function toObservations(factsList, options = {}) {
  return (factsList ?? []).map((facts) => toObservation(facts, options));
}
