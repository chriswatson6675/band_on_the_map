#!/usr/bin/env node
// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — the one
// manual entry point this package adds: `npm run discover:uk-national`.
//
// DISCOVER -> RECONCILE -> VALIDATE -> CANONICALISE -> GEOCODE -> PUBLISH,
// using entirely existing, proven generic machinery
// (ingestion/venue-discovery/{contract,reconcile,existing-registry}.mjs)
// plus this package's own additions: a deterministic national grid
// coverage plan (coverage-plan.mjs), a bbox Overpass provider
// (overpass-bbox-query.mjs), a resumable checkpoint controller
// (controller.mjs), a locality gazetteer for candidates OSM leaves
// unlocalised (locality-gazetteer.mjs), and evidence-gated auto-admission
// (admission.mjs). GEOCODING is not a separate pass for OSM-sourced
// candidates — every one already carries its own OSM-evidenced
// coordinate (GEOCODED / OSM_OVERPASS_ELEMENT_COORDINATE, see
// ingestion/venue/contract.mjs); only event-derived candidates with no
// coordinate at all fall back to ADDRESS_ONLY/UNRESOLVED, exactly
// honouring the existing Venue contract's "never guess" rule. PUBLISH
// reuses venues/uk.json + ingestion/geocoding/run-uk.mjs +
// ingestion/map/publication.mjs's buildUnitedKingdomMarkers() completely
// unchanged (see the immediately-prior UK package) — this script only
// ever grows venues/uk.json, never touches the publication pipeline
// itself.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCoverageUnits } from "./coverage-plan.mjs";
import { discoverCoverageUnitCandidates } from "./overpass-bbox-query.mjs";
import { runCoverageSweep, summariseCoverage, loadUnitStates } from "./controller.mjs";
import { buildLocalityGazetteer, nearestLocality, localityFromTags } from "./locality-gazetteer.mjs";
import { classifyDiscoveryGroup, DISCOVERY_ADMISSION_STATUSES } from "./admission.mjs";
import { createVenueDiscoveryCandidate } from "../venue-discovery/contract.mjs";
import { reconcileCandidates } from "../venue-discovery/reconcile.mjs";
import { reconcileWithExistingRegistry } from "../venue-discovery/existing-registry.mjs";
import { createVenueId, validateVenue } from "../venue/contract.mjs";
import { extractVenueCandidates } from "../venue-onboarding/candidates.mjs";
import { resolveObservation } from "../venue/resolver.mjs";
import { acquireLondon } from "../london/run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RESEARCH_DIR = "research/venue-discovery/uk-national-expansion-01";
const UK_REGISTRY_PATH = "venues/uk.json";
const LONDON_REGISTRY_PATH = "venues/london.json";

function parseArgs(argv) {
  const args = { runId: "uk-national-expansion-01", skipSweep: false, skipEventDerived: false, limitUnits: null };
  for (const arg of argv) {
    const runIdMatch = /^--run-id=(.+)$/.exec(arg);
    if (runIdMatch) args.runId = runIdMatch[1];
    if (arg === "--skip-sweep") args.skipSweep = true;
    if (arg === "--skip-event-derived") args.skipEventDerived = true;
    // Dev/test-only: bound the coverage plan to the first N units. Never
    // used for the real national campaign (this package's brief: "There
    // is NO arbitrary batch cap") — exists only so this script's own
    // pipeline can be smoke-tested against a handful of real units
    // without waiting out the full national sweep.
    const limitMatch = /^--limit-units=(\d+)$/.exec(arg);
    if (limitMatch) args.limitUnits = Number(limitMatch[1]);
    // Dev/test-only: run only the named coverage_unit_id(s). Same "never
    // used for the real national campaign" caveat as --limit-units.
    const unitsMatch = /^--units=(.+)$/.exec(arg);
    if (unitsMatch) args.onlyUnitIds = new Set(unitsMatch[1].split(","));
  }
  return args;
}

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

function parseOsmTagsEvidence(observation) {
  const entry = (observation.discovery_evidence ?? []).find((item) => item.kind === "OSM_TAGS");
  if (!entry) return {};
  try {
    return JSON.parse(entry.value) ?? {};
  } catch {
    return {};
  }
}

/**
 * Rebuild one candidate with a corrected `city` — every OSM candidate is
 * initially created with `city` set to its coverage_unit_id (a grid
 * label, e.g. "uk-grid-r02-c08" — see overpass-bbox-query.mjs; the shared
 * ingestion/venue-discovery/providers/overpass.mjs's parseOverpassCandidates()
 * requires a `city` string at creation time and has no locality concept
 * of its own). This is the ONE place that grid label is ever replaced
 * with a real place name, after the fact, from either the element's own
 * addr:city/addr:town/addr:suburb tag or (failing that) the nearest named
 * locality in `gazetteer`. Every other field is preserved unchanged;
 * candidate_id never changes (it's derived from the OSM element, not the
 * city), so this never breaks downstream identity.
 */
function rehydrateCandidateCity(candidate, gazetteer) {
  const tags = parseOsmTagsEvidence(candidate);
  const tagLocality = localityFromTags(tags, candidate.reported_latitude, candidate.reported_longitude);
  const city = tagLocality?.city ?? nearestLocality(gazetteer, candidate.reported_latitude, candidate.reported_longitude) ?? candidate.city;
  if (city === candidate.city) return candidate;
  return createVenueDiscoveryCandidate({ ...candidate, city });
}

async function loadExistingRegistries() {
  const ukVenues = await loadJsonOrDefault(UK_REGISTRY_PATH, { venues: [] });
  const londonVenues = await loadJsonOrDefault(LONDON_REGISTRY_PATH, { venues: [] });
  const londonSources = await loadJsonOrDefault("sources/london.json", { entries: [] });
  return { ukVenues, londonVenues, londonSources };
}

async function runOsmSweep(runId, { onProgress, limitUnits, onlyUnitIds } = {}) {
  let units = buildCoverageUnits();
  if (onlyUnitIds) units = units.filter((u) => onlyUnitIds.has(u.coverage_unit_id));
  else if (limitUnits) units = units.slice(0, limitUnits);
  console.log(`  coverage plan: ${units.length} units`);
  const results = await runCoverageSweep(units, { runId, discover: discoverCoverageUnitCandidates, onProgress });
  const coverage = summariseCoverage(units, results);
  return { units, results, coverage };
}

async function mineEventDerivedCandidates() {
  console.log("  acquiring London Observations for event-derived venue-name mining...");
  const { londonObservations } = await acquireLondon();
  const candidates = extractVenueCandidates(londonObservations, { resolveFn: resolveObservation });
  const unresolved = candidates.filter((c) => !c.existing_canonical_mapping);
  console.log(`  event-derived: ${candidates.length} venue-name candidates in London Observations, ${unresolved.length} unresolved to a canonical Venue`);
  const now = new Date().toISOString();
  return unresolved.map((c) =>
    createVenueDiscoveryCandidate({
      candidate_id: `cand-event-derived-${c.candidate_id}`,
      city: "London",
      country_code: "GB",
      reported_name: c.raw_keys[0] ?? c.key,
      reported_address: null,
      reported_latitude: null,
      reported_longitude: null,
      reported_website: null,
      reported_category: null,
      discovery_provider: "BEATMAPPED_EVENT_DERIVED_UNRESOLVED_NAME",
      provider_record_id: c.candidate_id,
      // provider_url is a required field (ingestion/venue-discovery/contract.mjs)
      // — there is no OSM/website URL for an unresolved venue-name lead, so
      // this uses the first real Observation's own event_url (a genuine,
      // already-evidenced page naming this venue) rather than a fabricated
      // reference. Every Observation that reaches here came from a real
      // acquisition, so at least one should carry one; the source's own
      // registry-listed page is the fallback for the rare case none do.
      provider_url: c.observations.find((o) => o.event_url)?.event_url ?? `https://github.com/chriswatson6675/band_on_the_map/blob/main/sources/london.json`,
      retrieved_at: now,
      discovery_evidence: [
        { kind: "UNRESOLVED_OBSERVATION_VENUE_NAME", value: c.raw_keys.join("; ") },
        { kind: "SOURCE_ID", value: c.source_id },
        { kind: "EXAMPLE_SOURCE_RECORD_IDS", value: JSON.stringify(c.example_source_record_ids) },
      ],
      music_relevance_hint: null,
      active_status_hint: null,
      official_site_hint: null,
    }),
  );
}

function flattenOsmCandidates(unitResults) {
  return unitResults.filter((u) => u.status === "COMPLETE").flatMap((u) => u.candidates ?? []);
}

function buildSeedLocalities(ukVenues, londonVenues) {
  return [...ukVenues.venues, ...londonVenues.venues]
    .filter((v) => typeof v.city === "string" && v.city.trim() !== "" && Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
    .map((v) => ({ city: v.city, latitude: v.latitude, longitude: v.longitude }));
}

/**
 * Build one canonical Venue from an AUTO_ADMIT_HIGH_CONFIDENCE reconciled
 * discovery group. Uses the group's first observation with real
 * coordinates (OSM-sourced groups always have one; a coordinate-less
 * event-derived group never reaches here with a valid coordinate, so it
 * honestly becomes UNRESOLVED). Never invents an address — `address`
 * mirrors the first available `reported_address`, or null.
 */
function buildVenueFromGroup(group) {
  const withCoords = group.observations.find((o) => Number.isFinite(o.reported_latitude) && Number.isFinite(o.reported_longitude));
  const address = group.reported_addresses[0] ?? null;
  const evidence = [
    ...new Set(group.observations.flatMap((o) => (o.discovery_evidence ?? []).map((e) => JSON.stringify(e)))),
  ].map((s) => JSON.parse(s));
  const evidenceEntries = evidence.map((e) => ({
    url: group.observations.find((o) => o.provider_url)?.provider_url ?? null,
    kind: `DISCOVERY_${e.kind}`,
    note: `BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01: ${e.kind}=${e.value}`,
  }));

  const venue = {
    venue_id: createVenueId(group.reported_names[0], group.city),
    canonical_name: group.reported_names[0],
    country_code: group.country_code,
    city: group.city,
    municipality: group.city,
    address,
    latitude: null,
    longitude: null,
    location_status: "UNRESOLVED",
    evidence: evidenceEntries.length > 0 ? evidenceEntries : [{ url: null, kind: "DISCOVERY_CAMPAIGN", note: "BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01" }],
  };

  if (withCoords) {
    venue.latitude = withCoords.reported_latitude;
    venue.longitude = withCoords.reported_longitude;
    venue.location_status = "GEOCODED";
    venue.coordinate_provenance = {
      method: "OSM_OVERPASS_ELEMENT_COORDINATE",
      provider: "OPENSTREETMAP_OVERPASS",
      result_osm_type: withCoords.provider_record_id,
      result_display_name: withCoords.reported_name,
      retrieved_at: withCoords.retrieved_at,
    };
  } else if (address) {
    venue.location_status = "ADDRESS_ONLY";
  }

  const errors = validateVenue(venue);
  if (errors.length > 0) return { venue: null, errors };
  return { venue, errors: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  console.log(`BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 discover:uk-national starting (${startedAt}), run_id=${args.runId}`);

  const { ukVenues, londonVenues, londonSources } = await loadExistingRegistries();

  // ---- Phase 2/3: national OSM Overpass sweep (resumable) ----
  let sweep = { units: [], results: [], coverage: {} };
  if (!args.skipSweep) {
    console.log("\n== OSM/Overpass national sweep ==");
    let completedSoFar = 0;
    sweep = await runOsmSweep(args.runId, {
      limitUnits: args.limitUnits,
      onlyUnitIds: args.onlyUnitIds,
      onProgress: ({ unit, skipped, record }) => {
        completedSoFar += 1;
        const tag = skipped ? "skip" : record.status;
        console.log(`  [${completedSoFar}] ${unit.coverage_unit_id} (${unit.nation_hint}): ${tag} (${record.candidate_count ?? 0} candidates)`);
      },
    });
    console.log(`  coverage summary: ${JSON.stringify(sweep.coverage)}`);
  } else {
    const units = buildCoverageUnits();
    const existing = await loadUnitStates(args.runId);
    sweep = { units, results: units.map((u) => existing.get(u.coverage_unit_id) ?? { coverage_unit_id: u.coverage_unit_id, status: "PENDING" }), coverage: summariseCoverage(units, [...existing.values()]) };
  }

  const osmCandidatesRaw = flattenOsmCandidates(sweep.results);
  console.log(`\n  total raw OSM candidates: ${osmCandidatesRaw.length}`);

  // ---- Locality backfill ----
  const seedLocalities = buildSeedLocalities(ukVenues, londonVenues);
  const tagLocalities = osmCandidatesRaw
    .map((c) => localityFromTags(parseOsmTagsEvidence(c), c.reported_latitude, c.reported_longitude))
    .filter(Boolean);
  const gazetteer = buildLocalityGazetteer(tagLocalities, seedLocalities);
  console.log(`  locality gazetteer: ${gazetteer.size} named localities (${tagLocalities.length} from this sweep + ${seedLocalities.length} already-known city seeds)`);
  const osmCandidates = osmCandidatesRaw.map((c) => rehydrateCandidateCity(c, gazetteer));

  // ---- Phase 4: event-derived discovery ----
  let eventDerivedCandidates = [];
  if (!args.skipEventDerived) {
    console.log("\n== Event-derived discovery (mining existing UK Observations) ==");
    try {
      eventDerivedCandidates = await mineEventDerivedCandidates();
    } catch (error) {
      console.log(`  event-derived mining failed (non-fatal, continuing): ${error.message}`);
    }
  }

  // ---- Phase 9/10: reconcile within this run, then against the existing registry ----
  console.log("\n== Reconciliation ==");
  const allCandidates = [...osmCandidates, ...eventDerivedCandidates];
  console.log(`  total candidates before reconciliation: ${allCandidates.length}`);
  const reconcileStart = Date.now();
  const reconciledGroups = reconcileCandidates(allCandidates);
  console.log(`  reconciled into ${reconciledGroups.length} groups (${Date.now() - reconcileStart}ms)`);
  const withExistingRegistry = reconcileWithExistingRegistry(reconciledGroups, londonSources, { venues: [...ukVenues.venues, ...londonVenues.venues] });

  // ---- Phase 8/11: classify every group ----
  console.log("\n== Admission ==");
  const classified = withExistingRegistry.map((group) => ({ group, decision: classifyDiscoveryGroup(group) }));
  const statusCounts = {};
  for (const status of DISCOVERY_ADMISSION_STATUSES) statusCounts[status] = 0;
  let unexplained = 0;
  for (const { decision } of classified) {
    if (DISCOVERY_ADMISSION_STATUSES.has(decision.status)) statusCounts[decision.status] += 1;
    else unexplained += 1;
  }
  console.log(`  status breakdown: ${JSON.stringify(statusCounts)}`);
  console.log(`  UNEXPLAINED: ${unexplained}`);

  // ---- Phase 11/12: build canonical venues for auto-admitted groups ----
  const toAdmit = classified.filter((c) => c.decision.status === "AUTO_ADMIT_HIGH_CONFIDENCE");
  const existingIds = new Set([...ukVenues.venues, ...londonVenues.venues].map((v) => v.venue_id));
  const seenThisRun = new Map();
  const newVenues = [];
  const identityConflicts = [];
  const buildFailures = [];

  for (const { group } of toAdmit) {
    const { venue, errors } = buildVenueFromGroup(group);
    if (!venue) {
      buildFailures.push({ reconciled_candidate_id: group.reconciled_candidate_id, errors });
      continue;
    }
    if (existingIds.has(venue.venue_id)) {
      // Genuinely already canonical by id (reconcileWithExistingRegistry's own
      // name/address/domain/postcode matching missed it) — never overwritten.
      continue;
    }
    if (seenThisRun.has(venue.venue_id)) {
      identityConflicts.push({ venue_id: venue.venue_id, groups: [seenThisRun.get(venue.venue_id), group.reconciled_candidate_id] });
      continue;
    }
    seenThisRun.set(venue.venue_id, group.reconciled_candidate_id);
    newVenues.push(venue);
  }

  console.log(`\n  new canonical venues to admit: ${newVenues.length}`);
  console.log(`  identity conflicts (venue_id collisions, not admitted): ${identityConflicts.length}`);
  console.log(`  build failures (invalid per Venue contract, not admitted): ${buildFailures.length}`);

  const mergedUkRegistry = { venues: [...ukVenues.venues, ...newVenues] };
  await saveJson(UK_REGISTRY_PATH, mergedUkRegistry);
  console.log(`  wrote ${UK_REGISTRY_PATH}: ${mergedUkRegistry.venues.length} total venues (${newVenues.length} newly added this run)`);

  // ---- Research artifacts ----
  const completedAt = new Date().toISOString();
  const bySourceFamily = {};
  for (const provider of new Set(allCandidates.map((c) => c.discovery_provider))) {
    const providerCandidates = allCandidates.filter((c) => c.discovery_provider === provider);
    const providerGroups = classified.filter((c) => c.group.observations.some((o) => o.discovery_provider === provider));
    bySourceFamily[provider] = {
      candidates: providerCandidates.length,
      new_venues: providerGroups.filter((c) => c.decision.status === "AUTO_ADMIT_HIGH_CONFIDENCE" && newVenues.some((v) => v.venue_id === createVenueId(c.group.reported_names[0], c.group.city))).length,
    };
  }

  const runSummary = {
    artifact_type: "UK_NATIONAL_DISCOVERY_RUN_SUMMARY",
    run_id: args.runId,
    started_at: startedAt,
    completed_at: completedAt,
    coverage: sweep.coverage,
    coverage_unit_count: sweep.units.length,
    total_raw_candidates: allCandidates.length,
    osm_candidates: osmCandidates.length,
    event_derived_candidates: eventDerivedCandidates.length,
    reconciled_group_count: reconciledGroups.length,
    admission_status_counts: statusCounts,
    unexplained: unexplained,
    newly_admitted_venue_count: newVenues.length,
    identity_conflicts: identityConflicts.length,
    build_failures: buildFailures.length,
    by_source_family: bySourceFamily,
  };
  await saveJson(`${RESEARCH_DIR}/run.json`, runSummary);
  await saveJson(`${RESEARCH_DIR}/coverage-plan.json`, {
    generated_at: startedAt,
    total_units: sweep.units.length,
    units: sweep.units.map((u) => ({ coverage_unit_id: u.coverage_unit_id, nation_hint: u.nation_hint, bounds: u.bounds, centre: u.centre })),
  });
  await saveJson(`${RESEARCH_DIR}/coverage-progress.json`, { coverage_units: sweep.units.map((u) => ({ coverage_unit_id: u.coverage_unit_id, nation_hint: u.nation_hint, status: sweep.results.find((r) => r.coverage_unit_id === u.coverage_unit_id)?.status ?? "PENDING" })) });
  await saveJson(`${RESEARCH_DIR}/admitted.json`, { count: newVenues.length, venues: newVenues.map((v) => ({ venue_id: v.venue_id, canonical_name: v.canonical_name, city: v.city, location_status: v.location_status })) });
  await saveJson(`${RESEARCH_DIR}/review-queue.json`, {
    count: classified.filter((c) => c.decision.status === "REVIEW_REQUIRED").length,
    entries: classified.filter((c) => c.decision.status === "REVIEW_REQUIRED").map((c) => ({ reconciled_candidate_id: c.group.reconciled_candidate_id, names: c.group.reported_names, reason: c.decision.reason })),
  });
  await saveJson(`${RESEARCH_DIR}/excluded.json`, {
    count: classified.filter((c) => !["AUTO_ADMIT_HIGH_CONFIDENCE", "ALREADY_CANONICAL", "REVIEW_REQUIRED"].includes(c.decision.status)).length,
    entries: classified
      .filter((c) => !["AUTO_ADMIT_HIGH_CONFIDENCE", "ALREADY_CANONICAL", "REVIEW_REQUIRED"].includes(c.decision.status))
      .map((c) => ({ reconciled_candidate_id: c.group.reconciled_candidate_id, names: c.group.reported_names, status: c.decision.status, reason: c.decision.reason })),
  });
  await saveJson(`${RESEARCH_DIR}/already-canonical.json`, {
    count: classified.filter((c) => c.decision.status === "ALREADY_CANONICAL").length,
    entries: classified.filter((c) => c.decision.status === "ALREADY_CANONICAL").map((c) => ({ names: c.group.reported_names, matches: c.group.existing_registry_reconciliation.confident_matches })),
  });
  await saveJson(`${RESEARCH_DIR}/failures.json`, { identity_conflicts: identityConflicts, build_failures: buildFailures });
  await saveJson(`${RESEARCH_DIR}/source-yield.json`, bySourceFamily);

  console.log(`\n=== discover:uk-national summary ===`);
  console.log(JSON.stringify(runSummary, null, 2));

  return runSummary;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main, buildVenueFromGroup, rehydrateCandidateCity, flattenOsmCandidates, buildSeedLocalities, parseOsmTagsEvidence };
