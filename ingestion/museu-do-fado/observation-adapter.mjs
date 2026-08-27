// Converts Museu do Fado event-detail facts
// (ingestion/museu-do-fado/discovery.mjs's extractMuseuDoFadoEventFacts())
// into the generic Observation contract (ingestion/observation/contract.mjs).
//
// Source: Museu do Fado (museudofado.pt), a real, retained
// READY_FOR_ACTIVATION investigation at
// research/source-investigations/museu-do-fado-lisbon-01/investigation.json.
// This module does not activate that source (no sources/*.json edit) — it
// only builds the collector the investigation recommended
// (collector_assessment.recommended_family: STATIC_EVENT_LIST).
//
// source_record_id (PARTIAL, deliberately NOT promoted to PROVEN): no
// numeric internal event ID is exposed anywhere in the retained HTML of
// any sampled page (no data-event-id attribute, no JSON-LD @id, no
// applicable page-data blob). investigation.json's
// field_assessment.source_record_id documents the ALTERNATIVE IDENTITY
// STRATEGY this module follows exactly: use the event page's own URL slug
// (the path segment after /evento/) as the source-record identifier
// candidate. That same investigation is explicit that slug stability over
// TIME was only observed once and is NOT yet empirically proven ("could
// not honestly be marked PROVEN on this single-observation basis"). This
// adapter therefore derives source_record_id from the slug (never guesses
// a different id, never borrows the third-party bol.pt ticket-URL numeric
// id — see investigation.json's explicit rejection of that as
// third-party-controlled), but also records this honestly as
// `source_fields.source_record_id_basis: "URL_SLUG_PARTIAL_UNCONFIRMED_STABILITY"`
// rather than silently presenting it with the same confidence a
// server-issued id (e.g. Capitólio's WordPress shortlink post id) would
// carry.
//
// Dates: each detail page's own "Data"/"Horas"/"Até"/"Termina" fields are
// unambiguous Portuguese text with no declared timezone anywhere in the
// retained evidence — investigation.json's field_assessment.start_date/
// time/end notes call these explicitly "a floating local date/time". This
// adapter never invents a UTC offset or IANA timezone: certainty is
// "FLOATING_LOCAL" when both a calendar date AND a time-of-day are
// mechanically known, "DATE_ONLY" when only the calendar date is known,
// and "TEXT_ONLY"/"UNKNOWN" when even that could not be mechanically
// parsed — mirroring ingestion/teatro-municipal-porto/observation-
// adapter.mjs's identical reasoning for the same underlying ambiguity.
// `end` is populated the same way from Até/Termina when present (the 4
// sampled events all had it), never fabricated when genuinely absent.
//
// Venue: `venue_location_text` is a venue/room NAME only (e.g. "Centro
// Cultural de Belém - Grande Auditório"), not a separately resolved
// address — per investigation.json's field_assessment.venue_location
// notes, this project does not silently normalise every event to the
// museum's own footer address. This adapter therefore leaves venue_name
// null and carries the raw text only in location_text, matching
// ingestion/capitolio/observation-adapter.mjs's identical conservative
// choice for the same kind of unresolved venue-name text.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { parseMuseuDoFadoDateToIso } from "./discovery.mjs";

export const SOURCE_ID = "museu-do-fado";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const SLUG_RE = /^https:\/\/museudofado\.pt\/evento\/([a-z0-9-]+)$/;

/**
 * Derive the source-record identifier candidate from an event page's own
 * URL — the ALTERNATIVE IDENTITY STRATEGY investigation.json documents
 * for this PARTIAL field. Returns null (never guessed) if event_url does
 * not match this source's own detail-page URL shape.
 */
export function deriveSourceRecordId(eventUrl) {
  if (typeof eventUrl !== "string") return null;
  const match = SLUG_RE.exec(eventUrl.trim());
  return match ? match[1] : null;
}

function deriveDateTime(dateText, timeText) {
  const dt = emptyDateTime();
  dt.raw = [dateText, timeText].filter(Boolean).join(" · ") || null;
  dt.date = parseMuseuDoFadoDateToIso(dateText);
  if (dt.date && timeText) {
    dt.certainty = "FLOATING_LOCAL";
  } else if (dt.date) {
    dt.certainty = "DATE_ONLY";
  } else if (dt.raw) {
    dt.certainty = "TEXT_ONLY";
  } else {
    dt.certainty = "UNKNOWN";
  }
  return dt;
}

/**
 * Convert one retained Museu do Fado event-detail facts object (from
 * extractMuseuDoFadoEventFacts()) into an Observation.
 *
 * `options`: { retrievedAt, contentType, fixturePath } — supplied by the
 * caller, since this module is deliberately agnostic about how/when the
 * facts were retrieved (no network access happens here).
 */
export function toObservation(facts, options = {}) {
  const sourceRecordId = deriveSourceRecordId(facts?.event_url);
  if (!sourceRecordId) {
    throw new Error(
      "toObservation requires facts.event_url to match https://museudofado.pt/evento/{slug} — never derives a source_record_id any other way",
    );
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: sourceRecordId,
    retrieved_at: options.retrievedAt ?? null,

    source_url: facts.event_url ?? null,
    content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,

    title: facts.title ?? null,
    description: null, // not retained by this investigation's field_assessment scope

    start: deriveDateTime(facts.date_text, facts.time_text),
    end: deriveDateTime(facts.end_date_text, facts.end_time_text),

    venue_name: null, // see module doc comment — venue_location_text is an unresolved name only
    location_text: facts.venue_location_text ?? null,

    price_text: facts.price_text ?? null,
    event_url: facts.event_url ?? null,

    source_fields: {
      slug: sourceRecordId,
      source_record_id_basis: "URL_SLUG_PARTIAL_UNCONFIRMED_STABILITY",
      date_text: facts.date_text ?? null,
      time_text: facts.time_text ?? null,
      end_date_text: facts.end_date_text ?? null,
      end_time_text: facts.end_time_text ?? null,
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
 * HTML (ingestion/museu-do-fado/discovery.mjs's
 * extractMuseuDoFadoEventFacts()) into Observations, sharing one set of
 * retrieval options.
 */
export function toObservations(factsList, options = {}) {
  return (factsList ?? []).map((facts) => toObservation(facts, options));
}
