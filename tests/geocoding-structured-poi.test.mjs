import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildStructuredPoiFields,
  buildStructuredPoiSearchUrl,
  searchNominatimStructuredLive,
  searchNominatimLive,
  STRUCTURED_POI_FIXED_PARAMS,
  MIN_REQUEST_INTERVAL_MS,
} from "../ingestion/geocoding/nominatim.mjs";
import {
  evaluateStructuredPoiCandidate,
  selectStructuredPoiMatch,
  extractStreet,
  extractPostcode,
  VENUE_NAME_ALIASES,
} from "../ingestion/geocoding/match-address.mjs";
import { geocodeOneVenue, validateCacheIdentity, QUERY_STRATEGIES } from "../ingestion/geocoding/run.mjs";
import { validateVenue } from "../ingestion/venue/contract.mjs";
import { geocodeAdmittedVenues } from "../ingestion/venue-onboarding/bounded-geocoding.mjs";
import { MAX_LIVE_STRUCTURED_POI_REQUESTS, classifyStructuredFailure } from "../ingestion/geocoding/run-structured-poi.mjs";

// VENUE-LOCATION-RESOLUTION-03 — deterministic, fixture-backed tests for
// the STRUCTURED_POI_QUERY third geocoding strategy. No live network call
// is ever made in this file.

function baseVenue(overrides = {}) {
  return {
    venue_id: "venue-odivelas-biblioteca-municipal-d-dinis",
    canonical_name: "Biblioteca Municipal D. Dinis",
    city: "Odivelas",
    municipality: "Odivelas",
    address: "Rua Guilherme Gomes Fernandes (Fim), 2675-625 Odivelas",
    location_status: "ADDRESS_ONLY",
    latitude: null,
    longitude: null,
    evidence: [{ url: "https://example.test/official", kind: "OFFICIAL_MUNICIPAL_CULTURAL_PAGE", note: "test" }],
    ...overrides,
  };
}

function libraryCandidate(overrides = {}) {
  return {
    lat: "38.79",
    lon: "-9.18",
    category: "amenity",
    type: "library",
    addresstype: "amenity",
    osm_type: "way",
    osm_id: 8001,
    name: "Biblioteca Municipal D. Dinis",
    display_name: "Biblioteca Municipal D. Dinis, Odivelas, 2675-625, Portugal",
    address: { amenity: "Biblioteca Municipal D. Dinis", city: "Odivelas", postcode: "2675-625", country_code: "pt" },
    ...overrides,
  };
}

// -- 6/8/9/7/10/11. structured query construction. --------------------------

test("6. buildStructuredPoiSearchUrl never sends a q= free-text parameter", () => {
  const fields = buildStructuredPoiFields("Biblioteca Municipal D. Dinis", "Rua Guilherme Gomes Fernandes (Fim), 2675-625 Odivelas", "Odivelas");
  const url = buildStructuredPoiSearchUrl(fields);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("q"), null);
});

test("7. the amenity field equals the canonical venue identity exactly, never a partial/fuzzy name", () => {
  const fields = buildStructuredPoiFields("BOTA Anjos", "Largo de Santa Bárbara, 3D, 1150-287 Lisboa", "Lisboa");
  assert.equal(fields.amenity, "BOTA Anjos");
  const url = buildStructuredPoiSearchUrl(fields);
  assert.equal(new URL(url).searchParams.get("amenity"), "BOTA Anjos");
});

test("8. countrycodes=pt is retained on the structured URL", () => {
  const fields = buildStructuredPoiFields("Casa Capitão", "Rua do Grilo, 119, Beato Innovation District", "Lisboa");
  const url = buildStructuredPoiSearchUrl(fields);
  assert.equal(new URL(url).searchParams.get("countrycodes"), "pt");
});

test("9. layer=poi is retained on the structured URL", () => {
  const fields = buildStructuredPoiFields("Casa Capitão", "Rua do Grilo, 119, Beato Innovation District", "Lisboa");
  const url = buildStructuredPoiSearchUrl(fields);
  assert.equal(new URL(url).searchParams.get("layer"), "poi");
});

test("the structured URL also carries format=jsonv2, addressdetails=1, namedetails=1, extratags=1, limit=5, country=Portugal", () => {
  const fields = buildStructuredPoiFields("Igreja e Convento da Graça", "Largo da Graça, 1170-165 Lisboa", "Lisboa");
  const url = new URL(buildStructuredPoiSearchUrl(fields));
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("addressdetails"), "1");
  assert.equal(url.searchParams.get("namedetails"), "1");
  assert.equal(url.searchParams.get("extratags"), "1");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal(url.searchParams.get("country"), "Portugal");
});

test("10. postcode is extracted deterministically into the structured postalcode field", () => {
  const fields = buildStructuredPoiFields("Teatro Campo Alegre", "Rua das Estrelas, 4150-762 Porto", "Porto");
  assert.equal(fields.postalcode, "4150-762");
  assert.equal(extractPostcode("Rua das Estrelas, 4150-762 Porto"), "4150-762");
});

test("street IS included when a single unambiguous non-postcode segment remains (e.g. Igreja e Convento da Graça, Village Underground)", () => {
  assert.equal(extractStreet("Largo da Graça, 1170-165 Lisboa"), "Largo da Graça");
  assert.equal(extractStreet("Avenida da Índia 52, 1300-299 Lisboa"), "Avenida da Índia 52");
  const fields = buildStructuredPoiFields("Igreja e Convento da Graça", "Largo da Graça, 1170-165 Lisboa", "Lisboa");
  assert.equal(fields.street, "Largo da Graça");
});

test("11. street is OMITTED (never fabricated) when parsing is uncertain — BOTA Anjos' own separate unit segment", () => {
  // "Largo de Santa Bárbara, 3D, 1150-287 Lisboa" leaves TWO non-postcode
  // segments once the postcode is removed — genuinely ambiguous whether
  // "3D" belongs to the street. This package's brief explicitly calls out
  // this exact address as a case to omit rather than guess.
  assert.equal(extractStreet("Largo de Santa Bárbara, 3D, 1150-287 Lisboa"), null);
  const fields = buildStructuredPoiFields("BOTA Anjos", "Largo de Santa Bárbara, 3D, 1150-287 Lisboa", "Lisboa");
  assert.equal(fields.street, undefined);
  const url = new URL(buildStructuredPoiSearchUrl(fields));
  assert.equal(url.searchParams.get("street"), null);
  // The query remains valid with amenity+city+postcode alone.
  assert.equal(url.searchParams.get("amenity"), "BOTA Anjos");
  assert.equal(url.searchParams.get("city"), "Lisboa");
  assert.equal(url.searchParams.get("postalcode"), "1150-287");
});

test("street is also omitted when no postcode is present and multiple segments remain (Casa Capitão)", () => {
  assert.equal(extractStreet("Rua do Grilo, 119, Beato Innovation District"), null);
  const fields = buildStructuredPoiFields("Casa Capitão", "Rua do Grilo, 119, Beato Innovation District", "Lisboa");
  assert.equal(fields.street, undefined);
  assert.equal(fields.postalcode, undefined);
});

test("buildStructuredPoiFields requires a non-empty canonical_name and address", () => {
  assert.throws(() => buildStructuredPoiFields("", "Rua X, 1000-000 Lisboa", "Lisboa"));
  assert.throws(() => buildStructuredPoiFields(null, "Rua X, 1000-000 Lisboa", "Lisboa"));
  assert.throws(() => buildStructuredPoiFields("Some Venue", "", "Lisboa"));
  assert.throws(() => buildStructuredPoiFields("Some Venue", null, "Lisboa"));
});

test("buildStructuredPoiSearchUrl requires a non-empty amenity field", () => {
  assert.throws(() => buildStructuredPoiSearchUrl({}));
  assert.throws(() => buildStructuredPoiSearchUrl({ amenity: "" }));
});

// -- 17/18/19/20. acceptance rules — reused NAME_PLUS_ADDRESS strictness. ---

test("17. a road-only candidate is rejected under STRUCTURED_POI_QUERY too", () => {
  const roadCandidate = libraryCandidate({ category: "highway", type: "residential", addresstype: "road" });
  const { checks, passed } = evaluateStructuredPoiCandidate(roadCandidate, baseVenue());
  assert.equal(checks.specificEnough, false);
  assert.equal(passed, false);
});

test("18. a boundary/administrative candidate is rejected", () => {
  const boundaryCandidate = libraryCandidate({ category: "boundary", type: "administrative", addresstype: "administrative" });
  const { checks, passed } = evaluateStructuredPoiCandidate(boundaryCandidate, baseVenue());
  assert.equal(checks.specificEnough, false);
  assert.equal(passed, false);
});

test("19. a correctly named theatre/library/cultural POI may pass", () => {
  const match = selectStructuredPoiMatch([libraryCandidate()], baseVenue());
  assert.equal(match.status, "ACCEPTED");
});

test("20. an incompatible venue name is rejected even though address/postcode/type all pass", () => {
  const wrongNameCandidate = libraryCandidate({
    name: "Unrelated Public Library",
    display_name: "Unrelated Public Library, Odivelas, 2675-625, Portugal",
    address: { ...libraryCandidate().address, amenity: "Unrelated Public Library" },
  });
  const { checks, passed } = evaluateStructuredPoiCandidate(wrongNameCandidate, baseVenue());
  assert.equal(checks.nameCompatible, false);
  assert.equal(passed, false);
});

// -- 21. namedetails participate only through harmless normalisation. -------

test("21a. an exact alternate name in namedetails (e.g. name:pt) may match via harmless normalisation only", () => {
  const candidate = libraryCandidate({
    name: "Some Other Label",
    address: { ...libraryCandidate().address, amenity: "Some Other Label" },
    namedetails: { name: "Biblioteca Municipal D. Dinis", "name:pt": "BIBLIOTECA MUNICIPAL D DINIS" },
  });
  const { checks, passed } = evaluateStructuredPoiCandidate(candidate, baseVenue());
  assert.equal(checks.nameCompatible, true);
  assert.equal(passed, true);
});

test("21b. a genuinely different (merely similar) namedetails name never matches — no fuzzy/edit-distance leniency", () => {
  const candidate = libraryCandidate({
    name: "Some Other Label",
    display_name: "Some Other Label, Odivelas, 2675-625, Portugal",
    address: { ...libraryCandidate().address, amenity: "Some Other Label" },
    namedetails: { name: "Biblioteca Central de Odivelas" },
  });
  const { checks, passed } = evaluateStructuredPoiCandidate(candidate, baseVenue());
  assert.equal(checks.nameCompatible, false);
  assert.equal(passed, false);
});

// -- 22. governed aliases remain explicit — nothing new invented. -----------

test("22. VENUE_NAME_ALIASES is unchanged by this package — no alias was invented merely to gain STRUCTURED_POI acceptance", () => {
  assert.deepEqual(Object.keys(VENUE_NAME_ALIASES).sort(), ["teatro campo alegre", "teatro rivoli"]);
});

// -- 23/24/25/26. fail-closed edge cases. ------------------------------------

test("23. two distinct, both-passing structured candidates are rejected as ambiguous, never auto-picked", () => {
  const candidateA = libraryCandidate({ lat: "38.10", lon: "-9.10", osm_id: 1 });
  const candidateB = libraryCandidate({ lat: "38.20", lon: "-9.20", osm_id: 2 });
  const match = selectStructuredPoiMatch([candidateA, candidateB], baseVenue());
  assert.equal(match.status, "REJECTED");
  assert.equal(match.reason, "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED");
});

test("24. a conflicting postcode fails closed, even with a perfect name match", () => {
  const candidate = libraryCandidate({ address: { ...libraryCandidate().address, postcode: "9999-999" } });
  const { checks, passed } = evaluateStructuredPoiCandidate(candidate, baseVenue());
  assert.equal(checks.postcode, false);
  assert.equal(passed, false);
});

test("25. a conflicting house number fails closed, even with a perfect name match", () => {
  const venue = baseVenue({ address: "Avenida da Índia 52, 1300-299 Lisboa", canonical_name: "Village Underground Lisboa" });
  const candidate = libraryCandidate({
    name: "Village Underground Lisboa",
    type: "nightclub",
    address: { amenity: "Village Underground Lisboa", house_number: "54", postcode: "1300-299", city: "Lisboa", country_code: "pt" },
  });
  const { checks, passed } = evaluateStructuredPoiCandidate(candidate, venue);
  assert.equal(checks.houseNumber, false);
  assert.equal(passed, false);
});

test("26. invalid/non-numeric coordinates from a provider are rejected, never geocoded", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [baseVenue()]);
  await writeStructuredCacheFixture(cacheDir, baseVenue().venue_id, [
    libraryCandidate({ lat: "not-a-number", lon: "-9.18" }),
  ]);

  const result = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(result.outcome, "LEFT_ADDRESS_ONLY");
  assert.equal(result.reason, "INVALID_NUMERIC_COORDINATES_FROM_PROVIDER");
});

// -- workspace helpers for full-orchestration (offline, cache-hit) tests. ---

async function makeTempWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "botm-structured-poi-test-"));
  const cacheDir = join(dir, "cache");
  await mkdir(cacheDir, { recursive: true });
  return { dir, cacheDir };
}

async function writeRegistry(dir, venues) {
  const registryPath = join(dir, "test-registry.json");
  await writeFile(registryPath, JSON.stringify({ region: "Test", venues }, null, 2));
  return registryPath;
}

async function writeStructuredCacheFixture(cacheDir, venueId, candidates, overrides = {}) {
  const venue = baseVenue();
  const structuredQuery = buildStructuredPoiFields(venue.canonical_name, venue.address, venue.municipality);
  const fixture = {
    venue_id: venueId,
    query_strategy: "STRUCTURED_POI_QUERY",
    query: `STRUCTURED: ${JSON.stringify(structuredQuery)}`,
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    structured_query: structuredQuery,
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery },
    request_url: "https://nominatim.openstreetmap.org/search?amenity=test",
    provider: "NOMINATIM_OSM",
    retrieved_at: "2026-08-24T00:00:00.000Z",
    http_status: 200,
    candidates,
    ...overrides,
  };
  await writeFile(join(cacheDir, `${venueId}--structured-poi.json`), JSON.stringify(fixture, null, 2));
  return fixture;
}

// -- 1/2/3/4. eligibility gates (identical shared machinery to strategies 1/2). --

test("1. STRUCTURED_POI_QUERY requires an existing canonical Venue — a missing venue is SKIPPED, never fabricated", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, []);

  const result = await geocodeOneVenue(
    { venue_id: "venue-does-not-exist", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "VENUE_NOT_FOUND_IN_REGISTRY");
});

test("2. ADDRESS_ONLY is required for STRUCTURED_POI_QUERY", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [baseVenue({ location_status: "GEOCODED", latitude: 38.7, longitude: -9.1 })]);

  const result = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.match(result.reason, /not ADDRESS_ONLY/);
});

test("3. canonical_name is required for STRUCTURED_POI_QUERY — never queried on address alone", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("must never query live when canonical_name is missing");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [baseVenue({ canonical_name: null })]);
  const result = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "NO_CANONICAL_NAME");
});

test("4. an evidenced official address is required for STRUCTURED_POI_QUERY too", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const noAddress = await writeRegistry(dir, [baseVenue({ address: null })]);
  const r1 = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath: noAddress },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(r1.outcome, "SKIPPED");
  assert.equal(r1.reason, "NO_CANONICAL_ADDRESS");

  const noEvidence = await writeRegistry(dir, [baseVenue({ evidence: [] })]);
  const r2 = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath: noEvidence },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(r2.outcome, "SKIPPED");
  assert.equal(r2.reason, "ADDRESS_NOT_EVIDENCE_BACKED");
});

// -- 5. no Observation text ever enters query construction. -----------------

test("5. neither nominatim.mjs, match-address.mjs, run.mjs, nor run-structured-poi.mjs ever reference Observation-only fields", async () => {
  const files = [
    new URL("../ingestion/geocoding/run.mjs", import.meta.url),
    new URL("../ingestion/geocoding/nominatim.mjs", import.meta.url),
    new URL("../ingestion/geocoding/match-address.mjs", import.meta.url),
    new URL("../ingestion/geocoding/run-structured-poi.mjs", import.meta.url),
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.ok(!text.includes("observation/contract"), `${file} must never import the Observation contract`);
    assert.ok(!text.includes("ics_geo_untrusted"), `${file} must never reference ics_geo_untrusted`);
    assert.ok(!text.includes("location_text"), `${file} must never read Observation.location_text`);
  }
});

// -- 12/13/14/15/16. strategy-aware cache identity. --------------------------

test("12. a STRUCTURED_POI_QUERY fixture matching every identity field IS reused", () => {
  const venue = baseVenue();
  const structuredQuery = buildStructuredPoiFields(venue.canonical_name, venue.address, venue.municipality);
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "STRUCTURED_POI_QUERY",
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    structured_query: structuredQuery,
    provider: "NOMINATIM_OSM",
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "STRUCTURED_POI_QUERY" }, venue);
  assert.equal(result.valid, true);
  assert.deepEqual(result.failures, []);
});

test("a STRUCTURED_POI_QUERY target never accepts an ADDRESS_ONLY_QUERY or NAME_PLUS_ADDRESS_QUERY fixture, and vice versa", () => {
  const venue = baseVenue();
  const structuredQuery = buildStructuredPoiFields(venue.canonical_name, venue.address, venue.municipality);
  const structuredFixture = {
    venue_id: venue.venue_id,
    query_strategy: "STRUCTURED_POI_QUERY",
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    structured_query: structuredQuery,
    provider: "NOMINATIM_OSM",
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery },
  };
  const asAddressOnly = validateCacheIdentity(structuredFixture, { venue_id: venue.venue_id }, venue);
  assert.equal(asAddressOnly.valid, false);
  assert.ok(asAddressOnly.failures.includes("query_strategy"));

  const addressOnlyFixture = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const asStructured = validateCacheIdentity(
    addressOnlyFixture,
    { venue_id: venue.venue_id, strategy: "STRUCTURED_POI_QUERY" },
    venue,
  );
  assert.equal(asStructured.valid, false);
  assert.ok(asStructured.failures.includes("query_strategy"));
});

test("13. a stale canonical_name invalidates a STRUCTURED_POI_QUERY cache", () => {
  const venue = baseVenue({ canonical_name: "Biblioteca Municipal D. Dinis (renamed)" });
  const structuredQuery = buildStructuredPoiFields("Biblioteca Municipal D. Dinis", venue.address, venue.municipality);
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "STRUCTURED_POI_QUERY",
    query_address: venue.address,
    canonical_name: "Biblioteca Municipal D. Dinis", // stale, pre-rename
    structured_query: structuredQuery,
    provider: "NOMINATIM_OSM",
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "STRUCTURED_POI_QUERY" }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("canonical_name"));
});

test("14. a stale address invalidates a STRUCTURED_POI_QUERY cache", () => {
  const venue = baseVenue({ address: "Rua Nova, 2675-000 Odivelas" });
  const structuredQuery = buildStructuredPoiFields(venue.canonical_name, "Rua Guilherme Gomes Fernandes (Fim), 2675-625 Odivelas", venue.municipality);
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "STRUCTURED_POI_QUERY",
    query_address: "Rua Guilherme Gomes Fernandes (Fim), 2675-625 Odivelas", // pre-edit address
    canonical_name: venue.canonical_name,
    structured_query: structuredQuery,
    provider: "NOMINATIM_OSM",
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "STRUCTURED_POI_QUERY" }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("query_address"));
  assert.ok(result.failures.includes("structured_query.postalcode"));
});

test("15. a changed structured component (e.g. city) invalidates the cache even when canonical_name/address are unchanged", () => {
  const venue = baseVenue();
  const structuredQuery = buildStructuredPoiFields(venue.canonical_name, venue.address, venue.municipality);
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "STRUCTURED_POI_QUERY",
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    structured_query: { ...structuredQuery, city: "Some Other City" }, // tampered/stale structured field
    provider: "NOMINATIM_OSM",
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery, city: "Some Other City" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "STRUCTURED_POI_QUERY" }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("structured_query.city"));
});

test("16. a fixture from a different/unexpected provider is rejected under STRUCTURED_POI_QUERY", () => {
  const venue = baseVenue();
  const structuredQuery = buildStructuredPoiFields(venue.canonical_name, venue.address, venue.municipality);
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "STRUCTURED_POI_QUERY",
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    structured_query: structuredQuery,
    provider: "SOME_OTHER_PROVIDER",
    request_params: { ...STRUCTURED_POI_FIXED_PARAMS, ...structuredQuery },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "STRUCTURED_POI_QUERY" }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("provider"));
});

// -- 27. accepted STRUCTURED_POI result becomes GEOCODED only, never CONFIRMED. --

test("27. a cached, accepted STRUCTURED_POI_QUERY candidate becomes GEOCODED with numeric, in-range coordinates, never re-querying live, never CONFIRMED", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [baseVenue()]);
  await writeStructuredCacheFixture(cacheDir, baseVenue().venue_id, [libraryCandidate()]);

  const result = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );

  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.used_cache, true);
  assert.equal(Number.isFinite(result.latitude), true);
  assert.ok(result.latitude >= -90 && result.latitude <= 90);
  assert.ok(result.longitude >= -180 && result.longitude <= 180);
  assert.equal(result.provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
  assert.equal(result.provenance.query_strategy, "STRUCTURED_POI_QUERY");
  assert.equal(result.provenance.query_name, "Biblioteca Municipal D. Dinis");
  assert.ok(result.provenance.structured_query);

  const updated = JSON.parse(await readFile(registryPath, "utf8"));
  const venue = updated.venues.find((v) => v.venue_id === baseVenue().venue_id);
  assert.equal(venue.location_status, "GEOCODED");
  assert.notEqual(venue.location_status, "CONFIRMED");
  assert.equal(validateVenue(venue).length, 0, "the resulting Venue must still satisfy the shared contract");
});

// -- 28. existing map-eligible venues are never requeried. ------------------

test("28. an already-GEOCODED venue (Casa da Música) is SKIPPED under STRUCTURED_POI_QUERY, never re-queried live", async (t) => {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  const casaDaMusica = registry.venues.find((v) => v.venue_id === "venue-porto-casa-da-musica");
  assert.ok(casaDaMusica);

  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("an already-GEOCODED venue must never be re-queried by this package");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const registryPath = await writeRegistry(dir, [casaDaMusica]);
  const result = await geocodeOneVenue(
    { venue_id: "venue-porto-casa-da-musica", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.match(result.reason, /not ADDRESS_ONLY/);
});

// -- 29/30. Porto's three geocoded coordinates remain exact. ----------------

test("29/30. Casa da Música, Teatro Rivoli, and Teatro Campo Alegre's committed coordinates remain exactly as before this package", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  const byId = new Map(registry.venues.map((v) => [v.venue_id, v]));

  const casaDaMusica = byId.get("venue-porto-casa-da-musica");
  assert.equal(casaDaMusica.latitude, 41.1589025);
  assert.equal(casaDaMusica.longitude, -8.6307748);
  assert.equal(casaDaMusica.location_status, "GEOCODED");

  const rivoli = byId.get("venue-porto-teatro-rivoli");
  assert.equal(rivoli.latitude, 41.1478215);
  assert.equal(rivoli.longitude, -8.6099393);
  assert.equal(rivoli.location_status, "GEOCODED");

  const campoAlegre = byId.get("venue-porto-teatro-campo-alegre");
  assert.equal(campoAlegre.latitude, 41.1507848);
  assert.equal(campoAlegre.longitude, -8.6395243);
  assert.equal(campoAlegre.location_status, "GEOCODED");
});

// -- 31. BOTA's bad ICS GEO stays completely unrelated to STRUCTURED_POI_QUERY too. --

test("31. the STRUCTURED_POI fields built for BOTA's canonical name+address never contain the bad ICS GEO numbers", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const bota = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  assert.ok(bota);
  const fields = buildStructuredPoiFields(bota.canonical_name, bota.address, bota.municipality ?? bota.city);
  const serialised = JSON.stringify(fields);
  assert.ok(!serialised.includes("40.720756"));
  assert.ok(!serialised.includes("74.000761"));
  const url = buildStructuredPoiSearchUrl(fields);
  assert.ok(!url.includes("40.720756"));
  assert.ok(!url.includes("74.000761"));
});

// -- 32/33. live request cap + serialization (reusing existing, unmodified machinery). --

test("32. the live STRUCTURED_POI_QUERY request cap is 15, and geocodeAdmittedVenues (reused unmodified) enforces it", async () => {
  assert.equal(MAX_LIVE_STRUCTURED_POI_REQUESTS, 15);

  const venues = Array.from({ length: 17 }, (_, i) => baseVenue({ venue_id: `venue-test-cap-${i}` }));
  let liveCalls = 0;
  const { results, liveRequestCount } = await geocodeAdmittedVenues(venues, {
    maxLiveRequests: MAX_LIVE_STRUCTURED_POI_REQUESTS,
    registryTargetForVenue: () => ({ region: "lisbon", registryPath: "venues/lisbon.json" }),
    loadCachedFixture: async () => null, // every venue is a cache miss -> would need a live request
    validateCacheIdentity: () => ({ valid: false }),
    geocodeOneVenue: async (target) => {
      liveCalls += 1;
      return { venue_id: target.venue_id, outcome: "GEOCODED", latitude: 38.7, longitude: -9.1 };
    },
    cacheDir: "unused",
  });

  assert.equal(liveRequestCount, 15);
  assert.equal(liveCalls, 15, "geocodeOneVenue itself must only be invoked for the first 15 (cache-miss) venues");
  const readyForGeocoding = results.filter((r) => r.outcome === "READY_FOR_GEOCODING");
  assert.equal(readyForGeocoding.length, 2, "the 2 over-cap venues are retained ADDRESS_ONLY-eligible, never discarded");
});

test("33. searchNominatimStructuredLive shares the SAME single-threaded, rate-limited queue as searchNominatimLive", async (t) => {
  const originalFetch = globalThis.fetch;
  const callTimes = [];
  globalThis.fetch = async () => {
    callTimes.push(Date.now());
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => "[]" };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await searchNominatimLive("Address A, 1000-000 Lisboa");
  await searchNominatimStructuredLive({ amenity: "Some Venue", city: "Lisboa" });

  assert.equal(callTimes.length, 2);
  const gap = callTimes[1] - callTimes[0];
  assert.ok(gap >= MIN_REQUEST_INTERVAL_MS - 5, `expected gap >= ~${MIN_REQUEST_INTERVAL_MS}ms between a free-text and a structured call, got ${gap}ms`);
});

// -- 34. cache-only rerun makes zero live requests (proven at the geocodeOneVenue level). --

test("34. rerunning geocodeOneVenue against an already-cached, already-GEOCODED STRUCTURED_POI venue is SKIPPED, never re-queried", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("must never call the live network");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [baseVenue()]);
  await writeStructuredCacheFixture(cacheDir, baseVenue().venue_id, [libraryCandidate()]);

  const first = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(first.outcome, "GEOCODED");

  const second = await geocodeOneVenue(
    { venue_id: baseVenue().venue_id, registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.STRUCTURED_POI },
  );
  assert.equal(second.outcome, "SKIPPED", "already GEOCODED — never re-processed as ADDRESS_ONLY, never re-queried");
});

// -- 35. the data-driven resolver remains completely untouched. -------------

test("35. run-structured-poi.mjs never imports or writes venues/source-venue-mappings.json or the resolver's admission machinery", async () => {
  const text = await readFile(new URL("../ingestion/geocoding/run-structured-poi.mjs", import.meta.url), "utf8");
  assert.ok(!text.includes("source-venue-mappings"));
  assert.ok(!text.includes("resolveViaExplicitMappings"));
  assert.ok(!text.includes("resolveFromMappings"));
});

// -- classification A-F diagnostic (used by the runner's own reporting). ----

test("classifyStructuredFailure distinguishes NO_POI/ROAD-ONLY/AMBIGUOUS for reporting, never used for acceptance itself", () => {
  assert.equal(classifyStructuredFailure({ status: "ACCEPTED" }), null);
  assert.equal(classifyStructuredFailure({ status: "REJECTED", reason: "NO_CANDIDATES_RETURNED" }), "A. NO_POI_RETURNED");
  assert.equal(
    classifyStructuredFailure({ status: "REJECTED", reason: "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED" }),
    "E. MULTIPLE_AMBIGUOUS_POIS",
  );
  assert.equal(
    classifyStructuredFailure({
      status: "REJECTED",
      reason: "NO_CANDIDATE_PASSED_ALL_CHECKS",
      evaluated: [{ checks: { specificEnough: false, featureCompatible: true } }],
    }),
    "B. ONLY_ROAD_OR_ADDRESS_RETURNED",
  );
  assert.equal(
    classifyStructuredFailure({
      status: "REJECTED",
      reason: "NO_CANDIDATE_PASSED_ALL_CHECKS",
      evaluated: [
        { checks: { specificEnough: true, featureCompatible: true, country: true, city: true, postcode: true, houseNumber: true, nameCompatible: false } },
      ],
    }),
    "C. POI_RETURNED_BUT_WRONG_NAME",
  );
  assert.equal(
    classifyStructuredFailure({
      status: "REJECTED",
      reason: "NO_CANDIDATE_PASSED_ALL_CHECKS",
      evaluated: [
        { checks: { specificEnough: true, featureCompatible: true, country: true, city: true, postcode: false, houseNumber: true, nameCompatible: true } },
      ],
    }),
    "D. POI_RETURNED_BUT_ADDRESS_CONFLICT",
  );
});

// -- extratags is retained as supporting evidence only, never identity. -----

test("extratags never participate in name compatibility — only namedetails/address/name fields do", () => {
  const candidate = libraryCandidate({
    name: "Some Other Label",
    display_name: "Some Other Label, Odivelas, 2675-625, Portugal",
    address: { ...libraryCandidate().address, amenity: "Some Other Label" },
    extratags: { website: "https://biblioteca-municipal-d-dinis.example", wikidata: "Q999999" },
  });
  const { checks, passed } = evaluateStructuredPoiCandidate(candidate, baseVenue());
  assert.equal(checks.nameCompatible, false, "extratags fields must never substitute for a genuine name match");
  assert.equal(passed, false);
});
