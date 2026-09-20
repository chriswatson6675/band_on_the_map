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

/**
 * BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — the durable
 * candidate execution identity, used as the checkpoint file key INSTEAD
 * OF venue_id. venue_id is derived purely from (canonical_name, city) —
 * two distinct real venues that happen to share a name (a real,
 * confirmed occurrence: two un-merged reconciled representations of "AO
 * Arena" from different providers, or any two OSM elements with
 * identical names) collide on it and silently overwrite each other's
 * checkpoint. A candidate's own discovery identity never collapses this
 * way: a multi-source reconciled candidate's reconciled_candidate_id is
 * unique per reconciled group by construction (reconcile.mjs derives it
 * from its group's own lexicographically-first, individually-unique
 * observation candidate_id — union-find groups are always disjoint, so
 * no two groups can share a "first" member); a legacy single-provider
 * candidate's own provenance.candidate_id is unique per raw discovered
 * element for the same reason. Both are deterministic and — so long as
 * the same city's discovery data is reused on resume (already true via
 * recordCityState/loadCityStates) — stable across interruption/resume,
 * independent of execution order.
 */
export function deriveExecutionId(candidate) {
  return candidate?.provenance?.reconciled_candidate_id ?? candidate?.provenance?.candidate_id ?? null;
}

/**
 * `candidate` (not a bare venue_id) is now required so both the new
 * durable execution_id (the file key) and venue_id (retained on the
 * record as the potential canonical venue identity, never used as the
 * key) can be captured together.
 */
export async function recordCandidateState(runId, candidate, record, { root = ROOT } = {}) {
  const executionId = deriveExecutionId(candidate);
  if (!executionId) throw new Error(`recordCandidateState: candidate has no derivable execution_id (venue_id=${candidate?.venue_id ?? "unknown"})`);
  const dir = resolveCandidatesDir(runId, { root });
  return atomicWrite(dir, `${sanitizeIdForFilename(executionId)}.json`, { execution_id: executionId, venue_id: candidate.venue_id, ...record, updated_at: new Date().toISOString() });
}

/**
 * Returns BOTH new-format checkpoints (keyed by their own execution_id,
 * always unambiguous) and legacy checkpoints (pre-Correction-03 runs,
 * recorded before execution_id existed, filed only under venue_id) —
 * kept in two separate maps rather than merged, because a legacy
 * checkpoint's safety to reuse depends on today's candidate list (see
 * resolveCandidateCheckpoint) and cannot be decided here.
 */
export async function loadCandidateStates(runId, { root = ROOT } = {}) {
  const dir = resolveCandidatesDir(runId, { root });
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { byExecutionId: new Map(), legacyByVenueId: new Map() };
    throw error;
  }

  const byExecutionId = new Map();
  const legacyByVenueId = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
    try {
      const record = JSON.parse(await readFile(resolve(dir, entry.name), "utf8"));
      if (record?.execution_id) byExecutionId.set(record.execution_id, record);
      else if (record?.venue_id) legacyByVenueId.set(record.venue_id, record);
    } catch {
      // corrupt/partial checkpoint — leave unset, caller re-evaluates
    }
  }
  return { byExecutionId, legacyByVenueId };
}

/**
 * Resolve one candidate's checkpoint (if any) from the state loaded by
 * loadCandidateStates(). A new-format checkpoint, keyed by this
 * candidate's own execution_id, is always unambiguous. A legacy
 * checkpoint (a pre-Correction-03 run, keyed only by venue_id) is reused
 * ONLY when venue_id is unique across every candidate THIS run currently
 * has for the city — if two of today's candidates share a venue_id, the
 * legacy checkpoint cannot tell which one it actually belongs to, so
 * neither may reuse it; both are re-evaluated fresh, each recorded going
 * forward under its own, unambiguous execution_id.
 */
export function resolveCandidateCheckpoint(states, candidate, allCandidates) {
  const executionId = deriveExecutionId(candidate);
  if (executionId && states.byExecutionId.has(executionId)) return states.byExecutionId.get(executionId);
  const legacy = states.legacyByVenueId.get(candidate.venue_id);
  if (!legacy) return undefined;
  const sharingCount = allCandidates.filter((c) => c.venue_id === candidate.venue_id).length;
  if (sharingCount > 1) return undefined;
  return legacy;
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
