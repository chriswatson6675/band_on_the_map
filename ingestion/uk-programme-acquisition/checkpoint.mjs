// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — durable,
// resumable per-source checkpointing under its own runtime/
// uk-programme-acquisition/<run_id>/ namespace. Mirrors the exact
// atomic-write, one-file-per-item convention this repository's other
// national campaigns already use (ingestion/future-city-wave/
// state-store.mjs, ingestion/uk-national-bulk-osm/checkpoint.mjs) — the
// same proven pattern, not a new one.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveRunDir(runId, { root = ROOT } = {}) {
  return resolve(root, "runtime/uk-programme-acquisition", runId);
}

export function resolveSourcesDir(runId, { root = ROOT } = {}) {
  return resolve(resolveRunDir(runId, { root }), "sources");
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

/** Terminal statuses this campaign's own checkpoint recognises — a source in any of these is never re-attempted on resume. RETRYABLE (transient failure, e.g. network) is NOT terminal — see loadSourceCheckpoints()'s caller in run.mjs, which re-attempts anything not in this set. */
export const TERMINAL_SOURCE_STATUSES = new Set(["ACQUIRED", "RESIDUE", "SKIPPED_SHARED_WEBSITE", "NO_SOURCE_FOUND"]);

export async function recordSourceCheckpoint(runId, sourceId, record, { root = ROOT } = {}) {
  return atomicWrite(resolveSourcesDir(runId, { root }), `${sanitizeIdForFilename(sourceId)}.json`, {
    source_id: sourceId,
    ...record,
    updated_at: new Date().toISOString(),
  });
}

export async function loadSourceCheckpoints(runId, { root = ROOT } = {}) {
  const dir = resolveSourcesDir(runId, { root });
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
      if (record?.source_id) byId.set(record.source_id, record);
    } catch {
      // corrupt/partial checkpoint file — leave unset, caller re-attempts this source
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

export { ROOT as UK_PROGRAMME_ACQUISITION_ROOT };
