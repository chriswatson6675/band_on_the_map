import assert from "node:assert/strict";
import test from "node:test";

import { buildVenueFromGroup, rehydrateCandidateCity, flattenOsmCandidates, buildSeedLocalities } from "../ingestion/uk-national-discovery/run.mjs";
import { createVenueDiscoveryCandidate } from "../ingestion/venue-discovery/contract.mjs";
import { reconcileCandidates } from "../ingestion/venue-discovery/reconcile.mjs";
import { buildLocalityGazetteer } from "../ingestion/uk-national-discovery/locality-gazetteer.mjs";
import { validateVenue } from "../ingestion/venue/contract.mjs";

function osmCandidate(overrides = {}) {
  return createVenueDiscoveryCandidate({
    candidate_id: "cand-osm-node-1",
    city: "uk-grid-r02-c08",
    country_code: "GB",
    reported_name: "Test Venue",
    reported_address: null,
    reported_latitude: 51.5,
    reported_longitude: -0.1,
    reported_website: null,
    reported_category: "amenity=theatre",
    discovery_provider: "OPENSTREETMAP_OVERPASS",
    provider_record_id: "node/1",
    provider_url: "https://www.openstreetmap.org/node/1",
    retrieved_at: "2026-09-22T00:00:00.000Z",
    discovery_evidence: [
      { kind: "OSM_ELEMENT", value: "node/1" },
      { kind: "OSM_TAGS", value: JSON.stringify({ amenity: "theatre", name: "Test Venue" }) },
    ],
    ...overrides,
  });
}

test("rehydrateCandidateCity replaces a grid-label city with the element's own addr:city tag", () => {
  const candidate = osmCandidate({
    discovery_evidence: [
      { kind: "OSM_ELEMENT", value: "node/1" },
      { kind: "OSM_TAGS", value: JSON.stringify({ amenity: "theatre", name: "Test Venue", "addr:city": "Guildford" }) },
    ],
  });
  const rehydrated = rehydrateCandidateCity(candidate, buildLocalityGazetteer([]));
  assert.equal(rehydrated.city, "Guildford");
  assert.equal(rehydrated.candidate_id, candidate.candidate_id, "candidate_id must never change — it is derived from the OSM element, not the city");
});

test("rehydrateCandidateCity falls back to the nearest gazetteer locality when the element has no addr:* tag", () => {
  const candidate = osmCandidate(); // no addr:city in tags, lat/lon near London
  const gazetteer = buildLocalityGazetteer([], [{ city: "London", latitude: 51.5, longitude: -0.1 }, { city: "Manchester", latitude: 53.48, longitude: -2.24 }]);
  const rehydrated = rehydrateCandidateCity(candidate, gazetteer);
  assert.equal(rehydrated.city, "London");
});

test("rehydrateCandidateCity is a no-op (returns the same object) when the city is already correct", () => {
  const candidate = osmCandidate({
    city: "Guildford",
    discovery_evidence: [
      { kind: "OSM_ELEMENT", value: "node/1" },
      { kind: "OSM_TAGS", value: JSON.stringify({ amenity: "theatre", name: "Test Venue", "addr:city": "Guildford" }) },
    ],
  });
  const gazetteer = buildLocalityGazetteer([]);
  const rehydrated = rehydrateCandidateCity(candidate, gazetteer);
  assert.equal(rehydrated, candidate);
});

test("buildVenueFromGroup produces a valid GEOCODED venue from a single-observation OSM group", () => {
  const groups = reconcileCandidates([osmCandidate({ city: "Guildford" })]);
  const { venue, errors } = buildVenueFromGroup(groups[0]);
  assert.deepEqual(errors, []);
  assert.equal(venue.location_status, "GEOCODED");
  assert.equal(venue.city, "Guildford");
  assert.equal(venue.latitude, 51.5);
  assert.equal(venue.longitude, -0.1);
  assert.equal(venue.coordinate_provenance.method, "OSM_OVERPASS_ELEMENT_COORDINATE");
  assert.deepEqual(validateVenue(venue), []);
});

test("buildVenueFromGroup honestly produces UNRESOLVED for a coordinate-less, address-less group (e.g. event-derived)", () => {
  const eventDerived = createVenueDiscoveryCandidate({
    candidate_id: "cand-event-derived-1",
    city: "London",
    country_code: "GB",
    reported_name: "Some Unresolved Venue",
    reported_address: null,
    reported_latitude: null,
    reported_longitude: null,
    reported_website: null,
    reported_category: null,
    discovery_provider: "BEATMAPPED_EVENT_DERIVED_UNRESOLVED_NAME",
    provider_record_id: "cand-1",
    provider_url: "https://example.test/source-page",
    retrieved_at: "2026-09-22T00:00:00.000Z",
    discovery_evidence: [{ kind: "UNRESOLVED_OBSERVATION_VENUE_NAME", value: "Some Unresolved Venue" }],
  });
  const groups = reconcileCandidates([eventDerived]);
  const { venue, errors } = buildVenueFromGroup(groups[0]);
  assert.deepEqual(errors, []);
  assert.equal(venue.location_status, "UNRESOLVED");
  assert.equal(venue.latitude, null);
  assert.equal(venue.address, null);
  assert.deepEqual(validateVenue(venue), []);
});

test("buildVenueFromGroup never fabricates an address — ADDRESS_ONLY only when a real address was reported with no coordinate", () => {
  const candidate = osmCandidate({
    city: "Guildford",
    reported_latitude: null,
    reported_longitude: null,
    reported_address: "1 Real Street, Guildford, GU1 1AA",
  });
  const groups = reconcileCandidates([candidate]);
  const { venue, errors } = buildVenueFromGroup(groups[0]);
  assert.deepEqual(errors, []);
  assert.equal(venue.location_status, "ADDRESS_ONLY");
  assert.equal(venue.address, "1 Real Street, Guildford, GU1 1AA");
  assert.equal(venue.latitude, null);
});

test("flattenOsmCandidates only includes COMPLETE units, never RETRYABLE_FAILURE/PERMANENT_FAILURE/PENDING candidate lists", () => {
  const unitResults = [
    { coverage_unit_id: "u1", status: "COMPLETE", candidates: [osmCandidate()] },
    { coverage_unit_id: "u2", status: "PERMANENT_FAILURE", candidates: [] },
    { coverage_unit_id: "u3", status: "PENDING" },
  ];
  const flattened = flattenOsmCandidates(unitResults);
  assert.equal(flattened.length, 1);
});

test("buildSeedLocalities only includes venues with a real city AND finite coordinates", () => {
  const seeds = buildSeedLocalities(
    { venues: [{ city: "Guildford", latitude: 51.2, longitude: -0.5 }, { city: "", latitude: 1, longitude: 1 }, { city: "NoCoords", latitude: null, longitude: null }] },
    { venues: [{ city: "London", latitude: 51.5, longitude: -0.1 }] },
  );
  assert.equal(seeds.length, 2);
  assert.ok(seeds.some((s) => s.city === "Guildford"));
  assert.ok(seeds.some((s) => s.city === "London"));
});
