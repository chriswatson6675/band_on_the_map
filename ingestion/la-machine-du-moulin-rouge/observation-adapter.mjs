// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — La Machine du Moulin Rouge
// observation adapter. See
// ingestion/la-machine-du-moulin-rouge/discovery.mjs and
// research/source-investigations/la-machine-du-moulin-rouge-paris-01/ for
// the source investigation this is built against.
//
// IMPORTANT: this source's own machine-readable <time datetime="..."> is
// NOT trustworthy as a genuine UTC instant — every sampled card carries an
// identical "+00:00" suffix regardless of calendar date, even across a
// real Europe/Paris DST transition (late October 2026), where a genuine
// UTC conversion would show a mix of +02:00/+01:00. The governed
// investigation recorded this honestly: the wall-clock date/time digits
// are DIRECT_SOURCE, but certainty stays FLOATING_LOCAL, never UTC_INSTANT
// — matching the Hot Clube de Portugal ICS UID "looks stable but isn't"
// precedent (see docs/OBSERVATION_PIPELINE.md).
//
// venue_location is DETERMINISTIC_CONTEXT per the governed investigation:
// each card states its own room name directly; the sitewide footer
// address is hardcoded here as the investigation's own proven derivation.
//
// end is left NOT_PRESENT here even though the source's own per-event
// DETAIL page can state a range (e.g. "23H59 — 06H00") — this collector
// deliberately only fetches the cheaper listing page, matching this
// project's bounded-scope precedent (e.g. badehaus-berlin-01); extracting
// end from each detail page is out of scope for this MVP collector.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "la-machine-du-moulin-rouge-paris";

const VENUE_NAME = "La Machine du Moulin Rouge";
const VENUE_ADDRESS = "90 Boulevard de Clichy, 75018 Paris";

const SLUG_RE = /\/evenement\/([a-z0-9-]+)\/?$/;

function deriveDateTime(isoDatetime) {
  const dt = emptyDateTime();
  dt.raw = isoDatetime;
  const dateMatch = /^(\d{4}-\d{2}-\d{2})T/.exec(isoDatetime ?? "");
  dt.date = dateMatch ? dateMatch[1] : null;
  // Never upgraded to a UTC instant — see this file's own doc comment.
  dt.iso = null;
  dt.is_utc = false;
  dt.tzid = null;
  dt.certainty = dt.date ? "FLOATING_LOCAL" : "UNKNOWN";
  return dt;
}

function locationText(rooms) {
  if (!rooms || rooms.length === 0) return VENUE_ADDRESS;
  return `${rooms.join(", ")}, ${VENUE_ADDRESS}`;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /evenement/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card.isoDatetime),
    end: emptyDateTime(), // NOT_PRESENT in this list-page-only collector — see this file's own doc comment

    venue_name: VENUE_NAME,
    location_text: locationText(card.rooms),

    price_text: null, // NOT_PRESENT — ticketing delegated entirely to a third party (shotgun.live)
    event_url: card.eventUrl,

    source_fields: {
      rooms: card.rooms ?? [],
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
