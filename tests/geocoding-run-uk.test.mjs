import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { geocodeOneUkVenue, validateUkCacheIdentity, UK_QUERY_STRATEGIES } from "../ingestion/geocoding/run-uk.mjs";

// Same disposable-temp-workspace discipline as tests/geocoding-run.test.mjs
// (never the real venues/uk.json or fixtures/geocoding/nominatim/*.json
// committed files, and never the live network when a valid cache fixture
// already exists).

async function makeTempWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "botm-uk-geocoding-test-"));
  const cacheDir = join(dir, "cache");
  await mkdir(cacheDir, { recursive: true });
  await mkdir(join(dir, "venues"), { recursive: true });
  return { dir, cacheDir };
}

function ukVenue(overrides = {}) {
  return {
    venue_id: "venue-testcity-test-theatre",
    canonical_name: "Test Theatre",
    country_code: "GB",
    city: "Testcity",
    municipality: "Testcity",
    address: null,
    latitude: null,
    longitude: null,
    location_status: "UNRESOLVED",
    evidence: [{ url: "https://www.testtheatre.example/", kind: "UK_MAJOR_EVENT_CENSUS", note: "test" }],
    ...overrides,
  };
}

async function writeUkRegistry(dir, venues) {
  await writeFile(join(dir, "venues", "uk.json"), JSON.stringify({ venues }, null, 2));
}

async function writeFixture(cacheDir, venueId, strategy, candidates, extra = {}) {
  const suffix = strategy === UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS ? "--uk-name-plus-address" : strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI ? "--uk-structured-poi" : "--uk-address-only";
  const fixture = {
    venue_id: venueId,
    query_strategy: strategy,
    query_address: extra.query_address ?? null,
    canonical_name: extra.canonical_name ?? "Test Theatre",
    request_url: "https://nominatim.openstreetmap.org/search?amenity=Test+Theatre",
    provider: "NOMINATIM_OSM",
    retrieved_at: "2026-09-22T00:00:00.000Z",
    http_status: 200,
    candidates,
    structured_query: strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI ? { amenity: "Test Theatre", city: "Testcity" } : undefined,
  };
  await writeFile(join(cacheDir, `${venueId}${suffix}.json`), JSON.stringify(fixture, null, 2));
}

const GOOD_STRUCTURED_CANDIDATE = {
  lat: "53.4",
  lon: "-1.5",
  class: "amenity",
  category: "amenity",
  type: "theatre",
  addresstype: "amenity",
  osm_type: "way",
  osm_id: 555666,
  display_name: "Test Theatre, Testcity, United Kingdom",
  name: "Test Theatre",
  address: { city: "Testcity", country_code: "gb" },
};

test("an address-less UK venue is geocoded via STRUCTURED_POI_QUERY only, never calling ADDRESS_ONLY_QUERY/NAME_PLUS_ADDRESS", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await writeUkRegistry(dir, [ukVenue()]);
  await writeFixture(cacheDir, "venue-testcity-test-theatre", UK_QUERY_STRATEGIES.STRUCTURED_POI, [GOOD_STRUCTURED_CANDIDATE]);

  const result = await geocodeOneUkVenue("venue-testcity-test-theatre", { root: dir, cacheDir });
  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.provenance.method, "STRUCTURED_POI_NAME_CITY_MATCH");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].strategy, UK_QUERY_STRATEGIES.STRUCTURED_POI);

  const registry = JSON.parse(await readFile(join(dir, "venues", "uk.json"), "utf8"));
  const updated = registry.venues[0];
  assert.equal(updated.location_status, "GEOCODED");
  assert.equal(updated.latitude, 53.4);
  assert.equal(updated.longitude, -1.5);
  assert.equal(updated.coordinate_provenance.method, "STRUCTURED_POI_NAME_CITY_MATCH");
});

test("a UK venue WITH an evidenced address is tried under ADDRESS_ONLY_QUERY first and never falls through when it succeeds", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const venue = ukVenue({ location_status: "ADDRESS_ONLY", address: "1 Test Street, Testcity" });
  await writeUkRegistry(dir, [venue]);
  await writeFixture(cacheDir, "venue-testcity-test-theatre", UK_QUERY_STRATEGIES.ADDRESS_ONLY, [GOOD_STRUCTURED_CANDIDATE], { query_address: "1 Test Street, Testcity" });

  const result = await geocodeOneUkVenue("venue-testcity-test-theatre", { root: dir, cacheDir });
  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].strategy, UK_QUERY_STRATEGIES.ADDRESS_ONLY);
  assert.equal(result.provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
});

test("the ladder falls through ADDRESS_ONLY_QUERY -> NAME_PLUS_ADDRESS_QUERY -> STRUCTURED_POI_QUERY when earlier strategies return no acceptable candidate", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const venue = ukVenue({ location_status: "ADDRESS_ONLY", address: "1 Test Street, Testcity" });
  await writeUkRegistry(dir, [venue]);
  await writeFixture(cacheDir, "venue-testcity-test-theatre", UK_QUERY_STRATEGIES.ADDRESS_ONLY, [], { query_address: "1 Test Street, Testcity" });
  await writeFixture(cacheDir, "venue-testcity-test-theatre", UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS, [], { query_address: "1 Test Street, Testcity" });
  await writeFixture(cacheDir, "venue-testcity-test-theatre", UK_QUERY_STRATEGIES.STRUCTURED_POI, [GOOD_STRUCTURED_CANDIDATE], { query_address: "1 Test Street, Testcity" });

  const result = await geocodeOneUkVenue("venue-testcity-test-theatre", { root: dir, cacheDir });
  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.attempts.length, 3);
  assert.deepEqual(
    result.attempts.map((a) => a.strategy),
    [UK_QUERY_STRATEGIES.ADDRESS_ONLY, UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS, UK_QUERY_STRATEGIES.STRUCTURED_POI],
  );
  assert.equal(result.provenance.method, "STRUCTURED_POI_NAME_CITY_MATCH");
});

test("a venue rejected by every applicable strategy is left exactly as it was — LEFT_UNGEOCODED, never a guessed coordinate", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await writeUkRegistry(dir, [ukVenue()]);
  await writeFixture(cacheDir, "venue-testcity-test-theatre", UK_QUERY_STRATEGIES.STRUCTURED_POI, []);

  const result = await geocodeOneUkVenue("venue-testcity-test-theatre", { root: dir, cacheDir });
  assert.equal(result.outcome, "LEFT_UNGEOCODED");

  const registry = JSON.parse(await readFile(join(dir, "venues", "uk.json"), "utf8"));
  assert.equal(registry.venues[0].location_status, "UNRESOLVED");
  assert.equal(registry.venues[0].latitude, null);
});

test("a cache fixture for the wrong canonical_name is rejected as stale and never silently reused", () => {
  const fixture = { venue_id: "v1", query_strategy: "STRUCTURED_POI_QUERY", query_address: null, canonical_name: "Old Name", provider: "NOMINATIM_OSM" };
  const venue = { venue_id: "v1", canonical_name: "New Name", address: null };
  const identity = validateUkCacheIdentity(fixture, venue, "STRUCTURED_POI_QUERY");
  assert.equal(identity.valid, false);
  assert.ok(identity.failures.includes("canonical_name"));
});

test("geocoding an already-GEOCODED venue is a no-op SKIPPED, never re-queried", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeUkRegistry(dir, [ukVenue({ location_status: "GEOCODED", latitude: 1, longitude: 2 })]);
  const result = await geocodeOneUkVenue("venue-testcity-test-theatre", { root: dir, cacheDir });
  assert.equal(result.outcome, "SKIPPED");
});
