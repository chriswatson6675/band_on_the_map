#!/usr/bin/env node
// VENUE-GEOCODING-01 — the one manual entry point this package adds:
// `npm run geocode:venues` (optionally `-- --region=lisbon` /
// `-- --region=porto` to filter, and `-- --refresh` to force a fresh
// live query even where a cached fixture already exists).
//
// A deliberate, bounded, developer-side, ONE-TIME enrichment operation
// for exactly the five ADDRESS_ONLY canonical Venues named in
// TARGET_VENUES below — never automatic, never scheduled, never run per-
// Observation/per-event, never part of the web frontend. See
// ingestion/geocoding/nominatim.mjs (the rate-limited provider adapter)
// and ingestion/geocoding/match-address.mjs (the fail-closed deterministic
// acceptance rules) for the two pieces this module orchestrates.
//
// A Venue may be geocoded ONLY if it already exists in a canonical Venue
// registry, is currently ADDRESS_ONLY, carries a non-null address, and
// that address is already backed by at least one evidence entry — never
// arbitrary Observation text, never an unresolved venue string, never a
// venue name alone (see geocodeOneVenue's eligibility checks below).
//
// Every live provider response is cached verbatim under
// fixtures/geocoding/nominatim/<venue_id>.json before any acceptance
// decision is made, and is never re-queried once cached unless --refresh
// is passed — this keeps repeated runs of this command from repeatedly
// hitting the public Nominatim service for the same five addresses.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { searchNominatimLive, NOMINATIM_USER_AGENT } from "./nominatim.mjs";
import { selectGeocodeMatch } from "./match-address.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE_DIR = resolve(ROOT, "fixtures/geocoding/nominatim");

// The bounded, restricted target set for VENUE-GEOCODING-01. Adding a
// venue here is an explicit, separately-scoped decision — this package
// does not silently widen it (Campo Alegre, Malaposta, Biblioteca D.
// Dinis and every other currently-unresolved/ADDRESS_ONLY venue are
// deliberately absent).
export const TARGET_VENUES = [
  { venue_id: "venue-lisboa-igreja-e-convento-da-graca", region: "lisbon", registryPath: "venues/lisbon.json" },
  { venue_id: "venue-lisboa-bota-anjos", region: "lisbon", registryPath: "venues/lisbon.json" },
  {
    venue_id: "venue-lisboa-village-underground-lisboa",
    region: "lisbon",
    registryPath: "venues/lisbon.json",
  },
  { venue_id: "venue-porto-casa-da-musica", region: "porto", registryPath: "venues/porto.json" },
  { venue_id: "venue-porto-teatro-rivoli", region: "porto", registryPath: "venues/porto.json" },
];

function parseArgs(argv) {
  const args = { region: null, refresh: false };
  for (const arg of argv) {
    const regionMatch = /^--region=(.+)$/.exec(arg);
    if (regionMatch) args.region = regionMatch[1];
    if (arg === "--refresh") args.refresh = true;
  }
  return args;
}

function cacheFixturePath(venueId, cacheDir) {
  return resolve(cacheDir, `${venueId}.json`);
}

async function loadCachedFixture(venueId, cacheDir) {
  try {
    return JSON.parse(await readFile(cacheFixturePath(venueId, cacheDir), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function saveFixture(venueId, fixture, cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFixturePath(venueId, cacheDir), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
}

async function loadRegistry(registryPath, root) {
  const fullPath = resolve(root, registryPath);
  return { fullPath, registry: JSON.parse(await readFile(fullPath, "utf8")) };
}

async function saveRegistry(fullPath, registry) {
  await writeFile(fullPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

const REQUEST_PARAMS = { format: "jsonv2", addressdetails: 1, limit: 5, countrycodes: "pt" };

/**
 * Geocode (or skip/reject) exactly one target venue. Exported for direct
 * testing; also called in a plain sequential loop by main() below — never
 * in parallel, per Nominatim's single-threaded usage requirement.
 *
 * `root`/`cacheDir` default to this repository's real paths but are
 * overridable so tests can exercise the full cache-hit orchestration path
 * against a disposable registry/cache without ever touching the real
 * venues/*.json or fixtures/geocoding/nominatim/*.json committed files.
 */
export async function geocodeOneVenue(target, { refresh = false, root = ROOT, cacheDir = CACHE_DIR } = {}) {
  const { fullPath, registry } = await loadRegistry(target.registryPath, root);
  const venue = registry.venues.find((v) => v.venue_id === target.venue_id);

  if (!venue) {
    return { venue_id: target.venue_id, outcome: "SKIPPED", reason: "VENUE_NOT_FOUND_IN_REGISTRY" };
  }
  if (venue.location_status !== "ADDRESS_ONLY") {
    return {
      venue_id: target.venue_id,
      outcome: "SKIPPED",
      reason: `location_status is ${venue.location_status}, not ADDRESS_ONLY`,
    };
  }
  if (typeof venue.address !== "string" || venue.address.trim() === "") {
    return { venue_id: target.venue_id, outcome: "SKIPPED", reason: "NO_CANONICAL_ADDRESS" };
  }
  if (!Array.isArray(venue.evidence) || venue.evidence.length === 0) {
    return { venue_id: target.venue_id, outcome: "SKIPPED", reason: "ADDRESS_NOT_EVIDENCE_BACKED" };
  }

  let fixture = refresh ? null : await loadCachedFixture(target.venue_id, cacheDir);
  const usedCache = Boolean(fixture);

  if (!fixture) {
    console.log(`  querying Nominatim live for ${target.venue_id}: "${venue.address}" ...`);
    const result = await searchNominatimLive(venue.address, REQUEST_PARAMS);
    fixture = {
      venue_id: target.venue_id,
      query_address: venue.address,
      request_params: REQUEST_PARAMS,
      request_url: result.url,
      user_agent: NOMINATIM_USER_AGENT,
      provider: "NOMINATIM_OSM",
      retrieved_at: result.retrieved_at,
      http_status: result.status,
      candidates: result.candidates,
    };
    await saveFixture(target.venue_id, fixture, cacheDir);
  } else {
    console.log(`  using cached fixture for ${target.venue_id} (pass --refresh to force a live requery)`);
  }

  const match = selectGeocodeMatch(fixture.candidates, venue);

  if (match.status !== "ACCEPTED") {
    return {
      venue_id: target.venue_id,
      outcome: "LEFT_ADDRESS_ONLY",
      reason: match.reason,
      query_address: fixture.query_address,
      candidate_count: fixture.candidates.length,
      used_cache: usedCache,
    };
  }

  const candidate = match.candidate;
  const latitude = Number(candidate.lat);
  const longitude = Number(candidate.lon);
  const validCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (!validCoordinates) {
    return {
      venue_id: target.venue_id,
      outcome: "LEFT_ADDRESS_ONLY",
      reason: "INVALID_NUMERIC_COORDINATES_FROM_PROVIDER",
      query_address: fixture.query_address,
      used_cache: usedCache,
    };
  }

  const provenance = {
    method: "GEOCODED_FROM_OFFICIAL_ADDRESS",
    provider: "NOMINATIM_OSM",
    query_address: fixture.query_address,
    result_osm_type: candidate.osm_type ?? null,
    result_osm_id: candidate.osm_id != null ? String(candidate.osm_id) : null,
    result_display_name: candidate.display_name ?? null,
    matched_postcode: candidate.address?.postcode ?? null,
    matched_city: candidate.address?.city ?? candidate.address?.town ?? candidate.address?.municipality ?? null,
    retrieved_at: fixture.retrieved_at,
  };

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
        `VENUE-GEOCODING-01: deterministically accepted Nominatim/OSM search result for this venue's own ` +
        `already-evidenced official address ("${fixture.query_address}") — see ` +
        `fixtures/geocoding/nominatim/${target.venue_id}.json for the full cached response. Matched OSM feature: ` +
        `${provenance.result_osm_type ?? "unknown"}/${provenance.result_osm_id ?? "unknown"}. This coordinate is ` +
        `GEOCODED, not first-party CONFIRMED — see ingestion/venue/contract.mjs's location_status contract.`,
    },
  ];

  await saveRegistry(fullPath, registry);

  return { venue_id: target.venue_id, outcome: "GEOCODED", latitude, longitude, provenance, used_cache: usedCache };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = TARGET_VENUES.filter((target) => !args.region || target.region === args.region);

  console.log(`VENUE-GEOCODING-01 geocode:venues starting (${new Date().toISOString()})`);
  if (args.region) console.log(`  region filter: ${args.region}`);
  if (args.refresh) console.log(`  --refresh: forcing fresh live queries even where a cache exists`);
  console.log(`  ${targets.length} target venue(s): ${targets.map((t) => t.venue_id).join(", ")}`);

  const results = [];
  for (const target of targets) {
    // Deliberately sequential/awaited — never Promise.all — to respect
    // Nominatim's single-threaded usage policy.
    const result = await geocodeOneVenue(target, { refresh: args.refresh });
    results.push(result);
    console.log(`  [${result.outcome}] ${result.venue_id}${result.reason ? `: ${result.reason}` : ""}`);
  }

  console.log(`\n=== geocode:venues summary ===`);
  for (const result of results) {
    console.log(`  ${result.venue_id}: ${result.outcome}${result.reason ? ` (${result.reason})` : ""}`);
  }

  return results;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
