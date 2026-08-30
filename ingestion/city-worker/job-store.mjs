// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — durable, filesystem-
// backed persistence for one city job's own record (job.mjs's shape).
//
// THE CANONICAL LOCATION is runtime/city-jobs/<job_id>/job.json, resolved
// from THIS MODULE'S OWN FILE LOCATION (import.meta.url, walking up to
// the repository root) — never process.cwd() — matching the existing
// convention this project already uses for its other runtime state (e.g.
// ingestion/unattended-runner/lock.mjs's runtime/unattended-run.lock).
//
// Writes are atomic (write to a sibling tmp file, then rename) so a crash
// mid-write can never leave a job record half-written/corrupt — matching
// this project's existing atomic-publish convention.

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveCityJobsDir({ root = ROOT } = {}) {
  return resolve(root, "runtime/city-jobs");
}

export function resolveJobDir(jobId, { root = ROOT } = {}) {
  return resolve(resolveCityJobsDir({ root }), jobId);
}

export function resolveJobPath(jobId, { root = ROOT } = {}) {
  return resolve(resolveJobDir(jobId, { root }), "job.json");
}

// runner.mjs's bounded-concurrency processing means multiple sources can
// finish at nearly the same instant, each triggering its own saveJob()
// for the SAME job.json — a real intra-process race, not just a theory:
// two overlapping tmp-then-rename sequences targeting the same
// destination path can collide (observed as a rename EPERM on Windows;
// silently-interleaved writes are equally possible on POSIX). Every
// write for a given job path is therefore serialised through this small
// per-path promise chain — only "this process's own concurrent lanes
// never race each other".
//
// BEATMAPPED-CITY-JOB-OPERATOR-CANCEL-CONTROL-01 UPDATED THIS NOTE. It
// used to say "no cross-process guarantee is needed here", because only
// the worker ever wrote a job record and lock.mjs guarantees one worker.
// That is no longer true: the sanctioned cancel control runs
// `cli.mjs cancel-job` as a SEPARATE process that writes the same
// job.json while the worker is mid-city — by design. A short cross-
// process overlap on one record is therefore now a NORMAL operational
// event, not a bug, and on Windows a concurrent open handle on the
// destination makes the tmp->final rename fail with EPERM/EBUSY. That is
// transient, so the rename is retried briefly rather than failing the
// whole job (which is exactly how it surfaced: a real worker process
// died with "FATAL: EPERM ... rename"). The write itself stays atomic —
// this only retries the atomic step, it never falls back to a non-atomic
// write.
const pendingWritesByPath = new Map();

function serialized(path, task) {
  const previous = pendingWritesByPath.get(path) ?? Promise.resolve();
  const next = previous.then(task, task);
  pendingWritesByPath.set(
    path,
    next.catch(() => {}),
  );
  return next;
}

const RENAME_RETRY_DELAYS_MS = [10, 25, 50, 100, 200];

/** Transient on Windows when another process holds a read handle on the destination; never a real, persistent failure. */
function isTransientRenameError(error) {
  return error?.code === "EPERM" || error?.code === "EBUSY" || error?.code === "EACCES";
}

async function renameWithRetry(tmpPath, finalPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tmpPath, finalPath);
      return;
    } catch (error) {
      if (!isTransientRenameError(error) || attempt >= RENAME_RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, RENAME_RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** Atomic write of a job record: tmp file in the same directory, then rename (rename within one filesystem/volume is atomic), serialised per job path (see above). */
export async function saveJob(job, { root = ROOT } = {}) {
  const dir = resolveJobDir(job.job_id, { root });
  const finalPath = resolve(dir, "job.json");
  return serialized(finalPath, async () => {
    await mkdir(dir, { recursive: true });
    const tmpPath = resolve(dir, `.job.${randomUUID()}.tmp`);
    const serializedJob = `${JSON.stringify(job, null, 2)}\n`;
    await writeFile(tmpPath, serializedJob, "utf8");
    await renameWithRetry(tmpPath, finalPath);
    return finalPath;
  });
}

/**
 * BEATMAPPED-CITY-JOB-OPERATOR-CANCEL-CONTROL-01 — atomic READ-MODIFY-WRITE
 * of one job record, performed INSIDE the same per-path serialisation as
 * saveJob().
 *
 * The runner has to merge the operator-owned `cancel_requested` flag from
 * disk into every progress save, or it clobbers a cancellation that landed
 * mid-batch. Doing that as a separate `loadJob()` then `saveJob()` opens a
 * read handle on job.json that can overlap another lane's rename onto the
 * same path — the Windows EPERM this module already warns about. Reading
 * within the serialised section removes that overlap entirely for this
 * process's own lanes.
 *
 * `mutate(current)` receives the record as it is ON DISK (or null if it is
 * missing/unreadable) and returns the record to persist; returning null
 * writes nothing.
 */
export async function updateJob(jobId, mutate, { root = ROOT } = {}) {
  const dir = resolveJobDir(jobId, { root });
  const finalPath = resolve(dir, "job.json");
  return serialized(finalPath, async () => {
    let current = null;
    try {
      current = JSON.parse(await readFile(finalPath, "utf8"));
    } catch {
      current = null;
    }
    const next = mutate(current);
    if (!next) return null;
    await mkdir(dir, { recursive: true });
    const tmpPath = resolve(dir, `.job.${randomUUID()}.tmp`);
    await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await renameWithRetry(tmpPath, finalPath);
    return next;
  });
}

/** Returns null (never throws) when the job does not exist or its record is unreadable/corrupt — callers treat that as "no such job". */
export async function loadJob(jobId, { root = ROOT } = {}) {
  try {
    const raw = await readFile(resolveJobPath(jobId, { root }), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Every job_id with a persisted record, in no particular order — callers sort/filter as needed. */
export async function listJobIds({ root = ROOT } = {}) {
  const dir = resolveCityJobsDir({ root });
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export async function listJobs({ root = ROOT } = {}) {
  const ids = await listJobIds({ root });
  const jobs = await Promise.all(ids.map((id) => loadJob(id, { root })));
  return jobs.filter(Boolean);
}

export { ROOT as CITY_WORKER_ROOT };
