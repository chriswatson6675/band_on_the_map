// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — tests for the
// bounded multi-source venue discovery layer. Fake providers/cities only
// — never a real Manchester venue name or website (that lives only in
// research/venue-discovery/manchester-curated-directory-01.json, a data
// file, and this package's own retest scripts, never in generic code).

import assert from "node:assert/strict";
import test from "node:test";

import { discoverCityCandidatesMultiSource, runDiscoveryProviders } from "../../ingestion/future-city-wave/multi-source-discovery.mjs";
import { toWaveCandidateFromGroup } from "../../ingestion/future-city-wave/candidate.mjs";
import { overpassAdapter } from "../../ingestion/venue-discovery/providers/overpass.mjs";

const CITY = { name: "Testville", city_id: "testville-tv", country: "Testland", country_code: "TV", wave_id: "test-wave" };

function rawOsm({ id, name, website }) {
  return { elements: [{ type: "node", id, lat: 1, lon: 1, tags: { name, ...(website ? { website } : {}) } }] };
}

test("a candidate found only by OSM is discovered", async () => {
  const result = await discoverCityCandidatesMultiSource(CITY, { rawOverpass: rawOsm({ id: 1, name: "OSM Only Venue", website: "https://osm-only.example/" }) });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].providers[0], "OPENSTREETMAP_OVERPASS");
});

test("a candidate found only by the curated directory (non-OSM provider) is discovered", async () => {
  const result = await discoverCityCandidatesMultiSource(CITY, {
    curatedDirectory: { provider_id: "CURATED_TEST", provider_url: "https://curated.example/", records: [{ id: "c1", name: "Curated Only Venue", website: "https://curated-only.example/" }] },
  });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].providers[0], "CURATED_TEST");
});

test("one provider's failure is isolated: the other provider's real results are still returned", async () => {
  // A malformed curated record (missing required `name`) makes createVenueDiscoveryCandidate() throw inside the adapter — the whole curated provider fails, but OSM must still succeed.
  const result = await discoverCityCandidatesMultiSource(CITY, {
    rawOverpass: rawOsm({ id: 1, name: "Surviving OSM Venue", website: "https://survives.example/" }),
    curatedDirectory: { provider_id: "CURATED_TEST", provider_url: "https://curated.example/", records: [{ id: "c1", name: "", website: "https://broken.example/" }] },
  });
  const osmResult = result.provider_results.find((r) => r.provider_id === "OPENSTREETMAP_OVERPASS");
  const curatedResult = result.provider_results.find((r) => r.provider_id === "CURATED_TEST");
  assert.equal(osmResult.error, null);
  assert.equal(osmResult.candidate_count, 1);
  assert.ok(curatedResult.error, "the curated provider's failure must be recorded, not silently swallowed");
  assert.equal(result.groups.length, 1, "the OSM venue must still be discovered despite the other provider failing");
});

test("the same physical venue reported by both providers is deduplicated into one group with cross-provider provenance retained", async () => {
  const result = await discoverCityCandidatesMultiSource(CITY, {
    rawOverpass: rawOsm({ id: 1, name: "Shared Venue", website: "https://shared.example/" }),
    curatedDirectory: { provider_id: "CURATED_TEST", provider_url: "https://curated.example/", records: [{ id: "c1", name: "Shared Venue", website: "https://shared.example/" }] },
  });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].provider_count, 2);
  assert.deepEqual([...result.groups[0].providers].sort(), ["CURATED_TEST", "OPENSTREETMAP_OVERPASS"]);
});

test("toWaveCandidateFromGroup: an agreed website across providers yields WEBSITE_FOUND_HIGH_CONFIDENCE and is usable", () => {
  const group = {
    reconciled_candidate_id: "g1", providers: ["OSM", "CURATED"], provider_count: 2,
    observations: [{ reported_name: "Agreed Venue", reported_latitude: 1, reported_longitude: 1 }],
    reported_websites: ["https://agreed.example/"], reported_addresses: [],
    coverage: { conflicts: [] },
  };
  const candidate = toWaveCandidateFromGroup(group, CITY);
  assert.equal(candidate.website, "https://agreed.example/");
  assert.equal(candidate.website_confidence, "WEBSITE_FOUND_HIGH_CONFIDENCE");
});

test("toWaveCandidateFromGroup: a website conflict between providers is WEBSITE_AMBIGUOUS and defers safely (no website used, never silently picked)", () => {
  const group = {
    reconciled_candidate_id: "g2", providers: ["OSM", "CURATED"], provider_count: 2,
    observations: [{ reported_name: "Conflicted Venue", reported_latitude: 1, reported_longitude: 1 }],
    reported_websites: ["https://one.example/", "https://two.example/"], reported_addresses: [],
    coverage: { conflicts: ["WEBSITE_CONFLICT"] },
  };
  const candidate = toWaveCandidateFromGroup(group, CITY);
  assert.equal(candidate.website, null, "an ambiguous website must never be silently chosen");
  assert.equal(candidate.website_confidence, "WEBSITE_AMBIGUOUS");
});

test("toWaveCandidateFromGroup: no provider reporting a website is honestly WEBSITE_NOT_FOUND", () => {
  const group = {
    reconciled_candidate_id: "g3", providers: ["OSM"], provider_count: 1,
    observations: [{ reported_name: "No Website Venue", reported_latitude: 1, reported_longitude: 1 }],
    reported_websites: [], reported_addresses: [],
    coverage: { conflicts: [] },
  };
  const candidate = toWaveCandidateFromGroup(group, CITY);
  assert.equal(candidate.website, null);
  assert.equal(candidate.website_confidence, "WEBSITE_NOT_FOUND");
});

test("runDiscoveryProviders never throws even when every provider fails", async () => {
  const results = await runDiscoveryProviders([{ adapter: overpassAdapter, input: { not: "valid overpass shape" }, context: { city: "X", country_code: "TV", retrieved_at: "2026-01-01" } }]);
  assert.equal(results.length, 1);
  assert.ok(results[0].error);
  assert.deepEqual(results[0].candidates, []);
});
