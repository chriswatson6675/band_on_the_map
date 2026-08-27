// Converts genuinely retrieved Hard Club (Porto) agenda-fragment records
// (ingestion/hard-club-porto/discovery.mjs) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Hard Club — Porto, Portugal. registry id "hard-club-porto"
// (sources/porto.json — this module reads that id as a literal string; it
// does not read or modify sources/porto.json itself). Built entirely from
// the retained, READY_FOR_ACTIVATION investigation at
// research/source-investigations/hard-club-porto-02/.
//
// Date/time (deliberate, conservative certainty choice): start.date is the
// full YYYY-MM-DD mechanically derived by discovery.mjs's
// deriveDateFromSlugYearAndDayMonth() (policy v1.2 DETERMINISTIC_CONTEXT —
// see investigation.json field_assessment.start_date). start.certainty is
// honestly "DATE_ONLY", NOT "FLOATING_LOCAL" and NOT "UTC_INSTANT": the
// list fragment's own "local_hora" field additionally carries a room label
// plus a 24-hour local time (e.g. "Sala 2 : 20H00"), but with no timezone/
// UTC marker anywhere in any retained evidence (investigation.json
// field_assessment.time.state is "PARTIAL", not "PROVEN") — see that
// field_assessment note. Rather than silently promoting that unqualified
// time-of-day into start's own certainty, it is preserved as its own
// separate, honestly-labelled field: source_fields.local_time_text /
// source_fields.room_label. end is always emptyDateTime() — end/end-time is
// confirmed NOT_PRESENT anywhere for this source (investigation.json
// field_assessment.end) and must never be fabricated.
//
// Venue: every event on this source is inherently a Hard Club event (the
// whole hardclubporto.com site is Hard Club's own single official agenda —
// investigation.json field_assessment.venue_location), so venue_name is
// left null and resolved by source_id (matching the Super Bock Arena / Casa
// da Música fixed-single-venue precedent). Each event's own room label
// ("Sala 1"/"Sala 2") is genuinely per-record first-party information, so —
// unlike the fixed-venue precedent's location_text — it IS carried on
// location_text here, honestly null when a record's own local_hora field
// carries no room prefix at all (see discovery.mjs's parseLocalHora, and
// the genuine anomalous archive record used in this source's own negative
// control, whose local_hora is a bare "15H00" with no room).
//
// Price: NOT present in the list fragment discovery.mjs parses. It is
// exposed only via a separate per-event loadevent AJAX fragment
// (discovery.mjs's parseHardClubEventPrice()) — callers pass its
// { price_text } result in as this function's `price` option; a record
// with no price fetched yet (or no price option supplied) gets
// price_text: null, never a guess.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "hard-club-porto";

const DEFAULT_CONTENT_TYPE = "text/html; charset=utf-8";

/**
 * Convert one discovery record (ingestion/hard-club-porto/discovery.mjs's
 * parseHardClubAgendaFragment()) into an Observation.
 *
 * `price` is an optional `{ price_text }` object — the result of a separate
 * parseHardClubEventPrice() call for this same record's slug, since price
 * is fetched via a distinct AJAX request keyed by source_record_id. Omitted
 * (or absent) leaves price_text honestly null.
 */
export function toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath, price } = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  const start = emptyDateTime();
  // discovery.mjs's record shape does not separately retain the list
  // fragment's own pre-derivation "data" (day+month) text — only the
  // mechanically-derived date_iso is exposed downstream (see discovery.mjs
  // deriveDateFromSlugYearAndDayMonth) — so raw and date coincide here.
  start.raw = record.date_iso ?? null;
  start.date = record.date_iso ?? null;
  start.certainty = record.date_iso ? "DATE_ONLY" : "UNKNOWN";

  // Matches investigation.json field_assessment.title's own representative
  // PROVEN value shape exactly ("JOHNNY HOOKER | EURO TOUR 2026" — the
  // <h3> main title and its nested <p class="demi"> subtitle joined with
  // " | ").
  const title = record.subtitle ? `${record.title} | ${record.subtitle}` : (record.title ?? null);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.source_record_id),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title,
    description: null, // not exposed by the list fragment; the separate loadevent fragment's free-text description is deliberately not mapped here — see investigation.json's blocker note on internally-inconsistent marketing copy

    start,
    end: emptyDateTime(), // end/end-time confirmed NOT_PRESENT anywhere for this source — never fabricated

    venue_name: null, // fixed single venue, resolved by source_id — see module doc comment
    location_text: record.room_label ?? null,

    price_text: price?.price_text ?? null,
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.source_record_id,
      title: record.title ?? null,
      subtitle: record.subtitle ?? null,
      room_label: record.room_label ?? null,
      local_time_text: record.time_text ?? null, // floating-local 24h time, no confirmed UTC offset anywhere — deliberately NOT folded into start's own certainty
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // extracted facts from a shared multi-event listing fragment, not a per-record raw response
    },
  });
}

/**
 * Convert every record from one parsed agenda fragment into Observations,
 * sharing one retrieval timestamp/source URL/fixture path. `priceBySlug` is
 * an optional `{ [source_record_id]: { price_text } }` lookup (e.g. built
 * from several parseHardClubEventPrice() calls) — a record whose slug is
 * absent from it gets price_text: null, never a guess.
 */
export function toObservations(records, options = {}) {
  const { priceBySlug, ...rest } = options;
  return (records ?? []).map((record) =>
    toObservation(record, { ...rest, price: priceBySlug?.[record.source_record_id] }),
  );
}
