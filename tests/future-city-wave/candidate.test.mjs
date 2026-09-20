import assert from "node:assert/strict";
import test from "node:test";

import { toWaveCandidate } from "../../ingestion/future-city-wave/candidate.mjs";
import { selectDiscoveryCandidates } from "../../ingestion/future-city-wave/overpass-discovery.mjs";
import { FAKE_CITIES, fakeDiscoveryCandidate } from "./fixtures.mjs";

const city = FAKE_CITIES[0];

test("toWaveCandidate maps real OSM coordinates to has_admissible_location: true", () => {
  const discovery = fakeDiscoveryCandidate({ name: "Club X", city: city.name, countryCode: city.country_code, website: "https://clubx.example/", id: 1 });
  const candidate = toWaveCandidate(discovery, city);
  assert.equal(candidate.has_admissible_location, true);
  assert.equal(candidate.website, "https://clubx.example/");
  assert.equal(candidate.canonical_name, "Club X");
  assert.equal(candidate.venue_id, "venue-testville-club-x");
});

test("toWaveCandidate: a candidate with no coordinates does not clear the location gate", () => {
  const discovery = fakeDiscoveryCandidate({ name: "No Coords Club", city: city.name, countryCode: city.country_code, id: 2, lat: null, lon: null });
  const candidate = toWaveCandidate(discovery, city);
  assert.equal(candidate.has_admissible_location, false);
});

test("selectDiscoveryCandidates deduplicates by candidate_id and prioritises website-tagged candidates", () => {
  const a = fakeDiscoveryCandidate({ name: "A", city: city.name, countryCode: city.country_code, id: 1, website: null });
  const b = fakeDiscoveryCandidate({ name: "B", city: city.name, countryCode: city.country_code, id: 2, website: "https://b.example/" });
  const bDupe = fakeDiscoveryCandidate({ name: "B", city: city.name, countryCode: city.country_code, id: 2, website: "https://b.example/" });

  const selected = selectDiscoveryCandidates([a, b, bDupe], { limit: 10 });
  assert.equal(selected.length, 2, "duplicate candidate_id must be removed");
  assert.equal(selected[0].candidate_id, "cand-osm-node-2", "website-tagged candidate must be prioritised first");
});

test("selectDiscoveryCandidates respects the limit", () => {
  const many = Array.from({ length: 20 }, (_, i) => fakeDiscoveryCandidate({ name: `V${i}`, city: city.name, countryCode: city.country_code, id: i }));
  assert.equal(selectDiscoveryCandidates(many, { limit: 15 }).length, 15);
});
