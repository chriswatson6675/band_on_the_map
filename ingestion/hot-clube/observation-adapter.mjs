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
 */
export function toObservation({ eventId, icsText, fixturePath, metadata }) {
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
    // event.url is confirmed absent from source. A distinct permalink
    // pattern (https://hcp.pt/events/{slug}/) was noticed on the
    // programme page but not confirmed for this event, so it is not used
    // here — see docs/sources/HOT_CLUBE.md "Limitations".
    event_url: null,

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
 * object across all of them.
 */
export function toObservations(entries, metadata) {
  return entries.map(({ eventId, icsText, fixturePath }) =>
    toObservation({ eventId, icsText, fixturePath, metadata }),
  );
}
