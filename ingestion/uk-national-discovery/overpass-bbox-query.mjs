// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — bounding-box
// Overpass discovery for one coverage unit (ingestion/uk-national-discovery/
// coverage-plan.mjs). Complements, never replaces,
// ingestion/future-city-wave/overpass-discovery.mjs's point+radius query
// (appropriate for "sweep N named cities") — a national campaign instead
// needs "sweep every part of the map", which a radius-around-a-point
// query cannot express. Parsing a raw Overpass response into this
// repository's own VenueDiscoveryCandidate shape is entirely REUSED,
// unchanged, from ingestion/venue-discovery/providers/overpass.mjs's
// parseOverpassCandidates() — the same generic multi-source venue
// discovery framework every other provider already uses, never
// duplicated.
//
// Tag selection matches ingestion/future-city-wave/overpass-discovery.mjs's
// own TAG_CLAUSES (amenity=nightclub/theatre/arts_centre/community_centre,
// live_music=yes, music_venue=yes) PLUS two additive, explicitly-evidenced
// clauses for pubs/bars carrying live_music=yes — never bare
// amenity=pub/bar (this package's brief: noisy categories require
// EXPLICIT live-event relevance, never mere category membership).
//
// Politeness: every live request funnels through one shared,
// single-threaded, rate-limited queue (mirroring ingestion/geocoding/
// nominatim.mjs's exact discipline) — never concurrent Overpass requests,
// always spaced by MIN_REQUEST_INTERVAL_MS regardless of how many callers
// enqueue work.

import { parseOverpassCandidates } from "../venue-discovery/providers/overpass.mjs";

export const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
export const MIN_REQUEST_INTERVAL_MS = 2000;

// Exported (not just module-private) so any OTHER discovery mechanism
// querying the same governed tag semantics — e.g.
// ingestion/uk-national-bulk-osm/'s offline PBF extraction
// (BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02) — imports this
// exact single source of truth instead of maintaining its own copy that
// could silently drift from the live Overpass sweep's criteria.
export const TAG_CLAUSES = [
  ["amenity", "nightclub"],
  ["amenity", "theatre"],
  ["amenity", "arts_centre"],
  ["amenity", "community_centre"],
  ["live_music", "yes"],
  ["music_venue", "yes"],
];

// Explicit-relevance-only additions for otherwise-noisy categories — never
// bare amenity=pub/bar (see file header). Both require live_music=yes on
// the SAME element, so a candidate can only ever arrive here with genuine
// tagged evidence of a live-music programme, never from category alone.
export const EXPLICIT_RELEVANCE_CLAUSES = [
  [["amenity", "pub"], ["live_music", "yes"]],
  [["amenity", "bar"], ["live_music", "yes"]],
];

/**
 * Build the exact Overpass QL query for one bounding box. `nwr(...)`
 * (node/way/relation combined) rather than `node` alone, so a venue
 * mapped as a building outline (way) or a multi-building campus
 * (relation) is not silently missed — matching the hand-verified bbox
 * query precedent already retained at research/venue-discovery/berlin-01/
 * evidence/overpass-query.overpassql. `out center tags;` returns a usable
 * coordinate (a way/relation's own computed centre) and every tag, for
 * every element kind uniformly.
 */
export function buildOverpassBboxQuery({ south, west, north, east, timeoutSeconds = 60 }) {
  const bbox = `${south},${west},${north},${east}`;
  const singleTagClauses = TAG_CLAUSES.map(([key, value]) => `  nwr(${bbox})["${key}"="${value}"];`);
  const multiTagClauses = EXPLICIT_RELEVANCE_CLAUSES.map(
    (clauses) => `  nwr(${bbox})${clauses.map(([key, value]) => `["${key}"="${value}"]`).join("")};`,
  );
  const clauses = [...singleTagClauses, ...multiTagClauses].join("\n");
  return `[out:json][timeout:${timeoutSeconds}];\n(\n${clauses}\n);\nout center tags;`;
}

let lastRequestAt = 0;
let requestQueue = Promise.resolve();

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (lastRequestAt !== 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((res) => setTimeout(res, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

function enqueue(run) {
  const scheduled = requestQueue.then(run, run);
  requestQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

async function defaultFetchOverpass(query) {
  await waitForRateLimit();
  const response = await fetch(OVERPASS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "BandOnTheMap-UkNationalVenueDiscovery/0.1 (+https://github.com/chriswatson6675/band_on_the_map)",
    },
    body: query,
  });
  if (!response.ok) throw new Error(`Overpass API returned HTTP ${response.status}`);
  return response.json();
}

/**
 * Discover every OSM-tagged venue candidate inside one coverage unit's
 * bounding box. Never throws for an ordinary Overpass failure (timeout,
 * non-2xx, malformed response, rate limit) — returns an empty candidate
 * list with the error recorded instead, so one cell's failure can never
 * halt the national sweep (this package's brief: one Overpass tile
 * failure must not halt the campaign). Every live call is funnelled
 * through the shared rate-limited queue regardless of caller concurrency.
 */
export async function discoverCoverageUnitCandidates(unit, { fetchOverpass, retrievedAt = new Date().toISOString() } = {}) {
  const query = buildOverpassBboxQuery({ ...unit.bounds });
  const run = fetchOverpass ?? ((q) => enqueue(() => defaultFetchOverpass(q)));

  let raw;
  try {
    raw = await run(query);
  } catch (error) {
    return { candidates: [], excluded: [], error: String(error?.message ?? error), query };
  }

  let parsed;
  try {
    parsed = parseOverpassCandidates(raw, {
      city: unit.coverage_unit_id,
      country_code: "GB",
      retrieved_at: retrievedAt,
    });
  } catch (error) {
    return { candidates: [], excluded: [], error: String(error?.message ?? error), query };
  }

  return { candidates: parsed.candidates, excluded: parsed.excluded, error: null, query };
}
