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
// per-path promise chain — no cross-process guarantee is needed here
// (job.mjs/runner.mjs never runs two workers against the same job
// concurrently — see lock.mjs for that guarantee), only "this process's
// own concurrent lanes never race each other".
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

/** Atomic write of a job record: tmp file in the same directory, then rename (rename within one filesystem/volume is atomic), serialised per job path (see above). */
export async function saveJob(job, { root = ROOT } = {}) {
  const dir = resolveJobDir(job.job_id, { root });
  const finalPath = resolve(dir, "job.json");
  return serialized(finalPath, async () => {
    await mkdir(dir, { recursive: true });
    const tmpPath = resolve(dir, `.job.${randomUUID()}.tmp`);
    const serializedJob = `${JSON.stringify(job, null, 2)}\n`;
    await writeFile(tmpPath, serializedJob, "utf8");
    await rename(tmpPath, finalPath);
    return finalPath;
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
