#!/usr/bin/env node
// VENUE-AUTO-ONBOARDING-01 — the one manual entry point this package
// adds: `npm run onboard:venues` (optionally `-- --from=YYYY-MM-DD
// --to=YYYY-MM-DD --region=lisbon|porto`).
//
// Batch venue-onboarding pipeline:
//
//   existing 9-source Lisbon+Porto acquisition (ingestion/lisbon-porto/
//     run.mjs's acquireLisbonPorto() — completely unchanged, reused)
//   -> every UNRESOLVED (and, for inventory, resolved) Observation
//      grouped into deterministic venue candidates
//      (ingestion/venue-onboarding/candidates.mjs)
//   -> each candidate decided against bounded, retained research
//      evidence (venues/candidate-research.json), never live web search
//      (ingestion/venue-onboarding/admission.mjs)
//   -> admitted candidates become new canonical Venue entries
//      (venues/lisbon.json / venues/porto.json) and/or new data-driven
//      mapping entries (venues/source-venue-mappings.json) — NEVER a
//      new hardcoded branch in ingestion/venue/resolver.mjs
//   -> newly admitted ADDRESS_ONLY venues are geocoded through the
//      EXISTING, unmodified VENUE-GEOCODING-01 machinery
//      (ingestion/geocoding/{nominatim,match-address,run}.mjs), under a
//      hard cap of 15 uncached live Nominatim requests for this whole
//      run (already-cached queries never count)
//   -> a summary report proves ONE RUN processed MANY venues.
//
// This script performs live HTTP acquisition (via acquireLisbonPorto())
// and, up to the bounded cap, live Nominatim geocoding requests — never
// used by `npm test` (which exercises every pure module here —
// candidates.mjs, data-driven-resolver.mjs, admission.mjs — directly
// against retained fixtures, never this file, never the network).

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLisbonPorto } from "../lisbon-porto/run.mjs";
import { resolveObservation, resolveViaExplicitMappings } from "../venue/resolver.mjs";
import { extractVenueCandidates } from "./candidates.mjs";
import { decideAdmission } from "./admission.mjs";
import { resolveFromMappings } from "./data-driven-resolver.mjs";
import { projectObservationsToDisplayMarkers } from "../map/group-associated-listings.mjs";
import { geocodeOneVenue, loadCachedFixture, validateCacheIdentity, CACHE_DIR } from "../geocoding/run.mjs";
import { geocodeAdmittedVenues, DEFAULT_MAX_LIVE_GEOCODE_REQUESTS } from "./bounded-geocoding.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Hard bound (this task's brief, section 7) — never exceeded, whatever
// the real live candidate count turns out to be. Already-cached queries
// (a fixture already on disk AND identity-valid — see
// ingestion/geocoding/run.mjs's validateCacheIdentity()) never count.
export const MAX_LIVE_GEOCODE_REQUESTS = DEFAULT_MAX_LIVE_GEOCODE_REQUESTS;

function parseArgs(argv) {
  const args = { from: null, to: null, region: null };
  for (const arg of argv) {
    const fromMatch = /^--from=(.+)$/.exec(arg);
    const toMatch = /^--to=(.+)$/.exec(arg);
    const regionMatch = /^--region=(.+)$/.exec(arg);
    if (fromMatch) args.from = fromMatch[1];
    if (toMatch) args.to = toMatch[1];
    if (regionMatch) args.region = regionMatch[1];
  }
  return args;
}

async function loadJson(relativePath) {
  const fullPath = resolve(ROOT, relativePath);
  return { fullPath, data: JSON.parse(await readFile(fullPath, "utf8")) };
}

async function saveJson(fullPath, data) {
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * A new Venue's registry file/region is decided by its own city field —
 * never by which source produced the candidate (Odivelas is a Lisbon-
 * area municipal source, but its venues are real Odivelas addresses,
 * not "Lisboa" ones; Porto sources' venues always belong in
 * venues/porto.json). Deterministic, data-derived — not a per-venue
 * if/else.
 */
function registryTargetForVenue(venue) {
  if (String(venue.city ?? "").trim().toLowerCase() === "porto") {
    return { region: "porto", registryPath: "venues/porto.json" };
  }
  return { region: "lisbon", registryPath: "venues/lisbon.json" };
}

function countMapEligible(observations, { venues, sourceRegistry }) {
  const markers = projectObservationsToDisplayMarkers(observations, { venues, sourceRegistry, associations: [] });
  return {
    map_marker_count: markers.length,
    display_listing_count: markers.reduce((sum, m) => sum + m.display_listings.length, 0),
    map_eligible_observation_count: markers.reduce((sum, m) => sum + m.listings.length, 0),
  };
}

/**
 * Resolve one Observation against the hardcoded tables PLUS a supplied,
 * in-memory (possibly just-mutated-this-run) mappings array — never the
 * process-start-frozen JSON import ingestion/venue/resolver.mjs's own
 * resolveObservation() reads, which cannot reflect mappings this same
 * process just added. Used only for this script's own "count what this
 * run just unlocked" reporting.
 */
function resolveWithMappings(observation, mappings) {
  const explicit = resolveViaExplicitMappings(observation);
  if (explicit.resolution_status === "RESOLVED") return explicit;
  return resolveFromMappings(observation, mappings);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`VENUE-AUTO-ONBOARDING-01 onboard:venues starting (${new Date().toISOString()})`);
  if (args.from || args.to) console.log(`  date bounds: from=${args.from ?? "(none)"} to=${args.to ?? "(none)"}`);
  if (args.region) console.log(`  region filter: ${args.region}`);

  const { lisbonRegistry, portoRegistry, lisbonObservations, portoObservations } = await acquireLisbonPorto(args);

  const { fullPath: lisbonVenuesPath, data: lisbonVenues } = await loadJson("venues/lisbon.json");
  const { fullPath: portoVenuesPath, data: portoVenues } = await loadJson("venues/porto.json");
  const { fullPath: mappingsPath, data: mappingsFile } = await loadJson("venues/source-venue-mappings.json");
  const { data: research } = await loadJson("venues/candidate-research.json");

  const sourceRegistry = [...lisbonRegistry.entries, ...portoRegistry.entries];
  const allVenuesBefore = [...lisbonVenues.venues, ...portoVenues.venues];

  const observationsBySelection = () => {
    if (args.region === "lisbon") return { lisbon: lisbonObservations, porto: [] };
    if (args.region === "porto") return { lisbon: [], porto: portoObservations };
    return { lisbon: lisbonObservations, porto: portoObservations };
  };
  const selected = observationsBySelection();
  const allObservations = [...selected.lisbon, ...selected.porto];

  // ---- BEFORE metrics (current, on-disk state — nothing mutated yet) ----
  const beforeLisbon = countMapEligible(selected.lisbon, { venues: allVenuesBefore, sourceRegistry });
  const beforePorto = countMapEligible(selected.porto, { venues: allVenuesBefore, sourceRegistry });
  const beforeUnresolvedLisbon = selected.lisbon.filter((o) => resolveObservation(o).resolution_status !== "RESOLVED").length;
  const beforeUnresolvedPorto = selected.porto.filter((o) => resolveObservation(o).resolution_status !== "RESOLVED").length;

  // ---- Candidate extraction (deterministic, over ALL selected Observations) ----
  const candidates = extractVenueCandidates(allObservations, { resolveFn: resolveObservation });
  console.log(`\n  candidates discovered: ${candidates.length}`);

  // ---- Admission decisions (data-driven, no live research here) ----
  const newVenuesByPath = new Map([
    [lisbonVenuesPath, lisbonVenues],
    [portoVenuesPath, portoVenues],
  ]);
  const newMappingEntries = [];
  const outcomes = [];

  for (const candidate of candidates) {
    const decision = decideAdmission(candidate, research);
    outcomes.push({ candidate, decision });

    if (decision.venue) {
      const target = registryTargetForVenue(decision.venue);
      const registryPath = target.region === "porto" ? portoVenuesPath : lisbonVenuesPath;
      const registry = newVenuesByPath.get(registryPath);
      const alreadyPresent = registry.venues.some((v) => v.venue_id === decision.venue.venue_id);
      if (!alreadyPresent) {
        registry.venues.push(decision.venue);
      }
    }

    if (decision.mapping) {
      const exists = [...mappingsFile.mappings, ...newMappingEntries].some(
        (m) =>
          m.source_id === decision.mapping.source_id &&
          m.source_key_type === decision.mapping.source_key_type &&
          m.source_key === decision.mapping.source_key,
      );
      if (!exists) newMappingEntries.push(decision.mapping);
    }
  }

  mappingsFile.mappings = [...mappingsFile.mappings, ...newMappingEntries];

  // Persist venue/mapping changes BEFORE geocoding, so geocodeOneVenue()
  // (which reads/writes venues/*.json from disk itself) sees the
  // just-admitted ADDRESS_ONLY venues.
  await saveJson(lisbonVenuesPath, lisbonVenues);
  await saveJson(portoVenuesPath, portoVenues);
  await saveJson(mappingsPath, mappingsFile);

  // ---- Bounded geocoding pass over newly admitted ADDRESS_ONLY venues ----
  const newlyAdmittedAddressOnly = outcomes
    .filter((o) => o.decision.status === "ADDRESS_ONLY_ADMIT" && o.decision.venue)
    .map((o) => o.decision.venue);

  const { results: geocodeResults, liveRequestCount } = await geocodeAdmittedVenues(newlyAdmittedAddressOnly, {
    maxLiveRequests: MAX_LIVE_GEOCODE_REQUESTS,
    registryTargetForVenue,
    loadCachedFixture,
    validateCacheIdentity,
    geocodeOneVenue,
    cacheDir: CACHE_DIR,
  });
  for (const result of geocodeResults) {
    console.log(`  [${result.outcome}] ${result.venue_id}${result.reason ? `: ${result.reason}` : ""}`);
  }

  // ---- AFTER metrics (using this run's just-updated in-memory mappings) ----
  const freshMappings = mappingsFile.mappings;
  // Coordinates from geocoding land only in the on-disk registries
  // (geocodeOneVenue mutates and saves them itself) — reload so the
  // AFTER projection sees GEOCODED coordinates, not stale ADDRESS_ONLY.
  const { data: lisbonVenuesAfter } = await loadJson("venues/lisbon.json");
  const { data: portoVenuesAfter } = await loadJson("venues/porto.json");
  const allVenuesAfter = [...lisbonVenuesAfter.venues, ...portoVenuesAfter.venues];

  const resolveAfter = (o) => resolveWithMappings(o, freshMappings);
  const afterUnresolvedLisbon = selected.lisbon.filter((o) => resolveAfter(o).resolution_status !== "RESOLVED").length;
  const afterUnresolvedPorto = selected.porto.filter((o) => resolveAfter(o).resolution_status !== "RESOLVED").length;

  function projectWithFreshMappings(observations) {
    // projectObservationsToDisplayMarkers uses ingestion/venue/resolver.mjs's
    // real resolveObservation() internally, which cannot see this run's
    // fresh in-memory mappings (only the on-disk file, already saved
    // above) — since mappingsPath was already persisted before this
    // point, the real resolveObservation() now DOES see them (a fresh
    // JSON.parse of the just-written file would, but the frozen static
    // import in this same process cannot). So AFTER map-eligibility is
    // instead computed the same way BEFORE was, using the venues array
    // reloaded from disk, and resolution status from resolveWithMappings
    // (explicit tables + fresh in-memory mappings) applied by hand.
    const venueById = new Map(allVenuesAfter.map((v) => [v.venue_id, v]));
    let mapMarkerVenueIds = new Set();
    let mapEligibleCount = 0;
    for (const observation of observations) {
      const resolution = resolveAfter(observation);
      if (resolution.resolution_status !== "RESOLVED") continue;
      const venue = venueById.get(resolution.venue_id);
      if (!venue) continue;
      if (venue.location_status !== "CONFIRMED" && venue.location_status !== "GEOCODED") continue;
      if (typeof venue.latitude !== "number" || typeof venue.longitude !== "number") continue;
      mapMarkerVenueIds.add(venue.venue_id);
      mapEligibleCount += 1;
    }
    return { map_marker_count: mapMarkerVenueIds.size, map_eligible_observation_count: mapEligibleCount };
  }

  const afterLisbon = projectWithFreshMappings(selected.lisbon);
  const afterPorto = projectWithFreshMappings(selected.porto);

  // ---- Report ----
  const statusCounts = {};
  for (const { decision } of outcomes) {
    statusCounts[decision.status] = (statusCounts[decision.status] ?? 0) + 1;
  }

  const autoAdmitted = outcomes.filter((o) => o.decision.status === "AUTO_ADMIT");
  const addressOnlyAdmitted = outcomes.filter((o) => o.decision.status === "ADDRESS_ONLY_ADMIT");
  const alreadyCanonical = outcomes.filter((o) => o.decision.status === "ALREADY_CANONICAL");
  const rejectedOrDeferred = outcomes.filter(
    (o) => !["AUTO_ADMIT", "ADDRESS_ONLY_ADMIT", "ALREADY_CANONICAL"].includes(o.decision.status),
  );

  const geocodedCount = geocodeResults.filter((r) => r.outcome === "GEOCODED").length;
  const readyForGeocodingCount = geocodeResults.filter((r) => r.outcome === "READY_FOR_GEOCODING").length;
  const leftAddressOnlyCount = geocodeResults.filter((r) => r.outcome === "LEFT_ADDRESS_ONLY").length;

  const observationsNewlyResolved =
    beforeUnresolvedLisbon + beforeUnresolvedPorto - (afterUnresolvedLisbon + afterUnresolvedPorto);
  const observationsNewlyMapVisible =
    afterLisbon.map_eligible_observation_count +
    afterPorto.map_eligible_observation_count -
    (beforeLisbon.map_eligible_observation_count + beforePorto.map_eligible_observation_count);

  console.log(`\n=== onboard:venues summary ===`);
  console.log(`  candidates discovered: ${candidates.length}`);
  console.log(`  already canonical: ${alreadyCanonical.length}`);
  console.log(`  auto-admitted: ${autoAdmitted.length}`);
  console.log(`  address-only admitted: ${addressOnlyAdmitted.length}`);
  console.log(`  geocoded: ${geocodedCount}`);
  console.log(`  confirmed directly: ${autoAdmitted.filter((o) => o.decision.venue?.location_status === "CONFIRMED").length}`);
  console.log(`  rejected/deferred: ${rejectedOrDeferred.length}`);
  console.log(`  observations newly resolved: ${observationsNewlyResolved}`);
  console.log(`  observations newly map-visible: ${observationsNewlyMapVisible}`);
  console.log(`\n  live Nominatim requests used: ${liveRequestCount}/${MAX_LIVE_GEOCODE_REQUESTS}`);
  console.log(`  ready-for-geocoding (over cap, retained ADDRESS_ONLY): ${readyForGeocodingCount}`);
  console.log(`  left ADDRESS_ONLY (geocode attempted, no acceptable match): ${leftAddressOnlyCount}`);

  console.log(`\n  status breakdown:`);
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`    ${status}: ${count}`);
  }

  console.log(`\n  before -> after (this run's own before/after, distinct from a separate ingest:lisbon-porto rerun):`);
  console.log(`    Lisbon unresolved: ${beforeUnresolvedLisbon} -> ${afterUnresolvedLisbon}`);
  console.log(`    Porto unresolved: ${beforeUnresolvedPorto} -> ${afterUnresolvedPorto}`);
  console.log(
    `    Lisbon map-eligible observations: ${beforeLisbon.map_eligible_observation_count} -> ${afterLisbon.map_eligible_observation_count}`,
  );
  console.log(
    `    Porto map-eligible observations: ${beforePorto.map_eligible_observation_count} -> ${afterPorto.map_eligible_observation_count}`,
  );
  console.log(`    Lisbon map markers: ${beforeLisbon.map_marker_count} -> ${afterLisbon.map_marker_count}`);
  console.log(`    Porto map markers: ${beforePorto.map_marker_count} -> ${afterPorto.map_marker_count}`);

  return {
    candidates,
    outcomes,
    geocodeResults,
    liveRequestCount,
    before: { lisbon: { ...beforeLisbon, unresolved: beforeUnresolvedLisbon }, porto: { ...beforePorto, unresolved: beforeUnresolvedPorto } },
    after: { lisbon: { ...afterLisbon, unresolved: afterUnresolvedLisbon }, porto: { ...afterPorto, unresolved: afterUnresolvedPorto } },
    observationsNewlyResolved,
    observationsNewlyMapVisible,
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
