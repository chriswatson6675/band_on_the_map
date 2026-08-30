// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — duplicate/cycle
// semantics for the governed operator enqueue.
//
// These drive the REAL CLI as a real subprocess (the exact command
// .github/workflows/enqueue-beatmapped-city-job.yml runs over SSH), so
// what is proven here is the operator path itself, not a re-implementation
// of it. A synthetic repository root stands in for the repository, so no
// real registry, real estate, or real runtime/city-jobs tree is touched.
//
// THE POLICY IN ONE SENTENCE: at most one NON-TERMINAL job per governed
// estate; a new acquisition cycle is allowed only once the previous one is
// terminal, and always gets a new job id — while a RESTART/RESUME of an
// unfinished job always keeps the original job id.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { CITY_ESTATE_CATALOGUE_PATH, findActiveJobForEstate } from "../../ingestion/city-worker/city-estate-catalogue.mjs";
import { listJobs, loadJob, saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { drainQueueOnce } from "../../ingestion/city-worker/worker-loop.mjs";
import { makeResolver } from "./helpers/synthetic-city.mjs";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../ingestion/city-worker/cli.mjs", import.meta.url));

const SYNTHETIC_SOURCE_IDS = ["alpha-venue", "beta-venue"];

async function writeJson(root, relative, value) {
  const path = join(root, relative);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** A synthetic repository root carrying one governed catalogue key. */
async function synthesiseRoot() {
  const root = await mkdtemp(join(tmpdir(), "city-job-cycle-test-"));
  await writeJson(root, "sources/synthetic-city.json", {
    country_code: "ZZ",
    entries: SYNTHETIC_SOURCE_IDS.map((id) => ({ id, name: `Venue ${id}`, official_website: `https://${id}.example/`, events_url: `https://${id}.example/events`, active_status: "ACTIVE" })),
  });
  await writeJson(root, CITY_ESTATE_CATALOGUE_PATH, {
    entries: [{ key: "synthetic-all-active", country: "ZZ", city: "Synthetica", selection: "ALL_ACTIVE", registry: "sources/synthetic-city.json" }],
  });
  return root;
}

/** Runs the real CLI exactly as the operator workflow does, against a scratch root. */
async function runCli(root, args) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [CLI, ...args, `--root=${root}`], { env: { ...process.env, BEATMAPPED_RUNNER_SHA: "0000000000000000000000000000000000000000" } });
    return { code: 0, stdout, json: stdout.trim() ? JSON.parse(stdout) : null };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "", json: null };
  }
}

async function enqueue(root) {
  const result = await runCli(root, ["enqueue-city-estate", "synthetic-all-active"]);
  assert.equal(result.code, 0, `enqueue failed: ${result.stderr ?? ""}`);
  return result.json;
}

/** Force a job to a given terminal (or in-flight) state, the way the runner itself would leave it. */
async function forceState(root, jobId, state, extra = {}) {
  const job = await loadJob(jobId, { root });
  await saveJob({ ...job, state, completed_at: state === "RUNNING" ? null : "2026-08-30T01:00:00.000Z", ...extra }, { root });
}

// ---------------------------------------------------------------------------
// A. no existing job → new job enqueued
// ---------------------------------------------------------------------------

test("A: with no existing job, the governed enqueue creates exactly one durable QUEUED job", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await enqueue(root);
  assert.equal(result.enqueued, true);
  assert.equal(result.city_estate_key, "synthetic-all-active");
  assert.equal(result.country, "ZZ");
  assert.equal(result.city, "Synthetica");
  assert.equal(result.state, "QUEUED");
  assert.equal(result.source_count, 2);

  const jobs = await listJobs({ root });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].job_id, result.job_id);
  assert.equal(jobs[0].configuration.city_estate_key, "synthetic-all-active");
  assert.equal(jobs[0].estate_ref, `runtime/city-jobs/${result.job_id}/estate.json`);
});

// ---------------------------------------------------------------------------
// B / C. a non-terminal job blocks a duplicate
// ---------------------------------------------------------------------------

test("B: a second enqueue while the estate's job is QUEUED does not create a duplicate", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await enqueue(root);
  const second = await runCli(root, ["enqueue-city-estate", "synthetic-all-active"]);

  assert.equal(second.code, 0, "a duplicate is a reported policy outcome, not a crash");
  assert.equal(second.json.enqueued, false);
  assert.equal(second.json.reason, "DUPLICATE_ACTIVE_CITY_JOB");
  assert.equal(second.json.existing_job_id, first.job_id);
  assert.equal(second.json.existing_state, "QUEUED");
  assert.equal((await listJobs({ root })).length, 1, "no second job may exist");
});

test("C: a second enqueue while the estate's job is RUNNING does not create a duplicate", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await enqueue(root);
  await forceState(root, first.job_id, "RUNNING");

  const second = await runCli(root, ["enqueue-city-estate", "synthetic-all-active"]);
  assert.equal(second.json.reason, "DUPLICATE_ACTIVE_CITY_JOB");
  assert.equal(second.json.existing_state, "RUNNING");
  assert.equal((await listJobs({ root })).length, 1);
});

test("B/C: the duplicate rule is per-estate — a different governed estate is never blocked by another estate's active job", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(root, CITY_ESTATE_CATALOGUE_PATH, {
    entries: [
      { key: "synthetic-all-active", country: "ZZ", city: "Synthetica", selection: "ALL_ACTIVE", registry: "sources/synthetic-city.json" },
      { key: "other-all-active", country: "ZZ", city: "Otherville", selection: "ALL_ACTIVE", registry: "sources/synthetic-city.json" },
    ],
  });

  const first = await enqueue(root);
  const other = await runCli(root, ["enqueue-city-estate", "other-all-active"]);
  assert.equal(other.json.enqueued, true);
  assert.notEqual(other.json.job_id, first.job_id);
  assert.equal((await listJobs({ root })).length, 2);
});

// ---------------------------------------------------------------------------
// D / E. a terminal job allows a new explicit cycle
// ---------------------------------------------------------------------------

for (const terminalState of ["COMPLETE", "COMPLETE_WITH_RESIDUE", "FAILED", "CANCELLED"]) {
  test(`D/E: with the estate's previous job ${terminalState}, a new explicit acquisition cycle is allowed`, async (t) => {
    const root = await synthesiseRoot();
    t.after(() => rm(root, { recursive: true, force: true }));

    const first = await enqueue(root);
    await forceState(root, first.job_id, terminalState);
    assert.equal(await findActiveJobForEstate("synthetic-all-active", { root }), null);

    const second = await enqueue(root);
    assert.equal(second.enqueued, true);
    assert.notEqual(second.job_id, first.job_id);

    // The earlier cycle's own record and frozen estate are left untouched.
    const previous = await loadJob(first.job_id, { root });
    assert.equal(previous.state, terminalState);
    assert.equal((await listJobs({ root })).length, 2);
  });
}

// ---------------------------------------------------------------------------
// F. restart/resume retains the same job id
// ---------------------------------------------------------------------------

test("F: a worker restart RESUMES the unfinished job under its original job id — never a second job", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const enqueued = await enqueue(root);

  // First pass: stop cooperatively after the first source, exactly as a
  // SIGTERM mid-city would, leaving the job RUNNING and unfinished.
  let processedCount = 0;
  await drainQueueOnce({
    root,
    resolveSourceTasksForJob: makeResolver(SYNTHETIC_SOURCE_IDS),
    shouldStop: () => processedCount++ >= 1,
  });
  const midFlight = await loadJob(enqueued.job_id, { root });
  assert.equal(midFlight.state, "RUNNING");

  // Second pass: a fresh worker process would call exactly this.
  await drainQueueOnce({ root, resolveSourceTasksForJob: makeResolver(SYNTHETIC_SOURCE_IDS) });

  const jobs = await listJobs({ root });
  assert.equal(jobs.length, 1, "a resume must never create a second job");
  assert.equal(jobs[0].job_id, enqueued.job_id, "the job id survives the restart");
  assert.equal(jobs[0].state, "COMPLETE");
  assert.equal(jobs[0].estate_ref, enqueued.estate_ref, "and so does the frozen estate identity");
});

test("F: resume reuses the job's own frozen estate snapshot, not a freshly-resolved catalogue universe", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const enqueued = await enqueue(root);
  // The catalogue's underlying registry gains a source after enqueue.
  await writeJson(root, "sources/synthetic-city.json", {
    country_code: "ZZ",
    entries: [...SYNTHETIC_SOURCE_IDS, "gamma-venue"].map((id) => ({ id, name: `Venue ${id}`, official_website: `https://${id}.example/`, events_url: `https://${id}.example/events`, active_status: "ACTIVE" })),
  });

  const seen = [];
  await drainQueueOnce({
    root,
    resolveSourceTasksForJob: async (job) => {
      const snapshot = JSON.parse(await (await import("node:fs/promises")).readFile(join(root, job.estate_ref), "utf8"));
      seen.push(...snapshot.source_ids);
      return makeResolver(snapshot.source_ids)();
    },
  });

  assert.deepEqual(seen, SYNTHETIC_SOURCE_IDS, "the in-flight job's universe must not grow underneath it");
  assert.equal((await loadJob(enqueued.job_id, { root })).total_sources, 2);
});

// ---------------------------------------------------------------------------
// G. a new operator acquisition cycle receives a new job id
// ---------------------------------------------------------------------------

test("G: each new acquisition cycle for the same estate gets a fresh job id and a fresh frozen estate", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const ids = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const result = await enqueue(root);
    ids.push(result.job_id);
    assert.equal(result.estate_ref, `runtime/city-jobs/${result.job_id}/estate.json`, "each cycle freezes its own estate snapshot");
    await forceState(root, result.job_id, "COMPLETE_WITH_RESIDUE");
  }

  assert.equal(new Set(ids).size, 3, "job ids are never reused across cycles");
  assert.equal((await listJobs({ root })).length, 3, "every cycle's own record is retained");
});

test("G: the operator control never supplies a job id — ids are always generated", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflow = await readFile(fileURLToPath(new URL("../../.github/workflows/enqueue-beatmapped-city-job.yml", import.meta.url)), "utf8");
  assert.doesNotMatch(workflow, /--job-id/, "the operator enqueue workflow must never pass a job id");
});
