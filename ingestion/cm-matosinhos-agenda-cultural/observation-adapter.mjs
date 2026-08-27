// Converts CM Matosinhos event-detail facts
// (ingestion/cm-matosinhos-agenda-cultural/discovery.mjs's
// extractMatosinhosEventDetailFacts()) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Câmara Municipal de Matosinhos' own, native "Eventos | Música"
// events system, NOT YET an existing registry id (this task builds the
// collector only — see docs/SOURCE_INVESTIGATION_POLICY.md's "investigation
// and activation are separate"; no sources/*.json or venues/*.json edit
// happens here or anywhere in this module). Entirely based on the
// READY_FOR_ACTIVATION investigation retained at research/
// source-investigations/cm-matosinhos-agenda-cultural-amp-01/
// investigation.json.
//
// source_record_id (PROVEN): investigation.json's field_assessment.
// source_record_id proves the detail page's own permalink slug (e.g.
// "quarteto-de-cordas-de-matosinhos-com-joao-reis") as the stable
// identifier — independently restated in that same page's own
// <meta name="canonical"> tag. This adapter derives source_record_id ONLY
// from that canonical event_url's own /evento/{slug} shape, exactly
// mirroring ingestion/campo-pequeno/observation-adapter.mjs's identical
// convention. The internal numeric wm:page_id meta tag is NEVER used as an
// identifier here — the two retained detail-page fixtures mechanically
// prove it is not unique across distinct events (both literally carry
// wm:page_id 2805); it is retained, for provenance only, in
// source_fields.page_id.
//
// Dates: field_assessment.start_date/time/end are all PROVEN with basis
// DIRECT_SOURCE — every sampled detail page's own add-to-calendar
// microformat states a full local "YYYY-MM-DD HH:MM:SS" atc_date_start/
// atc_date_end AND an explicit IANA atc_timezone directly. Per this
// project's certainty model (ingestion/observation/contract.mjs) and the
// precedent already established for the identical situation in
// ingestion/events-calendar-api/observation-adapter.mjs's deriveDateTime()
// (a local date+time plus a named-but-unresolved timezone), certainty is
// honestly TZID_QUALIFIED_UNRESOLVED — this project does not perform
// timezone-offset/DST inference to promote a named IANA zone into a
// UTC_INSTANT. `date` is populated (the calendar date is genuinely known)
// and `tzid` is populated (the timezone name is genuinely known); `iso`/
// `is_utc` are never populated. A genuine single-instant event states
// atc_date_end identical to atc_date_start (never inferred/copied here —
// both are read directly, independently, from the source's own text); a
// genuine multi-day event states a real, different atc_date_end.
//
// Venue: location_text is read ONLY from each event's OWN detail page
// "Local:" widget field (extractMatosinhosEventDetailFacts()'s
// location_text) — never from the listing page's own copy of the same
// fact (discovery.mjs's parseMatosinhosMusicaListing() retains that
// separately, for provenance/cross-check only, per this task's explicit
// instruction). venue_name is always null — this is an unresolved venue
// NAME text only, not a resolved address/coordinates, matching
// ingestion/campo-pequeno/observation-adapter.mjs's identical conservative
// choice. The exact text is used verbatim, never paraphrased or
// canonicalised (e.g. "Teatro Municipal de Matosinhos Constantino Nery",
// "Mosteiro de Leça do Balio" — real venues this investigation found, kept
// exactly as stated).
//
// Price: field_assessment.price is PARTIAL — no dedicated structured price
// field exists anywhere in the retained markup. When the source's own
// free-text "Preços" heading is present (discovery.mjs's
// extractPriceLines()), price_text is a faithful "line | line | ..."
// transcription of every stated line, never collapsed into a single
// scalar and never inferred when absent (price_text is honestly null for
// an event whose own text states no price information at all, e.g.
// "Os Hospitalários no Caminho de Santiago").
//
// Organizer: atc_organizer is present in the microformat on every sampled
// event but genuinely empty on all of them — never fabricated; retained
// as null in source_fields.organizer_text. No "Organização:"-labelled
// field exists anywhere in the retained evidence.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cm-matosinhos-agenda-cultural";

const DEFAULT_CONTENT_TYPE = "text/html; charset=utf-8";

const CANONICAL_URL_RE = /^https:\/\/www\.cm-matosinhos\.pt\/evento\/([a-z0-9-]+)$/;

/**
 * Derive the source-record identifier from an event detail page's own
 * canonical URL (the PROVEN-stable /evento/{slug} form). Returns null
 * (never guessed) if event_url does not match this source's own canonical
 * shape — in particular, never derived from the internal wm:page_id.
 */
export function deriveSourceRecordId(eventUrl) {
  if (typeof eventUrl !== "string") return null;
  const match = CANONICAL_URL_RE.exec(eventUrl.trim());
  return match ? match[1] : null;
}

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * Derive one `start`/`end`-shaped datetime (ingestion/observation/contract.mjs's
 * emptyDateTime() shape) from one atc_date_* value plus the event's own
 * atc_timezone. Exported for direct unit testing of every certainty tier
 * independently of the full Observation-building path.
 */
export function deriveDateTime(dateText, timezone) {
  const dt = emptyDateTime();
  if (typeof dateText !== "string" || dateText.trim() === "") {
    return dt; // genuinely absent — UNKNOWN, never guessed
  }

  dt.raw = dateText;

  const match = LOCAL_DATETIME_RE.exec(dateText.trim());
  if (!match) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }

  dt.date = match[1];
  if (typeof timezone === "string" && timezone.trim() !== "") {
    dt.tzid = timezone.trim();
    dt.certainty = "TZID_QUALIFIED_UNRESOLVED"; // a named IANA zone, not resolved to a UTC instant here
  } else {
    dt.certainty = "FLOATING_LOCAL";
  }
  return dt;
}

/**
 * Faithfully transcribe every retained price line joined by " | " — never
 * collapsed into a single scalar, never fabricated when the source states
 * no price information at all (see module doc comment).
 */
export function formatPriceText(priceLines) {
  if (!Array.isArray(priceLines) || priceLines.length === 0) return null;
  return priceLines.join(" | ");
}

/**
 * Convert one retained CM Matosinhos event-detail facts object (from
 * extractMatosinhosEventDetailFacts()) into an Observation.
 *
 * `options`: { retrievedAt, contentType, fixturePath } — supplied by the
 * caller, since this module is deliberately agnostic about how/when the
 * facts were retrieved (no network access happens here).
 */
export function toObservation(facts, options = {}) {
  const sourceRecordId = deriveSourceRecordId(facts?.event_url);
  if (!sourceRecordId) {
    throw new Error(
      "toObservation requires facts.event_url to match https://www.cm-matosinhos.pt/evento/{slug} — never derives a source_record_id any other way (in particular, never from wm:page_id)",
    );
  }

  if (typeof facts?.location_text !== "string" || facts.location_text.trim() === "") {
    throw new Error("toObservation requires facts.location_text (the event's own detail-page \"Local:\" field) — never invents a venue name");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: sourceRecordId,
    retrieved_at: options.retrievedAt ?? null,

    source_url: facts.event_url ?? null,
    content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,

    title: facts.title ?? null,
    description: facts.description_text ?? null,

    start: deriveDateTime(facts.date_start_text, facts.timezone),
    end: deriveDateTime(facts.date_end_text, facts.timezone),

    venue_name: null, // location_text is an unresolved name only, see module doc comment
    location_text: facts.location_text,

    price_text: formatPriceText(facts.price_lines),
    event_url: facts.event_url ?? null,

    source_fields: {
      slug: sourceRecordId,
      page_id: facts.page_id ?? null, // provenance ONLY — never a stable identifier, see module doc comment
      schedule_text: facts.schedule_text ?? null,
      atc_location: facts.atc_location ?? null,
      organizer_text: facts.organizer_text ?? null,
      category_tags: Array.isArray(facts.category_tags) ? facts.category_tags : [],
      price_lines: Array.isArray(facts.price_lines) ? facts.price_lines : [],
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_HTML",
      content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // the retained fixture is a bounded excerpt, not the full HTTP response body
    },
  });
}

/**
 * Convert every facts object already extracted from retained detail-page
 * HTML (ingestion/cm-matosinhos-agenda-cultural/discovery.mjs's
 * extractMatosinhosEventDetailFacts()) into Observations, sharing one set
 * of retrieval options.
 */
export function toObservations(factsList, options = {}) {
  return (factsList ?? []).map((facts) => toObservation(facts, options));
}
