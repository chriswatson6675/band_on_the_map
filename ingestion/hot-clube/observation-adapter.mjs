// Converts retained Hot Clube de Portugal per-event .ics fixtures
// (fixtures/hot-clube/events/*.ics) plus their retrieval metadata
// (fixtures/hot-clube/metadata.json) into the generic Observation
// contract, via the source-agnostic ICS parser (ingestion/ics/parse.mjs).
//
// Source: Hot Clube de Portugal, registry id "hot-clube-de-portugal". See
// docs/sources/HOT_CLUBE.md for the full source contract proof
// (BOTM-ICS-01 / BOTM-ICS-01A) this adapter is built on.
//
// Critical rule, directly from that proof: `source_record_id` MUST be the
// EventON `event_id` carried from the HTML discovery step (here, supplied
// by the caller from fixtures/hot-clube/metadata.json's
// `retained_event_ids` / `requests_made` log — the same convention as the
// fixture filenames) — NEVER the ICS `UID`, which regenerates on every
// download and is not a stable per-event identifier. The `UID` is
// preserved separately, in `source_fields.ics_uid`, for provenance only.
//
// DTSTART/DTEND in the ICS response are client-supplied and unvalidated by
// the server (see docs/sources/HOT_CLUBE.md, "client-supplied and not
// re-validated"). This adapter does not pretend the ICS endpoint
// independently proves timing beyond "reflects whatever was requested" —
// it maps DTSTART/DTEND through honestly via the same certainty model
// every other date/time field in this project uses.
//
// event_url (BOTM-HOT-CLUBE-EVENT-URL-01): the ICS payload itself has no
// URL field. ingestion/hot-clube/discovery.mjs can extract each event's
// first-party permalink from the homepage's own Schema.org microdata, but
// a permalink is only ever used here when the caller's `eventLinks`
// lookup says so — that lookup is expected to already encode a verified
// "does this actually resolve to distinct event content" decision (see
// fixtures/hot-clube/discovery/homepage-event-links.json's
// `permalink_verification.safe_event_urls`). This proof's own retained 9
// records all found the same first-party permalink pattern present, but
// verified every one of them 301-redirects to the Hot Clube homepage
// rather than distinct content — so `safe_event_urls` is currently empty
// and every retained record's event_url is still, correctly, null. This
// mechanism exists so a future, genuinely working permalink enriches
// event_url automatically, without ever guessing one.

import { parseICS } from "../ics/parse.mjs";
import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "hot-clube-de-portugal";

const DEFAULT_CONTENT_TYPE = "text/calendar; charset=utf-8";

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

function findRequestForFixture(metadata, fixturePath) {
  const normalized = String(fixturePath).replace(/\\/g, "/");
  const requests = Array.isArray(metadata?.requests_made) ? metadata.requests_made : [];
  return (
    requests.find(
      (request) =>
        request.retained_fixture &&
        String(request.retained_fixture).replace(/\\/g, "/") === normalized,
    ) ?? null
  );
}

/**
 * Convert one retained Hot Clube .ics fixture into an Observation.
 *
 * `eventId` must come from the caller (the fixture's filename convention,
 * matching `metadata.retained_event_ids`) — never parsed out of the ICS
 * payload itself, which does not contain it (see docs/sources/HOT_CLUBE.md,
 * "Stable Source Identifier Behaviour").
 *
 * `eventLinks` is an optional `{ [event_id]: event_url }` lookup — e.g.
 * fixtures/hot-clube/discovery/homepage-event-links.json's
 * `permalink_verification.safe_event_urls` — of permalinks already
 * verified safe to present as this event's own page. An event_id absent
 * from the lookup (or no lookup supplied at all) gets `event_url: null`,
 * never a guess.
 */
export function toObservation({ eventId, icsText, fixturePath, metadata, eventLinks }) {
  if (eventId === undefined || eventId === null || eventId === "") {
    throw new Error("toObservation requires a non-empty eventId from the HTML discovery step");
  }

  const { events } = parseICS(icsText);
  if (events.length !== 1) {
    throw new Error(`Expected exactly one VEVENT in ${fixturePath}, found ${events.length}`);
  }
  const event = events[0];
  const request = findRequestForFixture(metadata, fixturePath);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(eventId),
    retrieved_at: metadata?.retrieved_at ?? null,

    source_url: request?.url ?? null,
    content_type: request?.content_type ?? DEFAULT_CONTENT_TYPE,

    title: event.summary,
    description: event.description,
    start: dateTimeFromICSValue(event.dtstart),
    end: dateTimeFromICSValue(event.dtend),

    // ICS LOCATION does not cleanly separate a venue name from an address
    // (e.g. "Cineteatro Capitólio Parque Mayer") — splitting it would be
    // guessing, not observing, so it is kept as location_text only.
    venue_name: null,
    location_text: event.location,

    price_text: null, // confirmed absent from every retained VEVENT
    // event.url is confirmed absent from the ICS payload itself. A
    // proven first-party permalink pattern exists
    // (https://hcp.pt/events/{slug}/, see
    // docs/sources/HOT_CLUBE.md "Individual Event Permalinks"), but it is
    // only used when the caller's eventLinks lookup has already verified
    // it resolves to distinct event content — never merely because a
    // permalink was discovered.
    event_url: eventLinks?.[String(eventId)] ?? null,

    source_fields: {
      event_id: eventId, // the Hot Clube SOURCE identifier itself — see module doc comment
      ics_uid: event.uid, // preserved for provenance only — NEVER used as source_record_id
      status: event.status,
      organizer: event.organizer,
      dtstamp: dateTimeFromICSValue(event.dtstamp),
      calendar_prodid: event.calendarProdid,
      calendar_version: event.calendarVersion,
      other_properties: event.otherProperties,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: request?.content_type ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: true,
    },
  });
}

/**
 * Convert a list of { eventId, icsText, fixturePath } entries (one per
 * retained fixture) into Observations, sharing one retrieval-metadata
 * object and one optional eventLinks lookup across all of them.
 */
export function toObservations(entries, metadata, eventLinks) {
  return entries.map(({ eventId, icsText, fixturePath }) =>
    toObservation({ eventId, icsText, fixturePath, metadata, eventLinks }),
  );
}
