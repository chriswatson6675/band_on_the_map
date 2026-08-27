// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — CENTQUATRE-PARIS mapping
// from one Hydra `/api/events` member resource
// (ingestion/centquatre-paris/discovery.mjs) into the project's generic
// Observation contract. See
// research/source-investigations/centquatre-paris-01/ for the retained
// evidence this is built against.
//
// Date/time parsing reuses the EXISTING, already-proven
// deriveDateTimeFromIso() from ingestion/json-ld/observation-adapter.mjs
// rather than re-deriving ISO-with-offset parsing — this source's own
// 'arrayDates' entries are full ISO 8601 instants with an explicit numeric
// UTC offset (e.g. '2026-11-27T20:30:00+01:00'), exactly the shape that
// function already handles as UTC_INSTANT.

import { createObservation } from "../observation/contract.mjs";
import { deriveDateTimeFromIso } from "../json-ld/observation-adapter.mjs";
import { API_BASE_URL } from "./discovery.mjs";

export const SOURCE_ID = "centquatre-paris";

const RESOURCE_ID_RE = /^\/api\/events\/(\d+)$/;

/**
 * Derive this source's own stable `source_record_id` from one member
 * resource's own Hydra `@id` (e.g. '/api/events/90') — the API's own
 * documented, permanent resource IRI, a stronger identity guarantee than
 * a URL-slug fallback since it is the source's own explicit resource
 * identity scheme (see docs/SOURCE_INVESTIGATION_POLICY.md's "stable
 * identifier rule"). Returns `null` (never a fabricated fallback) if the
 * shape does not match.
 */
export function deriveSourceRecordId(record) {
  const id = record?.["@id"];
  if (typeof id !== "string") return null;
  const match = RESOURCE_ID_RE.exec(id);
  return match ? match[1] : null;
}

function venueNameFrom(record) {
  const names = record?.placesNames;
  if (!names || typeof names !== "object") return null;
  const values = Object.values(names).filter((v) => typeof v === "string" && v.trim() !== "");
  return values.length > 0 ? values.join(", ") : null;
}

function priceTextFrom(record) {
  if (typeof record?.priceRange === "string" && record.priceRange.trim() !== "") {
    return record.priceRange.trim();
  }
  const min = record?.minPrice;
  const max = record?.maxPrice;
  if (typeof min === "number" && typeof max === "number") {
    return `${(min / 100).toFixed(2)}–${(max / 100).toFixed(2)} EUR`;
  }
  return null;
}

function eventUrlFrom(record, baseUrl) {
  const url = record?.url;
  if (typeof url !== "string" || url.trim() === "") return null;
  return /^https?:\/\//i.test(url) ? url : `${baseUrl}${url}`;
}

/**
 * Convert one Hydra `/api/events` member resource into an Observation.
 * `options` — `{ retrievedAt, fixturePath, baseUrl }`, matching every
 * other observation-adapter's convention in this project.
 */
export function toObservation(record, options = {}) {
  const sourceRecordId = deriveSourceRecordId(record);
  if (!sourceRecordId) {
    throw new Error(`event resource does not carry the expected '@id: /api/events/{id}' shape: ${JSON.stringify(record?.["@id"])}`);
  }

  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const dates = Array.isArray(record.arrayDates) ? record.arrayDates : [];

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: sourceRecordId,
    retrieved_at: options.retrievedAt ?? null,

    source_url: eventUrlFrom(record, baseUrl),
    content_type: "application/ld+json",

    title: record.name ?? null,
    description: record.excerpt ?? null,

    start: deriveDateTimeFromIso(dates[0] ?? null),
    end: deriveDateTimeFromIso(dates.length > 1 ? dates[dates.length - 1] : null),

    venue_name: venueNameFrom(record),
    location_text: null, // NOT_PRESENT on this API shape — placesNames is a name only, no street address

    price_text: priceTextFrom(record),
    event_url: eventUrlFrom(record, baseUrl),

    source_fields: {
      type: record.type ?? null,
      mainPerformers: record.mainPerformers ?? null,
      tags: Array.isArray(record.tags) ? record.tags.map((t) => t?.slug).filter(Boolean) : [],
      minPrice: record.minPrice ?? null,
      maxPrice: record.maxPrice ?? null,
      longRunningEvent: record.longRunningEvent ?? null,
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
 * Convert every member resource from one `/api/events` page into
 * Observations, sharing one retrieval timestamp/fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
