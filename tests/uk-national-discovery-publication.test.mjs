import assert from "node:assert/strict";
import test from "node:test";

// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — locks the
// PR #55 regression fix (ingestion/map/date-filter.mjs) and the
// venue-only marker path (ingestion/map/projection.mjs) against this
// package's own newly-discovered venue shape (OSM_OVERPASS_ELEMENT_
// COORDINATE provenance, frequently no address) — proving the earlier
// fixes generalise to real discovery-sourced venues, not just the prior
// package's census-sourced ones.

import { seedMapEligibleVenueMarkers } from "../ingestion/map/projection.mjs";
import { buildUnitedKingdomMarkers, validatePublicationArtifact, buildPublicationArtifact } from "../ingestion/map/publication.mjs";
import { filterMarkersByDateRange } from "../ingestion/map/date-filter.mjs";
import { validateVenue } from "../ingestion/venue/contract.mjs";

function discoveredVenue(overrides = {}) {
  return {
    venue_id: "venue-guildford-the-discovered-theatre",
    canonical_name: "The Discovered Theatre",
    country_code: "GB",
    city: "Guildford",
    municipality: "Guildford",
    address: null, // the common case: a bare OSM node with no addr:* tags at all
    latitude: 51.24,
    longitude: -0.58,
    location_status: "GEOCODED",
    evidence: [{ url: "https://www.openstreetmap.org/node/123", kind: "DISCOVERY_OSM_ELEMENT", note: "test" }],
    coordinate_provenance: { method: "OSM_OVERPASS_ELEMENT_COORDINATE", provider: "OPENSTREETMAP_OVERPASS" },
    ...overrides,
  };
}

test("a discovery-sourced venue (OSM_OVERPASS_ELEMENT_COORDINATE, no address) is a valid canonical Venue", () => {
  assert.deepEqual(validateVenue(discoveredVenue()), []);
});

test("a discovery-sourced venue becomes a real, listing-free public marker via seedMapEligibleVenueMarkers", () => {
  const seeded = seedMapEligibleVenueMarkers([], [discoveredVenue()], new Map());
  assert.equal(seeded.length, 1);
  assert.deepEqual(seeded[0].display_listings, []);
  assert.equal(seeded[0].address, null, "address is honestly null, never fabricated");
});

test("a discovery-sourced venue-only marker survives the default (today-onward) date filter — PR #55 regression lock", () => {
  const seeded = seedMapEligibleVenueMarkers([], [discoveredVenue()], new Map());
  const filtered = filterMarkersByDateRange(seeded, "2026-09-22", "");
  assert.equal(filtered.length, 1, "a venue-only marker must never be stripped by the default date filter");
});

test("buildUnitedKingdomMarkers publishes discovery-sourced venues alongside London listings, deduplicated by venue_id", () => {
  const markers = buildUnitedKingdomMarkers({
    londonObservations: [],
    londonVenues: [],
    londonSourceRegistry: [],
    ukVenues: [discoveredVenue(), discoveredVenue({ venue_id: "venue-york-another-discovered-venue", canonical_name: "Another Discovered Venue" })],
  });
  assert.equal(markers.length, 2);
});

test("the full publication artifact validates with discovery-sourced venues present, and carries no football/SPORT content", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-09-22T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    unitedKingdomMarkers: [discoveredVenue()].map((v) => ({ venue_id: v.venue_id, canonical_name: v.canonical_name, latitude: v.latitude, longitude: v.longitude, address: v.address, display_listings: [] })),
    sourceResults: [],
    observationCount: 0,
  });
  assert.deepEqual(validatePublicationArtifact(artifact), []);
  const serialized = JSON.stringify(artifact);
  assert.equal(/FOOTBALL/i.test(serialized), false);
  assert.equal(serialized.includes('"SPORT"'), false);
});
