// Converts genuinely retrieved Centro Cultural Olga Cadaval (Sintra)
// event-detail facts (ingestion/cco-sintra/discovery.mjs) into the generic
// Observation contract (ingestion/observation/contract.mjs).
//
// Source: Centro Cultural Olga Cadaval, EXISTING registry id "cco-sintra"
// (sources/lisbon.json — this module only reads that id as a literal
// string constant; it never edits the registry). Investigation:
// research/source-investigations/cco-sintra-01/investigation.json,
// decision READY_FOR_ACTIVATION. Activation into any orchestration/run
// wiring is a separate, explicitly-authorised step this module does not
// perform.
//
// source_record_id — THE STABLE-IDENTIFIER NUANCE (must read before
// touching this file): investigation.json's field_assessment.
// source_record_id empirically demonstrated that this source's bare
// numeric content-item id (e.g. "543") is NOT alone a per-occurrence-
// unique key — the SAME id 543 serves two different calendar dates of one
// multi-date production ("Evita", 2026-09-03 and 2026-09-04). The FULL
// permalink — {id}-{slug}/{date}-{time} — IS proven stable, because each
// sampled detail page's own <link rel="canonical"> exactly self-declares
// that same full path. deriveSourceRecordId() below therefore always
// derives source_record_id from the full canonical permalink path (never
// the bare id alone). See tests/cco-sintra-observation.test.mjs for the
// regression test proving the two Evita dates produce two DIFFERENT
// source_record_id values despite sharing bare id 543.
//
// Dates: investigation.json's field_assessment.start_date.state is
// PROVEN with basis DIRECT_SOURCE — every sampled event states its own
// full ISO calendar date (YYYY-MM-DD) directly in a dedicated
// ic-single-next element, no DETERMINISTIC_CONTEXT combination needed.
// No UTC offset or IANA timezone is ever stated on this source, so —
// matching the ingestion/capitolio/observation-adapter.mjs precedent for
// the identical situation (an unambiguous, directly-stated local date,
// never promoted to a UTC instant) — certainty is recorded as DATE_ONLY,
// never UTC_INSTANT or FLOATING_LOCAL (FLOATING_LOCAL is reserved for a
// date corroborated across two independent representations on the same
// record per ingestion/casa-da-musica/observation-adapter.mjs's doc
// comment; this source states its date only once, directly).
//
// Time: field_assessment.time.state is PARTIAL (9 of 10 sampled rows
// carry an explicit start time; event id 551 genuinely has none anywhere,
// on its list row or its own detail page). time_text is retained in
// source_fields and folded into start.raw when present, but never
// promoted into start.iso/is_utc and never assumed present.
//
// End/duration: field_assessment.end.state is PARTIAL — a free-text
// "Duração:" sentence appears on some (not all) detail pages, with
// inconsistent wording. Per this project's honest-certainty model, `end`
// stays fully empty (emptyDateTime()) rather than attempting a free-text
// duration parse into a fabricated end instant.
//
// Venue: each event's own auditorium (one of the venue's two named rooms,
// "Auditório Jorge Sampaio" / "Auditório Acácio Barreiros") is retained
// verbatim in location_text and source_fields.venue_text — never asserted
// as venue_name (canonical Venue resolution/geocoding is a separate,
// out-of-scope step per docs/ARCHITECTURE.md).
//
// Price: field_assessment.price.state is PARTIAL — a multi-tier free-text
// "Preço:" block appears on some (not all) sampled detail pages. Retained
// verbatim in price_text when present, null when genuinely absent.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cco-sintra";

const DEFAULT_CONTENT_TYPE = "text/html; charset=utf-8";
const PERMALINK_PATH_RE = /\/agenda\/(.+)$/;

/**
 * Derive this source's per-occurrence source_record_id from a full
 * canonical event-detail permalink URL — the exact strategy documented in
 * investigation.json's field_assessment.source_record_id.notes. Returns
 * the permalink's own path segment after "/agenda/" (id+slug+date+time),
 * e.g. "519-gnr/2026-09-11-21-00" — NEVER the bare numeric content-item
 * id alone, because that id is proven not to be per-occurrence-unique
 * (see this module's doc comment above). Throws if the permalink is
 * missing or does not contain a recognisable "/agenda/..." path.
 */
export function deriveSourceRecordId(permalink) {
  if (typeof permalink !== "string" || permalink.trim() === "") {
    throw new Error("deriveSourceRecordId requires a non-empty CCO Sintra permalink URL");
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
 * Convert one retrieved CCO Sintra event-detail record
 * (ingestion/cco-sintra/discovery.mjs's extractCcoSintraEventFacts()
 * shape) into an Observation.
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
    description: null, // not retained — see discovery.mjs; only the bounded structured fields are extracted

    start: deriveStart(record),
    end: emptyDateTime(), // duration text is inconsistently present free text — never fabricated into an end instant

    venue_name: null, // canonical Venue identity/resolution is out of scope for this adapter
    location_text: record.venue_text ?? null,

    price_text: record.price_text ?? null,
    event_url: record.permalink,

    source_fields: {
      permalink: record.permalink,
      date_iso: record.date_iso ?? null,
      time_text: record.time_text ?? null,
      venue_text: record.venue_text ?? null,
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
 * Convert every record already extracted from retrieved CCO Sintra
 * detail-page fetches (ingestion/cco-sintra/discovery.mjs's
 * extractCcoSintraEventFacts()) into Observations, sharing one retrieval
 * timestamp/content-type/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
