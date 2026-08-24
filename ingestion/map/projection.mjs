// Source-agnostic bridge from the offline Observation + Venue-resolution
// proof pipeline to browser-safe map marker data.
//
// Consumes real Observations (ingestion/observation/contract.mjs),
// resolves each one against the canonical Venue registry
// (ingestion/venue/resolver.mjs, venues/*.json), and produces one marker
// per canonical, map-eligible Venue — never one marker per Observation,
// and never a canonical Event. See docs/ARCHITECTURE.md and
// docs/VENUE_RESOLUTION.md.
//
// Fail-closed map eligibility: a Venue is placed on the map ONLY when
// resolution_status is RESOLVED, the canonical Venue exists in the
// registry, its location_status is CONFIRMED or GEOCODED (VENUE-
// GEOCODING-01 — see ingestion/venue/contract.mjs's
// MAP_ELIGIBLE_LOCATION_STATUSES for the shared definition), and it
// carries valid numeric coordinates. ADDRESS_ONLY and UNRESOLVED venues
// never receive a marker, and no fallback/guessed coordinate is ever
// substituted.
//
// Dependency-free; safe to import from a browser bundle (no Node
// built-ins here or in ingestion/venue/resolver.mjs, which this imports).

import { resolveObservation } from "../venue/resolver.mjs";
import { MAP_ELIGIBLE_LOCATION_STATUSES } from "../venue/contract.mjs";

function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    !Number.isNaN(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    !Number.isNaN(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function sourceName(sourceId, sourceRegistryEntries) {
  const entry = (sourceRegistryEntries ?? []).find((candidate) => candidate.id === sourceId);
  return entry?.name ?? sourceId ?? null;
}

/**
 * Project a list of Observations into map-eligible canonical Venue
 * markers.
 *
 *   observations            - Observation[] (ingestion/observation/contract.mjs)
 *   options.venues           - the canonical Venue registry's `venues`
 *                               array (e.g. venues/lisbon.json's `.venues`)
 *   options.sourceRegistry   - the source registry's `entries` array (e.g.
 *                               sources/lisbon.json's `.entries`), used
 *                               only to look up each source's
 *                               human-readable name — this module never
 *                               hardcodes a source name itself
 *
 * Markers are built in Observation-array order (each new map-eligible
 * venue_id appends a marker the first time it's seen), so a fixed input
 * order (as every adapter already guarantees — see
 * docs/OBSERVATION_PIPELINE.md) produces fully deterministic output. A
 * marker's `listings` preserve every map-eligible Observation
 * individually, in that same order — AgendaLX and Hot Clube listings for
 * the same real venue are never merged, deduplicated, or reordered away
 * from their source, and no listing is ever assigned a canonical Event
 * identity of any kind (no `event_id`/`canonical_event_id`/`id`).
 */
export function projectObservationsToMapMarkers(observations, { venues, sourceRegistry } = {}) {
  const venueById = new Map((venues ?? []).map((venue) => [venue.venue_id, venue]));
  const markersById = new Map();

  for (const observation of observations ?? []) {
    const resolution = resolveObservation(observation);
    if (resolution.resolution_status !== "RESOLVED") continue;

    const venue = venueById.get(resolution.venue_id);
    if (!venue) continue;
    if (!MAP_ELIGIBLE_LOCATION_STATUSES.has(venue.location_status)) continue;
    if (!isValidCoordinate(venue.latitude, venue.longitude)) continue;

    if (!markersById.has(venue.venue_id)) {
      markersById.set(venue.venue_id, {
        venue_id: venue.venue_id,
        canonical_name: venue.canonical_name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        address: venue.address,
        listings: [],
      });
    }

    markersById.get(venue.venue_id).listings.push({
      source_id: observation.source_id,
      source_record_id: observation.source_record_id,
      source_name: sourceName(observation.source_id, sourceRegistry),
      title: observation.title,
      start: observation.start,
      end: observation.end,
      event_url: observation.event_url,
    });
  }

  return [...markersById.values()];
}

/**
 * Country-scoped marker selection for the map UI. This project's only
 * retained proof data is for Lisbon (Portugal); Croatia deliberately has
 * none — this function is the single place that decides that, so the UI
 * component and its tests exercise the exact same logic rather than two
 * independently-maintained copies of it.
 */
export function getMarkersForCountry(country, portugalMarkers) {
  if (country === "Portugal") {
    return portugalMarkers ?? [];
  }
  return [];
}
