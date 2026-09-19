// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — merges the three candidate
// providers (investigations, venue-estate, census) into one deduplicated,
// registry-cross-referenced pool. Never mutates any registry — read-only,
// matching this repository's own "canonical/public data must not be
// mutated during investigation" rule.
//
// Deduplication key is the SAME deterministic identity scheme the rest of
// this repository already uses: createVenueId(canonical_name, city)
// (ingestion/venue/contract.mjs). Priority order when two providers name
// the same venue: INVESTIGATION (rigorously governed, retained evidence)
// > VENUE_ESTATE > CENSUS (raw discovery hint) — first-seen wins.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createVenueId } from "../venue/contract.mjs";
import { normaliseWebsite } from "../../sources/registry/validate.mjs";
import { deriveSourceId } from "./contract.mjs";
import { listKnownCities } from "./city-registry.mjs";
import { loadInvestigationCandidates } from "./candidate-sources/investigations.mjs";
import { loadVenueEstateCandidates } from "./candidate-sources/venue-estate.mjs";
import { loadCensusCandidates } from "./candidate-sources/census.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Build the full, deduplicated, registry-cross-referenced candidate pool.
 * Each returned candidate carries `venue_id`/`source_id` (this
 * repository's own deterministic identity scheme) plus `existing_venue`
 * and `existing_source` (the real registry record, or null) so the
 * controller can tell "brand new" from "venue known, source missing" from
 * "already fully registered" without any further disk I/O.
 */
export async function buildCandidatePool({ root = ROOT } = {}) {
  const knownCities = await listKnownCities({ root });

  const [investigationCandidates, venueEstateCandidates, censusCandidates] = await Promise.all([
    loadInvestigationCandidates({ root, knownCities }),
    loadVenueEstateCandidates({ root, knownCities }),
    loadCensusCandidates({ root, knownCities }),
  ]);

  const raw = [...investigationCandidates, ...venueEstateCandidates, ...censusCandidates];

  const registryCache = new Map();
  async function getRegistries(cityKey) {
    if (!cityKey) return null;
    if (registryCache.has(cityKey)) return registryCache.get(cityKey);
    const city = knownCities.find((c) => c.city_key === cityKey);
    if (!city) return null;
    // NOTE: venues/<city>.json's array key is "venues"; sources/<city>.json's is "entries" — genuinely different shapes, not a typo.
    const venues = (await readJsonSafe(city.venues_registry_path))?.venues ?? [];
    const sources = (await readJsonSafe(city.sources_registry_path))?.entries ?? [];
    const result = { venues, sources, city };
    registryCache.set(cityKey, result);
    return result;
  }

  const mappings = (await readJsonSafe(resolve(root, "venues/source-venue-mappings.json")))?.entries ?? [];

  const byVenueId = new Map();
  for (const candidate of raw) {
    if (!candidate.city || !candidate.canonical_name) continue; // no stable identity to key on at all — not even trackable as a deferred candidate
    const venueId = createVenueId(candidate.canonical_name, candidate.city);
    if (byVenueId.has(venueId)) continue; // a higher-priority provider already claimed this venue

    const sourceId = deriveSourceId(candidate.city, candidate.canonical_name);
    const registries = await getRegistries(candidate.city_key);
    const existingVenue = registries?.venues.find((v) => v.venue_id === venueId) ?? null;

    // Two independent ways an already-registered source is found: (a) the
    // Lisbon/Porto venue-onboarding mapping file, or (b) — the GENERAL,
    // city-agnostic signal — a normalised official_website match against
    // this city's own source registry (the SAME identity check
    // sources/registry/validate.mjs's own validateRegistry() already uses
    // to reject duplicates). Established cities like Berlin/Paris/London
    // wire their acquisition via a hardcoded per-city source-id list
    // rather than the mapping file, so (a) alone would systematically miss
    // them — see this controller's own FINAL REPORT.
    const mappingRow = mappings.find((m) => m.venue_id === venueId) ?? null;
    const candidateWebsiteNormalised = normaliseWebsite(candidate.website);
    const existingSource =
      (mappingRow ? registries?.sources.find((s) => s.id === mappingRow.source_id) : null) ??
      (candidateWebsiteNormalised
        ? registries?.sources.find((s) => normaliseWebsite(s.official_website) === candidateWebsiteNormalised) ?? null
        : null) ??
      null;

    byVenueId.set(venueId, {
      ...candidate,
      venue_id: venueId,
      source_id: sourceId,
      has_admissible_location: existingVenue != null || typeof candidate.address === "string",
      existing_venue: existingVenue,
      existing_source: existingSource,
    });
  }

  return [...byVenueId.values()].sort((a, b) => a.venue_id.localeCompare(b.venue_id));
}

export { ROOT as CANDIDATE_POOL_ROOT };
