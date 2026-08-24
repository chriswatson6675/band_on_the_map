import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  evaluateNamePlusAddressCandidate,
  isVenueNameCompatible,
  selectNamePlusAddressMatch,
  VENUE_NAME_ALIASES,
} from "../ingestion/geocoding/match-address.mjs";
import { buildNamePlusAddressQuery, buildNominatimSearchUrl } from "../ingestion/geocoding/nominatim.mjs";
import { geocodeOneVenue, validateCacheIdentity, QUERY_STRATEGIES } from "../ingestion/geocoding/run.mjs";
import { validateVenue } from "../ingestion/venue/contract.mjs";
import { isEligibleForSecondaryStrategy, classifyOutcome } from "../ingestion/geocoding/run-name-plus-address.mjs";

// VENUE-LOCATION-RESOLUTION-02 — deterministic, fixture-backed tests for
// the NAME_PLUS_ADDRESS_QUERY second query strategy. No live network call
// is ever made in this file.

function baseVenue(overrides = {}) {
  return {
    venue_id: "venue-porto-teatro-campo-alegre",
    canonical_name: "Teatro Campo Alegre",
    city: "Porto",
    municipality: "Porto",
    address: "Rua das Estrelas, 4150-762 Porto",
    location_status: "ADDRESS_ONLY",
    latitude: null,
    longitude: null,
    evidence: [{ url: "https://example.test/official", kind: "OFFICIAL_VENUE_WEBSITE", note: "test" }],
    ...overrides,
  };
}

function theatreCandidate(overrides = {}) {
  return {
    lat: "41.1497",
    lon: "-8.6122",
    category: "amenity",
    type: "theatre",
    addresstype: "amenity",
    osm_type: "way",
    osm_id: 555111,
    name: "Teatro Campo Alegre",
    display_name: "Teatro Campo Alegre, Rua das Estrelas, Porto, 4150-762, Portugal",
    address: {
      amenity: "Teatro Campo Alegre",
      road: "Rua das Estrelas",
      city: "Porto",
      postcode: "4150-762",
      country_code: "pt",
    },
    ...overrides,
  };
}

// -- 5. query construction is deterministic. --------------------------------

test("5. buildNamePlusAddressQuery deterministically joins canonical_name + address with ', ', never reordered", () => {
  const query = buildNamePlusAddressQuery("Teatro Campo Alegre", "Rua das Estrelas, 4150-762 Porto");
  assert.equal(query, "Teatro Campo Alegre, Rua das Estrelas, 4150-762 Porto");
  // deterministic — same inputs, same output, every time.
  assert.equal(query, buildNamePlusAddressQuery("Teatro Campo Alegre", "Rua das Estrelas, 4150-762 Porto"));
});

test("5b. buildNamePlusAddressQuery requires a non-empty canonical_name and address", () => {
  assert.throws(() => buildNamePlusAddressQuery("", "Rua X, 1000-000 Lisboa"));
  assert.throws(() => buildNamePlusAddressQuery(null, "Rua X, 1000-000 Lisboa"));
  assert.throws(() => buildNamePlusAddressQuery("Some Venue", ""));
  assert.throws(() => buildNamePlusAddressQuery("Some Venue", null));
});

test("5c. the constructed query flows into the Nominatim URL unchanged, still constrained to format=jsonv2&addressdetails=1&countrycodes=pt&limit=5", () => {
  const query = buildNamePlusAddressQuery("Casa Capitão", "Rua do Grilo, 119, Beato Innovation District");
  const url = buildNominatimSearchUrl(query, { countrycodes: "pt", limit: 5 });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("q"), query);
  assert.equal(parsed.searchParams.get("format"), "jsonv2");
  assert.equal(parsed.searchParams.get("addressdetails"), "1");
  assert.equal(parsed.searchParams.get("countrycodes"), "pt");
  assert.equal(parsed.searchParams.get("limit"), "5");
});

// -- 9-13. NAME_PLUS_ADDRESS_QUERY's own strict acceptance rules, reused/extended. --

test("9. a road-only candidate is still rejected under NAME_PLUS_ADDRESS_QUERY", () => {
  const roadCandidate = theatreCandidate({ category: "highway", type: "residential", addresstype: "road" });
  const { checks, passed } = evaluateNamePlusAddressCandidate(roadCandidate, baseVenue());
  assert.equal(checks.specificEnough, false);
  assert.equal(passed, false);
});

test("10. a wrong-country candidate is rejected", () => {
  const wrongCountry = theatreCandidate({ address: { ...theatreCandidate().address, country_code: "es" } });
  const { checks, passed } = evaluateNamePlusAddressCandidate(wrongCountry, baseVenue());
  assert.equal(checks.country, false);
  assert.equal(passed, false);
});

test("11. a conflicting postcode is rejected, even with a perfect name match", () => {
  const conflictingPostcode = theatreCandidate({ address: { ...theatreCandidate().address, postcode: "9999-999" } });
  const { checks, passed } = evaluateNamePlusAddressCandidate(conflictingPostcode, baseVenue());
  assert.equal(checks.postcode, false);
  assert.equal(passed, false);
});

test("12. a conflicting house number is rejected, even with a perfect name match", () => {
  const venue = baseVenue({ address: "Avenida da Índia 52, 1300-299 Lisboa", canonical_name: "Village Underground Lisboa" });
  const candidate = theatreCandidate({
    name: "Village Underground Lisboa",
    address: { ...theatreCandidate().address, house_number: "54", postcode: "1300-299", city: "Lisboa" },
  });
  const { checks, passed } = evaluateNamePlusAddressCandidate(candidate, venue);
  assert.equal(checks.houseNumber, false);
  assert.equal(passed, false);
});

test("13. an incompatible venue name is rejected even though address/postcode/type all pass", () => {
  const wrongNameCandidate = theatreCandidate({
    name: "Some Unrelated Theatre",
    display_name: "Some Unrelated Theatre, Rua das Estrelas, Porto, 4150-762, Portugal",
    address: { ...theatreCandidate().address, amenity: "Some Unrelated Theatre" },
  });
  const { checks, passed } = evaluateNamePlusAddressCandidate(wrongNameCandidate, baseVenue());
  assert.equal(checks.nameCompatible, false);
  assert.equal(passed, false);
});

// -- 14/15. name compatibility: harmless normalisation may match; aliases require governed data. --

test("14. case/diacritic/punctuation-only differences are treated as compatible", () => {
  assert.equal(isVenueNameCompatible("Teatro Campo Alegre", { name: "teatro campo alegre" }), true);
  assert.equal(isVenueNameCompatible("Igreja e Convento da Graça", { name: "IGREJA E CONVENTO DA GRACA" }), true);
  assert.equal(isVenueNameCompatible("Centro Cultural Malaposta", { name: "Centro Cultural  Malaposta" }), true, "whitespace collapse");
  assert.equal(
    isVenueNameCompatible("Biblioteca Municipal D. Dinis", { name: "Biblioteca Municipal D Dinis" }),
    true,
    "punctuation difference",
  );
});

test("14b. compatibility also checks address.amenity/theatre/building fields and the first display_name segment", () => {
  assert.equal(isVenueNameCompatible("Teatro Rivoli", { address: { theatre: "Teatro Rivoli" } }), true);
  assert.equal(isVenueNameCompatible("Teatro Rivoli", { address: { amenity: "Teatro Rivoli" } }), true);
  assert.equal(
    isVenueNameCompatible("Teatro Rivoli", { display_name: "Teatro Rivoli, Praça Dom João I, Porto, Portugal" }),
    true,
  );
  // a display_name whose FIRST segment is something else must not match
  // merely because "Teatro Rivoli" appears later in the string.
  assert.equal(
    isVenueNameCompatible("Teatro Rivoli", { display_name: "Praça Dom João I, next to Teatro Rivoli, Porto, Portugal" }),
    false,
  );
});

test("14c. genuinely unrelated names never match (no fuzzy/edit-distance leniency)", () => {
  assert.equal(isVenueNameCompatible("Teatro Campo Alegre", { name: "Teatro Rivoli" }), false);
  assert.equal(isVenueNameCompatible("BOTA Anjos", { name: "Bar Lisboa" }), false);
});

test("15. VENUE_NAME_ALIASES carries ONLY the two entries this package's own live proof run actually justified with retained, pre-existing evidence — nothing invented merely to gain acceptance", () => {
  assert.deepEqual(Object.keys(VENUE_NAME_ALIASES).sort(), ["teatro campo alegre", "teatro rivoli"]);
  assert.deepEqual(VENUE_NAME_ALIASES["teatro rivoli"], ["teatro municipal rivoli"]);
  assert.deepEqual(VENUE_NAME_ALIASES["teatro campo alegre"], [
    "teatro municipal do campo alegre",
    "teatro municipal campo alegre",
  ]);
});

test("15b. alias acceptance requires EXPLICIT governed alias data — absent by default, works only when supplied", () => {
  const candidate = { name: "Campo Alegre" };
  assert.equal(
    isVenueNameCompatible("Teatro Campo Alegre", candidate),
    false,
    "no alias is registered by default, so a bare short-form name must not match",
  );
  const withGovernedAlias = isVenueNameCompatible("Teatro Campo Alegre", candidate, {
    aliases: { "teatro campo alegre": ["campo alegre"] },
  });
  assert.equal(withGovernedAlias, true, "an explicitly supplied, governed alias may match");
});

// -- 16. ambiguity. ----------------------------------------------------------

test("16. two distinct, both-passing candidates are rejected as ambiguous, never auto-picked", () => {
  const candidateA = theatreCandidate({ lat: "41.10", lon: "-8.60", osm_id: 1 });
  const candidateB = theatreCandidate({ lat: "41.20", lon: "-8.70", osm_id: 2 });
  const match = selectNamePlusAddressMatch([candidateA, candidateB], baseVenue());
  assert.equal(match.status, "REJECTED");
  assert.equal(match.reason, "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED");
});

test("two passing candidates at the exact same coordinate are not ambiguous", () => {
  const candidateA = theatreCandidate({ osm_id: 1, osm_type: "way" });
  const candidateB = theatreCandidate({ osm_id: 2, osm_type: "relation" });
  const match = selectNamePlusAddressMatch([candidateA, candidateB], baseVenue());
  assert.equal(match.status, "ACCEPTED");
});

// -- 17. correct named theatre/building/library/etc may pass; every candidate is evaluated, not just [0]. --

test("17. a correct named theatre candidate is accepted", () => {
  const match = selectNamePlusAddressMatch([theatreCandidate()], baseVenue());
  assert.equal(match.status, "ACCEPTED");
});

test("17b. a correct named library candidate is accepted for a library venue", () => {
  const venue = baseVenue({
    venue_id: "venue-odivelas-biblioteca-municipal-d-dinis",
    canonical_name: "Biblioteca Municipal D. Dinis",
    city: "Odivelas",
    municipality: "Odivelas",
    address: "Rua Guilherme Gomes Fernandes (Fim), 2675-625 Odivelas",
  });
  const candidate = {
    lat: "38.79",
    lon: "-9.18",
    category: "amenity",
    type: "library",
    addresstype: "amenity",
    osm_type: "way",
    osm_id: 777,
    name: "Biblioteca Municipal D. Dinis",
    display_name: "Biblioteca Municipal D. Dinis, Odivelas, 2675-625, Portugal",
    address: { amenity: "Biblioteca Municipal D. Dinis", city: "Odivelas", postcode: "2675-625", country_code: "pt" },
  };
  const match = selectNamePlusAddressMatch([candidate], venue);
  assert.equal(match.status, "ACCEPTED");
});

test("17c. section 7 — every candidate is evaluated, not just the first: a correct match ranked SECOND is still found", () => {
  const wrongFirst = theatreCandidate({
    name: "Unrelated Place",
    display_name: "Unrelated Place, Rua das Estrelas, Porto, 4150-762, Portugal",
    address: { ...theatreCandidate().address, amenity: "Unrelated Place" },
  });
  const correctSecond = theatreCandidate({ osm_id: 999 });
  const match = selectNamePlusAddressMatch([wrongFirst, correctSecond], baseVenue());
  assert.equal(match.status, "ACCEPTED");
  assert.equal(match.candidate.osm_id, 999);
});

test("a plausible feature type outside the allowlist (e.g. a fuel station) is rejected even with a matching name coincidence", () => {
  const fuelStation = theatreCandidate({ category: "amenity", type: "fuel", addresstype: "amenity" });
  const { checks, passed } = evaluateNamePlusAddressCandidate(fuelStation, baseVenue());
  assert.equal(checks.featureCompatible, false);
  assert.equal(passed, false);
});

// -- 6/7/8. strategy-aware cache identity. -----------------------------------

test("6. a NAME_PLUS_ADDRESS_QUERY fixture matching venue_id/query_address/canonical_name/provider/strategy IS reused", () => {
  const venue = baseVenue();
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "NAME_PLUS_ADDRESS_QUERY",
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "NAME_PLUS_ADDRESS_QUERY" }, venue);
  assert.equal(result.valid, true);
});

test("6b. an ADDRESS_ONLY_QUERY target never accepts a NAME_PLUS_ADDRESS_QUERY fixture, and vice versa", () => {
  const venue = baseVenue();
  const namePlusAddressFixture = {
    venue_id: venue.venue_id,
    query_strategy: "NAME_PLUS_ADDRESS_QUERY",
    query_address: venue.address,
    canonical_name: venue.canonical_name,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const asAddressOnly = validateCacheIdentity(namePlusAddressFixture, { venue_id: venue.venue_id }, venue);
  assert.equal(asAddressOnly.valid, false);
  assert.ok(asAddressOnly.failures.includes("query_strategy"));

  const addressOnlyFixture = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const asNamePlusAddress = validateCacheIdentity(
    addressOnlyFixture,
    { venue_id: venue.venue_id, strategy: "NAME_PLUS_ADDRESS_QUERY" },
    venue,
  );
  assert.equal(asNamePlusAddress.valid, false);
  assert.ok(asNamePlusAddress.failures.includes("query_strategy"));
});

test("a pre-existing bare ADDRESS_ONLY_QUERY fixture (no query_strategy field at all) still validates as ADDRESS_ONLY_QUERY — backwards compatible", () => {
  const venue = baseVenue();
  const legacyFixture = {
    venue_id: venue.venue_id,
    query_address: venue.address,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(legacyFixture, { venue_id: venue.venue_id }, venue);
  assert.equal(result.valid, true);
});

test("7. a stale canonical_name invalidates a NAME_PLUS_ADDRESS_QUERY cache", () => {
  const venue = baseVenue({ canonical_name: "Teatro Campo Alegre (renamed)" });
  const fixture = {
    venue_id: venue.venue_id,
    query_strategy: "NAME_PLUS_ADDRESS_QUERY",
    query_address: venue.address,
    canonical_name: "Teatro Campo Alegre", // stale, pre-rename
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const result = validateCacheIdentity(fixture, { venue_id: venue.venue_id, strategy: "NAME_PLUS_ADDRESS_QUERY" }, venue);
  assert.equal(result.valid, false);
  assert.ok(result.failures.includes("canonical_name"));
});

test("8. a stale address invalidates BOTH strategies' cache", () => {
  const venue = baseVenue({ address: "Rua Nova, 4150-000 Porto" });
  const staleAddressOnly = {
    venue_id: venue.venue_id,
    query_address: "Rua das Estrelas, 4150-762 Porto", // pre-edit address
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const staleNamePlusAddress = {
    venue_id: venue.venue_id,
    query_strategy: "NAME_PLUS_ADDRESS_QUERY",
    query_address: "Rua das Estrelas, 4150-762 Porto",
    canonical_name: venue.canonical_name,
    provider: "NOMINATIM_OSM",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
  };
  const a = validateCacheIdentity(staleAddressOnly, { venue_id: venue.venue_id }, venue);
  const b = validateCacheIdentity(staleNamePlusAddress, { venue_id: venue.venue_id, strategy: "NAME_PLUS_ADDRESS_QUERY" }, venue);
  assert.equal(a.valid, false);
  assert.ok(a.failures.includes("query_address"));
  assert.equal(b.valid, false);
  assert.ok(b.failures.includes("query_address"));
});

// -- geocodeOneVenue under strategy NAME_PLUS_ADDRESS_QUERY (offline, cache-hit only). --

async function makeTempWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "botm-name-plus-address-test-"));
  const cacheDir = join(dir, "cache");
  await mkdir(cacheDir, { recursive: true });
  return { dir, cacheDir };
}

async function writeRegistry(dir, venues) {
  const registryPath = join(dir, "test-registry.json");
  await writeFile(registryPath, JSON.stringify({ region: "Test", venues }, null, 2));
  return registryPath;
}

async function writeNamePlusAddressCacheFixture(cacheDir, venueId, candidates, overrides = {}) {
  const fixture = {
    venue_id: venueId,
    query_strategy: "NAME_PLUS_ADDRESS_QUERY",
    query: "Teatro Campo Alegre, Rua das Estrelas, 4150-762 Porto",
    query_address: "Rua das Estrelas, 4150-762 Porto",
    canonical_name: "Teatro Campo Alegre",
    request_params: { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" },
    request_url: "https://nominatim.openstreetmap.org/search?q=test",
    provider: "NOMINATIM_OSM",
    retrieved_at: "2026-08-24T00:00:00.000Z",
    http_status: 200,
    candidates,
    ...overrides,
  };
  await writeFile(join(cacheDir, `${venueId}--name-plus-address.json`), JSON.stringify(fixture, null, 2));
  return fixture;
}

function nameAddressOnlyVenue(overrides = {}) {
  return baseVenue({ location_status: "ADDRESS_ONLY", ...overrides });
}

test("1. NAME_PLUS_ADDRESS_QUERY requires an existing canonical Venue — a missing venue is SKIPPED, never fabricated", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, []);

  const result = await geocodeOneVenue(
    { venue_id: "venue-does-not-exist", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "VENUE_NOT_FOUND_IN_REGISTRY");
});

test("2. canonical_name is required for NAME_PLUS_ADDRESS_QUERY — a venue missing it is SKIPPED, never queried on address alone", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("must never query live when canonical_name is missing");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [nameAddressOnlyVenue({ canonical_name: null })]);
  const result = await geocodeOneVenue(
    { venue_id: "venue-porto-teatro-campo-alegre", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.equal(result.reason, "NO_CANONICAL_NAME");
});

test("3. an evidenced official address is required for NAME_PLUS_ADDRESS_QUERY too (shared eligibility gates)", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const noAddress = await writeRegistry(dir, [nameAddressOnlyVenue({ address: null })]);
  const r1 = await geocodeOneVenue(
    { venue_id: "venue-porto-teatro-campo-alegre", registryPath: noAddress },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(r1.outcome, "SKIPPED");
  assert.equal(r1.reason, "NO_CANONICAL_ADDRESS");

  const noEvidence = await writeRegistry(dir, [nameAddressOnlyVenue({ evidence: [] })]);
  const r2 = await geocodeOneVenue(
    { venue_id: "venue-porto-teatro-campo-alegre", registryPath: noEvidence },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(r2.outcome, "SKIPPED");
  assert.equal(r2.reason, "ADDRESS_NOT_EVIDENCE_BACKED");
});

test("18/19. a cached, accepted NAME_PLUS_ADDRESS_QUERY candidate becomes GEOCODED with numeric, in-range coordinates, never re-querying live", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("live network must never be called when a cache fixture already exists");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registryPath = await writeRegistry(dir, [nameAddressOnlyVenue()]);
  await writeNamePlusAddressCacheFixture(cacheDir, "venue-porto-teatro-campo-alegre", [theatreCandidate()]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-porto-teatro-campo-alegre", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );

  assert.equal(result.outcome, "GEOCODED");
  assert.equal(result.used_cache, true);
  assert.equal(Number.isFinite(result.latitude), true);
  assert.ok(result.latitude >= -90 && result.latitude <= 90);
  assert.ok(result.longitude >= -180 && result.longitude <= 180);
  assert.equal(result.provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
  assert.equal(result.provenance.query_strategy, "NAME_PLUS_ADDRESS_QUERY");
  assert.equal(result.provenance.query_name, "Teatro Campo Alegre");

  const updated = JSON.parse(await readFile(registryPath, "utf8"));
  const venue = updated.venues.find((v) => v.venue_id === "venue-porto-teatro-campo-alegre");
  assert.equal(venue.location_status, "GEOCODED");
  // 20. never CONFIRMED.
  assert.notEqual(venue.location_status, "CONFIRMED");
  assert.equal(validateVenue(venue).length, 0, "the resulting Venue must still satisfy the shared contract");
});

test("18b. non-numeric/out-of-range provider coordinates are rejected, never geocoded", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [nameAddressOnlyVenue()]);
  await writeNamePlusAddressCacheFixture(cacheDir, "venue-porto-teatro-campo-alegre", [
    theatreCandidate({ lat: "not-a-number", lon: "-8.6" }),
  ]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-porto-teatro-campo-alegre", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(result.outcome, "LEFT_ADDRESS_ONLY");
  assert.equal(result.reason, "INVALID_NUMERIC_COORDINATES_FROM_PROVIDER");
});

test("9b. a road-only NAME_PLUS_ADDRESS_QUERY response leaves the venue ADDRESS_ONLY (offline, cache-hit)", async (t) => {
  const { dir, cacheDir } = await makeTempWorkspace();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registryPath = await writeRegistry(dir, [nameAddressOnlyVenue()]);
  await writeNamePlusAddressCacheFixture(cacheDir, "venue-porto-teatro-campo-alegre", [
    theatreCandidate({ category: "highway", type: "residential", addresstype: "road" }),
  ]);

  const result = await geocodeOneVenue(
    { venue_id: "venue-porto-teatro-campo-alegre", registryPath },
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(result.outcome, "LEFT_ADDRESS_ONLY");
  assert.equal(result.reason, "NO_CANDIDATE_PASSED_ALL_CHECKS");

  const updated = JSON.parse(await readFile(registryPath, "utf8"));
  const venue = updated.venues.find((v) => v.venue_id === "venue-porto-teatro-campo-alegre");
  assert.equal(venue.location_status, "ADDRESS_ONLY");
  assert.equal(venue.latitude, null);
});

// -- 21. Casa da Música is untouched. ----------------------------------------

test("21. Casa da Música's committed coordinates remain exactly 41.1589025, -8.6307748, still ADDRESS_ONLY_QUERY-sourced, and geocodeOneVenue under NAME_PLUS_ADDRESS skips it as not-ADDRESS_ONLY", async (t) => {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  const casaDaMusica = registry.venues.find((v) => v.venue_id === "venue-porto-casa-da-musica");
  assert.ok(casaDaMusica);
  assert.equal(casaDaMusica.latitude, 41.1589025);
  assert.equal(casaDaMusica.longitude, -8.6307748);
  assert.equal(casaDaMusica.location_status, "GEOCODED");
  assert.equal(casaDaMusica.coordinate_provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");

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
    { root: dir, cacheDir, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
  );
  assert.equal(result.outcome, "SKIPPED");
  assert.match(result.reason, /not ADDRESS_ONLY/);
});

// -- 22. BOTA's bad ICS GEO stays completely unrelated to the new strategy too. --

test("22. the NAME_PLUS_ADDRESS_QUERY built for BOTA's canonical name+address never contains the bad ICS GEO numbers", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const bota = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  assert.ok(bota);
  const query = buildNamePlusAddressQuery(bota.canonical_name, bota.address);
  assert.ok(!query.includes("40.720756"));
  assert.ok(!query.includes("74.000761"));
  const url = buildNominatimSearchUrl(query);
  assert.ok(!url.includes("40.720756"));
  assert.ok(!url.includes("74.000761"));
});

// -- run-name-plus-address.mjs orchestration helpers. ------------------------

test("8 (bounded target set). isEligibleForSecondaryStrategy requires ADDRESS_ONLY + canonical_name + address + evidence", () => {
  assert.equal(isEligibleForSecondaryStrategy(baseVenue()), true);
  assert.equal(isEligibleForSecondaryStrategy(baseVenue({ location_status: "GEOCODED" })), false);
  assert.equal(isEligibleForSecondaryStrategy(baseVenue({ canonical_name: "" })), false);
  assert.equal(isEligibleForSecondaryStrategy(baseVenue({ address: null })), false);
  assert.equal(isEligibleForSecondaryStrategy(baseVenue({ evidence: [] })), false);
});

test("classifyOutcome distinguishes road-only/no-result/ambiguous/postcode-conflict/name-conflict/acceptance for reporting", () => {
  assert.equal(classifyOutcome({ status: "ACCEPTED" }), "BUILDING_OR_VENUE_SPECIFIC_HIT");
  assert.equal(classifyOutcome({ status: "REJECTED", reason: "NO_CANDIDATES_RETURNED" }), "NO_RESULT");
  assert.equal(classifyOutcome({ status: "REJECTED", reason: "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED" }), "AMBIGUOUS");
  assert.equal(
    classifyOutcome({
      status: "REJECTED",
      reason: "NO_CANDIDATE_PASSED_ALL_CHECKS",
      evaluated: [{ checks: { country: true, city: true, postcode: true, houseNumber: true, specificEnough: false } }],
    }),
    "ROAD_OR_NON_SPECIFIC_ONLY",
  );
  assert.equal(
    classifyOutcome({
      status: "REJECTED",
      reason: "NO_CANDIDATE_PASSED_ALL_CHECKS",
      evaluated: [{ checks: { country: true, city: true, postcode: false, houseNumber: true, specificEnough: true } }],
    }),
    "POSTCODE_CONFLICT",
  );
});

// -- 4/28. the geocoding modules never touch Observations or the resolver. --

test("4. neither match-address.mjs, nominatim.mjs, run.mjs, nor run-name-plus-address.mjs ever reference Observation-only fields, so an UNRESOLVED Observation's free text can never enter this pipeline", async () => {
  const files = [
    new URL("../ingestion/geocoding/run.mjs", import.meta.url),
    new URL("../ingestion/geocoding/nominatim.mjs", import.meta.url),
    new URL("../ingestion/geocoding/match-address.mjs", import.meta.url),
    new URL("../ingestion/geocoding/run-name-plus-address.mjs", import.meta.url),
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.ok(!text.includes("observation/contract"), `${file} must never import the Observation contract`);
    assert.ok(!text.includes("ics_geo_untrusted"), `${file} must never reference ics_geo_untrusted`);
  }
});

test("27/28. run-name-plus-address.mjs never imports or writes venues/source-venue-mappings.json or ingestion/venue/resolver.mjs's admission machinery", async () => {
  const text = await readFile(new URL("../ingestion/geocoding/run-name-plus-address.mjs", import.meta.url), "utf8");
  assert.ok(!text.includes("source-venue-mappings"));
  assert.ok(!text.includes("resolveViaExplicitMappings"));
  assert.ok(!text.includes("resolveFromMappings"));
});
