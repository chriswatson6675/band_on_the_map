// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — generic
// mapping from one retrieved per-event ".ics" download (discovered via
// ./discovery.mjs) into the project's generic Observation contract
// (ingestion/observation/contract.mjs), layered on the EXISTING,
// unmodified ingestion/ics/parse.mjs — this module adds no new ICS
// parsing logic of its own, only Observation shaping, matching
// ingestion/json-ld/observation-adapter.mjs's own convention exactly.
//
// Deliberately generic: the only per-source input is `config.source_id`
// (and an optional `config.venueNameOverride`) — every other field comes
// straight from the record itself. Never references a specific venue by
// name.
//
// source_record_id is deliberately derived from the event's own detail-
// page URL (see discovery.mjs#deriveSourceRecordIdFromDetailUrl), NOT the
// ICS UID — every real retained sample from both venues that exposed this
// family carries no UID property at all.

import { parseICS } from "../ics/parse.mjs";
import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { deriveSourceRecordIdFromDetailUrl } from "./discovery.mjs";

const DEFAULT_CONTENT_TYPE = "text/calendar";

function dateTimeFromICSValue(parsed) {
  const dt = emptyDateTime();
  if (!parsed) return dt;

  dt.raw = parsed.raw ?? null;

  if (parsed.isDate) {
    dt.date = parsed.iso ?? null;
    dt.certainty = "DATE_ONLY";
  } else if (parsed.isUTC && parsed.iso) {
    dt.iso = parsed.iso;
    dt.date = parsed.iso.slice(0, 10);
    dt.is_utc = true;
    dt.certainty = "UTC_INSTANT";
  } else if (parsed.tzid) {
    dt.tzid = parsed.tzid;
    dt.certainty = "TZID_QUALIFIED_UNRESOLVED";
  } else if (parsed.raw) {
    dt.certainty = "FLOATING_LOCAL";
  }

  return dt;
}

/**
 * Convert one retrieved per-event `.ics` download into an Observation.
 *
 * `record` — `{ detailUrl, title, icsText, icsUrl, retrievedAt,
 * contentType, fixturePath }`. `detailUrl`/`title` come from
 * discovery.mjs's extractEventCards(); `icsText` is that event's own
 * retrieved `.ics` response body; `icsUrl` is the URL it was fetched
 * from.
 *
 * `config` — `{ source_id, venueNameOverride }`. `venueNameOverride`
 * follows ingestion/json-ld/observation-adapter.mjs's own precedent: a
 * single-venue source whose own ICS never states its own venue name
 * supplies it explicitly here rather than leaving `venue_name` null.
 */
export function toObservation(record, config) {
  if (!config?.source_id) {
    throw new Error("toObservation requires config.source_id");
  }
  if (!record?.detailUrl) {
    throw new Error("toObservation requires record.detailUrl (used to derive a stable source_record_id)");
  }

  const { events } = parseICS(record.icsText);
  if (events.length !== 1) {
    throw new Error(`Expected exactly one VEVENT for "${record.detailUrl}", found ${events.length}`);
  }
  const event = events[0];

  return createObservation({
    source_id: config.source_id,
    // BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01: a caller may
    // supply record.sourceRecordId explicitly when THIS source's own ICS
    // carries a genuinely proven-stable UID (empirically re-fetched and
    // confirmed identical — e.g. Columbiahalle's Contao export, unlike the
    // AEG-operated venues this module was first built against, which carry
    // no UID at all). When omitted, the existing detailUrl-slug derivation
    // is used unchanged — every existing caller/test keeps its exact prior
    // behaviour.
    source_record_id: record.sourceRecordId ?? deriveSourceRecordIdFromDetailUrl(record.detailUrl),
    retrieved_at: record.retrievedAt ?? null,

    source_url: record.icsUrl ?? null,
    content_type: record.contentType ?? DEFAULT_CONTENT_TYPE,

    // The ICS SUMMARY is this platform's own real event title on every
    // retained sample; record.title (from the list-page card) is kept as
    // a fallback only, never overriding a present SUMMARY.
    title: event.summary ?? record.title ?? null,
    description: event.description ?? null,

    start: dateTimeFromICSValue(event.dtstart),
    end: dateTimeFromICSValue(event.dtend),

    // event.location is present (and carries a real street address) on
    // one of the two real retained venues, and genuinely absent on the
    // other (confirmed absent, not merely unobserved) — never fabricated
    // either way. venue_name is not itself present in either venue's ICS
    // (LOCATION is an address string, not a venue name), so a
    // single-venue source supplies its own known name via
    // venueNameOverride, following ingestion/json-ld/observation-adapter
    // .mjs's identical precedent.
    venue_name: config.venueNameOverride ?? null,
    location_text: event.location ?? null,

    price_text: null, // confirmed absent from every retained VEVENT on this platform
    event_url: record.detailUrl ?? null, // this source's own event detail page, not a ticket link

    source_fields: {
      category_name: record.categoryName ?? null,
      ics_uid: event.uid ?? null, // confirmed null/absent on every retained sample — preserved for provenance only
      dtstamp: dateTimeFromICSValue(event.dtstamp),
      geo: event.otherProperties?.GEO ?? null,
      calendar_prodid: event.calendarProdid,
      calendar_version: event.calendarVersion,
    },

    raw_evidence: {
      fixture_path: record.fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: record.contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: true,
    },
  });
}

/**
 * Convert a list of already-retrieved per-event ICS records into
 * Observations, sharing one retrieval timestamp/content type across all
 * of them (each record may still individually override either).
 */
export function toObservations(records, config) {
  return (records ?? []).map((record) => toObservation(record, config));
}
