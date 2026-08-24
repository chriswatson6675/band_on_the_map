// Converts genuinely retrieved BOTA per-event .ics downloads into the
// generic Observation contract (ingestion/observation/contract.mjs), via
// the source-agnostic ICS parser (ingestion/ics/parse.mjs). Same reuse
// pattern and same stable-UID reasoning as
// ingestion/village-underground/observation-adapter.mjs — see that
// module's doc comment for why this Squarespace-platform UID (confirmed
// stable across repeated downloads during this task) may safely be used
// as `source_record_id`, unlike Hot Clube's EventON UID.
//
// Source: BOTA (Base Organizada da Toca das Artes), registry id
// "bota-anjos".
//
// Location AND an untrustworthy GEO field (important, directly-tested
// finding): unlike Village Underground, every retained BOTA sample's ICS
// DOES carry a `LOCATION` property — a consistent, single-venue address
// string ("BOTA, Largo de Santa Barbara, 3D, Lisboa, Portugal") — kept
// honestly in `location_text`, matching the Hot Clube precedent of never
// splitting a combined location string into a guessed venue name. It also
// carries a `GEO` property on every sample — and that GEO value
// (`40.720756;-74.000761`) is a genuine finding of this task: it resolves
// to a coordinate pair in the United States (consistent with a
// Squarespace platform-default/placeholder location), not Lisbon.
// Directly confirmed wrong by inspection, not merely unverified. This
// adapter preserves it verbatim, for provenance only, in
// `source_fields.ics_geo_untrusted` — its own name records why it must
// NEVER be read as a real coordinate by any resolver or map projection.
// This project's canonical Venue coordinates for BOTA remain exactly as
// already evidence-resolved in venues/lisbon.json (ADDRESS_ONLY, no
// coordinates) — this task does not upgrade that entry.

import { parseICS } from "../ics/parse.mjs";
import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "bota-anjos";

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

/** See ingestion/village-underground/observation-adapter.mjs's identical helper. */
export function stableIdFromUid(uid) {
  if (typeof uid !== "string" || uid.trim() === "") {
    throw new Error("Expected a non-empty ICS UID to derive a stable BOTA record id");
  }
  const at = uid.indexOf("@");
  return at === -1 ? uid : uid.slice(0, at);
}

/**
 * Convert one retrieved BOTA .ics download into an Observation. `slug`/
 * `eventUrl` come from the discovery step (ingestion/bota/discovery.mjs).
 */
export function toObservation({ slug, eventUrl, icsText, icsUrl, retrievedAt, contentType, fixturePath }) {
  const { events } = parseICS(icsText);
  if (events.length !== 1) {
    throw new Error(`Expected exactly one VEVENT for slug "${slug}", found ${events.length}`);
  }
  const event = events[0];
  const geo = event.otherProperties?.GEO ?? null;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: stableIdFromUid(event.uid),
    retrieved_at: retrievedAt ?? null,

    source_url: icsUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: event.summary,
    description: event.description,
    start: dateTimeFromICSValue(event.dtstart),
    end: dateTimeFromICSValue(event.dtend),

    venue_name: null, // combined address string, not a separable venue name — see module doc comment
    location_text: event.location,

    price_text: null, // confirmed absent from every retained VEVENT
    event_url: eventUrl ?? null,

    source_fields: {
      slug: slug ?? null,
      ics_uid: event.uid, // preserved for provenance; NEVER used directly as source_record_id
      ics_geo_untrusted: geo, // confirmed wrong (resolves outside Lisbon) — NEVER used as a coordinate
      status: event.status,
      dtstamp: dateTimeFromICSValue(event.dtstamp),
      calendar_prodid: event.calendarProdid,
      calendar_version: event.calendarVersion,
      other_properties: event.otherProperties,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: true,
    },
  });
}

/**
 * Convert a list of `{ slug, eventUrl, icsUrl, icsText, fixturePath }`
 * entries into Observations, sharing one retrieval timestamp/content type.
 */
export function toObservations(entries, { retrievedAt, contentType } = {}) {
  return entries.map((entry) => toObservation({ ...entry, retrievedAt, contentType }));
}
