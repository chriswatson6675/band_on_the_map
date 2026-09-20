// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — live OpenStreetMap
// Overpass discovery for one Wave-1 city, around its geocoded centre.
// Query construction + live fetch is the ONLY new capability this module
// adds; PARSING a raw Overpass response into this repository's own
// VenueDiscoveryCandidate shape is entirely REUSED, unchanged, from
// ingestion/venue-discovery/providers/overpass.mjs's parseOverpassCandidates()
// — the same generic multi-source venue discovery framework
// (BEATMAPPED-GENERIC-MULTISOURCE-VENUE-DISCOVERY-01) already merged to
// main, never duplicated.
//
// Tag selection matches that module's own category() recognition exactly
// (amenity=nightclub/theatre/arts_centre/community_centre, live_music=yes,
// music_venue=yes) so every discovered element is one this repository's
// existing candidate contract already classifies meaningfully.

import { parseOverpassCandidates } from "../venue-discovery/providers/overpass.mjs";

export const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
export const DEFAULT_RADIUS_METERS = 6000;

const TAG_CLAUSES = [
  ["amenity", "nightclub"],
  ["amenity", "theatre"],
  ["amenity", "arts_centre"],
  ["amenity", "community_centre"],
  ["live_music", "yes"],
  ["music_venue", "yes"],
];

export function buildOverpassQuery({ lat, lon, radiusMeters = DEFAULT_RADIUS_METERS, timeoutSeconds = 25 }) {
  const clauses = TAG_CLAUSES.map(([key, value]) => `  node["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`).join("\n");
  return `[out:json][timeout:${timeoutSeconds}];\n(\n${clauses}\n);\nout center;`;
}

async function defaultFetchOverpass(query) {
  const response = await fetch(OVERPASS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": "BandOnTheMap-FutureCityWave/0.1 (+https://github.com/chriswatson6675/band_on_the_map)" },
    body: query,
  });
  if (!response.ok) throw new Error(`Overpass API returned HTTP ${response.status}`);
  return response.json();
}

/**
 * De-duplicate parsed candidates and prioritise the ones a Tier-1 pass can
 * actually attempt: website-tagged candidates first, then the rest,
 * capped at `limit`. Never invents data — a candidate with no website tag
 * is still included (up to the cap) so the resulting defer-reason
 * distribution honestly reflects what OSM actually has, not just the
 * easiest subset.
 */
export function selectDiscoveryCandidates(candidates, { limit = 15 } = {}) {
  const seen = new Set();
  const deduped = candidates.filter((c) => {
    if (seen.has(c.candidate_id)) return false;
    seen.add(c.candidate_id);
    return true;
  });
  const withWebsite = deduped.filter((c) => c.reported_website);
  const withoutWebsite = deduped.filter((c) => !c.reported_website);
  return [...withWebsite, ...withoutWebsite].slice(0, limit);
}

/**
 * Discover up to `limit` real OSM-tagged venue candidates around one
 * Wave-1 city's geocoded centre. Never throws for an ordinary Overpass
 * failure (timeout, non-2xx, malformed response) — returns an empty
 * candidate list with the error recorded instead, so one city's discovery
 * failure can never halt the wave.
 */
export async function discoverCityCandidates(city, centre, { fetchOverpass = defaultFetchOverpass, radiusMeters = DEFAULT_RADIUS_METERS, limit = 15, retrievedAt = new Date().toISOString() } = {}) {
  const query = buildOverpassQuery({ lat: centre.lat, lon: centre.lon, radiusMeters });
  let raw;
  try {
    raw = await fetchOverpass(query);
  } catch (error) {
    return { candidates: [], error: String(error?.message ?? error), query };
  }

  let parsed;
  try {
    parsed = parseOverpassCandidates(raw, { city: city.name, country_code: city.country_code, retrieved_at: retrievedAt });
  } catch (error) {
    return { candidates: [], error: String(error?.message ?? error), query };
  }

  return { candidates: selectDiscoveryCandidates(parsed.candidates, { limit }), excluded: parsed.excluded, error: null, query };
}
