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

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-AND-DISCOVERY-CORRECTION-01 — a
// real Manchester calibration run proved two GENERIC gaps (reusable for
// every future city, not Manchester-specific):
//
//   1. querying `node` only, never `way`/`relation`, silently misses every
//      venue OSM maps as a building outline rather than a point — this is
//      the common representation for substantial venues (a real
//      calibration run found Bridgewater Hall and Albert Hall Manchester
//      both mapped as `way`s, invisible to the old node-only query even
//      though Bridgewater Hall carries the exact same amenity=theatre tag
//      the query already asked for). Fixed generically below by querying
//      `nwr` (node+way+relation) instead of `node`.
//   2. the tag clause set itself was missing `amenity=events_venue` (the
//      modern OSM tag for purpose-built event/concert venues — real data
//      showed a major venue mapped under exactly this tag and no other)
//      and `leisure=stadium` (the standard tag for arenas, which
//      regularly host major touring concerts alongside sport).
const TAG_CLAUSES = [
  ["amenity", "nightclub"],
  ["amenity", "theatre"],
  ["amenity", "arts_centre"],
  ["amenity", "community_centre"],
  ["amenity", "events_venue"],
  ["leisure", "stadium"],
  ["live_music", "yes"],
  ["music_venue", "yes"],
];

export function buildOverpassQuery({ lat, lon, radiusMeters = DEFAULT_RADIUS_METERS, timeoutSeconds = 25 }) {
  const clauses = TAG_CLAUSES.map(([key, value]) => `  nwr["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`).join("\n");
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

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-AND-DISCOVERY-CORRECTION-01 —
// deterministic, tag-evidenced priority tiers (never AI, never popularity,
// never a hardcoded venue name). Lower number = tried first.
//   0: an explicit OSM music signal (live_music=yes or music_venue=yes) —
//      the strongest, most direct evidence this is actually a gig venue.
//   1: a dedicated entertainment/event venue category (nightclub, theatre,
//      arts_centre, events_venue, or a stadium/arena, which regularly
//      hosts major touring concerts) without an explicit music tag.
//   2: everything else that still cleared the discovery query (e.g. a
//      community_centre, whose primary purpose is usually NOT a gig
//      programme even though it occasionally hosts one).
const MUSIC_SIGNAL = /\b(live_music|music_venue)=yes\b/;
const DEDICATED_VENUE_TYPE = /\bamenity=(nightclub|theatre|arts_centre|events_venue)\b|\bleisure=stadium\b/;

export function candidateTier(candidate) {
  const category = candidate.reported_category || "";
  if (MUSIC_SIGNAL.test(category)) return 0;
  if (DEDICATED_VENUE_TYPE.test(category)) return 1;
  return 2;
}

function normaliseName(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * De-duplicate parsed candidates — both exact re-discovery (same
 * candidate_id) and the same physical venue represented twice under a
 * DIFFERENT OSM element type (e.g. a `node` and a `way` for the same real
 * place, now both discoverable since buildOverpassQuery queries `nwr`) —
 * then prioritise deterministically by candidateTier() within the
 * website-tagged group. A candidate with no website tag is still
 * included (up to the cap) so the resulting defer-reason distribution
 * honestly reflects what OSM actually has, not just the easiest subset.
 * `Array.prototype.sort` is spec-guaranteed stable, so within a tier the
 * original (Overpass response) order is preserved — no extra, unevidenced
 * ordering signal is introduced.
 */
export function selectDiscoveryCandidates(candidates, { limit = 15 } = {}) {
  const seenIds = new Set();
  const seenNames = new Map(); // normalised name -> the kept candidate, so a website-tagged duplicate always wins over a website-less one
  const deduped = [];
  for (const candidate of candidates) {
    if (seenIds.has(candidate.candidate_id)) continue;
    seenIds.add(candidate.candidate_id);

    const key = normaliseName(candidate.reported_name);
    const existing = seenNames.get(key);
    if (existing) {
      if (!existing.reported_website && candidate.reported_website) {
        deduped[deduped.indexOf(existing)] = candidate;
        seenNames.set(key, candidate);
      }
      continue; // duplicate representation of the same named venue — keep only one
    }
    seenNames.set(key, candidate);
    deduped.push(candidate);
  }

  const withWebsite = deduped.filter((c) => c.reported_website).sort((a, b) => candidateTier(a) - candidateTier(b));
  const withoutWebsite = deduped.filter((c) => !c.reported_website);
  return [...withWebsite, ...withoutWebsite].slice(0, limit);
}

function entityTypeCounts(rawElements) {
  const counts = { node: 0, way: 0, relation: 0 };
  for (const element of rawElements ?? []) {
    if (element?.type in counts) counts[element.type] += 1;
  }
  return counts;
}

/**
 * Discover up to `limit` real OSM-tagged venue candidates around one
 * Wave-1 city's geocoded centre. Never throws for an ordinary Overpass
 * failure (timeout, non-2xx, malformed response) — returns an empty
 * candidate list with the error recorded instead, so one city's discovery
 * failure can never halt the wave.
 *
 * `limit` (default 15) is a RECONNAISSANCE bound, not a claim that a
 * city's easy Tier-1 estate has been exhausted once `limit` candidates
 * are attempted — a real Manchester calibration run found 71 named
 * candidates (32 with a website) within a single 6km radius, far more
 * than 15. Callers that want an actual Tier-1 harvest (rather than a
 * bounded reconnaissance pass) should pass a materially larger `limit`;
 * this function only enforces that whatever `limit` is chosen is applied
 * consistently and honestly reported (see `raw_stats` below), never
 * silently treated as "this is everything".
 */
export async function discoverCityCandidates(city, centre, { fetchOverpass = defaultFetchOverpass, radiusMeters = DEFAULT_RADIUS_METERS, limit = 15, retrievedAt = new Date().toISOString() } = {}) {
  const query = buildOverpassQuery({ lat: centre.lat, lon: centre.lon, radiusMeters });
  let raw;
  try {
    raw = await fetchOverpass(query);
  } catch (error) {
    return { candidates: [], error: String(error?.message ?? error), query, raw_stats: null };
  }

  let parsed;
  try {
    parsed = parseOverpassCandidates(raw, { city: city.name, country_code: city.country_code, retrieved_at: retrievedAt });
  } catch (error) {
    return { candidates: [], error: String(error?.message ?? error), query, raw_stats: null };
  }

  const rawStats = {
    ...entityTypeCounts(raw.elements),
    named_total: parsed.candidates.length,
    with_website: parsed.candidates.filter((c) => c.reported_website).length,
  };

  return { candidates: selectDiscoveryCandidates(parsed.candidates, { limit }), excluded: parsed.excluded, error: null, query, raw_stats: rawStats };
}
