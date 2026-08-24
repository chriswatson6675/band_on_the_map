// Converts genuinely retrieved Altice/MEO Arena agenda-card records
// (ingestion/meo-arena/discovery.mjs) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Altice / MEO Arena, registry id "meo-arena". Acquisition
// path: bounded first-party server-rendered HTML — the single
// https://arena.meo.pt/agenda-completa listing page, per this task's
// explicit "bounded, not a speculative universal scraper" instruction.
//
// Date: the listing's own "DD MON YYYY" text (Portuguese 3-letter month
// abbreviation, e.g. "28 NOV 2026") is unambiguous and reformatted (never
// inferred) into an ISO calendar date, certainty DATE_ONLY — the listing
// carries no time-of-day, so none is fabricated; `start.raw` retains the
// page's own text verbatim.
//
// Venue: the listing page does not repeat a per-card venue name (every
// card on this bounded listing is this one arena) — `venue_name`/
// `location_text` are left honestly null rather than copying the
// registry's own venue name onto the Observation. MEO Arena is a single
// fixed-address VENUE-type source (sources/lisbon.json); canonical Venue
// resolution for it happens by source_id in
// ingestion/venue/resolver.mjs's resolveMeoArenaObservation(), the same
// deliberate pattern used for Village Underground — see that resolver's
// own doc comment for why this is a non-fuzzy, non-fabricating mapping.
//
// Ticketing: a page-specific "comprar" CTA (Blueticket/Ticketline/
// SeeTickets) is retained only in `source_fields.ticket_url` — never as
// `event_url` (reserved for this source's own first-party `/agenda/...`
// page) and never modelled as an Offer, matching the Capitólio precedent
// in ingestion/capitolio/observation-adapter.mjs exactly.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "meo-arena";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

const PT_MONTHS = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

/**
 * Parse this source's own "DD MON YYYY" abbreviated Portuguese date text
 * (e.g. "28 NOV 2026") into an ISO calendar date. Returns null (never a
 * guess) if the text does not match that exact, unambiguous shape or
 * names a month abbreviation this table does not recognise.
 */
export function parseDateAbbrevPt(text) {
  if (typeof text !== "string") return null;
  const match = /^(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})$/.exec(text.trim().toUpperCase());
  if (!match) return null;
  const [, day, monAbbr, year] = match;
  const month = PT_MONTHS[monAbbr];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function deriveStart(record) {
  const start = emptyDateTime();
  start.raw = record?.date_text ?? null;
  start.date = parseDateAbbrevPt(record?.date_text);
  start.certainty = start.date ? "DATE_ONLY" : start.raw ? "TEXT_ONLY" : "UNKNOWN";
  return start;
}

/**
 * Convert one retrieved MEO Arena agenda-card record into an Observation.
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
    description: null, // not exposed by the bounded listing page

    start: deriveStart(record),
    end: emptyDateTime(), // no end/duration exposed by this listing

    venue_name: null, // see module doc comment — resolved by source_id, not fabricated per-record
    location_text: null,

    price_text: null, // not exposed by this listing (only a ticketing CTA, see below)
    event_url: record.event_url ?? null, // this source's own /agenda/{slug}_pt/{id} page

    source_fields: {
      slug_and_id_path: record.event_url ?? null,
      ticket_url: record.ticket_url ?? null, // retained metadata only — never an Offer, never event_url
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
 * Convert every record already parsed from one agenda-listing fetch
 * (ingestion/meo-arena/discovery.mjs's parseMeoArenaAgenda()) into
 * Observations, sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
