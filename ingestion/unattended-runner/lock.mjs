// BOTM-UNATTENDED-COLLECTION-RUNNER-01 — the simplest robust single-run
// guard appropriate to this repository: a local PID lockfile. No Redis,
// no database, no queue, no Docker orchestration — a boring file on the
// same server the runner itself runs on, matching every other piece of
// runtime state this project already keeps in plain files (venues/
// manual-coordinates.json, data/public/lisbon-porto-map.json).
//
// THE CANONICAL LOCK FILE is runtime/unattended-run.lock, resolved from
// THIS MODULE'S OWN FILE LOCATION (import.meta.url, walking up to the
// repository root) — never from process.cwd() — matching the exact
// existing convention already used by ingestion/geocoding/
// manual-coordinate-store.mjs and ingestion/map/publish-artifact-io.mjs.
//
// Mechanism: exclusive file creation (`open(path, "wx")`) is atomic at the
// filesystem level — two processes racing to create the same path can
// never both succeed. The winner's lock file records its own PID and
// start time; the loser is refused immediately, safely, before touching
// anything else (never a corrupted public artifact).
//
// Stale/crashed-run handling (honest, not swept under the rug): if a
// previous run was killed hard (SIGKILL, host reboot, out-of-memory) it
// never reaches its own `finally` release, and the lock file would
// otherwise block every future run forever. A lock is treated as STALE —
// safe to take over — when EITHER its recorded PID is no longer a live
// process on this host, OR it is older than `staleAfterMs` (default 2
// hours — comfortably longer than any real Lisbon+Porto collection cycle
// has ever taken in this project's own live proofs). A live, non-stale
// lock is never overridden.

import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const DEFAULT_LOCK_STALE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

export function resolveLockPath({ root = ROOT } = {}) {
  return resolve(root, "runtime/unattended-run.lock");
}

/**
 * True if `pid` names a currently-live process on this host. `process.kill
 * (pid, 0)` sends no actual signal — it only probes existence/permission,
 * and this is supported cross-platform by Node.js (including Windows).
 * EPERM means the process exists but is owned by someone else — still
 * alive, so never treated as stale on that basis alone.
 */
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
    return null; // missing, unreadable, or corrupt — treated as unknown, not alive
  }
}

/**
 * Attempt to acquire the single-run lock. Returns:
 *   { ok: true,  path }
 *   { ok: false, reason: "ANOTHER_RUN_IN_PROGRESS", existing }
 *   { ok: false, reason: "LOCK_CONTENDED_AFTER_STALE_CLEANUP", existing }
 * Never throws for ordinary contention — only for a genuine filesystem
 * error (e.g. an unwritable directory), matching this repository's
 * existing convention for I/O failures elsewhere.
 */
export async function acquireRunLock({ root = ROOT, staleAfterMs = DEFAULT_LOCK_STALE_AFTER_MS, pid = process.pid } = {}) {
  const path = resolveLockPath({ root });
  await mkdir(dirname(path), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx"); // exclusive create — atomic; fails with EEXIST if already present
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
        return { ok: false, reason: "ANOTHER_RUN_IN_PROGRESS", existing };
      }
      if (attempt === 0) {
        await rm(path, { force: true }); // stale/crashed — safe to reclaim; try once more
        continue;
      }
      return { ok: false, reason: "LOCK_CONTENDED_AFTER_STALE_CLEANUP", existing };
    }
  }
  return { ok: false, reason: "LOCK_CONTENDED_AFTER_STALE_CLEANUP" };
}

/**
 * Release the lock. Idempotent — releasing an already-absent lock is not
 * an error (this is always called from a `finally`, including on the
 * handled-failure path, so it must never itself throw for "nothing to
 * remove").
 */
export async function releaseRunLock({ root = ROOT } = {}) {
  const path = resolveLockPath({ root });
  await rm(path, { force: true });
}

export { ROOT as UNATTENDED_LOCK_ROOT };
