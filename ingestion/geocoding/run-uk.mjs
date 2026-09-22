#!/usr/bin/env node
// BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 — the United
// Kingdom sibling of VENUE-GEOCODING-01/VENUE-LOCATION-RESOLUTION-02/03's
// geocode:venues family, targeting venues/uk.json instead of
// venues/lisbon.json / venues/porto.json.
//
// Deliberately a SEPARATE file from ingestion/geocoding/run.mjs, never a
// modification of it: run.mjs's geocodeOneVenue() hardcodes
// countrycodes="pt" throughout (REQUEST_PARAMS, validateCacheIdentity's
// own request_params checks, STRUCTURED_POI_FIXED_PARAMS defaults) and
// unconditionally requires a non-empty venue.address before attempting
// ANY strategy — a real constraint for this project's existing Portugal/
// Spain/Germany/France venues (which always start ADDRESS_ONLY with an
// evidenced address), but wrong for the UK major-event census, where most
// venues (research/major-event-venues/uk-major-event-census-01/venues.json:
// 321/855 have an address at all) have none. Reusing run.mjs unmodified
// keeps every existing, already-proven country's geocoding behaviour and
// tests completely untouched; this file reuses only the genuinely
// country-agnostic pieces — ingestion/geocoding/nominatim.mjs's
// searchNominatimLive/searchNominatimStructuredLive/buildStructuredPoiFields
// (already parameterised for country/countrycodes and an optional address
// by this same package) and ingestion/geocoding/match-address.mjs's
// selectGeocodeMatch/selectNamePlusAddressMatch/selectStructuredPoiMatch
// (already accept a countryCode option) — unchanged.
//
// Strategy ladder per venue (mirrors the existing three-strategy
// escalation exactly, just GB-parameterised):
//   1. ADDRESS_ONLY_QUERY       - only if venue.address is non-empty
//   2. NAME_PLUS_ADDRESS_QUERY  - only if venue.address is non-empty AND
//                                 strategy 1 was REJECTED
//   3. STRUCTURED_POI_QUERY     - always attempted if strategies 1/2 don't
//                                 apply or were REJECTED (address is
//                                 OPTIONAL for this strategy — the primary
//                                 path for the majority of census venues,
//                                 which have no address at all)
// First ACCEPTED match wins; a venue rejected by every applicable strategy
// stays exactly as it was (ADDRESS_ONLY or UNRESOLVED) — never guessed.
//
// This package's brief explicitly requires the ENTIRE selected in-scope
// estate to be processed in one run ("Do NOT stop after 10/20/50/100...
// Process the entire selected in-scope census estate") — so, unlike
// ingestion/venue-onboarding/run.mjs's bounded-geocoding.mjs (a 15-request
// cap sized for a small per-run trial), this script has NO artificial
// request cap. It still respects Nominatim's rate limit completely (every
// live call funnels through nominatim.mjs's single shared, serialized,
// >=1100ms-spaced request queue — never Promise.all, never concurrent),
// and every live response is cached to disk before any accept/reject
// decision, so a killed/resumed run never repeats an already-answered
// query.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  searchNominatimLive,
  searchNominatimStructuredLive,
  buildNamePlusAddressQuery,
  buildStructuredPoiFields,
  NOMINATIM_USER_AGENT,
} from "./nominatim.mjs";
import { selectGeocodeMatch, selectNamePlusAddressMatch, selectStructuredPoiMatch } from "./match-address.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CACHE_DIR = resolve(ROOT, "fixtures/geocoding/nominatim");
const UK_REGISTRY_PATH = "venues/uk.json";
const UK_REQUEST_PARAMS = { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "gb" };
const UK_COUNTRY = "United Kingdom";
const UK_COUNTRY_CODE = "gb";

export const UK_QUERY_STRATEGIES = Object.freeze({
  ADDRESS_ONLY: "ADDRESS_ONLY_QUERY",
  NAME_PLUS_ADDRESS: "NAME_PLUS_ADDRESS_QUERY",
  STRUCTURED_POI: "STRUCTURED_POI_QUERY",
});

function cacheFixturePath(venueId, cacheDir, strategy) {
  const suffix =
    strategy === UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS
      ? "--uk-name-plus-address"
      : strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI
        ? "--uk-structured-poi"
        : "--uk-address-only";
  return resolve(cacheDir, `${venueId}${suffix}.json`);
}

export async function loadCachedUkFixture(venueId, cacheDir, strategy) {
  try {
    return JSON.parse(await readFile(cacheFixturePath(venueId, cacheDir, strategy), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function saveUkFixture(venueId, fixture, cacheDir, strategy) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFixturePath(venueId, cacheDir, strategy), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
}

/**
 * A UK cache fixture is reused only when it still matches this venue's
 * CURRENT identity — the same fail-closed discipline as
 * ingestion/geocoding/run.mjs's validateCacheIdentity(), GB-scoped: an
 * edited canonical_name/address must never be silently answered by a
 * stale fixture.
 */
export function validateUkCacheIdentity(fixture, venue, strategy) {
  const failures = [];
  if (!fixture || typeof fixture !== "object") return { valid: false, failures: ["MISSING_FIXTURE"] };
  if (fixture.venue_id !== venue.venue_id) failures.push("venue_id");
  if (fixture.query_strategy !== strategy) failures.push("query_strategy");
  if ((fixture.query_address ?? null) !== (venue.address ?? null)) failures.push("query_address");
  if (fixture.canonical_name !== venue.canonical_name) failures.push("canonical_name");
  if (fixture.provider !== "NOMINATIM_OSM") failures.push("provider");
  return { valid: failures.length === 0, failures };
}

async function attemptStrategy(venue, strategy, { refresh, cacheDir }) {
  let fixture = refresh ? null : await loadCachedUkFixture(venue.venue_id, cacheDir, strategy);
  let usedCache = false;

  if (fixture) {
    const identity = validateUkCacheIdentity(fixture, venue, strategy);
    if (identity.valid) {
      usedCache = true;
    } else {
      console.log(`  cached UK fixture for ${venue.venue_id} (${strategy}) failed identity validation (${identity.failures.join(", ")}) — requerying live`);
      fixture = null;
    }
  }

  if (!fixture) {
    if (strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI) {
      const structuredFields = buildStructuredPoiFields(venue.canonical_name, venue.address, venue.municipality ?? venue.city);
      console.log(`  querying Nominatim live (UK structured POI) for ${venue.venue_id}: ${JSON.stringify(structuredFields)} ...`);
      const result = await searchNominatimStructuredLive(structuredFields, { country: UK_COUNTRY, countrycodes: UK_COUNTRY_CODE });
      fixture = {
        venue_id: venue.venue_id,
        query_strategy: strategy,
        query: `STRUCTURED: ${JSON.stringify(structuredFields)}`,
        query_address: venue.address ?? null,
        canonical_name: venue.canonical_name,
        structured_query: structuredFields,
        request_params: { ...UK_REQUEST_PARAMS, ...structuredFields, country: UK_COUNTRY },
        request_url: result.url,
        user_agent: NOMINATIM_USER_AGENT,
        provider: "NOMINATIM_OSM",
        retrieved_at: result.retrieved_at,
        http_status: result.status,
        candidates: result.candidates,
      };
    } else {
      const query = strategy === UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS ? buildNamePlusAddressQuery(venue.canonical_name, venue.address) : venue.address;
      console.log(`  querying Nominatim live (UK ${strategy}) for ${venue.venue_id}: "${query}" ...`);
      const result = await searchNominatimLive(query, UK_REQUEST_PARAMS);
      fixture = {
        venue_id: venue.venue_id,
        query_strategy: strategy,
        query,
        query_address: venue.address ?? null,
        canonical_name: venue.canonical_name,
        request_params: UK_REQUEST_PARAMS,
        request_url: result.url,
        user_agent: NOMINATIM_USER_AGENT,
        provider: "NOMINATIM_OSM",
        retrieved_at: result.retrieved_at,
        http_status: result.status,
        candidates: result.candidates,
      };
    }
    await saveUkFixture(venue.venue_id, fixture, cacheDir, strategy);
  }

  const matchOptions = { countryCode: UK_COUNTRY_CODE };
  const match =
    strategy === UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS
      ? selectNamePlusAddressMatch(fixture.candidates, venue, matchOptions)
      : strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI
        ? selectStructuredPoiMatch(fixture.candidates, venue, matchOptions)
        : selectGeocodeMatch(fixture.candidates, venue, matchOptions);

  return { fixture, match, usedCache };
}

function provenanceFor(strategy, venue, fixture, candidate) {
  const base = {
    provider: "NOMINATIM_OSM",
    query_name: venue.canonical_name,
    query_address: fixture.query_address,
    result_osm_type: candidate.osm_type ?? null,
    result_osm_id: candidate.osm_id != null ? String(candidate.osm_id) : null,
    result_display_name: candidate.display_name ?? null,
    retrieved_at: fixture.retrieved_at,
  };
  if (strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI) {
    return { method: "STRUCTURED_POI_NAME_CITY_MATCH", query_strategy: strategy, structured_query: fixture.structured_query, ...base };
  }
  return { method: "GEOCODED_FROM_OFFICIAL_ADDRESS", query_strategy: strategy, ...base };
}

/**
 * Geocode (or leave unresolved) exactly ONE venue already present in
 * venues/uk.json, trying every applicable strategy in ladder order until
 * one is ACCEPTED. Mutates and persists venues/uk.json itself on success
 * — mirrors ingestion/geocoding/run.mjs's own geocodeOneVenue() contract
 * exactly, just GB-scoped and address-optional.
 */
export async function geocodeOneUkVenue(venueId, { refresh = false, root = ROOT, cacheDir = CACHE_DIR } = {}) {
  const registryFullPath = resolve(root, UK_REGISTRY_PATH);
  const registry = JSON.parse(await readFile(registryFullPath, "utf8"));
  const venue = registry.venues.find((v) => v.venue_id === venueId);

  if (!venue) return { venue_id: venueId, outcome: "SKIPPED", reason: "VENUE_NOT_FOUND_IN_REGISTRY" };
  if (venue.location_status === "CONFIRMED" || venue.location_status === "GEOCODED") {
    return { venue_id: venueId, outcome: "SKIPPED", reason: `location_status is already ${venue.location_status}` };
  }
  if (typeof venue.canonical_name !== "string" || venue.canonical_name.trim() === "") {
    return { venue_id: venueId, outcome: "SKIPPED", reason: "NO_CANONICAL_NAME" };
  }

  const hasAddress = typeof venue.address === "string" && venue.address.trim() !== "";
  const strategies = hasAddress
    ? [UK_QUERY_STRATEGIES.ADDRESS_ONLY, UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS, UK_QUERY_STRATEGIES.STRUCTURED_POI]
    : [UK_QUERY_STRATEGIES.STRUCTURED_POI];

  const attempts = [];
  for (const strategy of strategies) {
    const { fixture, match, usedCache } = await attemptStrategy(venue, strategy, { refresh, cacheDir });
    attempts.push({ strategy, reason: match.reason ?? null, used_cache: usedCache, candidate_count: fixture.candidates?.length ?? 0 });

    if (match.status !== "ACCEPTED") continue;

    const candidate = match.candidate;
    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);
    const validCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    if (!validCoordinates) {
      attempts[attempts.length - 1].reason = "INVALID_NUMERIC_COORDINATES_FROM_PROVIDER";
      continue;
    }

    const provenance = provenanceFor(strategy, venue, fixture, candidate);
    venue.latitude = latitude;
    venue.longitude = longitude;
    venue.location_status = "GEOCODED";
    venue.coordinate_provenance = provenance;
    venue.evidence = [
      ...(venue.evidence ?? []),
      {
        url: fixture.request_url,
        kind: "GEOCODED_NOMINATIM_RESULT",
        note:
          `BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01: deterministically accepted Nominatim/OSM ` +
          `${strategy} result — see fixtures/geocoding/nominatim/${venueId}${strategy === UK_QUERY_STRATEGIES.STRUCTURED_POI ? "--uk-structured-poi" : strategy === UK_QUERY_STRATEGIES.NAME_PLUS_ADDRESS ? "--uk-name-plus-address" : "--uk-address-only"}.json ` +
          `for the full cached response. Matched OSM feature: ${provenance.result_osm_type ?? "unknown"}/${provenance.result_osm_id ?? "unknown"}. ` +
          `This coordinate is GEOCODED, not first-party CONFIRMED — see ingestion/venue/contract.mjs's location_status contract.`,
      },
    ];

    await writeFile(registryFullPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    return { venue_id: venueId, outcome: "GEOCODED", latitude, longitude, provenance, attempts };
  }

  return { venue_id: venueId, outcome: "LEFT_UNGEOCODED", reason: attempts.at(-1)?.reason ?? "NO_STRATEGY_ACCEPTED", attempts };
}

function parseArgs(argv) {
  const args = { refresh: false };
  for (const arg of argv) {
    if (arg === "--refresh") args.refresh = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 geocode:venues:uk starting (${new Date().toISOString()})`);

  const registryFullPath = resolve(ROOT, UK_REGISTRY_PATH);
  const registry = JSON.parse(await readFile(registryFullPath, "utf8"));
  const targets = registry.venues.filter((v) => v.location_status === "ADDRESS_ONLY" || v.location_status === "UNRESOLVED").map((v) => v.venue_id);
  console.log(`  ${targets.length} target venue(s) (ADDRESS_ONLY or UNRESOLVED) out of ${registry.venues.length} total in venues/uk.json`);

  const results = [];
  for (const venueId of targets) {
    // Deliberately sequential/awaited — never Promise.all — every live
    // call still funnels through nominatim.mjs's own shared rate-limited
    // queue regardless, but this loop itself must never fire requests
    // concurrently either.
    const result = await geocodeOneUkVenue(venueId, { refresh: args.refresh });
    results.push(result);
    console.log(`  [${result.outcome}] ${result.venue_id}${result.reason ? `: ${result.reason}` : ""}`);
  }

  const geocoded = results.filter((r) => r.outcome === "GEOCODED").length;
  const leftUngeocoded = results.filter((r) => r.outcome === "LEFT_UNGEOCODED").length;
  const skipped = results.filter((r) => r.outcome === "SKIPPED").length;
  console.log(`\n=== geocode:venues:uk summary ===`);
  console.log(`  geocoded: ${geocoded}`);
  console.log(`  left ungeocoded (attempted, no acceptable match): ${leftUngeocoded}`);
  console.log(`  skipped: ${skipped}`);

  return { results, geocoded, leftUngeocoded, skipped };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
