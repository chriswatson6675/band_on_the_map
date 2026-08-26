// BARCELONA-30-VENUE-POPULATION-02 — converts L'Auditori discovery
// records (./discovery.mjs) into the generic Observation contract.
//
// Date/time: this source's own `event_next_date` is a genuine Unix
// -seconds timestamp — confirmed, by direct cross-check against the
// SAME record's own human-readable `event_date_text` (e.g. unix
// 1788627600 == "September 5, 2026 · 7 p.m." local Europe/Madrid time,
// CEST +02:00 in September), to be a real UTC instant, not a
// floating/local value — UTC_INSTANT, never guessed.
//
// venue_name carries this source's own `hall` text VERBATIM (this is a
// genuinely multi-venue source — see AUDITORI_OWN_HALLS in
// ./discovery.mjs) — resolved via venues/source-venue-mappings.json's
// VENUE_NAME-keyed entries, one per real hall observed, never a fuzzy
// match.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "l-auditori-barcelona";

function deriveStart(record) {
  const dt = emptyDateTime();
  if (!record.event_next_date_unix) {
    dt.raw = record.event_date_text ?? null;
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  const iso = new Date(record.event_next_date_unix * 1000).toISOString();
  dt.iso = iso;
  dt.is_utc = true;
  dt.date = iso.slice(0, 10);
  dt.raw = record.event_date_text ?? String(record.event_next_date_unix);
  dt.certainty = "UTC_INSTANT";
  return dt;
}

function combinedTitle(record) {
  if (!record.title) return null;
  return record.subtitle ? `${record.title} — ${record.subtitle}` : record.title;
}

export function toObservation(record, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? "application/json",

    title: combinedTitle(record),
    description: null,

    start: deriveStart(record),
    end: emptyDateTime(), // this source never exposes an end time

    venue_name: record.hall ?? null,
    location_text: null,

    price_text: record.price_text ?? null,
    event_url: record.event_url ?? null,

    source_fields: {
      category: record.category ?? null,
      hall: record.hall ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: options.contentType ?? "application/json",
      byte_faithful: false,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
