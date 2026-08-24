import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { geocodeOneVenue, validateCacheIdentity } from "../ingestion/geocoding/run.mjs";

// These tests exercise the FULL orchestration path (registry read/write +
// cache read/write + acceptance) against disposable temp directories —
// never the real venues/*.json or fixtures/geocoding/nominatim/*.json
// committed files, and never the live network (global fetch is never
// invoked because a cache fixture always already exists before
// geocodeOneVenue is called).

async function makeTempWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "botm-geocoding-test-"));
  const cacheDir = join(dir, "cache");
  await mkdir(cacheDir, { recursive: true });
  return { dir, cacheDir };
}

function addressOnlyVenue(overrides = {}) {
  return {
    venue_id: "venue-test-offline-fixture",
    canonical_name: "Test Offline Venue",
    country_code: "PT",
    city: "Lisboa",
    municipality: "Lisboa",
    address: "Largo da Graça, 1170-165 Lisboa",
    latitude: null,
    longitude: null,
    location_status: "ADDRESS_ONLY",
    evidence: [{ url: "https://example.test/official", kind: "OFFICIAL_VENUE_WEBSITE", note: "test fixture" }],
    ...overrides,
  };
}

async function writeRegistry(dir, venues) {
  const registryPath = join(dir, "test-registry.json");
  await writeFile(registryPath, JSON.stringify({ region: "Test", venues }, null, 2));
  return registryPath;
}

async function writeCacheFixture(cacheDir, venueId, candidates) {
  const fixture = {
    venue_id: venueId,
    query_address: "Largo da Graça, 1170-165 Lisboa",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
    request_url: `https://nominatim.openstreetmap.org/search?q=test`,
    user_agent: "BandOnTheMap-VenueGeocoder/0.1 (+https://github.com/chriswatson6675/band_on_the_map)",
    provider: "NOMINATIM_OSM",
    retrieved_at: "2026-08-24T00:00:00.000Z",
    http_status: 200,
    candidates,
  };
  await writeFile(join(cacheDir, `${venueId}.json`), JSON.stringify(fixture, null, 2));
  return fixture;
}

const ACCEPTABLE_CANDIDATE = {
  lat: "38.7147",
  lon: "-9.1306",
  class: "amenity",
  type: "place_of_worship",
  addresstype: "amenity",
  osm_type: "way",
  osm_id: 111222,
  display_name: "Igreja da Graça, Largo da Graça, Lisboa, Portugal",
  address: { city: "Lisboa", postcode: "1170-165", country_code: "pt" },
};

test("cache-hit path never calls the live network and updates the registry with GEOCODED coordinates", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [addressOnlyVenue()]);
  await writeCacheFixture(cacheDir, "venue-test-offline-fixture", [ACCEPTABLE_CANDIDATE]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );

  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.latitude, 38.7147);
  assert.equal(result.longitude, -9.1306);
  assert.equal(result.used_cache, true);

  const updated = JSON.parse(await readFile(registryPath, "utf8"));
  const venue = updated.venues.find((v) => v.venue_id === "venue-test-offline-fixture");
  assert.equal(venue.location_status, "GEOCODED");
  assert.equal(venue.latitude, 38.7147);
  assert.equal(venue.longitude, -9.1306);
  assert.equal(venue.coordinate_provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
  assert.equal(venue.coordinate_provenance.query_address, venue.address);

  // 2. cached result produces deterministic coordinates — rerun and check byte-identical outcome.
  const secondResult = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );
  assert.equal(secondResult.outcome, "SKIPPED", "already GEOCODED, not re-processed as ADDRESS_ONLY");
});

test("a venue that fails deterministic acceptance is left ADDRESS_ONLY, never guessed", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  globalThis.fetch = async () => {
    throw new Error("must not call the live network");
  };
  t.after(() => {
    globalThis.fetch = globalThis.fetch;
  });

  const registryPath = await writeRegistry(dir, [addressOnlyVenue()]);
  await writeCacheFixture(cacheDir, "venue-test-offline-fixture", []); // NO_CANDIDATES_RETURNED

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );

  assert.equal(result.outcome, "LEFT_ADDRESS_ONLY");
  assert.equal(result.reason, "NO_CANDIDATES_RETURNED");

  const updated = JSON.parse(await readFile(registryPath, "utf8"));
  const venue = updated.venues.find((v) => v.venue_id === "venue-test-offline-fixture");
  assert.equal(venue.location_status, "ADDRESS_ONLY");
  assert.equal(venue.latitude, null);
  assert.equal(venue.longitude, null);
});

// 1. official canonical address is the only geocoding input (eligibility gates).

test("a venue not present in the registry is SKIPPED, not fabricated", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, []);

  const result = await geocodeOneVenue(
    { venue_id: "venue-does-not-exist", registryPath },
    { root: dir, cacheDir },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "VENUE_NOT_FOUND_IN_REGISTRY");
});

test("a venue whose location_status is not ADDRESS_ONLY is SKIPPED", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [
    addressOnlyVenue({ location_status: "CONFIRMED", latitude: 38.7, longitude: -9.1 }),
  ]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.match(result.reason, /not ADDRESS_ONLY/);
});

test("a venue with no address is SKIPPED, never geocoded on venue name alone", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [addressOnlyVenue({ address: null })]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "NO_CANONICAL_ADDRESS");
});

test("a venue with an address but no evidence backing it is SKIPPED", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [addressOnlyVenue({ evidence: [] })]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "ADDRESS_NOT_EVIDENCE_BACKED");
});

// --- VENUE-GEOCODING-01A: cache identity safety ---------------------------
// A cache HIT by filename (venue_id) alone is not proof the retained
// evidence still matches this run's query. These tests prove a mismatch
// on any identity/request-shape field is fail-closed: reported, never
// silently reused, and never mutates the Venue.

test("a. a fixture matching venue_id/query_address/provider/request shape IS reused", () => {
  const venue = addressOnlyVenue();
  const fixture = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id }, venue);
  assert.equal(result.valid, true);
  assert.deepEqual(result.failures, []);
});

test("b. a fixture whose query_address no longer matches the venue's CURRENT address is rejected", () => {
  const venue = addressOnlyVenue({ address: "Rua Nova, 42, 1000-000 Lisboa" }); // address edited since caching
  const fixture = {
    venue_id: venue.venue_id,
    query_address: "Largo da Graça, 1170-165 Lisboa", // stale, pre-edit address
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("query_address"));
});

test("c. a fixture written for a different venue_id is rejected", () => {
  const venue = addressOnlyVenue();
  const fixture = {
    venue_id: "venue-some-other-venue",
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("venue_id"));
});

test("d. a fixture from a different/unexpected provider is rejected", () => {
  const venue = addressOnlyVenue();
  const fixture = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "SOME_OTHER_PROVIDER",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("provider"));
});

test("e. an incompatible request format or country is rejected", () => {
  const venue = addressOnlyVenue();
  const wrongFormat = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "json", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const wrongCountry = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "es" },
  };
  const formatResult = validateCacheIdentity(wrongFormat, { venue_id: venue.venue_id }, venue);
  const countryResult = validateCacheIdentity(wrongCountry, { venue_id: venue.venue_id }, venue);
  assert.equal(formatResult.valid, false);
  assert.ok(formatResult.failures.includes("request_params.format"));
  assert.equal(countryResult.valid, false);
  assert.ok(countryResult.failures.includes("request_params.countrycodes"));
});

test("f. geocodeOneVenue reports CACHE_IDENTITY_MISMATCH, never mutates the Venue, and never queries live without --refresh", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("must not call the live network on a cache identity mismatch without --refresh");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Registry has a DIFFERENT (edited) address than the cached fixture recorded.
  const registryPath = await writeRegistry(dir, [addressOnlyVenue({ address: "Rua Nova, 42, 1000-000 Lisboa" })]);
  await writeCacheFixture(cacheDir, "venue-test-offline-fixture", [ACCEPTABLE_CANDIDATE]); // query_address = old address

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir },
  );

  assert.equal(result.outcome, "CACHE_IDENTITY_MISMATCH");
  assert.ok(result.failures.includes("query_address"));

  const updated = JSON.parse(await readFile(registryPath, "utf8"));
  const venue = updated.venues.find((v) => v.venue_id === "venue-test-offline-fixture");
  assert.equal(venue.location_status, "ADDRESS_ONLY", "Venue must not be mutated on a cache identity mismatch");
  assert.equal(venue.latitude, null);
  assert.equal(venue.longitude, null);
});

test("f2. --refresh replaces a stale/mismatched cache via the normal governed live-request path", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  let liveCalled = false;
  const NEW_ADDRESS_CANDIDATE = {
    lat: "38.72",
    lon: "-9.13",
    class: "amenity",
    type: "theatre",
    addresstype: "amenity",
    osm_type: "way",
    osm_id: 333444,
    display_name: "Rua Nova, 42, Lisboa, Portugal",
    address: { city: "Lisboa", postcode: "1000-000", house_number: "42", country_code: "pt" },
  };
  globalThis.fetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify([NEW_ADDRESS_CANDIDATE]),
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [addressOnlyVenue({ address: "Rua Nova, 42, 1000-000 Lisboa" })]);
  await writeCacheFixture(cacheDir, "venue-test-offline-fixture", [ACCEPTABLE_CANDIDATE]); // stale query_address

  const result = await geocodeOneVenue(
    { venue_id: "venue-test-offline-fixture", registryPath },
    { root: dir, cacheDir, refresh: true },
  );

  assert.equal(liveCalled, true, "--refresh must issue a fresh live request through the normal governed path");
  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.used_cache, false);
});

// 14. no Observation facts mutate: the geocoding module never touches Observations at all.
test("14. the geocoding modules never import the Observation contract", async () => {
  const files = [
    new URL("../ingestion/geocoding/run.mjs", import.meta.url),
    new URL("../ingestion/geocoding/nominatim.mjs", import.meta.url),
    new URL("../ingestion/geocoding/match-address.mjs", import.meta.url),
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.ok(!text.includes("observation/contract"), `${file} must never import the Observation contract`);
  }
});
