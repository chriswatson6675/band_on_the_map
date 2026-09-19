// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — before/after product
// accounting (Phase 13) and the operator-facing summary (Phase 12). Reads
// only; never mutates anything. Reuses the SAME public artifact
// (data/public/lisbon-porto-map.json) and its own already-computed
// `counts` block — never recomputes marker/listing totals independently.

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_ARTIFACT_PATH = "data/public/lisbon-porto-map.json";

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function countRegistryEntries(dir, arrayKey) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "registry.schema.json");
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
  let total = 0;
  for (const file of files) {
    const doc = await readJsonSafe(resolve(dir, file));
    const arr = doc?.[arrayKey];
    if (Array.isArray(arr)) total += arr.length;
  }
  return total;
}

/** One point-in-time product snapshot: venue/source registry totals plus the current published public-map artifact's own counts. */
export async function captureProductSnapshot({ root = ROOT } = {}) {
  const [venues, sources, publicArtifact] = await Promise.all([
    countRegistryEntries(resolve(root, "venues"), "venues"),
    countRegistryEntries(resolve(root, "sources"), "entries"),
    readJsonSafe(resolve(root, PUBLIC_ARTIFACT_PATH)),
  ]);

  return {
    venues,
    sources,
    public_map_markers: publicArtifact?.counts?.map_marker_count ?? 0,
    public_listings: publicArtifact?.counts?.display_listing_count ?? 0,
  };
}

export function formatBeforeAfter(before, after) {
  const net = (key) => after[key] - before[key];
  return [
    "BEFORE",
    `  VENUES: ${before.venues}`,
    `  SOURCES: ${before.sources}`,
    `  PUBLIC MAP VENUES/MARKERS: ${before.public_map_markers}`,
    `  PUBLIC LISTINGS: ${before.public_listings}`,
    "AFTER",
    `  VENUES: ${after.venues}`,
    `  SOURCES: ${after.sources}`,
    `  PUBLIC MAP VENUES/MARKERS: ${after.public_map_markers}`,
    `  PUBLIC LISTINGS: ${after.public_listings}`,
    "NET CHANGE",
    `  VENUES: ${net("venues")}`,
    `  SOURCES: ${net("sources")}`,
    `  PUBLIC MAP VENUES/MARKERS: ${net("public_map_markers")}`,
    `  PUBLIC LISTINGS: ${net("public_listings")}`,
  ].join("\n");
}

export function formatCounters(summary) {
  const c = summary.counters;
  const deferLines = Object.entries(c.deferred_by_reason)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `    ${reason}: ${count}`);

  return [
    `RUN: ${summary.run_id} (${summary.dry_run ? "DRY RUN" : "EXECUTE"}, max_admissions=${summary.max_admissions})`,
    `CITIES ENCOUNTERED: ${c.cities_encountered}`,
    `CANDIDATES CHECKED: ${c.candidates_checked} (resumed/skipped: ${c.resumed_skipped})`,
    `ALREADY LIVE: ${c.already_live}`,
    `REPAIR: ${c.repair}`,
    `TIER-1 PROVEN: ${c.tier1_proven}`,
    `ADMITTED: ${c.admitted}`,
    `FAILED SYSTEMIC: ${c.failed_systemic}`,
    "DEFERRED BY REASON:",
    ...(deferLines.length > 0 ? deferLines : ["    (none)"]),
  ].join("\n");
}

export { ROOT as REPORT_ROOT, PUBLIC_ARTIFACT_PATH };
