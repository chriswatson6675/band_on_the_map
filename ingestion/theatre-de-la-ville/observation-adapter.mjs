// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — mapping from one
// api.theatredelaville-paris.com '/event_dates' Hydra node (which itself
// embeds its full parent '/events' record under `.event`) into this
// project's generic Observation contract
// (ingestion/observation/contract.mjs). See
// research/source-investigations/theatre-de-la-ville-paris-01/ for the
// governed investigation this is built against.
//
// Naming caveat (honesty, not fabrication — see the investigation's own
// field_assessment.start_date.notes): this source's own field is literally
// named 'doorTime', but cross-checking the same record's own 'arrayDates'/
// 'sortingDateTime'/'humanHours' fields confirmed it is actually used as
// the performance START instant on every sampled record, not a genuinely
// separate door-opening time. Used here as the Observation's `start`
// accordingly, with this caveat preserved in `source_fields`.
//
// source_record_id uses the event_date's OWN Hydra '@id' (e.g.
// "/event_dates/9332") — a persistent per-performance-instance identifier
// distinct from the parent event's own '@id' (which a production with
// several performance dates would share across all of them).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { buildEventPageUrl } from "./discovery.mjs";

export const SOURCE_ID = "theatre-de-la-ville-paris";
export const BASE_URL = "https://www.theatredelaville-paris.com";

const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Derive one `start`/`end`-shaped datetime from this source's own ISO 8601
 * string with an explicit UTC offset. Exported for direct unit testing.
 */
export function deriveDateTimeFromIsoWithOffset(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  if (!ISO_WITH_OFFSET_RE.test(rawValue)) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  const iso = parsed.toISOString();
  dt.iso = iso;
  dt.is_utc = true;
  dt.date = iso.slice(0, 10);
  dt.certainty = "UTC_INSTANT";
  return dt;
}

/**
 * Convert one retained '/event_dates' Hydra node (with its nested `.event`
 * and `.place`) into an Observation.
 */
export function toObservation(eventDateNode, options = {}) {
  if (!eventDateNode?.["@id"]) {
    throw new Error("toObservation requires an event_date node with @id");
  }
  const event = eventDateNode.event ?? {};
  const place = eventDateNode.place ?? {};

  const eventUrl =
    event.slug && event.season?.slug && event.mainCategory?.slug
      ? buildEventPageUrl({
          baseUrl: options.baseUrl ?? BASE_URL,
          seasonSlug: event.season.slug,
          mainCategorySlug: event.mainCategory.slug,
          slug: event.slug,
        })
      : null;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(eventDateNode["@id"]),
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: "application/ld+json",

    title: event.name ?? null,
    description: event.excerpt ?? null,

    start: deriveDateTimeFromIsoWithOffset(eventDateNode.doorTime),
    end: deriveDateTimeFromIsoWithOffset(eventDateNode.endDate),

    venue_name: place.name ?? null,
    location_text: null,

    price_text: event.priceRange ?? null,
    event_url: eventUrl,

    source_fields: {
      event_id: event["@id"] ?? null,
      season_slug: event.season?.slug ?? null,
      main_category: event.mainCategory?.name ?? null,
      cancelled: eventDateNode.cancelled ?? event.cancelled ?? null,
      offer_url: eventDateNode.offerUrl ?? null,
      duration: eventDateNode.duration ?? event.duration ?? null,
      door_time_field_naming_caveat:
        "this source's own field is literally named 'doorTime' but is used here as the performance start instant — see research/source-investigations/theatre-de-la-ville-paris-01/",
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/ld+json",
      byte_faithful: false,
    },
  });
}

/**
 * Adapt every event_date node in one retained collection, excluding any
 * marked cancelled (on either the event_date itself or its parent event)
 * — never publishing a cancelled performance as a live listing.
 */
export function toObservations(eventDateNodes, options = {}) {
  return (eventDateNodes ?? [])
    .filter((node) => !(node.cancelled ?? node.event?.cancelled))
    .map((node) => toObservation(node, options));
}
