#!/usr/bin/env node
// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — generates the
// compact, machine-readable research artifacts this package's brief
// (Phase 23) requires, computed entirely from already-persisted state
// (sources/uk.json, venues/uk.json, the run.mjs checkpoint files) — no
// new network calls, no new acquisition. Safe to run repeatedly; each
// run overwrites these specific files with a fresh, honest snapshot of
// whatever sources/uk.json currently contains.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { approximateNation } from "../uk-national-discovery/coverage-plan.mjs";
import { extractCandidateWebsite } from "./extract-candidate-urls.mjs";
import { deriveSourceId } from "./registry-entries.mjs";
import { loadSourceCheckpoints } from "./checkpoint.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RESEARCH_DIR = "research/programme-acquisition/uk-national-01";

async function loadJson(relativePath) {
  return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
}

async function loadJsonOrDefault(relativePath, fallback) {
  try {
    return await loadJson(relativePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function saveJson(relativePath, data) {
  const fullPath = resolve(ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** One of Phase 2's exact required states for every canonical UK venue. */
function venueSourceState(venue, sourceEntry, checkpoint) {
  if (!sourceEntry) {
    if (checkpoint?.status === "SKIPPED_SHARED_WEBSITE") return "REVIEW_REQUIRED";
    return "NO_SOURCE_FOUND";
  }
  if (sourceEntry.monitoring_status === "TECHNICAL_PATH_PROVEN") return "OFFICIAL_PROGRAMME_FOUND";
  if (sourceEntry.monitoring_status === "BLOCKED") return "OFFICIAL_SITE_FOUND_NO_PROGRAMME";
  if (checkpoint?.decision_status === "HUMAN_REVIEW") return "REVIEW_REQUIRED";
  if (sourceEntry.monitoring_status === "UNSUITABLE_AUTOMATION") return "OFFICIAL_SITE_FOUND_NO_PROGRAMME";
  return "OFFICIAL_SITE_FOUND_NO_PROGRAMME";
}

async function main({ runId = "uk-national-01" } = {}) {
  const ukVenues = await loadJson("venues/uk.json");
  const sourceRegistry = await loadJsonOrDefault("sources/uk.json", { entries: [] });
  const sourcesById = new Map(sourceRegistry.entries.map((entry) => [entry.id, entry]));
  const checkpoints = await loadSourceCheckpoints(runId, { root: ROOT });

  // ---- venue-source-census.json (Phase 2) ----
  const census = [];
  const stateCounts = {};
  let unexplained = 0;
  for (const venue of ukVenues.venues) {
    const sourceId = deriveSourceId(venue.venue_id);
    const entry = sourcesById.get(sourceId);
    const checkpoint = checkpoints.get(sourceId);
    const candidate = extractCandidateWebsite(venue);
    const state = venueSourceState(venue, entry, checkpoint);
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
    if (!candidate && !checkpoint) unexplained += 1; // genuinely unaccounted for — should never happen given run.mjs's own NO_SOURCE_FOUND/SKIPPED_SHARED_WEBSITE checkpointing
    census.push({
      venue_id: venue.venue_id,
      canonical_name: venue.canonical_name,
      city: venue.city ?? null,
      nation: Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude) ? approximateNation(venue.latitude, venue.longitude) : "UNKNOWN",
      source_id: entry?.id ?? null,
      official_website: candidate?.url ?? null,
      state,
      acquisition_method: entry?.acquisition_method ?? null,
      proven_event_count: checkpoint?.proven_event_count ?? 0,
    });
  }
  await saveJson(`${RESEARCH_DIR}/venue-source-census.json`, {
    artifact_type: "UK_PROGRAMME_ACQUISITION_VENUE_SOURCE_CENSUS",
    total_venues: ukVenues.venues.length,
    state_counts: stateCounts,
    unexplained,
    venues: census,
  });

  // ---- platform-families.json + source-yield.json (Phase 3, 8, 17) ----
  const byMethod = new Map();
  for (const entry of sourceRegistry.entries) {
    const method = entry.acquisition_method ?? "UNKNOWN";
    if (!byMethod.has(method)) byMethod.set(method, { venues_attempted: 0, venues_successful: 0, event_counts: [] });
    const bucket = byMethod.get(method);
    bucket.venues_attempted += 1;
    if (entry.monitoring_status === "TECHNICAL_PATH_PROVEN") {
      bucket.venues_successful += 1;
      const checkpoint = checkpoints.get(entry.id);
      bucket.event_counts.push(checkpoint?.proven_event_count ?? 0);
    }
  }
  const platformFamilies = [...byMethod.entries()]
    .map(([method, bucket]) => {
      const sorted = [...bucket.event_counts].sort((a, b) => a - b);
      const median = sorted.length === 0 ? 0 : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      return {
        platform: method,
        venues_attempted: bucket.venues_attempted,
        venues_successful: bucket.venues_successful,
        total_event_observations: bucket.event_counts.reduce((a, b) => a + b, 0),
        median_events_per_successful_venue: median,
        existing_adapter: true, // every acquisition_method here is served by an already-existing generic collector — see ingestion/programme-acquisition/'s own family modules
      };
    })
    .sort((a, b) => b.venues_successful - a.venues_successful);
  await saveJson(`${RESEARCH_DIR}/platform-families.json`, { artifact_type: "UK_PROGRAMME_ACQUISITION_PLATFORM_FAMILIES", families: platformFamilies });
  await saveJson(`${RESEARCH_DIR}/source-yield.json`, {
    artifact_type: "UK_PROGRAMME_ACQUISITION_SOURCE_YIELD",
    best_by_venue_coverage: platformFamilies[0]?.platform ?? null,
    best_by_event_count: [...platformFamilies].sort((a, b) => b.total_event_observations - a.total_event_observations)[0]?.platform ?? null,
    by_platform: platformFamilies,
  });

  // ---- geographic coverage (Phase 18) ----
  const byNation = new Map();
  const byTown = new Map();
  for (const row of census) {
    const nationKey = row.nation;
    if (!byNation.has(nationKey)) byNation.set(nationKey, { venues_with_listings: 0, listings: 0, venue_only: 0 });
    const nationBucket = byNation.get(nationKey);
    if (row.proven_event_count > 0) { nationBucket.venues_with_listings += 1; nationBucket.listings += row.proven_event_count; } else { nationBucket.venue_only += 1; }

    const townKey = row.city ?? "UNKNOWN";
    if (!byTown.has(townKey)) byTown.set(townKey, { venues_with_listings: 0, venue_only: 0 });
    const townBucket = byTown.get(townKey);
    if (row.proven_event_count > 0) townBucket.venues_with_listings += 1; else townBucket.venue_only += 1;
  }
  const townsWithListings = [...byTown.entries()].filter(([, v]) => v.venues_with_listings > 0).map(([town]) => town).sort();
  const townsWithVenuesButZeroListings = [...byTown.entries()].filter(([, v]) => v.venues_with_listings === 0 && v.venue_only > 0).map(([town]) => town).sort();
  await saveJson(`${RESEARCH_DIR}/geographic-coverage.json`, {
    artifact_type: "UK_PROGRAMME_ACQUISITION_GEOGRAPHIC_COVERAGE",
    by_nation: Object.fromEntries(byNation),
    towns_with_listings_count: townsWithListings.length,
    towns_with_venues_but_zero_listings_count: townsWithVenuesButZeroListings.length,
    towns_with_listings_sample: townsWithListings.slice(0, 30),
  });

  return { stateCounts, platformFamilies: platformFamilies.length };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const runIdArg = process.argv.find((a) => a.startsWith("--run-id="))?.split("=")[1];
  main({ runId: runIdArg }).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
