#!/usr/bin/env node
// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — the one manual
// entry point this package adds: `npm run discover:uk-bulk-osm`.
//
// EXTRACT (bulk Geofabrik PBF, offline) -> ASSIGN (209-unit coverage grid)
// -> CHECKPOINT -> RECONCILE -> ADMIT -> CANONICALISE -> PUBLISH, reusing
// package-01/02's entire proven pipeline downstream of "where candidates
// come from" completely UNCHANGED: ingestion/venue-discovery/{contract,
// reconcile,existing-registry}.mjs, ingestion/uk-national-discovery/
// {admission,locality-gazetteer}.mjs, and
// ingestion/uk-national-discovery/run.mjs's own buildVenueFromGroup /
// rehydrateCandidateCity helpers (imported directly, never re-implemented
// — this package's brief: "reuse existing publication pipeline unchanged").
// The only genuinely new pipeline stage is EXTRACT: pbf_extract.py /
// nation_filter.py (offline, bounded-memory, governed by the exact same
// TAG_CLAUSES/EXPLICIT_RELEVANCE_CLAUSES the live Overpass sweep uses —
// see export-tag-clauses.mjs) in place of a live Overpass bbox query per
// coverage unit.
//
// GEOCODING is, as in package-02, not a separate pass for OSM-sourced
// candidates — every one already carries its own OSM-evidenced coordinate
// (GEOCODED / OSM_OVERPASS_ELEMENT_COORDINATE, see
// ingestion/venue/contract.mjs) taken directly from the PBF, never routed
// through the live geocoder (this package's brief: "avoid a geocoder
// bottleneck").

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildCoverageUnits } from "../uk-national-discovery/coverage-plan.mjs";
import { classifyDiscoveryGroup, DISCOVERY_ADMISSION_STATUSES } from "../uk-national-discovery/admission.mjs";
import { buildLocalityGazetteer, localityFromTags } from "../uk-national-discovery/locality-gazetteer.mjs";
import { rehydrateCandidateCity, buildVenueFromGroup, buildSeedLocalities, parseOsmTagsEvidence } from "../uk-national-discovery/run.mjs";
import { reconcileWithExistingRegistry, buildRegistryRecords } from "../venue-discovery/existing-registry.mjs";

import { writeTagClauses } from "./export-tag-clauses.mjs";
import { loadCandidatesByCoverageUnit } from "./ndjson-to-candidates.mjs";
import { reconcileCandidatesByCity } from "./reconcile-by-city.mjs";
import { runBulkOsmSweep, summariseBulkOsmCoverage, saveRunCheckpoint } from "./checkpoint.mjs";
import { reclassifyPermanentFailures } from "./reclassify-provider-outage.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RESEARCH_DIR = "research/venue-discovery/uk-national-bulk-osm-02";
const PACKAGE02_RESEARCH_DIR = "research/venue-discovery/uk-national-expansion-01";
const UK_REGISTRY_PATH = "venues/uk.json";
const LONDON_REGISTRY_PATH = "venues/london.json";

function parseArgs(argv) {
  const args = {
    runId: "uk-national-bulk-osm-02",
    gbPbf: null,
    niPbf: null,
    niBoundary: resolve(ROOT, "ingestion/uk-national-bulk-osm/ni-boundary.geojson"),
    workDir: null,
    skipExtraction: false,
  };
  for (const arg of argv) {
    const m = (flag) => new RegExp(`^--${flag}=(.+)$`).exec(arg)?.[1];
    args.runId = m("run-id") ?? args.runId;
    args.gbPbf = m("gb-pbf") ?? args.gbPbf;
    args.niPbf = m("ni-pbf") ?? args.niPbf;
    args.niBoundary = m("ni-boundary") ?? args.niBoundary;
    args.workDir = m("work-dir") ?? args.workDir;
    if (arg === "--skip-extraction") args.skipExtraction = true;
  }
  if (!args.workDir) args.workDir = resolve(ROOT, `runtime/uk-national-bulk-osm/${args.runId}/extraction`);
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

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadExistingRegistries() {
  const ukVenues = await loadJsonOrDefault(UK_REGISTRY_PATH, { venues: [] });
  const londonVenues = await loadJsonOrDefault(LONDON_REGISTRY_PATH, { venues: [] });
  const londonSources = await loadJsonOrDefault("sources/london.json", { entries: [] });
  return { ukVenues, londonVenues, londonSources };
}

/**
 * Phase: correct package-02's failure semantics BEFORE this run's own
 * accounting starts, so this package's final report can honestly state
 * both "package-02's 15 units were reclassified" AND "this run's own 209
 * units resolved to COMPLETE/COMPLETE_NO_CANDIDATES/SOURCE_DATA_INVALID".
 * Never touches package-02's original artifact file.
 */
async function reclassifyPackage02Failures() {
  const original = await loadJsonOrDefault(`${PACKAGE02_RESEARCH_DIR}/coverage-progress.json`, { coverage_units: [] });
  const { corrected, reclassified_count, reclassified_unit_ids } = reclassifyPermanentFailures(original, {
    sourceArtifactPath: `${PACKAGE02_RESEARCH_DIR}/coverage-progress.json`,
  });
  await saveJson(`${RESEARCH_DIR}/package02-failure-reclassification.json`, {
    artifact_type: "UK_NATIONAL_BULK_OSM_PACKAGE02_RECLASSIFICATION",
    reclassified_count,
    reclassified_unit_ids,
    corrected_coverage_units: corrected.coverage_units,
  });
  return { reclassified_count, reclassified_unit_ids };
}

/**
 * Ensure the governed tag-clauses.json exists in the work dir (regenerated
 * every run from the live JS constants — never stale, never hand-copied).
 */
async function ensureTagClauses(workDir) {
  await mkdir(workDir, { recursive: true });
  const path = resolve(workDir, "tag-clauses.json");
  await writeTagClauses(path);
  return path;
}

/**
 * Run pbf_extract.py for one PBF file, skipping the (expensive) extraction
 * itself if its output NDJSON already exists from a prior run in the same
 * workDir — this is this package's resumability for the slow stage: a
 * killed process resumes without re-parsing a 2GB file it already fully
 * parsed.
 */
async function extractPbf({ pbfPath, tagClausesPath, workDir, label }) {
  const outPath = resolve(workDir, `${label}-candidates-raw.ndjson`);
  const countsPath = resolve(workDir, `${label}-counts.json`);
  if (await fileExists(outPath)) {
    console.log(`  [${label}] extraction output already present, skipping re-extraction: ${outPath}`);
    return { outPath, counts: (await fileExists(countsPath)) ? await loadJsonAbsolute(countsPath) : null, skipped: true };
  }
  console.log(`  [${label}] extracting from ${pbfPath} ...`);
  const script = resolve(ROOT, "ingestion/uk-national-bulk-osm/pbf_extract.py");
  await execFileAsync("python3", [script, "--pbf", pbfPath, "--tag-clauses", tagClausesPath, "--out", outPath, "--counts-out", countsPath], {
    maxBuffer: 1024 * 1024 * 64,
  });
  return { outPath, counts: await loadJsonAbsolute(countsPath), skipped: false };
}

async function loadJsonAbsolute(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Split the Ireland+NI raw candidates into NI-kept / ROI-excluded via a real point-in-polygon test against Northern Ireland's own OSM boundary. Skipped (reusing prior output) under the same resumability rule as extractPbf. */
async function nationFilterNi({ candidatesPath, boundaryPath, workDir }) {
  const keepOut = resolve(workDir, "ni-candidates-kept.ndjson");
  const excludeOut = resolve(workDir, "ni-candidates-excluded-roi.ndjson");
  const summaryOut = resolve(workDir, "ni-nation-filter-summary.json");
  if (await fileExists(keepOut)) {
    console.log(`  [ni-nation-filter] output already present, skipping: ${keepOut}`);
    return { keepOut, summary: await loadJsonAbsolute(summaryOut) };
  }
  console.log("  [ni-nation-filter] splitting Northern Ireland from Republic of Ireland ...");
  const script = resolve(ROOT, "ingestion/uk-national-bulk-osm/nation_filter.py");
  await execFileAsync("python3", [script, "--candidates", candidatesPath, "--boundary", boundaryPath, "--keep-out", keepOut, "--exclude-out", excludeOut, "--summary-out", summaryOut], {
    maxBuffer: 1024 * 1024 * 64,
  });
  return { keepOut, summary: await loadJsonAbsolute(summaryOut) };
}

function mergeCandidatesByUnit(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [unitId, candidates] of map) {
      if (!merged.has(unitId)) merged.set(unitId, []);
      merged.get(unitId).push(...candidates);
    }
  }
  return merged;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  console.log(`BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 discover:uk-bulk-osm starting (${startedAt}), run_id=${args.runId}`);

  console.log("\n== Package-02 failure reclassification ==");
  const reclassification = await reclassifyPackage02Failures();
  console.log(`  reclassified ${reclassification.reclassified_count} PERMANENT_FAILURE units to RETRYABLE_PROVIDER_FAILURE`);

  const { ukVenues, londonVenues, londonSources } = await loadExistingRegistries();
  const units = buildCoverageUnits();
  console.log(`\n  coverage plan: ${units.length} units`);

  // Existing-registry records, built ONCE up front — passed into the
  // eligibility pre-filter (ingestion/uk-national-bulk-osm/
  // candidate-eligibility.mjs) so a generic-category OSM element that
  // BeatMapped already independently knows as an active source/venue can
  // still clear the pre-candidacy gate (founder correction condition 2),
  // without this package doing any NEW manual research.
  const registryRecords = buildRegistryRecords(londonSources, { venues: [...ukVenues.venues, ...londonVenues.venues] });

  let candidatesByUnit = new Map(units.map((u) => [u.coverage_unit_id, []]));
  let unassignedTotal = [];
  let excludedMissingNameTotal = [];
  let filteredGenericLeadsTotal = [];
  const signalCountsTotal = {};
  let rawOsmObjectsInspected = 0;
  let rawOsmObjectsMatchedBroadTags = 0;

  function accumulateExtractionCounts(counts) {
    if (!counts) return;
    rawOsmObjectsInspected += (counts.nodes_scanned ?? 0) + (counts.ways_scanned ?? 0) + (counts.relations_scanned ?? 0);
    rawOsmObjectsMatchedBroadTags += (counts.nodes_matched ?? 0) + (counts.ways_matched ?? 0) + (counts.relations_matched ?? 0);
  }

  function accumulateLoaded(loaded) {
    candidatesByUnit = mergeCandidatesByUnit(candidatesByUnit, loaded.candidatesByUnit);
    unassignedTotal = unassignedTotal.concat(loaded.unassigned);
    excludedMissingNameTotal = excludedMissingNameTotal.concat(loaded.excludedMissingName);
    filteredGenericLeadsTotal = filteredGenericLeadsTotal.concat(loaded.filteredGenericLeads);
    for (const [signal, count] of Object.entries(loaded.signalCounts)) signalCountsTotal[signal] = (signalCountsTotal[signal] ?? 0) + count;
  }

  if (!args.skipExtraction) {
    console.log("\n== EXTRACT (bulk OSM PBF) ==");
    const tagClausesPath = await ensureTagClauses(args.workDir);

    if (args.gbPbf) {
      const gb = await extractPbf({ pbfPath: args.gbPbf, tagClausesPath, workDir: args.workDir, label: "gb" });
      console.log(`  [gb] counts: ${JSON.stringify(gb.counts)}`);
      accumulateExtractionCounts(gb.counts);
      const gbLoaded = await loadCandidatesByCoverageUnit(gb.outPath, units, { retrievedAt: startedAt, sourceLabel: "gb-bulk-osm", registryRecords });
      accumulateLoaded(gbLoaded);
    } else {
      console.log("  [gb] no --gb-pbf given, skipping Great Britain extraction");
    }

    if (args.niPbf) {
      const ni = await extractPbf({ pbfPath: args.niPbf, tagClausesPath, workDir: args.workDir, label: "ireland-ni" });
      console.log(`  [ireland-ni] counts: ${JSON.stringify(ni.counts)}`);
      accumulateExtractionCounts(ni.counts);
      const filtered = await nationFilterNi({ candidatesPath: ni.outPath, boundaryPath: args.niBoundary, workDir: args.workDir });
      console.log(`  [ni-nation-filter] summary: ${JSON.stringify(filtered.summary)}`);
      const niLoaded = await loadCandidatesByCoverageUnit(filtered.keepOut, units, { retrievedAt: startedAt, sourceLabel: "ni-bulk-osm", registryRecords });
      accumulateLoaded(niLoaded);
    } else {
      console.log("  [ireland-ni] no --ni-pbf given, skipping Ireland/NI extraction");
    }
  }

  console.log(`\n  raw OSM objects inspected (nodes+ways+relations scanned): ${rawOsmObjectsInspected}`);
  console.log(`  raw OSM objects matched by the broad discovery tag net (TAG_CLAUSES/EXPLICIT_RELEVANCE_CLAUSES): ${rawOsmObjectsMatchedBroadTags}`);
  console.log(`  generic noisy records filtered before candidacy (FILTERED_GENERIC_NON_EVENT_LEAD): ${filteredGenericLeadsTotal.length}`);
  const remainingCommunityCentresInCandidates = [...candidatesByUnit.values()].flat().filter((c) => (c.reported_category ?? "").includes("amenity=community_centre") && !(c.reported_category ?? "").includes("live_music=yes")).length;
  console.log(`  bare community_centre candidates remaining in the main census (must be 0): ${remainingCommunityCentresInCandidates}`);

  const totalRawCandidates = [...candidatesByUnit.values()].reduce((sum, c) => sum + c.length, 0);
  console.log(`\n  total raw bulk-OSM candidates assigned to a coverage unit: ${totalRawCandidates}`);
  console.log(`  unassigned (outside every unit's bounds): ${unassignedTotal.length}`);
  console.log(`  excluded (missing name tag): ${excludedMissingNameTotal.length}`);

  // ---- Checkpoint: confirm every unit's candidate set, resumably ----
  console.log("\n== Checkpoint (per coverage unit) ==");
  const unitResults = await runBulkOsmSweep(candidatesByUnit, {
    runId: args.runId,
    processUnit: async (unitId, candidates) => ({ candidate_count: candidates.length }),
    onProgress: ({ unitId, skipped, record }) => {
      if (!skipped && record.candidate_count > 0) console.log(`  ${unitId}: ${record.status} (${record.candidate_count} candidates)`);
    },
  });
  const coverageSummary = summariseBulkOsmCoverage(units.map((u) => u.coverage_unit_id), unitResults);
  console.log(`  coverage summary: ${JSON.stringify(coverageSummary)}`);

  // ---- Locality backfill (reused unchanged) ----
  const osmCandidatesRaw = [...candidatesByUnit.values()].flat();
  const seedLocalities = buildSeedLocalities(ukVenues, londonVenues);
  const tagLocalities = osmCandidatesRaw
    .map((c) => localityFromTags(parseOsmTagsEvidence(c), c.reported_latitude, c.reported_longitude))
    .filter(Boolean);
  const gazetteer = buildLocalityGazetteer(tagLocalities, seedLocalities);
  console.log(`\n  locality gazetteer: ${gazetteer.size} named localities (${tagLocalities.length} from this sweep + ${seedLocalities.length} already-known city seeds)`);
  const osmCandidates = osmCandidatesRaw.map((c) => rehydrateCandidateCity(c, gazetteer));

  // ---- Reconcile (bucketed-by-city wrapper around the unchanged reconcileCandidates) ----
  console.log("\n== Reconciliation ==");
  const reconcileStart = Date.now();
  const reconciledGroups = reconcileCandidatesByCity(osmCandidates);
  console.log(`  reconciled ${osmCandidates.length} candidates into ${reconciledGroups.length} groups (${Date.now() - reconcileStart}ms)`);
  const withExistingRegistry = reconcileWithExistingRegistry(reconciledGroups, londonSources, { venues: [...ukVenues.venues, ...londonVenues.venues] });

  // ---- Admission (unchanged) ----
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

  // ---- Build canonical venues for auto-admitted groups (buildVenueFromGroup reused unchanged) ----
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
    if (existingIds.has(venue.venue_id)) continue;
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
  const runSummary = {
    artifact_type: "UK_NATIONAL_BULK_OSM_RUN_SUMMARY",
    run_id: args.runId,
    started_at: startedAt,
    completed_at: completedAt,
    coverage: coverageSummary,
    coverage_unit_count: units.length,
    package02_reclassified_unit_count: reclassification.reclassified_count,
    raw_osm_objects_inspected: rawOsmObjectsInspected,
    raw_osm_objects_matched_broad_discovery_tags: rawOsmObjectsMatchedBroadTags,
    generic_noisy_records_filtered_before_candidacy: filteredGenericLeadsTotal.length,
    total_raw_candidates: osmCandidates.length,
    candidate_count_by_qualifying_signal: signalCountsTotal,
    bare_community_centre_candidates_remaining: remainingCommunityCentresInCandidates,
    unassigned_candidate_count: unassignedTotal.length,
    excluded_missing_name_count: excludedMissingNameTotal.length,
    reconciled_group_count: reconciledGroups.length,
    admission_status_counts: statusCounts,
    unexplained,
    newly_admitted_venue_count: newVenues.length,
    identity_conflicts: identityConflicts.length,
    build_failures: buildFailures.length,
  };
  await saveJson(`${RESEARCH_DIR}/run.json`, runSummary);
  await saveRunCheckpoint(args.runId, runSummary);
  await saveJson(`${RESEARCH_DIR}/coverage-summary.json`, {
    generated_at: completedAt,
    total_units: units.length,
    counts: coverageSummary,
    units: unitResults.map((r) => ({ coverage_unit_id: r.coverage_unit_id, status: r.status, candidate_count: r.candidate_count ?? 0 })),
  });
  await saveJson(`${RESEARCH_DIR}/candidate-summary.json`, {
    raw_osm_objects_inspected: rawOsmObjectsInspected,
    raw_osm_objects_matched_broad_discovery_tags: rawOsmObjectsMatchedBroadTags,
    total_raw_candidates: osmCandidates.length,
    candidate_count_by_qualifying_signal: signalCountsTotal,
    bare_community_centre_candidates_remaining: remainingCommunityCentresInCandidates,
    unassigned_candidate_count: unassignedTotal.length,
    unassigned_sample: unassignedTotal.slice(0, 20).map((c) => ({ provider_record_id: c.provider_record_id, reported_name: c.reported_name, reported_latitude: c.reported_latitude, reported_longitude: c.reported_longitude })),
    excluded_missing_name_count: excludedMissingNameTotal.length,
  });
  await saveJson(`${RESEARCH_DIR}/filtered-generic-leads-summary.json`, {
    artifact_type: "UK_NATIONAL_BULK_OSM_FILTERED_GENERIC_LEADS",
    note: "Generic-category OSM elements (community_centre, pub, bar, restaurant, hotel, place_of_worship, school, sports_centre, social_facility, etc.) that were DISCOVERED by the broad governed tag net but never entered the main candidate census because they carried no explicit live-event tag evidence and no strong existing-registry match. Full OSM identity retained for every lead — never discarded, never counted as a candidate/review/insufficient-evidence entry.",
    count: filteredGenericLeadsTotal.length,
    by_tag_category: filteredGenericLeadsTotal.reduce((acc, lead) => {
      const key = Object.entries(lead.tags ?? {}).map(([k, v]) => `${k}=${v}`).find((kv) => kv.startsWith("amenity=") || kv.startsWith("leisure=")) ?? "OTHER";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    sample: filteredGenericLeadsTotal.slice(0, 30).map((l) => ({ type: l.type, id: l.id, name: l.tags?.name ?? null, tags: l.tags, coverage_unit_id: l.coverage_unit_id })),
  });
  await saveJson(`${RESEARCH_DIR}/admission-summary.json`, statusCounts);
  await saveJson(`${RESEARCH_DIR}/review-queue.json`, {
    count: classified.filter((c) => c.decision.status === "REVIEW_REQUIRED").length,
    entries: classified.filter((c) => c.decision.status === "REVIEW_REQUIRED").map((c) => ({ reconciled_candidate_id: c.group.reconciled_candidate_id, names: c.group.reported_names, reason: c.decision.reason })),
  });
  await saveJson(`${RESEARCH_DIR}/failure-summary.json`, { identity_conflicts: identityConflicts, build_failures: buildFailures });
  await saveJson(`${RESEARCH_DIR}/source-yield.json`, {
    package01_carried_forward: ukVenues.venues.length,
    new_bulk_osm_candidates: osmCandidates.length,
    new_bulk_osm_canonical_venues: newVenues.length,
    duplicates_with_existing_uk_estate: statusCounts.ALREADY_CANONICAL ?? 0,
    excluded_noisy_candidates: (statusCounts.INSUFFICIENT_EVIDENCE ?? 0) + (statusCounts.NOT_LIVE_EVENT_VENUE ?? 0) + (statusCounts.SPORT_ONLY ?? 0) + (statusCounts.CLOSED_OR_INACTIVE ?? 0),
    review_required: statusCounts.REVIEW_REQUIRED ?? 0,
  });

  console.log(`\n=== discover:uk-bulk-osm summary ===`);
  console.log(JSON.stringify(runSummary, null, 2));

  return runSummary;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main, parseArgs, mergeCandidatesByUnit, reclassifyPackage02Failures };
