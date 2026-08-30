// BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 — the
// end-to-end operator lifecycle proof, retained as a repeatable test
// rather than a one-off transcript.
//
// It runs the WHOLE governed path against a temporary runtime root:
//
//   governed catalogue key -> ACTIVE-membership resolution -> frozen
//   per-job estate snapshot -> real `node worker-loop-main.mjs` child
//   process (the exact systemd ExecStart) -> drain -> terminal job ->
//   exit 0 -> second explicit cycle -> new job id -> second clean exit
//
// REAL governed data, NO network. The catalogue, the real
// sources/berlin.json registry and the real committed berlin-proof-5
// estate file are copied into the scratch root, so the estate resolved
// here is genuinely the production one (the five real Berlin source ids).
// Only the ACQUISITION is deterministic: the instrumented resolver stands
// in for live HTTP, because repeatability — not a network round trip — is
// what this lifecycle proof needs. The live-network proof of those same
// five sources is separately recorded in docs/UNATTENDED_CITY_WORKER.md,
// "Bounded real-source proof".
//
// Production is never contacted, and this repository's own
// runtime/city-jobs/ tree is never touched.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(REPO_ROOT, "ingestion/city-worker/cli.mjs");
const WORKER_MAIN = join(REPO_ROOT, "ingestion/city-worker/worker-loop-main.mjs");
const RESOLVER = join(REPO_ROOT, "ingestion/city-worker/resolvers/instrumented-estate-log-resolver.mjs");

const GOVERNED_KEY = "berlin-proof-5";
const EXPECTED_SOURCE_IDS = ["tempodrom-berlin", "a-trane-berlin", "b-flat-berlin", "uber-arena-berlin", "columbiahalle-berlin"];

/** A scratch root carrying this repository's REAL governed catalogue, registry and bounded estate file. */
async function governedRoot() {
  const root = await mkdtemp(join(tmpdir(), "operator-lifecycle-proof-"));
  for (const relative of ["ingestion/city-worker/city-estate-catalogue.json", "sources/berlin.json", "fixtures/city-worker/real-estates/berlin-sample-01.json"]) {
    await mkdir(join(root, dirname(relative)), { recursive: true });
    await copyFile(join(REPO_ROOT, relative), join(root, relative));
  }
  return root;
}

async function enqueueGoverned(root) {
  const { stdout } = await execFileAsync(process.execPath, [CLI, "enqueue-city-estate", GOVERNED_KEY, `--root=${root}`]);
  return JSON.parse(stdout);
}

async function runnableWork(root) {
  const { stdout } = await execFileAsync(process.execPath, [CLI, "has-runnable-work", `--root=${root}`]);
  return Object.fromEntries(stdout.trim().split("\n").map((line) => line.split("=")));
}

/** Spawn the real systemd ExecStart and resolve with its genuine exit code. */
function runWorker(root, logPath, { residueSourceIds = "" } = {}) {
  const child = spawn(process.execPath, [WORKER_MAIN], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      BEATMAPPED_CITY_WORKER_ROOT: root,
      BEATMAPPED_CITY_WORKER_RESOLVER: RESOLVER,
      INSTRUMENTED_LOG_PATH: logPath,
      INSTRUMENTED_DELAY_MS: "0",
      INSTRUMENTED_RESIDUE_SOURCE_IDS: residueSourceIds,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  return new Promise((resolvePromise) => child.once("exit", (code, signal) => resolvePromise({ code, signal, stdout, stderr })));
}

async function readLog(logPath) {
  return (await readFile(logPath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function loadJobRecord(root, jobId) {
  return JSON.parse(await readFile(join(root, "runtime/city-jobs", jobId, "job.json"), "utf8"));
}

test("27 A–H: the whole governed operator lifecycle, twice, against a temporary root and with no network", async (t) => {
  const root = await governedRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // --- A. enqueue the governed berlin-proof-5 estate -----------------------
  const first = await enqueueGoverned(root);
  assert.equal(first.enqueued, true);
  assert.equal(first.city_estate_key, GOVERNED_KEY);
  assert.equal(first.country, "DE");
  assert.equal(first.city, "Berlin");
  assert.equal(first.state, "QUEUED");
  assert.equal(first.source_count, 5);

  // The frozen snapshot is the REAL five governed Berlin sources.
  const snapshot = JSON.parse(await readFile(join(root, first.estate_ref), "utf8"));
  assert.deepEqual(snapshot.source_ids, EXPECTED_SOURCE_IDS);
  assert.equal(snapshot.registry, "sources/berlin.json");

  const before = await runnableWork(root);
  assert.equal(before.RUNNABLE_WORK, "true");
  assert.equal(before.OPERATIONAL_STATE, "WORK_NEEDS_WAKE", "durable work with no worker is exactly the state the wake exists to clear");

  // --- B/C/D/E. start the real ExecStart; it drains, then exits ------------
  const log1 = join(root, "cycle-1.jsonl");
  const startedAt = Date.now();
  const run1 = await runWorker(root, log1, { residueSourceIds: "uber-arena-berlin" });
  const elapsed = Date.now() - startedAt;

  // E: the process ended ON ITS OWN — no signal, no external stop, no timeout.
  assert.equal(run1.code, 0, `clean queue-drained exit must be 0; stderr: ${run1.stderr}`);
  assert.equal(run1.signal, null, "the worker must exit by itself, never be killed");
  assert.ok(elapsed < 60_000, `the worker must terminate promptly after draining, took ${elapsed}ms`);
  assert.match(run1.stdout, /queue drained \(1 job\(s\) processed\) — exiting cleanly/);

  // C: the queued estate was genuinely processed, in one process.
  const entries1 = await readLog(log1);
  assert.equal(entries1.find((entry) => entry.event === "estate-resolved").source_count, 5);
  assert.deepEqual(
    entries1.filter((entry) => entry.event === "attempt-start").map((entry) => entry.source_id).sort(),
    [...EXPECTED_SOURCE_IDS].sort(),
    "every governed source in the frozen estate must be attempted",
  );
  assert.equal(new Set(entries1.map((entry) => entry.pid)).size, 1);

  // D: a real terminal job state, with the residue honestly recorded.
  const job1 = await loadJobRecord(root, first.job_id);
  assert.equal(job1.state, "COMPLETE_WITH_RESIDUE");
  assert.equal(job1.total_sources, 5);
  assert.equal(job1.successful_sources, 4);
  assert.equal(job1.residue_sources, 1);
  assert.equal(job1.failed_sources, 0);
  assert.ok(job1.completed_at);

  // E: queue empty, lock released, host back in the deployable resting state.
  const afterFirst = await runnableWork(root);
  assert.equal(afterFirst.RUNNABLE_WORK, "false");
  assert.equal(afterFirst.WORKER_ALIVE, "false");
  assert.equal(afterFirst.OPERATIONAL_STATE, "IDLE_NOTHING_TO_DO", "this is the state in which a deployment is allowed again");

  // --- F/G/H. a second explicit acquisition cycle --------------------------
  const second = await enqueueGoverned(root);
  assert.equal(second.enqueued, true, "a terminal previous cycle permits a new one");
  assert.notEqual(second.job_id, first.job_id, "H: a new acquisition cycle gets a NEW job id");
  assert.notEqual(second.estate_ref, first.estate_ref, "H: and freezes its OWN estate snapshot");

  const log2 = join(root, "cycle-2.jsonl");
  const run2 = await runWorker(root, log2);
  assert.equal(run2.code, 0, `H: second clean drain must also exit 0; stderr: ${run2.stderr}`);
  assert.equal(run2.signal, null);

  const entries2 = await readLog(log2);
  assert.equal(entries2.filter((entry) => entry.event === "attempt-start").length, 5);
  assert.equal(new Set(entries2.map((entry) => entry.pid)).size, 1);
  assert.notEqual(entries2[0].pid, entries1[0].pid, "the second cycle ran in a genuinely NEW process — the first had exited");

  const job2 = await loadJobRecord(root, second.job_id);
  assert.equal(job2.state, "COMPLETE");
  assert.equal(job2.successful_sources, 5);

  // The first cycle's record survives the second untouched.
  const job1Again = await loadJobRecord(root, first.job_id);
  assert.equal(job1Again.state, "COMPLETE_WITH_RESIDUE");
  assert.equal(job1Again.completed_at, job1.completed_at);

  const jobDirs = (await readdir(join(root, "runtime/city-jobs"), { withFileTypes: true })).filter((entry) => entry.isDirectory());
  assert.equal(jobDirs.length, 2, "exactly two cycles, each with its own durable record");

  const afterSecond = await runnableWork(root);
  assert.equal(afterSecond.RUNNABLE_WORK, "false");
  assert.equal(afterSecond.OPERATIONAL_STATE, "IDLE_NOTHING_TO_DO");
});

test("27: a duplicate dispatch during the SAME cycle creates no second job — and the governed estate is never re-derived for an in-flight one", async (t) => {
  const root = await governedRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await enqueueGoverned(root);
  const duplicate = await enqueueGoverned(root);
  assert.equal(duplicate.enqueued, false);
  assert.equal(duplicate.reason, "DUPLICATE_ACTIVE_CITY_JOB");
  assert.equal(duplicate.existing_job_id, first.job_id);

  const jobDirs = (await readdir(join(root, "runtime/city-jobs"), { withFileTypes: true })).filter((entry) => entry.isDirectory());
  assert.equal(jobDirs.length, 1, "no second job may exist while the first is non-terminal");

  const run = await runWorker(root, join(root, "cycle.jsonl"));
  assert.equal(run.code, 0, `stderr: ${run.stderr}`);
  assert.equal((await loadJobRecord(root, first.job_id)).state, "COMPLETE");
});
