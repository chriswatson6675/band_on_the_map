// Converts genuinely retrieved LAV — Lisboa ao Vivo JSON-LD Event records
// (ingestion/lav/discovery.mjs) into the generic Observation contract
// (ingestion/observation/contract.mjs).
//
// Source: LAV – Lisboa ao Vivo, registry id "lav-lisboa-ao-vivo".
// Acquisition path: bounded, first-party JSON-LD embedded directly on the
// public https://lisboaaovivo.com/agenda/ listing page.
//
// Date/time: unlike every other WordPress-Events-Calendar source this
// project has automated so far, this source's own `startDate`/`endDate`
// carry an explicit `+00:00` UTC offset — a genuinely confirmed UTC
// instant, not a floating local guess. Certainty is honestly
// "UTC_INSTANT"; `start.date` is the UTC calendar date portion of that
// same confirmed instant, and `start.iso`/`is_utc` are populated
// directly from it — nothing here is inferred beyond what the source
// itself asserts.
//
// Venue: this listing page covers only this one physical venue —
// `venue_name`/`location_text` are left honestly null (never fabricated
// per-record, matching the Casa da Música/MEO Arena/Village Underground/
// Super Bock Arena fixed-single-venue precedent); canonical Venue
// resolution happens by source_id (see
// ingestion/venue/resolver.mjs's SOURCE_ID_TO_FIXED_CANONICAL_VENUE table
// for the historical, hardcoded sources of this same pattern — LAV itself
// is onboarded through the DATA-DRIVEN table, venues/source-venue-
// mappings.json, per this task's "no new venue-specific resolver code"
// rule; see docs/LISBON_PORTO_P1_SOURCE_AUTOMATION_01.md). The source's
// own per-record room-level location name ("LAV", "LAV – Sala 1", "LAV –
// Sala 2") is retained in source_fields.room — the same "room is not a
// separate venue" judgement already made for Casa da Música. Whenever a
// record's own JSON-LD carries a genuine PostalAddress
// (streetAddress/addressLocality/addressRegion/postalCode/addressCountry),
// it is retained verbatim in source_fields.location_address — this is the
// venue's own first-party address evidence, used (not fabricated) by this
// task's venue-onboarding pass to admit LAV as a new ADDRESS_ONLY
// canonical Venue.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "lav-lisboa-ao-vivo";

const DEFAULT_CONTENT_TYPE = "application/ld+json";

const ISO_UTC_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}\+00:00$/;

/**
 * Parse this source's own ISO 8601 instant text (always carrying an
 * explicit "+00:00" UTC offset on this source) into `{ date, iso }`, or
 * null if the text does not match that exact, confirmed-UTC shape —
 * never guessed. Exported for direct unit testing.
 */
export function parseLavUtcInstant(isoText) {
  if (typeof isoText !== "string") return null;
  const match = ISO_UTC_RE.exec(isoText.trim());
  if (!match) return null;
  return { date: match[1], iso: isoText.trim() };
}

function deriveDateTime(isoText) {
  const dt = emptyDateTime();
  dt.raw = isoText ?? null;
  const parsed = parseLavUtcInstant(isoText);
  if (!parsed) {
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = parsed.date;
  dt.iso = parsed.iso;
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

/**
 * Convert one retrieved LAV JSON-LD Event record into an Observation.
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

    start: deriveDateTime(record.start_iso),
    end: deriveDateTime(record.end_iso),

    venue_name: null, // see module doc comment — resolved by source_id, not fabricated per-record
    location_text: null,

    price_text: null, // not exposed by this source's JSON-LD
    event_url: record.event_url ?? null,

    source_fields: {
      slug: record.source_record_id,
      room: record.location_name ?? null,
      location_address: record.location_address ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // the JSON-LD block is extracted from a shared listing page, not a per-record raw response
    },
  });
}

/**
 * Convert every record already parsed from one agenda-listing fetch
 * (ingestion/lav/discovery.mjs's parseLavAgendaJsonLd()) into
 * Observations, sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
