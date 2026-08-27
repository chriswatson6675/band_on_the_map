// Converts genuinely retrieved Câmara Municipal de Sintra — Agenda
// Cultural event records (ingestion/cm-sintra-agenda-cultural/
// discovery.mjs) into the generic Observation contract
// (ingestion/observation/contract.mjs).
//
// Source: Câmara Municipal de Sintra — Agenda Cultural, EXISTING registry
// id "cm-sintra-agenda-cultural" (sources/lisbon.json — this module only
// reads that id as a literal string constant; it never edits the
// registry). Investigation: research/source-investigations/
// cm-sintra-agenda-cultural-01/investigation.json, decision
// READY_FOR_ACTIVATION. Activation into any orchestration/run wiring is a
// separate, explicitly-authorised step this module does not perform.
//
// source_record_id — THE STABLE-IDENTIFIER NUANCE (must read before
// touching this file): investigation.json's field_assessment.
// source_record_id empirically demonstrated that this source's internal
// numeric event id (visible only in an HTML class attribute, e.g.
// "ic-event-id-148", never in any URL) is NOT alone a per-occurrence-
// unique key — the SAME id 148 serves two different calendar dates of one
// multi-date production ("Evita", 2026-09-03 and 2026-09-04). This
// source's public permalink URLs carry no numeric id at all — the shape
// is /agenda/{slug}/{date}-{time} — and ARE proven stable per occurrence:
// this platform emits no <link rel="canonical"> at all, but each sampled
// detail page's own <meta property="og:url"> exactly self-declares that
// same full path (2/2). deriveSourceRecordId() below therefore always
// derives source_record_id from the full permalink path after
// "/agenda/" (never the internal numeric id). See
// tests/cm-sintra-agenda-cultural-observation.test.mjs for the regression
// test proving the two Evita dates produce two DIFFERENT
// source_record_id values despite sharing internal id 148.
//
// Dates: investigation.json's field_assessment.start_date.state is
// PROVEN with basis DIRECT_SOURCE — every sampled Música row states its
// own full ISO calendar date (YYYY-MM-DD) directly in a dedicated
// ic-single-next element, on the list row itself, no DETERMINISTIC_CONTEXT
// combination needed. No UTC offset or IANA timezone is ever stated on
// this source, so — matching the ingestion/cco-sintra/
// observation-adapter.mjs precedent for the identical situation (an
// unambiguous, directly-stated local date, never promoted to a UTC
// instant) — certainty is recorded as DATE_ONLY, never UTC_INSTANT or
// FLOATING_LOCAL.
//
// Time: field_assessment.time.state is PROVEN for this source's bounded
// 3-row Música sample — every sampled row carries an explicit start time.
// time_text is retained in source_fields and folded into start.raw when
// present, but never promoted into start.iso/is_utc.
//
// End/duration: field_assessment.end.state is NOT_PRESENT — no end-time,
// duration, or "Duração:" field of any kind was found anywhere on either
// retained detail page (unlike the sibling cco-sintra-01 investigation,
// where a free-text duration sentence existed on some pages). `end` stays
// fully empty (emptyDateTime()) — this adapter never attempts to derive
// one from anything.
//
// Venue: each event's own venue/location text (e.g. "Centro Cultural
// Olga Cadaval", "Museu Arqueológico de São Miguel de Odrinhas") is
// retained verbatim in location_text and source_fields.venue_text — never
// asserted as venue_name (canonical Venue resolution/geocoding is a
// separate, out-of-scope step per docs/ARCHITECTURE.md).
//
// Price: field_assessment.price.state is PARTIAL — no dedicated price
// field exists anywhere in the retained sample. Retained verbatim in
// price_text when a "Preço:"-labelled paragraph is genuinely present
// (never observed in this source's own bounded 2-detail-page sample),
// null otherwise — never guessed from unstructured free-admission prose
// or from an unrelated page element (see discovery.mjs's doc comment on
// the "gratuita" pitfall).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cm-sintra-agenda-cultural";

const DEFAULT_CONTENT_TYPE = "text/html; charset=utf-8";
const PERMALINK_PATH_RE = /\/agenda\/(.+)$/;

/**
 * Derive this source's per-occurrence source_record_id from a full
 * event-detail permalink URL — the exact strategy documented in
 * investigation.json's field_assessment.source_record_id.notes. Returns
 * the permalink's own path segment after "/agenda/" (slug+date+time),
 * e.g. "evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00"
 * — this source's URLs never carry a numeric id prefix at all, but the
 * underlying stable-identifier nuance still applies: the row's own
 * internal numeric event id (e.g. 148) is NOT per-occurrence-unique, so
 * this function must never be short-circuited into deriving an id from
 * anything other than the full permalink path. Throws if the permalink is
 * missing or does not contain a recognisable "/agenda/..." path.
 */
export function deriveSourceRecordId(permalink) {
  if (typeof permalink !== "string" || permalink.trim() === "") {
    throw new Error("deriveSourceRecordId requires a non-empty CM Sintra Agenda Cultural permalink URL");
  }
  const match = PERMALINK_PATH_RE.exec(permalink);
  if (!match || match[1].trim() === "") {
    throw new Error(`deriveSourceRecordId could not find an "/agenda/..." path in permalink: ${permalink}`);
  }
  return match[1];
}

function deriveStart(record) {
  const start = emptyDateTime();
  start.raw = [record?.date_iso, record?.time_text].filter(Boolean).join(" ") || null;
  start.date = typeof record?.date_iso === "string" && record.date_iso.trim() !== "" ? record.date_iso : null;
  start.certainty = start.date ? "DATE_ONLY" : start.raw ? "TEXT_ONLY" : "UNKNOWN";
  return start;
}

/**
 * Convert one retrieved CM Sintra Agenda Cultural event record
 * (ingestion/cm-sintra-agenda-cultural/discovery.mjs's
 * parseCmSintraAgendaMusicRecords() or extractCmSintraEventFacts() shape)
 * into an Observation.
 */
export function toObservation(record, { retrievedAt, contentType, fixturePath } = {}) {
  if (!record?.permalink) {
    throw new Error("toObservation requires a record with a non-empty permalink");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: deriveSourceRecordId(record.permalink),
    retrieved_at: retrievedAt ?? null,

    source_url: record.permalink,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: null, // not retained — only the bounded structured fields are extracted

    start: deriveStart(record),
    end: emptyDateTime(), // field_assessment.end.state is NOT_PRESENT — never fabricated

    venue_name: null, // canonical Venue identity/resolution is out of scope for this adapter
    location_text: record.venue_text ?? null,

    price_text: record.price_text ?? null,
    event_url: record.permalink,

    source_fields: {
      permalink: record.permalink,
      date_iso: record.date_iso ?? null,
      time_text: record.time_text ?? null,
      venue_text: record.venue_text ?? null,
      category_text: record.category_text ?? null,
      price_text: record.price_text ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_HTML_EXCERPT",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // fixture is a bounded, curated excerpt of the retained evidence, not the complete raw HTTP body
    },
  });
}

/**
 * Convert every record already extracted from retrieved CM Sintra Agenda
 * Cultural list/detail-page parses into Observations, sharing one
 * retrieval timestamp/content-type/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
