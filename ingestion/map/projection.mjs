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
// registry, and it ends up with valid numeric coordinates through
// resolveVenueMapCoordinates() below — either directly, because
// location_status is CONFIRMED or GEOCODED (VENUE-GEOCODING-01 — see
// ingestion/venue/contract.mjs's MAP_ELIGIBLE_LOCATION_STATUSES for the
// shared definition), or, as of VENUE-MANUAL-COORDINATES-DASHBOARD-01,
// because the venue is ADDRESS_ONLY and carries a valid
// MANUAL_OPERATOR_ENTRY override (venues/manual-coordinates.json). A
// stale manual entry is never used once a venue becomes CONFIRMED/
// GEOCODED — canonical coordinates always win. UNRESOLVED venues never
// receive a marker under any circumstance, and no fallback/guessed
// coordinate is ever substituted.
//
// Dependency-free; safe to import from a browser bundle (no Node
// built-ins here or in ingestion/venue/resolver.mjs, which this imports).

import { resolveObservation } from "../venue/resolver.mjs";
import { MAP_ELIGIBLE_LOCATION_STATUSES } from "../venue/contract.mjs";

export function isValidCoordinate(latitude, longitude) {
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

// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — the one deterministic place
// canonical-vs-manual map coordinate precedence is decided. Priority:
//   1. canonical CONFIRMED coordinates
//   2. canonical GEOCODED coordinates
//   3. a valid MANUAL_OPERATOR_ENTRY override (venues/manual-coordinates.json,
//      loaded and passed in by the caller — this module stays dependency-
//      free/browser-safe and never touches the filesystem itself)
//   4. no usable map coordinates
//
// A manual entry NEVER overrides existing CONFIRMED/GEOCODED coordinates
// — if one somehow still exists for a venue that has since become
// CONFIRMED/GEOCODED, the canonical coordinates win and the stale manual
// entry is simply never consulted. This function never mutates the Venue
// or the manual entry passed in.
export function resolveVenueMapCoordinates(venue, manualEntry) {
  if (venue && MAP_ELIGIBLE_LOCATION_STATUSES.has(venue.location_status) && isValidCoordinate(venue.latitude, venue.longitude)) {
    return { eligible: true, latitude: venue.latitude, longitude: venue.longitude, source: venue.location_status };
  }
  // A manual override is only ever consulted for an ADDRESS_ONLY venue —
  // never for UNRESOLVED (which by definition has no evidenced identity
  // to attach a coordinate to at all) — matching this project's existing
  // "an unresolved gig is preferable to a false map pin" rule.
  if (
    venue?.location_status === "ADDRESS_ONLY" &&
    manualEntry &&
    manualEntry.method === "MANUAL_OPERATOR_ENTRY" &&
    isValidCoordinate(manualEntry.latitude, manualEntry.longitude)
  ) {
    return {
      eligible: true,
      latitude: manualEntry.latitude,
      longitude: manualEntry.longitude,
      source: "MANUAL_OPERATOR_ENTRY",
    };
  }
  return { eligible: false, latitude: null, longitude: null, source: null };
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
 *   options.manualCoordinatesByVenueId - (VENUE-MANUAL-COORDINATES-DASHBOARD-01,
 *                               optional, defaults to none) a Map or plain
 *                               object keyed by venue_id whose value is one
 *                               venues/manual-coordinates.json entry — see
 *                               resolveVenueMapCoordinates above for the
 *                               precedence rule. Omitting this parameter
 *                               leaves this function's behaviour completely
 *                               unchanged from before manual coordinates
 *                               existed (CONFIRMED/GEOCODED-only eligibility).
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
export function projectObservationsToMapMarkers(observations, { venues, sourceRegistry, manualCoordinatesByVenueId } = {}) {
  const venueById = new Map((venues ?? []).map((venue) => [venue.venue_id, venue]));
  const manualByVenueId =
    manualCoordinatesByVenueId instanceof Map
      ? manualCoordinatesByVenueId
      : new Map(Object.entries(manualCoordinatesByVenueId ?? {}));
  const markersById = new Map();

  for (const observation of observations ?? []) {
    const resolution = resolveObservation(observation);
    if (resolution.resolution_status !== "RESOLVED") continue;

    const venue = venueById.get(resolution.venue_id);
    if (!venue) continue;
    const composed = resolveVenueMapCoordinates(venue, manualByVenueId.get(venue.venue_id));
    if (!composed.eligible) continue;

    if (!markersById.has(venue.venue_id)) {
      markersById.set(venue.venue_id, {
        venue_id: venue.venue_id,
        canonical_name: venue.canonical_name,
        latitude: composed.latitude,
        longitude: composed.longitude,
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
 * Country-scoped marker selection for the map UI. This project's
 * retained proof data originally covered only Lisbon/Porto (Portugal);
 * Croatia deliberately has none — this function is the single place that
 * decides that, so the UI component and its tests exercise the exact
 * same logic rather than two independently-maintained copies of it.
 *
 * BARCELONA-30-VENUE-POPULATION-01: `spainMarkers` is a new, optional
 * third parameter (defaults to `[]`) carrying Barcelona's own display
 * markers (ingestion/map/publication.mjs's buildSpainMarkers()) — added
 * additively so every existing 2-argument call site (app/page.tsx, every
 * existing test) keeps its EXACT prior behaviour unchanged, including
 * `getMarkersForCountry("Spain", portugalMarkers)` still legitimately
 * returning `[]` when no third argument is supplied.
 */
export function getMarkersForCountry(country, portugalMarkers, spainMarkers = []) {
  if (country === "Portugal") {
    return portugalMarkers ?? [];
  }
  if (country === "Spain") {
    return spainMarkers ?? [];
  }
  return [];
}
