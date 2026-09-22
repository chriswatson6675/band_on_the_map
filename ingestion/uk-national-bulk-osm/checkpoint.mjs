// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — durable,
// resumable checkpointing for this package's own bulk-OSM sweep, under
// its own runtime/uk-national-bulk-osm/<run_id>/ namespace (never sharing
// runtime/uk-national-discovery/ with package-02's live-Overpass
// controller — a different pipeline, a different resumability contract).
// Mirrors ingestion/uk-national-discovery/controller.mjs's exact
// atomic-write convention (tmp file + rename, one JSON file per coverage
// unit) — the same proven pattern, not a new one, applied to a new
// namespace.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveRunDir(runId, { root = ROOT } = {}) {
  return resolve(root, "runtime/uk-national-bulk-osm", runId);
}

export function resolveUnitsDir(runId, { root = ROOT } = {}) {
  return resolve(resolveRunDir(runId, { root }), "units");
}

export function sanitizeIdForFilename(id) {
  return String(id).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function atomicWrite(dir, filename, payload) {
  await mkdir(dir, { recursive: true });
  const finalPath = resolve(dir, filename);
  const tmpPath = resolve(dir, `.${filename}.${randomUUID()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, finalPath);
  return finalPath;
}

export async function recordUnitCheckpoint(runId, unitId, record, { root = ROOT } = {}) {
  return atomicWrite(resolveUnitsDir(runId, { root }), `${sanitizeIdForFilename(unitId)}.json`, {
    coverage_unit_id: unitId,
    ...record,
    updated_at: new Date().toISOString(),
  });
}

export async function loadUnitCheckpoints(runId, { root = ROOT } = {}) {
  const dir = resolveUnitsDir(runId, { root });
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const byId = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
    try {
      const record = JSON.parse(await readFile(resolve(dir, entry.name), "utf8"));
      if (record?.coverage_unit_id) byId.set(record.coverage_unit_id, record);
    } catch {
      // corrupt/partial checkpoint file — leave unset, caller re-processes this unit
    }
  }
  return byId;
}

export async function saveRunCheckpoint(runId, summary, { root = ROOT } = {}) {
  return atomicWrite(resolveRunDir(runId, { root }), "run.json", summary);
}

export async function loadRunCheckpoint(runId, { root = ROOT } = {}) {
  try {
    return JSON.parse(await readFile(resolve(resolveRunDir(runId, { root }), "run.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export const BULK_OSM_TERMINAL_UNIT_STATUSES = new Set(["COMPLETE", "COMPLETE_NO_CANDIDATES", "SOURCE_DATA_INVALID"]);

/**
 * Process every coverage unit's candidates through `processUnit(unitId,
 * candidates)`, skipping any unit already checkpointed into a terminal
 * status under this runId (resumability: killing and re-running the same
 * runId never re-derives work already done). `candidatesByUnit` is a Map
 * of coverage_unit_id -> candidate array (every unit present, even with
 * zero candidates, so a genuinely-empty unit still gets a real
 * COMPLETE_NO_CANDIDATES checkpoint rather than silently vanishing from
 * accounting).
 */
export async function runBulkOsmSweep(candidatesByUnit, { runId, root = ROOT, processUnit, onProgress } = {}) {
  if (!runId) throw new Error("runBulkOsmSweep requires a runId");
  if (typeof processUnit !== "function") throw new Error("runBulkOsmSweep requires a processUnit(unitId, candidates) function");

  const existing = await loadUnitCheckpoints(runId, { root });
  const results = [];

  for (const [unitId, candidates] of candidatesByUnit) {
    const prior = existing.get(unitId);
    if (prior && BULK_OSM_TERMINAL_UNIT_STATUSES.has(prior.status)) {
      results.push(prior);
      onProgress?.({ unitId, skipped: true, record: prior });
      continue;
    }

    const startedAt = new Date().toISOString();
    let record;
    try {
      const outcome = await processUnit(unitId, candidates);
      record = {
        status: candidates.length === 0 ? "COMPLETE_NO_CANDIDATES" : "COMPLETE",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        error: null,
        ...outcome,
      };
    } catch (error) {
      // Failure policy (this package's brief): a genuine per-unit defect
      // (malformed candidate data for this specific cell) is recorded and
      // the sweep continues — it never halts the whole national run. Only
      // an unrecoverable, corruption-level failure would justify stopping
      // the whole job, and that is a decision made by the caller/run.mjs
      // orchestrator, not this per-unit loop.
      record = {
        status: "SOURCE_DATA_INVALID",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        error: String(error?.message ?? error),
        candidate_count: candidates.length,
      };
    }

    await recordUnitCheckpoint(runId, unitId, record, { root });
    results.push({ coverage_unit_id: unitId, ...record });
    onProgress?.({ unitId, skipped: false, record });
  }

  return results;
}

/** Roll up unit results into COMPLETE/COMPLETE_NO_CANDIDATES/SOURCE_DATA_INVALID/PENDING counts across ALL 209 units (units never present in `unitResults` — e.g. sweep interrupted — count as PENDING). */
export function summariseBulkOsmCoverage(allUnitIds, unitResults) {
  const byId = new Map(unitResults.map((r) => [r.coverage_unit_id, r]));
  const counts = { PENDING: 0, COMPLETE: 0, COMPLETE_NO_CANDIDATES: 0, SOURCE_DATA_INVALID: 0 };
  for (const unitId of allUnitIds) {
    const status = byId.get(unitId)?.status ?? "PENDING";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export { ROOT as UK_NATIONAL_BULK_OSM_ROOT };
