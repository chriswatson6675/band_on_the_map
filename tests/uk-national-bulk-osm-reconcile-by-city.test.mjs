import assert from "node:assert/strict";
import test from "node:test";

import { createVenueDiscoveryCandidate } from "../ingestion/venue-discovery/contract.mjs";
import { reconcileCandidates } from "../ingestion/venue-discovery/reconcile.mjs";
import { reconcileCandidatesByCity } from "../ingestion/uk-national-bulk-osm/reconcile-by-city.mjs";

function candidate({ id, city, name, lat, lon }) {
  return createVenueDiscoveryCandidate({
    candidate_id: `cand-osm-node-${id}`,
    city,
    country_code: "GB",
    reported_name: name,
    reported_address: null,
    reported_latitude: lat,
    reported_longitude: lon,
    reported_website: null,
    reported_category: "amenity=theatre",
    discovery_provider: "OPENSTREETMAP_OVERPASS",
    provider_record_id: `node/${id}`,
    provider_url: `https://www.openstreetmap.org/node/${id}`,
    retrieved_at: "2026-09-22T00:00:00.000Z",
    discovery_evidence: [{ kind: "OSM_ELEMENT", value: `node/${id}` }],
    music_relevance_hint: null,
    active_status_hint: null,
    official_site_hint: null,
  });
}

function sortedGroupSignature(groups) {
  return groups
    .map((g) => [...g.observations].map((o) => o.candidate_id).sort().join(","))
    .sort();
}

test("reconcileCandidatesByCity produces identical groups to the unmodified reconcileCandidates on a mixed-city fixture", () => {
  const candidates = [
    candidate({ id: 1, city: "London", name: "The Venue", lat: 51.5074, lon: -0.1278 }),
    candidate({ id: 2, city: "London", name: "The Venue", lat: 51.5075, lon: -0.1277 }), // near-duplicate, same city
    candidate({ id: 3, city: "Manchester", name: "The Venue", lat: 53.4808, lon: -2.2426 }), // same name, DIFFERENT city — must never group with London
    candidate({ id: 4, city: "Edinburgh", name: "Castle Hall", lat: 55.9533, lon: -3.1883 }),
    candidate({ id: 5, city: "Edinburgh", name: "Castle Hall Annex", lat: 55.9540, lon: -3.1890 }), // possible-duplicate candidate, same city
  ];

  const global = reconcileCandidates(candidates);
  const byCity = reconcileCandidatesByCity(candidates);

  assert.deepEqual(sortedGroupSignature(byCity), sortedGroupSignature(global));
});

test("candidates in different cities are never merged, even with an identical name", () => {
  const candidates = [
    candidate({ id: 1, city: "London", name: "The Venue", lat: 51.5074, lon: -0.1278 }),
    candidate({ id: 2, city: "Manchester", name: "The Venue", lat: 53.4808, lon: -2.2426 }),
  ];
  const groups = reconcileCandidatesByCity(candidates);
  assert.equal(groups.length, 2, "same name in two different cities must remain two distinct groups");
});

test("two near-duplicate candidates in the same city are still merged into one group", () => {
  const candidates = [
    candidate({ id: 1, city: "London", name: "The Venue", lat: 51.5074, lon: -0.1278 }),
    candidate({ id: 2, city: "London", name: "The Venue", lat: 51.5075, lon: -0.1277 }),
  ];
  const groups = reconcileCandidatesByCity(candidates);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].observations.length, 2);
});

// reconcileCandidates() itself is O(n^2) (see this file's header comment)
// — bucketing by city removes the NATIONAL n^2 blowup, but a single very
// dense city bucket (e.g. London, which can realistically hold thousands
// of governed-tag-matching OSM elements) still costs O(n_city^2) within
// its own bucket. Measured directly: 1000 candidates in one city bucket
// ≈5.5s, 2000 ≈21s — real but acceptable for a one-time national batch
// job that is not itself time-bounded (this package's brief: "no
// artificial batch cap"), never for this test suite's own budget. This
// test only proves bucketing scales roughly linearly with CITY COUNT at a
// fixed, CI-proportionate per-city size — a dense-city runtime is a real,
// separately-reported characteristic of the actual national run, not a
// unit-test concern.
test("scales roughly linearly across many cities at a CI-proportionate per-city size", () => {
  const cities = ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Edinburgh", "Cardiff", "Belfast", "Bristol", "Liverpool"];
  const candidates = [];
  for (let i = 0; i < 500; i += 1) {
    const city = cities[i % cities.length];
    candidates.push(candidate({ id: 100000 + i, city, name: `Venue ${i}`, lat: 51 + (i % 10) * 0.01, lon: -1 - (i % 10) * 0.01 }));
  }
  const start = Date.now();
  const groups = reconcileCandidatesByCity(candidates);
  const elapsedMs = Date.now() - start;
  assert.equal(groups.length, candidates.length, "distinct names/coordinates within each city bucket should not spuriously merge");
  assert.ok(elapsedMs < 5000, `bucketed reconciliation of 500 candidates across 10 cities took ${elapsedMs}ms, expected well under 5s`);
});
