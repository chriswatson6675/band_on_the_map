// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-AND-DISCOVERY-CORRECTION-01 —
// focused tests for the generic Overpass discovery corrections: nwr
// (node+way+relation) querying, the widened tag set, deterministic
// tag-evidenced candidate priority, and cross-representation dedup.

import assert from "node:assert/strict";
import test from "node:test";

import { buildOverpassQuery, selectDiscoveryCandidates, candidateTier, discoverCityCandidates } from "../../ingestion/future-city-wave/overpass-discovery.mjs";
import { fakeDiscoveryCandidate } from "./fixtures.mjs";

test("buildOverpassQuery requests nwr (node+way+relation), never node-only", () => {
  const query = buildOverpassQuery({ lat: 1, lon: 2 });
  assert.ok(!/\bnode\[/.test(query), "must not query node-only — this is exactly the gap that hid Bridgewater Hall (a way)");
  assert.ok(/nwr\["amenity"="theatre"\]/.test(query));
});

test("buildOverpassQuery includes events_venue and stadium tags (the tags that hid Albert Hall and AO Arena)", () => {
  const query = buildOverpassQuery({ lat: 1, lon: 2 });
  assert.ok(/nwr\["amenity"="events_venue"\]/.test(query));
  assert.ok(/nwr\["leisure"="stadium"\]/.test(query));
});

test("candidateTier: explicit music signal outranks a plain dedicated-venue category, which outranks everything else", () => {
  const music = fakeDiscoveryCandidate({ name: "A", city: "X", countryCode: "TV", id: 1 });
  music.reported_category = "amenity=nightclub;live_music=yes";
  const dedicated = fakeDiscoveryCandidate({ name: "B", city: "X", countryCode: "TV", id: 2 });
  dedicated.reported_category = "amenity=theatre";
  const arena = fakeDiscoveryCandidate({ name: "C", city: "X", countryCode: "TV", id: 3 });
  arena.reported_category = "leisure=stadium";
  const other = fakeDiscoveryCandidate({ name: "D", city: "X", countryCode: "TV", id: 4 });
  other.reported_category = "amenity=community_centre";

  assert.equal(candidateTier(music), 0);
  assert.equal(candidateTier(dedicated), 1);
  assert.equal(candidateTier(arena), 1);
  assert.equal(candidateTier(other), 2);
});

test("selectDiscoveryCandidates: a way-tagged concert hall with a website is prioritised ahead of a community centre, matching real Manchester evidence (Bridgewater Hall vs. a generic community centre)", () => {
  const bridgewaterHall = fakeDiscoveryCandidate({ name: "Bridgewater Hall", city: "Manchester", countryCode: "GB", website: "https://bridgewater-hall.example/", id: 1 });
  bridgewaterHall.reported_category = "amenity=theatre";
  const communityCentre = fakeDiscoveryCandidate({ name: "Some Community Centre", city: "Manchester", countryCode: "GB", website: "https://community.example/", id: 2 });
  communityCentre.reported_category = "amenity=community_centre";

  // Overpass response order deliberately puts the community centre FIRST — the old implementation would have kept that order unchanged.
  const selected = selectDiscoveryCandidates([communityCentre, bridgewaterHall], { limit: 10 });
  assert.equal(selected[0].reported_name, "Bridgewater Hall", "a dedicated venue-type must be tried before a community centre, regardless of raw OSM response order");
});

test("selectDiscoveryCandidates: the same physical venue represented as both a node and a way is deduplicated to one entry", () => {
  const asNode = fakeDiscoveryCandidate({ name: "Albert Hall", city: "Manchester", countryCode: "GB", website: null, id: 100 });
  const asWay = { ...fakeDiscoveryCandidate({ name: "Albert Hall", city: "Manchester", countryCode: "GB", website: "https://alberthallmanchester.example/", id: 200 }), candidate_id: "cand-osm-way-200" };
  const selected = selectDiscoveryCandidates([asNode, asWay], { limit: 10 });
  const albertHallEntries = selected.filter((c) => c.reported_name === "Albert Hall");
  assert.equal(albertHallEntries.length, 1, "must collapse to exactly one entry for the same named venue");
  assert.equal(albertHallEntries[0].reported_website, "https://alberthallmanchester.example/", "the website-tagged representation must be the one kept");
});

test("discoverCityCandidates reports raw_stats distinguishing node/way/relation and named/with-website counts, never silently discarded", async () => {
  const fetchOverpass = async () => ({
    elements: [
      { type: "node", id: 1, lat: 1, lon: 1, tags: { name: "Node Venue", amenity: "theatre", website: "https://a.example/" } },
      { type: "way", id: 2, center: { lat: 1, lon: 1 }, tags: { name: "Way Venue", amenity: "events_venue" } },
      { type: "relation", id: 3, center: { lat: 1, lon: 1 }, tags: { name: "Relation Venue", leisure: "stadium", website: "https://c.example/" } },
    ],
  });
  const result = await discoverCityCandidates({ name: "Testville", country_code: "TV" }, { lat: 1, lon: 1 }, { fetchOverpass, limit: 15 });
  assert.equal(result.raw_stats.node, 1);
  assert.equal(result.raw_stats.way, 1);
  assert.equal(result.raw_stats.relation, 1);
  assert.equal(result.raw_stats.named_total, 3);
  assert.equal(result.raw_stats.with_website, 2);
});

test("a way/relation element's center.lat/center.lon geometry is correctly converted to a candidate's coordinates", async () => {
  const fetchOverpass = async () => ({ elements: [{ type: "way", id: 42, center: { lat: 53.1, lon: -2.2 }, tags: { name: "Way Venue", amenity: "theatre", website: "https://way.example/" } }] });
  const result = await discoverCityCandidates({ name: "Testville", country_code: "TV" }, { lat: 53.1, lon: -2.2 }, { fetchOverpass, limit: 15 });
  assert.equal(result.candidates[0].reported_latitude, 53.1);
  assert.equal(result.candidates[0].reported_longitude, -2.2);
});
