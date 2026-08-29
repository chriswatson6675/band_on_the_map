// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — a single-worker-
// instance guard, generalised from this project's existing single-run
// lockfile pattern (ingestion/unattended-runner/lock.mjs in the parallel
// collector work). Same mechanism, same rationale: a local PID lockfile,
// exclusive-create atomic at the filesystem level, no Redis/database/
// queue software.
//
// This lock guards ONE THING: at most one city-worker process draining
// the queue on a given host at a time (see worker-loop.mjs). It is
// separate from any per-job or per-source state — a crashed worker still
// leaves every job/source checkpoint exactly where runner.mjs left it;
// this lock only prevents two worker processes from racing on the same
// queue.

import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const DEFAULT_LOCK_STALE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

export function resolveWorkerLockPath({ root = ROOT } = {}) {
  return resolve(root, "runtime/city-worker.lock");
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readLockPayload(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Attempt to acquire the worker lock. Returns:
 *   { ok: true,  path }
 *   { ok: false, reason: "ANOTHER_WORKER_RUNNING", existing }
 *   { ok: false, reason: "LOCK_CONTENDED_AFTER_STALE_CLEANUP", existing }
 * A stale lock (recorded PID no longer alive, or older than
 * `staleAfterMs`) is reclaimed automatically — see
 * ingestion/unattended-runner/lock.mjs's own doc comment for the full
 * rationale, unchanged here.
 */
export async function acquireWorkerLock({ root = ROOT, staleAfterMs = DEFAULT_LOCK_STALE_AFTER_MS, pid = process.pid } = {}) {
  const path = resolveWorkerLockPath({ root });
  await mkdir(dirname(path), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid, started_at: new Date().toISOString() }, null, 2), "utf8");
      } finally {
        await handle.close();
      }
      return { ok: true, path };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      const existing = await readLockPayload(path);
      const alive = existing?.pid ? isProcessAlive(existing.pid) : false;
      let ageMs = null;
      if (typeof existing?.started_at === "string") {
        const startedAtMs = Date.parse(existing.started_at);
        if (!Number.isNaN(startedAtMs)) ageMs = Date.now() - startedAtMs;
      }
      const stale = !alive || (ageMs !== null && ageMs > staleAfterMs);

      if (!stale) {
        return { ok: false, reason: "ANOTHER_WORKER_RUNNING", existing };
      }
      if (attempt === 0) {
        await rm(path, { force: true });
        continue;
      }
      return { ok: false, reason: "LOCK_CONTENDED_AFTER_STALE_CLEANUP", existing };
    }
  }
  return { ok: false, reason: "LOCK_CONTENDED_AFTER_STALE_CLEANUP" };
}

export async function releaseWorkerLock({ root = ROOT } = {}) {
  await rm(resolveWorkerLockPath({ root }), { force: true });
}

/** Read the current lock payload without acquiring — used by health.mjs to answer "is a worker alive?" without perturbing it. */
export async function readWorkerLockStatus({ root = ROOT, staleAfterMs = DEFAULT_LOCK_STALE_AFTER_MS } = {}) {
  const existing = await readLockPayload(resolveWorkerLockPath({ root }));
  if (!existing) return { present: false, alive: false };
  const alive = existing?.pid ? isProcessAlive(existing.pid) : false;
  let ageMs = null;
  if (typeof existing?.started_at === "string") {
    const startedAtMs = Date.parse(existing.started_at);
    if (!Number.isNaN(startedAtMs)) ageMs = Date.now() - startedAtMs;
  }
  const stale = !alive || (ageMs !== null && ageMs > staleAfterMs);
  return { present: true, alive: alive && !stale, pid: existing.pid ?? null, started_at: existing.started_at ?? null };
}

export { ROOT as CITY_WORKER_LOCK_ROOT };
