// Converts Sagres Campo Pequeno event-detail facts
// (ingestion/campo-pequeno/discovery.mjs's extractCampoPequenoEventFacts())
// into the generic Observation contract (ingestion/observation/contract.mjs).
//
// Source: Campo Pequeno (Sagres Campo Pequeno), EXISTING registry id
// "campo-pequeno" in sources/lisbon.json (this module does not edit that
// registry — see docs/SOURCE_INVESTIGATION_POLICY.md). Entirely based on
// the READY_FOR_ACTIVATION investigation retained at
// research/source-investigations/campo-pequeno-lisbon-01/investigation.json.
// This module does not activate that source — it only builds the collector
// the investigation recommended (collector_assessment.recommended_family:
// STATIC_EVENT_LIST).
//
// source_record_id (PROVEN): investigation.json's field_assessment.
// source_record_id proves the site's own short canonical URL slug
// (<link rel="canonical" href="https://www.sagrescampopequeno.pt/pt/
// {slug}">) as the stable identifier, corroborated three independent ways
// (zero duplicate agenda-card slugs, independent sitemap.xml listing, and
// an empirical cross-fetch proving both URL shapes serve the same record).
// This adapter derives source_record_id ONLY from that canonical event_url
// shape — never guesses a different id, never borrows a third-party
// ticketing URL/id (Blueticket/TicketLine links appear in the retained
// evidence only as buy-ticket CTAs, never used here as identity).
//
// Dates: field_assessment.start_date.state is PROVEN with basis
// DIRECT_SOURCE — each detail page states one complete "D month YYYY ,
// weekday" string, mechanically reformatted (never inferred) into an ISO
// calendar date. field_assessment.time.state is PARTIAL (two inconsistent
// free-text formats observed) — when a time_text is genuinely extractable,
// certainty is promoted to FLOATING_LOCAL; when only the calendar date is
// known, certainty stays DATE_ONLY. No timezone/UTC offset is stated
// anywhere in the retained evidence, so `iso`/`is_utc`/`tzid` are never
// populated — this project does not perform timezone-offset inference (see
// ingestion/capitolio/observation-adapter.mjs's identical precedent).
// field_assessment.end.state is NOT_PRESENT (no end time or duration is
// stated anywhere) — `end` is always the empty/unknown DateTime, never
// fabricated.
//
// Venue: field_assessment.venue_location proves only a venue NAME text
// ("Lisboa - Sagres Campo Pequeno"), not a resolved address/coordinates —
// this adapter leaves venue_name null and carries the raw text only in
// location_text, matching ingestion/capitolio/observation-adapter.mjs and
// ingestion/museu-do-fado/observation-adapter.mjs's identical conservative
// choice for the same kind of unresolved venue-name text.
//
// Price: field_assessment.price is PROVEN as a STRUCTURED multi-tier list
// (named area + euro price per tier), explicitly NOT a single scalar. This
// adapter never collapses that into one number: price_text is a faithful
// "area: price | area: price | ..." transcription of every tier (the same
// delimited-string shape investigation.json's own representative value
// uses), and the full structured array is additionally retained,
// un-lossy, at source_fields.price_tiers.
//
// Cancellation: the source has no structured status/cancelled field — see
// discovery.mjs's module doc comment for the two free-text signals this
// project observed. A cancelled event is still genuinely listed on the
// source's own live public agenda, so this adapter NEVER silently drops
// it — it is retained as an ordinary Observation with
// source_fields.is_cancelled = true and a description that states the
// cancellation plainly, exactly mirroring how field_assessment and
// collector_assessment.blockers in investigation.json describe the source's
// own honest signal rather than smoothing it away.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "campo-pequeno";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const CANONICAL_URL_RE = /^https:\/\/www\.sagrescampopequeno\.pt\/pt\/([a-z0-9-]+)$/;

/**
 * Derive the source-record identifier from an event detail page's own
 * short canonical URL (the PROVEN-stable form). Returns null (never
 * guessed) if event_url does not match this source's own canonical shape.
 */
export function deriveSourceRecordId(eventUrl) {
  if (typeof eventUrl !== "string") return null;
  const match = CANONICAL_URL_RE.exec(eventUrl.trim());
  return match ? match[1] : null;
}

function deriveStart(facts) {
  const start = emptyDateTime();
  start.raw = [facts?.date_text, facts?.time_text].filter(Boolean).join(" · ") || null;
  start.date = typeof facts?.date_iso === "string" ? facts.date_iso : null;
  if (start.date && facts?.time_text) {
    start.certainty = "FLOATING_LOCAL";
  } else if (start.date) {
    start.certainty = "DATE_ONLY";
  } else if (start.raw) {
    start.certainty = "TEXT_ONLY";
  } else {
    start.certainty = "UNKNOWN";
  }
  return start;
}

/**
 * Faithfully transcribe every priced tier as "area: price" joined by " | "
 * — never collapsed into a single scalar (see module doc comment / this
 * source's own field_assessment.price notes).
 */
export function formatPriceText(priceTiers) {
  if (!Array.isArray(priceTiers) || priceTiers.length === 0) return null;
  return priceTiers.map((tier) => `${tier.area}: ${tier.price}`).join(" | ");
}

function deriveDescription(facts) {
  if (facts?.is_cancelled) {
    return `CANCELLED — the source's own listing states this event is cancelled (title/"Sessões" text). Retained honestly, not dropped.`;
  }
  return null;
}

/**
 * Convert one retained Campo Pequeno event-detail facts object (from
 * extractCampoPequenoEventFacts()) into an Observation.
 *
 * `options`: { retrievedAt, contentType, fixturePath } — supplied by the
 * caller, since this module is deliberately agnostic about how/when the
 * facts were retrieved (no network access happens here).
 */
export function toObservation(facts, options = {}) {
  const sourceRecordId = deriveSourceRecordId(facts?.event_url);
  if (!sourceRecordId) {
    throw new Error(
      "toObservation requires facts.event_url to match https://www.sagrescampopequeno.pt/pt/{slug} — never derives a source_record_id any other way",
    );
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: sourceRecordId,
    retrieved_at: options.retrievedAt ?? null,

    source_url: facts.event_url ?? null,
    content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,

    title: facts.title ?? null,
    description: deriveDescription(facts),

    start: deriveStart(facts),
    end: emptyDateTime(), // field_assessment.end.state is NOT_PRESENT — never fabricated

    venue_name: null, // venue_text is an unresolved name only, see module doc comment
    location_text: facts.venue_text ?? null,

    price_text: formatPriceText(facts.price_tiers),
    event_url: facts.event_url ?? null,

    source_fields: {
      slug: sourceRecordId,
      date_text: facts.date_text ?? null,
      weekday_text: facts.weekday_text ?? null,
      time_text: facts.time_text ?? null,
      price_tiers: Array.isArray(facts.price_tiers) ? facts.price_tiers : [],
      is_cancelled: facts.is_cancelled === true,
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
 * HTML (ingestion/campo-pequeno/discovery.mjs's
 * extractCampoPequenoEventFacts()) into Observations, sharing one set of
 * retrieval options.
 */
export function toObservations(factsList, options = {}) {
  return (factsList ?? []).map((facts) => toObservation(facts, options));
}
