// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Point Éphémère's own mapping
// from ingestion/point-ephemere/discovery.mjs's normalized Prismic "event"
// records into the project's generic Observation contract
// (ingestion/observation/contract.mjs). See
// research/source-investigations/point-ephemere-paris-01/ for the governed
// investigation this is proven against.
//
// Date/time: this source's own `start_date` field is already a plain
// "YYYY-MM-DD" date (DIRECT_SOURCE). Its own `time` field is short free
// text (e.g. "20h", "19h30", "22H - 03H") with no timezone stated anywhere
// — parsed here into an hour:minute local time when the leading token
// matches, always recorded FLOATING_LOCAL, never upgraded to a UTC
// instant. A time string this project cannot parse (e.g. a purely
// descriptive value) leaves the raw text preserved but no derived
// hour/minute, per this project's "absence preserved explicitly, never
// guessed" convention.
//
// Venue: single-venue Prismic repository — every "event" document is one
// of Point Éphémère's own programmed nights (see discovery.mjs's own doc
// comment) — resolved by source_id, matching
// ingestion/badehaus/observation-adapter.mjs's and
// ingestion/zenner/observation-adapter.mjs's precedent for a single-venue
// source with no per-record venue field.
//
// Price: this source's own `prix` field (e.g. "10€ / 12€"), used
// verbatim when present; genuinely absent on some records (workshops,
// restaurant/bar listings, free events with no such field at all) —
// price_text is honestly null in that case, never fabricated.
//
// event_url: this source's own `ticket_link.url`, when present, points to
// a third-party ticketing platform (e.g. DICE) — used here as the closest
// thing to a definitive per-event link this source directly supplies, in
// the absence of a confirmed first-party pointephemere.org permalink for
// each event (see the governed investigation's own honest
// field_assessment.event_url notes). Never fabricated when absent.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "point-ephemere-paris";
export const VENUE_NAME = "Point Éphémère";

const TIME_RE = /^(\d{1,2})[hH:](\d{2})?/;

/**
 * Derive one start `start`-shaped datetime (emptyDateTime() shape) from a
 * record's own `start_date` ("YYYY-MM-DD") and free-text `time_text`.
 * Exported for direct unit testing independent of the full
 * Observation-building path.
 */
export function deriveStart(record) {
  const dt = emptyDateTime();
  const rawParts = [record?.start_date, record?.time_text].filter(Boolean);
  dt.raw = rawParts.length > 0 ? rawParts.join(" ") : null;

  if (typeof record?.start_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.start_date)) {
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = record.start_date;

  const timeMatch = TIME_RE.exec(record?.time_text ?? "");
  if (timeMatch) {
    const hour = timeMatch[1].padStart(2, "0");
    const minute = timeMatch[2] ?? "00";
    dt.iso = `${record.start_date}T${hour}:${minute}:00`;
    dt.is_utc = false;
    // No timezone/offset is stated anywhere on this source (confirmed for
    // every sampled record) — a floating local time, never upgraded to a
    // UTC instant.
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.is_utc = false;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

export function toObservation(record, { retrievedAt, fixturePath } = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires record.source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record.source_record_id,
    retrieved_at: retrievedAt ?? null,

    source_url: record.uid ? `https://www.pointephemere.org/agenda` : null,
    content_type: "application/json",

    title: record.title ?? null,
    description: null,

    start: deriveStart(record),
    end: emptyDateTime(), // NOT_PRESENT — end_date on this source represents a multi-day run's last day, not a performance end-time (see investigation.json field_assessment.end)

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: null,

    price_text: record.price_text ?? null,
    event_url: record.ticket_url ?? null,

    source_fields: {
      prismic_uid: record.uid ?? null,
      display_date_text: record.display_date_text ?? null,
      category: record.category ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
