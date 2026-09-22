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
import { createObservation, emptyDateTime } from "../ingestion/observation/contract.mjs";

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

// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — a real
// production gap this locks against regressing: an Observation from a
// national UK programme source (concatenated into `londonObservations` by
// ingestion/publish-map-data/run.mjs and ingestion/unattended-runner/
// run.mjs) resolves to a venue_id that lives in venues/uk.json, never
// venues/london.json. buildUnitedKingdomMarkers() previously only passed
// `londonVenues` into projectObservationsToDisplayMarkers()'s own `venues`
// lookup — projectObservationsToMapMarkers() (ingestion/map/projection.mjs)
// silently drops any Observation whose resolved venue_id isn't found in
// that lookup, so every genuinely-resolved national UK Observation was
// discarded before ever becoming a display listing (confirmed via a real
// `npm run publish:map-data` run: 89/89 UK sources reported 652 real
// acquired observations, yet the published artifact carried zero of
// them). "Rich Mix" is real, committed data — venues/uk.json's own
// venue-london-rich-mix and a VENUE_NAME-keyed mapping for
// uk-prog-london-rich-mix in venues/source-venue-mappings.json (which
// ingestion/venue/resolver.mjs's resolveObservation() reads statically
// from the real repository file, not a fixture) — so this test resolves
// through the exact same real mapping table production does.
test("an Observation from a national UK programme source resolves to a venue_id living in venues/uk.json (not venues/london.json) and still produces a real display listing", () => {
  const richMix = {
    venue_id: "venue-london-rich-mix",
    canonical_name: "Rich Mix",
    country_code: "GB",
    city: "London",
    municipality: "London",
    address: "Bethnal Green Road 35-47, E1 6LA, London",
    latitude: 51.52442403846154,
    longitude: -0.07323122307692308,
    location_status: "GEOCODED",
    evidence: [{ url: "https://www.openstreetmap.org/way/274608954", kind: "DISCOVERY_OSM_ELEMENT", note: "test" }],
    coordinate_provenance: { method: "OSM_OVERPASS_ELEMENT_COORDINATE", provider: "OPENSTREETMAP_OVERPASS" },
  };
  const ukProgrammeObservation = createObservation({
    source_id: "uk-prog-london-rich-mix",
    source_record_id: "test-event-1",
    retrieved_at: "2026-09-22T09:00:00.000Z",
    title: "A Real Rich Mix Gig",
    venue_name: "Rich Mix",
    start: { ...emptyDateTime(), date: "2026-10-01" },
  });

  const markers = buildUnitedKingdomMarkers({
    londonObservations: [ukProgrammeObservation],
    londonVenues: [], // deliberately empty — Rich Mix is a venues/uk.json venue, not a venues/london.json one
    londonSourceRegistry: [],
    ukVenues: [richMix],
  });

  const richMixMarker = markers.find((m) => m.venue_id === "venue-london-rich-mix");
  assert.ok(richMixMarker, "Rich Mix must produce a marker at all");
  assert.equal(richMixMarker.display_listings.length, 1, "the real UK programme Observation must survive as a display listing, not be silently dropped");
  assert.equal(richMixMarker.display_listings[0].title, "A Real Rich Mix Gig");
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
