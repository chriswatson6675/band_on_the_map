// Converts genuinely retrieved Village Underground Lisboa per-event .ics
// downloads into the generic Observation contract
// (ingestion/observation/contract.mjs), via the source-agnostic ICS
// parser (ingestion/ics/parse.mjs) — the same reuse pattern as
// ingestion/hot-clube/observation-adapter.mjs.
//
// Source: Village Underground Lisboa, registry id
// "village-underground-lisboa". Acquisition path: PER_EVENT_ICS via each
// event's own Squarespace `?format=ical` export
// (ingestion/village-underground/discovery.mjs), directly proven live
// under LISBON-AUTOMATIC-SUBSET-01.
//
// ICS UID stability (the key difference from Hot Clube's EventON UID,
// see docs/OBSERVATION_PIPELINE.md): Squarespace's calendar export UID is
// the platform's own stable per-event database identifier, not a
// per-download-regenerated value. Directly verified during this task by
// downloading the same event's .ics twice and confirming an identical
// UID both times. Consequently, unlike Hot Clube, `source_record_id` MAY
// safely be derived from the ICS UID itself here — the local part before
// `@squarespace.com` — rather than requiring a separate HTML-discovery
// identifier. The discovery-layer `slug` (ingestion/village-underground/
// discovery.mjs) is still carried through, in `source_fields.slug`, since
// it is what builds `event_url` and is itself genuine, useful provenance.
//
// Location: every retained sample's .ics carries no LOCATION property at
// all (confirmed absent across multiple live samples, not merely
// unobserved by chance) — Village Underground's calendar export does not
// repeat the venue's own address per event the way BOTA's does. This
// adapter does not fabricate one: `venue_name`/`location_text` are both
// left honestly null on every Observation. Village Underground is,
// however, a single fixed-address VENUE-type source (sources/lisbon.json)
// — ingestion/venue/resolver.mjs's resolveVillageUndergroundObservation()
// uses that source-level fact (not a per-Observation guess) to resolve
// every Observation from this source to the one canonical Venue evidenced
// in venues/lisbon.json; see that module for why this is a deliberate,
// explicit, non-fuzzy mapping and not an exception to "never fabricate".

import { parseICS } from "../ics/parse.mjs";
import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "village-underground-lisboa";

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
 * The stable Squarespace per-event identifier: the ICS UID's local part
 * before `@squarespace.com` (e.g. `6a60b47982c93f6404454bfe`). Falls back
 * to the full UID if it is present but not in that exact shape, rather
 * than throwing — still a real, source-provided value either way. Throws
 * only when the ICS carried no UID at all, since that would mean no
 * stable identity exists for this record at all.
 */
export function stableIdFromUid(uid) {
  if (typeof uid !== "string" || uid.trim() === "") {
    throw new Error("Expected a non-empty ICS UID to derive a stable Village Underground record id");
  }
  const at = uid.indexOf("@");
  return at === -1 ? uid : uid.slice(0, at);
}

/**
 * Convert one retrieved Village Underground .ics download into an
 * Observation. `slug`/`eventUrl` come from the discovery step
 * (ingestion/village-underground/discovery.mjs); `icsText` is that
 * event's own retrieved `.ics` response body.
 */
export function toObservation({ slug, eventUrl, icsText, icsUrl, retrievedAt, contentType, fixturePath }) {
  const { events } = parseICS(icsText);
  if (events.length !== 1) {
    throw new Error(`Expected exactly one VEVENT for slug "${slug}", found ${events.length}`);
  }
  const event = events[0];

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

    // Confirmed absent from every retained sample's ICS — see module doc
    // comment. Canonical venue resolution for this fixed-venue source
    // happens separately, by source_id, in ingestion/venue/resolver.mjs.
    venue_name: null,
    location_text: null,

    price_text: null, // confirmed absent from every retained VEVENT
    event_url: eventUrl ?? null, // this source's own per-event page, not a ticket link

    source_fields: {
      slug: slug ?? null,
      ics_uid: event.uid, // preserved for provenance; NEVER used directly as source_record_id
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
 * entries (one per retrieved/retained .ics) into Observations, sharing
 * one retrieval timestamp/content type across all of them.
 */
export function toObservations(entries, { retrievedAt, contentType } = {}) {
  return entries.map((entry) => toObservation({ ...entry, retrievedAt, contentType }));
}
