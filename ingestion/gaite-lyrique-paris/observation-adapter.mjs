// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — La Gaîté Lyrique (Paris)
// mapping from one extracted microdata event card
// (ingestion/gaite-lyrique-paris/discovery.mjs) into the project's
// generic Observation contract. See
// research/source-investigations/gaite-lyrique-paris-01/ for the
// retained evidence this is built against.
//
// Date/time certainty follows the same honest model already established
// project-wide (docs/OBSERVATION_PIPELINE.md): this source's own
// itemprop=startDate/endDate values are a bare "YYYY-MM-DDTHH:MM" with no
// UTC offset anywhere on the page — a genuinely floating local value,
// never upgraded by assuming a timezone.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { deriveSourceRecordId } from "./discovery.mjs";

export const SOURCE_ID = "gaite-lyrique-paris";
const VENUE_NAME = "La Gaîté Lyrique";

const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})$/;

/**
 * Derive one `start`/`end`-shaped datetime (emptyDateTime() shape) from
 * this source's own raw itemprop content string. Exported for direct unit
 * testing independently of the full Observation-building path.
 */
export function deriveDateTimeFromMicrodata(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    dt.certainty = "UNKNOWN";
    return dt;
  }

  const withTime = DATE_TIME_RE.exec(rawValue);
  if (withTime) {
    dt.date = withTime[1];
    dt.certainty = "FLOATING_LOCAL"; // no UTC offset anywhere on this source
    return dt;
  }

  const dateOnly = DATE_ONLY_RE.exec(rawValue);
  if (dateOnly) {
    dt.date = dateOnly[1];
    dt.certainty = "DATE_ONLY";
    return dt;
  }

  dt.certainty = "TEXT_ONLY";
  return dt;
}

/**
 * Convert one extracted event card into an Observation. `options` —
 * `{ retrievedAt, fixturePath }`, matching every other observation-
 * adapter's convention in this project.
 */
export function toObservation(card, options = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const sourceRecordId = deriveSourceRecordId(card);
  if (!sourceRecordId) {
    throw new Error(`event URL does not match the expected /agenda/{year}/{slug}/ shape: ${card.eventUrl}`);
  }

  // The room (e.g. "Grande Salle") is a sub-location WITHIN this single
  // venue, not a different venue — appended to the venue name only when
  // present, never replacing it.
  const venueName = card.room ? `${VENUE_NAME} (${card.room})` : VENUE_NAME;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: sourceRecordId,
    retrieved_at: options.retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTimeFromMicrodata(card.startRaw),
    end: deriveDateTimeFromMicrodata(card.endRaw),

    venue_name: venueName,
    location_text: null, // NOT_PRESENT on this data path — no street address repeated per card

    price_text: null, // NOT_PRESENT on this data path
    event_url: card.eventUrl,

    source_fields: {
      categories: card.categories ?? [],
      room: card.room ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

/**
 * Convert every extracted card from one page's worth of cards into
 * Observations, sharing one retrieval timestamp/fixture path.
 */
export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
