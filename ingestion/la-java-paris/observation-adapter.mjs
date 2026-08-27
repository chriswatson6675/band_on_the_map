// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Observation mapping for La
// Java's own embedded RSC "events" array (see ./discovery.mjs).
//
// IMPORTANT, evidenced honesty note on `date`: every record's own `date`
// field carries a trailing ".000Z" (e.g. "2026-08-27T21:00:00.000Z"), but
// this is NOT a genuine UTC instant — cross-checked against this same
// page's own human-readable card text for the identical event (e.g.
// "jeu. 27 août, 21:00"), which shows the exact same "21:00" digits with
// no timezone shift applied. A true UTC->Europe/Paris (UTC+2, August)
// conversion would have shown "23:00" instead. This is recorded honestly
// as FLOATING_LOCAL, per research/source-investigations/la-java-paris-01/,
// never silently promoted to a confirmed UTC instant.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

const SOURCE_ID = "la-java-paris";
const VENUE_NAME = "La Java";
const VENUE_LOCATION = "105 rue du Faubourg du Temple, 75010 Paris";

function deriveStartDateTime(event) {
  const dt = emptyDateTime();
  dt.raw = event.date ?? null;
  if (typeof event.date !== "string") {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(event.date);
  if (!match) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  dt.date = match[1];
  dt.certainty = "FLOATING_LOCAL"; // see module doc comment above — the source's own ".000Z" is not a genuine UTC conversion
  return dt;
}

export function toObservation(event, { retrievedAt, fixturePath } = {}) {
  if (!event?.id) throw new Error("toObservation requires event.id");
  if (!event?.ticketUrl) throw new Error("toObservation requires event.ticketUrl");

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: event.id, // this source's own stable id, e.g. "2026-08-28-100-bruno-mars-party-paris" — empirically confirmed identical across two independent fetches (see investigation.json)
    retrieved_at: retrievedAt ?? null,

    source_url: event.ticketUrl,
    content_type: "application/json", // this record's own shape: a first-party JSON object embedded in the page's Next.js RSC payload

    title: event.name ?? null,
    description: typeof event.description === "string" ? event.description : null,

    start: deriveStartDateTime(event),
    end: emptyDateTime(), // NOT_PRESENT — no end field in this source's own embedded event objects

    venue_name: VENUE_NAME,
    location_text: VENUE_LOCATION,

    price_text: null, // NOT_PRESENT — no price field in this source's own embedded event objects; ticket price lives only on the third-party Shotgun checkout page
    event_url: event.ticketUrl, // this venue's own first-party-selected outbound ticketing link (currently Shotgun); not itself a Shotgun-authored fact

    source_fields: {
      event_type: event.type ?? null, // "concert" | "club", this source's own categorisation
      poster: event.poster ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(events, options = {}) {
  return (events ?? []).map((event) => toObservation(event, options));
}
