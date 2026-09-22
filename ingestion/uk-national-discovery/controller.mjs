// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — the
// resumable, checkpointed controller driving the national coverage sweep.
// Mirrors ingestion/future-city-wave/state-store.mjs's exact conventions
// (one JSON file per unit, atomic tmp+rename, runtime/<namespace>/<run_id>/
// layout) under its own namespace, so this campaign survives a killed
// process/laptop sleep/session end exactly the way that proven module
// already does — re-running the same runId skips every unit already
// COMPLETE or PERMANENT_FAILURE, and only ever retries genuinely
// unfinished work.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveRunDir(runId, { root = ROOT } = {}) {
  return resolve(root, "runtime/uk-national-discovery", runId);
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

export async function recordUnitState(runId, unitId, record, { root = ROOT } = {}) {
  return atomicWrite(resolveUnitsDir(runId, { root }), `${sanitizeIdForFilename(unitId)}.json`, {
    coverage_unit_id: unitId,
    ...record,
    updated_at: new Date().toISOString(),
  });
}

export async function loadUnitStates(runId, { root = ROOT } = {}) {
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
      // corrupt/partial checkpoint — leave unset, caller re-attempts this unit
    }
  }
  return byId;
}

export async function saveRunSummary(runId, summary, { root = ROOT } = {}) {
  return atomicWrite(resolveRunDir(runId, { root }), "run.json", summary);
}

export async function loadRunSummary(runId, { root = ROOT } = {}) {
  try {
    return JSON.parse(await readFile(resolve(resolveRunDir(runId, { root }), "run.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export const MAX_ATTEMPTS_PER_UNIT = 3;
export const RETRY_BACKOFF_MS = [5000, 15000, 30000];

const TERMINAL_UNIT_STATES = new Set(["COMPLETE", "PERMANENT_FAILURE"]);

/**
 * Run (or resume) OSM discovery across every coverage unit. Every unit
 * already COMPLETE/PERMANENT_FAILURE under this runId is skipped
 * entirely (never re-queried — this package's brief: a resumable
 * campaign, not a re-run-from-scratch one). A transient failure
 * (timeout, 5xx, malformed response) is retried up to
 * MAX_ATTEMPTS_PER_UNIT times with backoff before being recorded
 * PERMANENT_FAILURE — one unit's exhausted retries never halts the
 * sweep; every other unit still runs (this package's brief, Phase 26).
 *
 * `discover(unit)` defaults to the real live Overpass call
 * (ingestion/uk-national-discovery/overpass-bbox-query.mjs) but is
 * injectable for tests. `sleep` is injectable so tests never actually
 * wait out the real backoff delays.
 */
export async function runCoverageSweep(
  units,
  { runId, root = ROOT, discover, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onProgress } = {},
) {
  if (!runId) throw new Error("runCoverageSweep requires a runId");
  if (typeof discover !== "function") throw new Error("runCoverageSweep requires a discover(unit) function");

  const existing = await loadUnitStates(runId, { root });
  const results = [];

  for (const unit of units) {
    const prior = existing.get(unit.coverage_unit_id);
    if (prior && TERMINAL_UNIT_STATES.has(prior.status)) {
      results.push(prior);
      onProgress?.({ unit, skipped: true, record: prior });
      continue;
    }

    let attempt = prior?.attempt_count ?? 0;
    let record = null;
    while (attempt < MAX_ATTEMPTS_PER_UNIT) {
      attempt += 1;
      const startedAt = new Date().toISOString();
      const outcome = await discover(unit);
      const completedAt = new Date().toISOString();

      if (!outcome.error) {
        record = {
          status: "COMPLETE",
          attempt_count: attempt,
          candidate_count: outcome.candidates.length,
          started_at: startedAt,
          completed_at: completedAt,
          error: null,
          candidates: outcome.candidates,
        };
        break;
      }

      const exhausted = attempt >= MAX_ATTEMPTS_PER_UNIT;
      record = {
        status: exhausted ? "PERMANENT_FAILURE" : "RETRYABLE_FAILURE",
        attempt_count: attempt,
        candidate_count: 0,
        started_at: startedAt,
        completed_at: completedAt,
        error: outcome.error,
        candidates: [],
      };
      if (!exhausted) {
        await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1));
      }
    }

    await recordUnitState(runId, unit.coverage_unit_id, record, { root });
    results.push({ coverage_unit_id: unit.coverage_unit_id, ...record });
    onProgress?.({ unit, skipped: false, record });
  }

  return results;
}

/** Roll up unit results into the exact PENDING/RUNNING/COMPLETE/RETRYABLE_FAILURE/PERMANENT_FAILURE counts this package's brief requires. Units still PENDING (e.g. sweep interrupted) are inferred from `allUnits` vs. what actually has a terminal/attempted record. */
export function summariseCoverage(allUnits, unitResults) {
  const byId = new Map(unitResults.map((r) => [r.coverage_unit_id, r]));
  const counts = { PENDING: 0, RUNNING: 0, COMPLETE: 0, RETRYABLE_FAILURE: 0, PERMANENT_FAILURE: 0 };
  for (const unit of allUnits) {
    const status = byId.get(unit.coverage_unit_id)?.status ?? "PENDING";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export { ROOT as UK_NATIONAL_DISCOVERY_ROOT };
