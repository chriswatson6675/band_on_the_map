// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — the generic,
// reusable WORDPRESS_TRIBE_API collector, wired into orchestrator.mjs's
// deriveEventRecords() exactly like ingestion/ics/collector.mjs already
// is. routeCollectorCapability() already classified WORDPRESS_TRIBE_API
// as "zero code" (this family's own client.mjs/observation-adapter.mjs
// already existed, already proven live against Centro Cultural de Belém
// — see research/source-investigations/ccb-lisbon-01/), but nothing
// generic ever actually called it: the fully-featured pipeline
// (fetch-all.mjs) does its OWN paginated network fetching, structurally
// incompatible with the generic dispatcher's single-already-fetched-
// document design.
//
// This collector closes the gap WITHOUT adding any new network
// capability: programme-resolver.mjs's COMMON_PROGRAMME_PATHS now
// includes the plugin's own fixed, well-known REST path
// (/wp-json/tribe/events/v1/events/) as one of its existing ~20 bounded
// candidate fetches — the SAME mechanism that already tries /events,
// /whats-on, etc. against every source's own origin. If a source runs
// this plugin, that request already returns real, structured JSON in
// the SAME single fetch round every other mechanism uses; this module
// only PARSES that already-retained response body.
//
// Reuses, never duplicates: this family's own parseEventsPage()/
// normalizeEventRecord() (client.mjs, already proven live) for parsing.
// Records are mapped into this repository's shared generic collector
// record shape (source_record_id/title/start_raw/end_raw/event_url/
// ticket_url/types) — the SAME shape ics/collector.mjs and
// static-cards/collector.mjs already produce — so the shared detail-
// candidate discovery and proof-matching logic in
// programme-acquisition/orchestrator.mjs work unchanged. This is a
// deliberately simpler mapping than events-calendar-api/observation-
// adapter.mjs's own toObservation() (which preserves venue/cost/
// category richness for a DEDICATED per-source config, e.g. CCB) — that
// full-featured path is untouched and remains available for any future
// per-source integration; this one is the automatic, zero-config
// generic path.

import { parseEventsPage, normalizeEventRecord } from "./client.mjs";
import { toObservations } from "../json-ld/observation-adapter.mjs";

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/;

/** Tribe's own "YYYY-MM-DD HH:MM:SS" (space-separated, no offset) shape, converted to a real ISO string the generic date-certainty adapter recognises. Never guesses a timezone offset that isn't there. */
function toIsoLike(value) {
  const match = LOCAL_DATETIME_RE.exec(value ?? "");
  return match ? `${match[1]}T${match[2]}` : (typeof value === "string" && value.trim() !== "" ? value : null);
}

/** The API's own utc_start_date is already server-converted UTC (see events-calendar-api/observation-adapter.mjs's own doc comment) — appending "Z" is honest, not inferred. */
function toIsoUtcLike(value) {
  const iso = toIsoLike(value);
  return iso ? `${iso}Z` : null;
}

/**
 * Convert one already-fetched Tribe Events REST API response body into
 * this repository's own generic {records, observations} collector
 * shape. Never throws for a non-JSON or non-Tribe-shaped body —
 * parseEventsPage()/normalizeEventRecord() failures are an honest,
 * expected empty result (e.g. the fingerprint fired on unrelated
 * "wp-json" text elsewhere on a page that is not actually this REST
 * endpoint), matching this project's "the collector ran, found nothing"
 * convention.
 */
export function collectTribeApiEvents(document, { sourceId, venueName, cutoffDate } = {}) {
  const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10);
  let page;
  try {
    page = parseEventsPage(document?.body);
  } catch {
    return { records: [], observations: [] };
  }

  const records = [];
  for (const raw of page.events) {
    let normalized;
    try {
      normalized = normalizeEventRecord(raw);
    } catch {
      continue; // one malformed event never aborts the rest of the page
    }
    const startIso = toIsoUtcLike(normalized.start_utc) ?? toIsoLike(normalized.start_local);
    if (!startIso || startIso.slice(0, 10) < cutoff) continue; // no resolvable start, or already in the past — never guessed
    if (!normalized.title) continue; // no title — not a usable record
    records.push({
      source_record_id: normalized.source_record_id,
      title: normalized.title,
      start_raw: startIso,
      end_raw: toIsoUtcLike(normalized.end_utc) ?? toIsoLike(normalized.end_local),
      event_url: normalized.event_url,
      ticket_url: null,
      types: [],
    });
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  const observations = toObservations(unique, { source_id: sourceId }, { retrievedAt: document?.at, sourceUrl: document?.url, venueNameOverride: venueName, contentType: "application/json" })
    .map((observation) => ({ ...observation, raw_evidence: { ...observation.raw_evidence, evidence_kind: "PARSED_WORDPRESS_TRIBE_API_JSON" } }));
  return { records: unique, observations };
}
