// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — per-source
// checkpointing. This is the entire mechanism that lets a city job survive
// a process restart without repeating already-terminal sources (see
// runner.mjs's runCityJob() for how these are read on resume).
//
// ONE FILE PER SOURCE: runtime/city-jobs/<job_id>/sources/<safe_source_id>.json.
// A source's checkpoint is written twice across its lifecycle:
//   1. RUNNING  — written immediately before the source's own acquisition
//                 begins. Non-terminal. If the process crashes here, this
//                 is exactly the recoverable evidence a restart needs: the
//                 source is known to have been in flight, never silently
//                 lost, and never wrongly treated as done.
//   2. terminal — SUCCESS | FAILED | RESIDUE, written once acquisition
//                 actually finishes (see job.mjs's SOURCE_CHECKPOINT_STATUSES).
// Both writes are atomic (tmp + rename), matching job-store.mjs.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveSourcesDir(jobId, { root = ROOT } = {}) {
  return resolve(root, "runtime/city-jobs", jobId, "sources");
}

/** Source ids are free-form strings from a source registry — never trusted as a literal filesystem path component. */
export function sanitizeSourceIdForFilename(sourceId) {
  return String(sourceId).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function resolveSourceCheckpointPath(jobId, sourceId, { root = ROOT } = {}) {
  return resolve(resolveSourcesDir(jobId, { root }), `${sanitizeSourceIdForFilename(sourceId)}.json`);
}

async function writeCheckpoint(jobId, sourceId, payload, { root = ROOT } = {}) {
  const dir = resolveSourcesDir(jobId, { root });
  await mkdir(dir, { recursive: true });
  const finalPath = resolveSourceCheckpointPath(jobId, sourceId, { root });
  const tmpPath = resolve(dir, `.${sanitizeSourceIdForFilename(sourceId)}.${randomUUID()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, finalPath);
  return finalPath;
}

/** Non-terminal "in flight" marker — see this module's own header comment. */
export async function markSourceRunning(jobId, sourceId, { root = ROOT, startedAt, attempt = 1 } = {}) {
  return writeCheckpoint(jobId, sourceId, { source_id: sourceId, status: "RUNNING", started_at: startedAt, attempt }, { root });
}

/**
 * Persist a source's terminal checkpoint. `status` must be one of
 * SUCCESS | FAILED | RESIDUE (see job.mjs). `detail` is the outcome-
 * specific payload (observation_count, error, residue_reason, ...),
 * spread onto the record unchanged — this module never inspects it.
 */
export async function recordSourceResult(jobId, sourceId, { status, attempts, startedAt, completedAt, ...detail } = {}, { root = ROOT } = {}) {
  return writeCheckpoint(
    jobId,
    sourceId,
    { source_id: sourceId, status, attempts: attempts ?? 1, started_at: startedAt ?? null, completed_at: completedAt, ...detail },
    { root },
  );
}

/** Every checkpoint currently on disk for a job, keyed by source_id (RUNNING and terminal alike — see runner.mjs for how the two are told apart on resume). */
export async function loadSourceCheckpoints(jobId, { root = ROOT } = {}) {
  const dir = resolveSourcesDir(jobId, { root });
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
      const raw = await readFile(resolve(dir, entry.name), "utf8");
      const record = JSON.parse(raw);
      if (record?.source_id) byId.set(record.source_id, record);
    } catch {
      // A corrupt/partially-written checkpoint file is treated as "not yet
      // terminal for this source" rather than a hard failure — the runner
      // will simply re-attempt that one source, which is always safe
      // (see docs/UNATTENDED_CITY_WORKER.md's idempotent-resume section).
    }
  }
  return byId;
}

export function isTerminalCheckpoint(record) {
  return record?.status === "SUCCESS" || record?.status === "FAILED" || record?.status === "RESIDUE";
}

export { ROOT as CHECKPOINT_STORE_ROOT };
