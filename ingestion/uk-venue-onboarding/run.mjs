#!/usr/bin/env node
// BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 — the one
// manual entry point this package adds: `npm run onboard:uk-venues`.
//
// Network-free pipeline (classification/dedup/registry-build only — live
// geocoding is a deliberately separate step, `npm run geocode:venues:uk`,
// see ingestion/geocoding/run-uk.mjs):
//
//   research/major-event-venues/uk-major-event-census-01/venues.json (855
//     UK major-event venues) + calendar-sources.json (989 retained
//     calendar-source records)
//   -> classify every venue (ingestion/uk-venue-onboarding/classification.mjs,
//      deterministic, evidence-cited, never AI judgement)
//   -> reconcile every IN_SCOPE_PUBLIC_PERFORMANCE_VENUE against every
//      EXISTING canonical Venue registry (ingestion/uk-venue-onboarding/
//      dedupe.mjs) — an existing canonical Venue is reused, never
//      duplicated under a second UK identity
//   -> build one canonical Venue (ADDRESS_ONLY or UNRESOLVED — never
//      coordinates) per new, non-duplicate in-scope venue
//      (ingestion/uk-venue-onboarding/build-registry.mjs)
//   -> write venues/uk.json
//   -> write a full accounting report artifact (every one of this
//      package's Phase 19 counts, retained rather than only printed)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyAllVenues, summariseClassification, SCOPE_CLASSIFICATIONS } from "./classification.mjs";
import { dedupeAgainstRegistries } from "./dedupe.mjs";
import { buildCanonicalUkVenues } from "./build-registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CENSUS_DIR = "research/major-event-venues/uk-major-event-census-01";
const UK_REGISTRY_PATH = "venues/uk.json";
const REPORT_PATH = `${CENSUS_DIR}/uk-onboarding-report.json`;

// Every EXISTING canonical Venue registry this package must dedupe
// against (this package's brief, Phase 3) — hardcoded and explicit,
// mirroring ingestion/venue-onboarding/run.mjs's own
// registryTargetForVenue() precedent, rather than a fragile directory
// glob that could silently pick up venues/manual-coordinates.json,
// venues/source-venue-mappings.json, or venues/candidate-research.json
// (none of which are `{ venues: [...] }` registries).
const EXISTING_REGISTRY_PATHS = ["venues/london.json", "venues/barcelona.json", "venues/berlin.json", "venues/lisbon.json", "venues/paris.json", "venues/porto.json"];

async function loadJson(relativePath) {
  return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
}

async function saveJson(relativePath, data) {
  const fullPath = resolve(ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function run() {
  console.log(`BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 onboard:uk-venues starting (${new Date().toISOString()})`);

  const census = await loadJson(`${CENSUS_DIR}/venues.json`);
  const calendarSourcesFile = await loadJson(`${CENSUS_DIR}/calendar-sources.json`);
  console.log(`  census: ${census.venues.length} UK major-event venues`);

  // ---- Phase 2: classification ----
  const classified = classifyAllVenues(census.venues, calendarSourcesFile.calendar_sources);
  const classificationSummary = summariseClassification(classified);
  console.log(`\n  classification counts:`);
  for (const classification of SCOPE_CLASSIFICATIONS) {
    console.log(`    ${classification}: ${classificationSummary.counts[classification]}`);
  }
  console.log(`    UNEXPLAINED: ${classificationSummary.unexplained}`);

  const inScope = classified.filter((entry) => entry.classification === "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE").map((entry) => entry.venue);
  console.log(`\n  selected IN_SCOPE_PUBLIC_PERFORMANCE_VENUE: ${inScope.length}`);

  // ---- Phase 3: dedup against every existing registry ----
  const registriesByPath = {};
  for (const path of EXISTING_REGISTRY_PATHS) {
    registriesByPath[path] = await loadJson(path);
  }
  const { duplicates, newVenues } = dedupeAgainstRegistries(inScope, registriesByPath);
  console.log(`\n  duplicates reused (already canonical elsewhere): ${duplicates.length}`);
  for (const dup of duplicates) {
    console.log(`    ${dup.census_venue_id} (${dup.canonical_name}) -> ${dup.existing_venue_id} [${dup.method}]`);
  }
  console.log(`  new venues to mint: ${newVenues.length}`);

  // ---- Phase 4: build canonical UK registry ----
  // If venues/uk.json already exists (a rerun), keep every existing entry
  // untouched (never re-mint, never overwrite an already-geocoded venue's
  // coordinates) and only append genuinely new venue_ids.
  let existingUkRegistry = { venues: [] };
  try {
    existingUkRegistry = await loadJson(UK_REGISTRY_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const existingUkIds = new Set(existingUkRegistry.venues.map((v) => v.venue_id));

  const { venues: builtVenues, collisions } = buildCanonicalUkVenues(newVenues);
  if (collisions.length > 0) {
    console.log(`\n  WARNING: ${collisions.length} venue_id collision(s) detected — see report`);
  }

  const genuinelyNewVenues = builtVenues.filter((v) => !existingUkIds.has(v.venue_id));
  const ukRegistry = { venues: [...existingUkRegistry.venues, ...genuinelyNewVenues] };
  await saveJson(UK_REGISTRY_PATH, ukRegistry);
  console.log(`\n  wrote ${UK_REGISTRY_PATH}: ${ukRegistry.venues.length} total venues (${genuinelyNewVenues.length} newly added this run)`);

  const addressOnlyCount = ukRegistry.venues.filter((v) => v.location_status === "ADDRESS_ONLY").length;
  const unresolvedCount = ukRegistry.venues.filter((v) => v.location_status === "UNRESOLVED").length;
  const geocodedCount = ukRegistry.venues.filter((v) => v.location_status === "GEOCODED").length;
  const confirmedCount = ukRegistry.venues.filter((v) => v.location_status === "CONFIRMED").length;

  // ---- Report artifact (Phase 19 accounting, retained not just printed) ----
  const report = {
    artifact_type: "BEATMAPPED_UK_MUSIC_VENUES_ONBOARDING_REPORT",
    generated_at: new Date().toISOString(),
    census_total: census.venues.length,
    classification: classificationSummary,
    in_scope_count: inScope.length,
    duplicates_reused: duplicates,
    newly_onboarded_count: genuinelyNewVenues.length,
    venue_id_collisions: collisions,
    uk_registry_totals: {
      total: ukRegistry.venues.length,
      CONFIRMED: confirmedCount,
      GEOCODED: geocodedCount,
      ADDRESS_ONLY: addressOnlyCount,
      UNRESOLVED: unresolvedCount,
    },
  };
  await saveJson(REPORT_PATH, report);
  console.log(`  wrote ${REPORT_PATH}`);

  return report;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
