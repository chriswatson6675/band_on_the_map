// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — the generic,
// reusable ICS_OR_ICAL collector, wired into orchestrator.mjs's
// deriveEventRecords() (see that module's own comment). Closes a
// confirmed EXISTING_COLLECTOR_NOT_DISPATCHED gap: routeCollectorCapability()
// already classified ICS_OR_ICAL as "zero code" (ingestion/ics/parse.mjs
// already existed, already proven live for hot-clube/bota/village-underground),
// but nothing generic ever actually called it for a source whose PROGRAMME
// document itself is a standard multi-VEVENT .ics/.ical calendar (as
// opposed to those three sources' own per-event .ics fixture pattern,
// which is source-specific and stays untouched here).
//
// Reuses, never duplicates: ingestion/ics/parse.mjs's parseICS() for
// parsing, and ingestion/json-ld/observation-adapter.mjs's toObservations()
// for the generic records->Observation conversion — the EXACT same
// reuse ingestion/static-cards/collector.mjs already makes for its own
// record shape (source_record_id/title/start_raw/end_raw/event_url/
// ticket_url/types).

import { parseICS } from "./parse.mjs";
import { toObservations } from "../json-ld/observation-adapter.mjs";

/**
 * A VEVENT's UID is the RFC 5545-intended stable per-event identifier —
 * the general, correct assumption for a generic dispatcher (unlike
 * Hot Clube's own specific, documented exception, where the UID
 * regenerates per download and a caller-supplied id must be used
 * instead — that source keeps its own bespoke adapter untouched).
 */
function stableIdFromUid(uid, fallbackIndex) {
  const trimmed = String(uid ?? "").trim();
  return trimmed !== "" ? trimmed : `ics-event-${fallbackIndex}`;
}

function isoFromParsedDateTime(parsed) {
  if (!parsed) return null;
  return parsed.iso ?? parsed.raw ?? null;
}

/**
 * Convert one already-fetched ICS/iCalendar document into this
 * repository's own generic {records, observations} collector shape —
 * matching collectStaticCardEvents()/collectEmbeddedStateEvents() exactly
 * so orchestrator.mjs's deriveEventRecords() can dispatch to it the same
 * way. Never throws for ordinary malformed/empty ICS text — an
 * unparseable document simply yields zero records (an honest empty
 * result), matching this project's "the collector ran, found nothing" convention.
 */
export function collectIcsEvents(document, { sourceId, venueName, cutoffDate } = {}) {
  const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10);
  let parsed;
  try {
    parsed = parseICS(String(document?.body ?? ""));
  } catch {
    return { records: [], observations: [] };
  }

  const records = [];
  parsed.events.forEach((event, index) => {
    const startIso = isoFromParsedDateTime(event.dtstart);
    if (!startIso || startIso.slice(0, 10) < cutoff) return; // no resolvable start, or already in the past — never guessed
    if (!event.summary) return; // no title — not a usable record
    records.push({
      source_record_id: stableIdFromUid(event.uid, index),
      title: event.summary,
      start_raw: startIso,
      end_raw: isoFromParsedDateTime(event.dtend),
      event_url: typeof event.url === "string" && event.url.trim() !== "" ? event.url : null,
      ticket_url: null,
      types: [],
    });
  });

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  const observations = toObservations(unique, { source_id: sourceId }, { retrievedAt: document?.at, sourceUrl: document?.url, venueNameOverride: venueName, contentType: "text/calendar" })
    // toObservation() hardcodes evidence_kind "PARSED_STRUCTURED_JSON" for
    // every caller (it was written for JSON-LD); correcting it here, after
    // the fact, is safer than adding an override parameter to code every
    // other collector family also depends on.
    .map((observation) => ({ ...observation, raw_evidence: { ...observation.raw_evidence, evidence_kind: "PARSED_ICALENDAR" } }));
  return { records: unique, observations };
}
