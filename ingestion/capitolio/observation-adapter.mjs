// Converts retained Teatro Variedades & Capitólio event-page facts
// (fixtures/capitolio/events.json) into the generic Observation contract.
//
// Source: Teatro Variedades & Capitólio, registry id
// "teatro-variedades-capitolio". See docs/sources/CAPITOLIO.md for the
// full source contract proof (BOTM-MULTISOURCE-LINKS-01).
//
// SOURCE != VENUE != EVENT. This adapter produces Capitólio's OWN
// Observations, entirely independent of Hot Clube de Portugal's
// Observations (ingestion/hot-clube/observation-adapter.mjs) even where
// both describe the same real-world gig — see
// ingestion/association/hot-clube-capitolio.mjs for the separate,
// evidence-backed reconciliation layer that associates them for DISPLAY
// only. This module never reads, mutates, or references a Hot Clube
// record, and never fabricates a canonical Event.
//
// source_record_id: no numeric/post ID is rendered anywhere in a
// Capitólio event page's own HTML body. The safest directly-evidenced
// stable identifier is the WordPress post ID exposed in that page's own
// HTTP response header (Link: <.../?p=NNNN>; rel=shortlink) — genuinely
// first-party, server-issued, and stable, unlike a URL slug (which is
// editorial text, not guaranteed permanent) or a synthetic index. See
// fixtures/capitolio/events.json's `wp_shortlink_post_id` /
// `http_headers_evidence`.
//
// Dates: each page's own "dd.mm.yyyy" date text is unambiguous and is
// reformatted (not inferred) into an ISO calendar date, certainty
// DATE_ONLY — never promoted to a UTC instant, because the page's local
// time text ("19h30") carries no declared timezone and this project does
// not perform timezone-offset inference (see docs/sources/HOT_CLUBE.md's
// "No timezone database lookups were needed or performed" precedent).
// The raw date+time text is preserved verbatim in `start.raw` and
// `source_fields.time_text`.
//
// Price/tickets: `price_text` is set only when the page's own "Preço"
// field states one, verbatim (Bode Wilson: "5€"; every other retained
// page has none). A "Comprar bilhetes" URL, where present and
// page-specific, is retained only in `source_fields.ticket_url` — never
// as `event_url` (which is reserved for Capitólio's own individual event
// page) and never modelled as an Offer, per this task's explicit scope.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "teatro-variedades-capitolio";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";

function deriveStart(record) {
  const start = emptyDateTime();
  start.raw = [record?.date_text, record?.time_text].filter(Boolean).join(" · ") || null;
  start.date = typeof record?.date_iso === "string" ? record.date_iso : null;
  start.certainty = start.date ? "DATE_ONLY" : start.raw ? "TEXT_ONLY" : "UNKNOWN";
  return start;
}

/**
 * Convert one retained Capitólio event-page record into an Observation.
 */
export function toObservation(record) {
  if (!record?.wp_shortlink_post_id) {
    throw new Error("toObservation requires a record with a non-empty wp_shortlink_post_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.wp_shortlink_post_id),
    retrieved_at: record.retrieved_at ?? null,

    source_url: record.url ?? null,
    content_type: record.content_type ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: null, // deliberately not retained — see fixtures/capitolio/events.json's note

    start: deriveStart(record),
    end: emptyDateTime(), // duration is known (source_fields.duration_minutes) but computing an end
                           // instant would require the same timezone inference this adapter avoids

    venue_name: null,
    location_text: record.venue_text ?? null,

    price_text: record.price_text ?? null,
    event_url: record.url ?? null, // Capitólio's own individual event page — its own, not Hot Clube's

    source_fields: {
      wp_shortlink_post_id: record.wp_shortlink_post_id,
      date_text: record.date_text ?? null,
      time_text: record.time_text ?? null,
      series_tagline: record.series_tagline ?? null,
      duration_minutes: record.duration_minutes ?? null,
      age_rating: record.age_rating ?? null,
      ticket_url: record.ticket_url ?? null, // retained metadata only — never an Offer, never event_url
    },

    raw_evidence: {
      fixture_path: "fixtures/capitolio/events.json",
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: record.content_type ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // the retained evidence is a curated fact extract, not the raw HTTP body
    },
  });
}

/**
 * Convert every retained record in fixtures/capitolio/events.json (the
 * shape written above) into Observations.
 */
export function toObservations(fixture) {
  const records = Array.isArray(fixture?.records) ? fixture.records : [];
  return records.map((record) => toObservation(record));
}
