// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — durable, resumable
// state, mirroring ingestion/global-easy-harvester/state-store.mjs's own
// conventions exactly (one JSON file per candidate, atomic tmp+rename,
// runtime/<namespace>/<run_id>/... layout) under its own namespace rather
// than sharing global-easy-harvester's runtime directory.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { TERMINAL_STATES } from "../global-easy-harvester/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveRunDir(runId, { root = ROOT } = {}) {
  return resolve(root, "runtime/future-city-wave", runId);
}

export function resolveCandidatesDir(runId, { root = ROOT } = {}) {
  return resolve(resolveRunDir(runId, { root }), "candidates");
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

export async function recordCandidateState(runId, venueId, record, { root = ROOT } = {}) {
  const dir = resolveCandidatesDir(runId, { root });
  return atomicWrite(dir, `${sanitizeIdForFilename(venueId)}.json`, { venue_id: venueId, ...record, updated_at: new Date().toISOString() });
}

export async function loadCandidateStates(runId, { root = ROOT } = {}) {
  const dir = resolveCandidatesDir(runId, { root });
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }

  const byVenueId = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
    try {
      const record = JSON.parse(await readFile(resolve(dir, entry.name), "utf8"));
      if (record?.venue_id) byVenueId.set(record.venue_id, record);
    } catch {
      // corrupt/partial checkpoint — leave unset, caller re-evaluates
    }
  }
  return byVenueId;
}

export function isTerminalCandidateState(record) {
  return TERMINAL_STATES.has(record?.state);
}

/** Per-city bookkeeping (geocode result, discovery outcome) — separate from per-candidate checkpoints so resuming a city never requires re-geocoding or re-querying Overpass. */
export async function recordCityState(runId, cityId, record, { root = ROOT } = {}) {
  return atomicWrite(resolve(resolveRunDir(runId, { root }), "cities"), `${sanitizeIdForFilename(cityId)}.json`, { city_id: cityId, ...record, updated_at: new Date().toISOString() });
}

export async function loadCityStates(runId, { root = ROOT } = {}) {
  const dir = resolve(resolveRunDir(runId, { root }), "cities");
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const byCityId = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
    try {
      const record = JSON.parse(await readFile(resolve(dir, entry.name), "utf8"));
      if (record?.city_id) byCityId.set(record.city_id, record);
    } catch {
      // corrupt/partial — re-discover this city
    }
  }
  return byCityId;
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

export { ROOT as STATE_STORE_ROOT };
