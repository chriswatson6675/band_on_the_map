// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — durable, resumable
// controller state. Mirrors ingestion/city-worker/checkpoint-store.mjs's
// own conventions exactly (one file per item, atomic tmp+rename writes,
// runtime/<namespace>/<run_id>/... layout) rather than inventing a
// different persistence scheme for this controller.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { TERMINAL_STATES } from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveRunDir(runId, { root = ROOT } = {}) {
  return resolve(root, "runtime/global-easy-harvester", runId);
}

export function resolveCandidatesDir(runId, { root = ROOT } = {}) {
  return resolve(resolveRunDir(runId, { root }), "candidates");
}

/** venue_id is already a safe kebab-case identifier (createVenueId), but sanitize anyway — matches checkpoint-store.mjs's own defensive convention for values it did not itself generate. */
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

/** Persist one candidate's current state. Called after every gate/admission transition so a crash never loses more than the in-flight step. */
export async function recordCandidateState(runId, venueId, record, { root = ROOT } = {}) {
  const dir = resolveCandidatesDir(runId, { root });
  return atomicWrite(dir, `${sanitizeIdForFilename(venueId)}.json`, { venue_id: venueId, ...record, updated_at: new Date().toISOString() });
}

/** Every candidate checkpoint currently on disk for a run, keyed by venue_id. Corrupt/partial files are treated as UNSEEN (safe to re-evaluate) rather than a hard failure. */
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
      // corrupt/partially-written checkpoint — leave unset, caller re-evaluates from UNSEEN
    }
  }
  return byVenueId;
}

export function isTerminalCandidateState(record) {
  return TERMINAL_STATES.has(record?.state);
}

/** The run-level summary record (counters, options, timestamps) — separate from per-candidate checkpoints so re-reading it never requires scanning the whole candidates/ directory. */
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
