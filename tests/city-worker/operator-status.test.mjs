// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — the read-only
// operator status control.
//
// "Read-only" is proven three ways here, not asserted: structurally (the
// module imports no mutating function), behaviourally (running the real
// status CLI leaves the whole runtime tree byte-identical), and at the
// control surface (the status workflow contains no systemctl verb and no
// other CLI command).

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildOperatorStatusReport, buildResidueSummary, deriveOperationalState, projectJobForOperator, summariseRunnableWork } from "../../ingestion/city-worker/operator-status.mjs";
import { recordSourceResult } from "../../ingestion/city-worker/checkpoint-store.mjs";
import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob } from "../../ingestion/city-worker/queue.mjs";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../ingestion/city-worker/cli.mjs", import.meta.url));
const MODULE_PATH = fileURLToPath(new URL("../../ingestion/city-worker/operator-status.mjs", import.meta.url));
const STATUS_WORKFLOW = fileURLToPath(new URL("../../.github/workflows/check-beatmapped-city-jobs.yml", import.meta.url));

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "operator-status-test-"));
}

/** Persist a job in a given state with a chosen set of counts/timestamps. */
async function seedJob(root, { jobId, state, key = "synthetic-all-active", counts = {}, ...overrides }) {
  const job = createCityJob({
    jobId,
    country: "ZZ",
    city: "Synthetica",
    estateRef: `runtime/city-jobs/${jobId}/estate.json`,
    createdAt: "2026-08-30T00:00:00.000Z",
    runnerVersionSha: "abc1234abc1234abc1234abc1234abc1234abc12",
    configuration: { city_estate_key: key },
  });
  await saveJob({ ...job, state, ...counts, ...overrides }, { root });
  await enqueueJob(jobId, { root });
  return jobId;
}

/** Every file under `root`, with its content — the fingerprint used to prove nothing was mutated. */
async function snapshotTree(root) {
  const files = new Map();
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.set(relative(root, full), `${(await stat(full)).size}:${await readFile(full, "utf8")}`);
    }
  }
  await walk(root);
  return files;
}

// ---------------------------------------------------------------------------
// cannot mutate queue/jobs; cannot start/stop the worker
// ---------------------------------------------------------------------------

/** Strip `//` line comments and block comments, so a prose mention of a banned token is never mistaken for a call to it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("the status module imports ONLY readers — no writer, no queue mutation, no process control", async () => {
  const source = await readFile(MODULE_PATH, "utf8");
  const imported = [...source.matchAll(/^import \{([^}]+)\} from/gm)].flatMap((match) => match[1].split(",").map((name) => name.trim()));

  const forbidden = [
    "saveJob",
    "enqueueJob",
    "runCityJob",
    "drainQueueOnce",
    // BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 renamed
    // runWorkerLoop; both names are banned so neither can slip back in.
    "runWorkerLoop",
    "runWorkerUntilQueueDrained",
    "requestJobCancel",
    "acquireWorkerLock",
    "releaseWorkerLock",
    "recordSourceResult",
    "markSourceRunning",
  ];
  for (const name of forbidden) {
    assert.ok(!imported.includes(name), `operator-status.mjs must never import ${name}`);
  }
  // Scoped to EXECUTABLE code only: this module's documentation legitimately
  // discusses what the operator control's `systemctl start` does, and a
  // prose mention is not a capability. The ban itself is unchanged.
  assert.doesNotMatch(stripComments(source), /node:child_process|execFile|spawn|systemctl|writeFile|mkdir|rename|unlink/, "the status surface must have no way to run a command or write a file");
});

test("running the real status CLI leaves the entire runtime tree byte-identical", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-queued", state: "QUEUED" });
  await seedJob(root, { jobId: "job-running", state: "RUNNING", started_at: "2026-08-30T00:05:00.000Z" });

  const before = await snapshotTree(root);
  const { stdout } = await execFileAsync(process.execPath, [CLI, "city-jobs-status", `--root=${root}`]);
  const after = await snapshotTree(root);

  assert.ok(JSON.parse(stdout).jobs.length === 2);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "no file may be created or removed");
  for (const [path, content] of before) {
    assert.equal(after.get(path), content, `${path} must be unchanged by a status read`);
  }
});

test("the status workflow contains no systemctl verb and runs no CLI command other than city-jobs-status", async () => {
  const workflow = await readFile(STATUS_WORKFLOW, "utf8");
  const executable = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  assert.doesNotMatch(executable, /systemctl/, "a read-only status control must never contain systemctl at all");
  assert.doesNotMatch(executable, /\b(nohup|tmux|screen)\b/);
  const cliCommands = [...executable.matchAll(/cli\.mjs\s+([a-z-]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(cliCommands)], ["city-jobs-status"], "the status control may run exactly one command");
  assert.doesNotMatch(executable, /enqueue-city|resume-job|cancel-job|run-worker/);
});

// ---------------------------------------------------------------------------
// reports queued / running / terminal states correctly, with counts,
// timestamps and runner SHA
// ---------------------------------------------------------------------------

test("queued, running and terminal jobs are each reported with their real state", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-q", state: "QUEUED", created_at: "2026-08-30T00:00:01.000Z" });
  await seedJob(root, { jobId: "job-r", state: "RUNNING", created_at: "2026-08-30T00:00:02.000Z" });
  await seedJob(root, { jobId: "job-t", state: "COMPLETE_WITH_RESIDUE", created_at: "2026-08-30T00:00:03.000Z" });

  const report = await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(report.generated_at, "2026-08-30T02:00:00.000Z");
  assert.equal(report.job_count, 3);
  assert.deepEqual(
    report.jobs.map((job) => [job.job_id, job.state]),
    [
      ["job-t", "COMPLETE_WITH_RESIDUE"],
      ["job-r", "RUNNING"],
      ["job-q", "QUEUED"],
    ],
    "newest first",
  );
});

test("every operator-visible field this control is required to expose is present", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, {
    jobId: "job-full",
    state: "RUNNING",
    started_at: "2026-08-30T00:05:00.000Z",
    completed_at: null,
    last_checkpoint: "2026-08-30T00:09:00.000Z",
    current_source_id: "beta-venue",
    counts: { total_sources: 7, completed_sources: 4, successful_sources: 2, residue_sources: 1, failed_sources: 1 },
  });

  const [job] = (await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" })).jobs;
  assert.equal(job.job_id, "job-full");
  assert.equal(job.country, "ZZ");
  assert.equal(job.city, "Synthetica");
  assert.equal(job.city_estate_key, "synthetic-all-active");
  assert.equal(job.estate_ref, "runtime/city-jobs/job-full/estate.json");
  assert.equal(job.created_at, "2026-08-30T00:00:00.000Z");
  assert.equal(job.started_at, "2026-08-30T00:05:00.000Z");
  assert.equal(job.completed_at, null);
  assert.equal(job.state, "RUNNING");
  assert.equal(job.total_sources, 7);
  assert.equal(job.completed_sources, 4);
  assert.equal(job.successful_sources, 2);
  assert.equal(job.residue_sources, 1);
  assert.equal(job.failed_sources, 1);
  assert.equal(job.last_checkpoint, "2026-08-30T00:09:00.000Z");
  assert.equal(job.current_source_id, "beta-venue");
  assert.equal(job.runner_version_sha, "abc1234abc1234abc1234abc1234abc1234abc12");
});

test("a terminal job carries a residue/failure summary; a non-terminal one deliberately does not", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-done", state: "COMPLETE_WITH_RESIDUE", completed_at: "2026-08-30T01:00:00.000Z" });
  await seedJob(root, { jobId: "job-live", state: "RUNNING", created_at: "2026-08-30T00:00:01.000Z" });

  for (const jobId of ["job-done", "job-live"]) {
    await recordSourceResult(jobId, "alpha-venue", { status: "SUCCESS", attempts: 1, completedAt: "2026-08-30T00:30:00.000Z", collector: "JSON_LD", normalized_event_count: 12, proven_event_count: 12, retry_count: 0, source_state: "ACQUISITION_PROVEN" }, { root });
    await recordSourceResult(jobId, "beta-venue", { status: "RESIDUE", attempts: 1, completedAt: "2026-08-30T00:40:00.000Z", residue_reason: "BROWSER_REQUIRED", source_state: "BROWSER_REQUIRED", retry_count: 0 }, { root });
    await recordSourceResult(jobId, "gamma-venue", { status: "FAILED", attempts: 1, completedAt: "2026-08-30T00:50:00.000Z", error: "NETWORK_FAILURE", source_state: "NETWORK_FAILURE", retry_count: 3 }, { root });
  }

  const report = await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" });
  const done = report.jobs.find((job) => job.job_id === "job-done");
  const live = report.jobs.find((job) => job.job_id === "job-live");

  assert.equal(live.terminal_summary, null, "a moving job's partial breakdown must not be reported as an outcome");
  assert.deepEqual(done.terminal_summary.residue_by_reason, { BROWSER_REQUIRED: 1 });
  assert.deepEqual(done.terminal_summary.residue.map((record) => record.source_id), ["beta-venue"]);
  assert.deepEqual(done.terminal_summary.failed.map((record) => record.source_id), ["gamma-venue"]);
  assert.equal(done.terminal_summary.failed[0].retry_count, 3);
  assert.ok(!done.terminal_summary.residue.some((record) => record.source_id === "alpha-venue"), "successful sources are not triage material");
});

// ---------------------------------------------------------------------------
// no-job / unknown-job states are handled cleanly
// ---------------------------------------------------------------------------

test("a host with no city jobs at all reports cleanly rather than failing", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(report.job_count, 0);
  assert.deepEqual(report.jobs, []);
  assert.equal(report.note, "NO_CITY_JOBS_ON_THIS_HOST");
  assert.equal(report.worker.worker_alive, false);

  const { stdout } = await execFileAsync(process.execPath, [CLI, "city-jobs-status", `--root=${root}`]);
  assert.equal(JSON.parse(stdout).note, "NO_CITY_JOBS_ON_THIS_HOST");
});

test("an unknown job id is reported as NO_SUCH_JOB, never as an empty success", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-real", state: "QUEUED" });

  const report = await buildOperatorStatusReport({ root, jobId: "job-imaginary", generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(report.job_count, 0);
  assert.match(report.note, /^NO_SUCH_JOB: job-imaginary$/);
  assert.equal(report.requested_job_id, "job-imaginary");
});

test("a single-job request returns exactly that job", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-one", state: "QUEUED" });
  await seedJob(root, { jobId: "job-two", state: "QUEUED", created_at: "2026-08-30T00:00:01.000Z" });

  const report = await buildOperatorStatusReport({ root, jobId: "job-two", generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(report.job_count, 1);
  assert.equal(report.jobs[0].job_id, "job-two");
});

test("a job created before the governed catalogue existed reports a null estate key rather than inventing one", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = createCityJob({ jobId: "job-legacy", country: "DE", city: "Berlin", estateRef: "fixtures/city-worker/real-estates/berlin-sample-01.json", createdAt: "2026-08-29T00:00:00.000Z" });
  await saveJob({ ...legacy, state: "COMPLETE" }, { root });

  const [job] = (await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" })).jobs;
  assert.equal(job.city_estate_key, null);
  assert.equal(job.estate_ref, "fixtures/city-worker/real-estates/berlin-sample-01.json");
});

// ---------------------------------------------------------------------------
// §15 — operational state. Under drain-and-exit "no worker process" is the
// NORMAL resting condition, so liveness alone is not an operator signal;
// it only means something read together with whether work is waiting.
// ---------------------------------------------------------------------------

test("15: no worker and nothing queued is NORMAL IDLE, not a problem", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-done", state: "COMPLETE_WITH_RESIDUE" });

  const report = await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(report.worker.worker_alive, false);
  assert.equal(report.worker.operational_state, "IDLE_NOTHING_TO_DO");
  assert.equal(report.worker.queued_job_count, 0);
  assert.equal(report.worker.running_job_count, 0);
});

test("15: no worker WITH a queued or running job is WORK_NEEDS_WAKE — distinguished from normal idle", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-waiting", state: "QUEUED" });

  const report = await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(report.worker.operational_state, "WORK_NEEDS_WAKE");
  assert.equal(report.worker.queued_job_count, 1);

  // A job left RUNNING by a killed worker is the same condition.
  await seedJob(root, { jobId: "job-orphan", state: "RUNNING", created_at: "2026-08-30T00:00:01.000Z" });
  const second = await buildOperatorStatusReport({ root, generatedAt: "2026-08-30T02:00:00.000Z" });
  assert.equal(second.worker.operational_state, "WORK_NEEDS_WAKE");
  assert.equal(second.worker.running_job_count, 1);
});

test("15: the three operational states are exactly the documented mapping", () => {
  assert.equal(deriveOperationalState({ workerAlive: true, queuedJobCount: 0, runningJobCount: 0 }), "WORKING");
  assert.equal(deriveOperationalState({ workerAlive: true, queuedJobCount: 3, runningJobCount: 1 }), "WORKING");
  assert.equal(deriveOperationalState({ workerAlive: false, queuedJobCount: 0, runningJobCount: 0 }), "IDLE_NOTHING_TO_DO");
  assert.equal(deriveOperationalState({ workerAlive: false, queuedJobCount: 1, runningJobCount: 0 }), "WORK_NEEDS_WAKE");
  assert.equal(deriveOperationalState({ workerAlive: false, queuedJobCount: 0, runningJobCount: 1 }), "WORK_NEEDS_WAKE");
});

test("15: status reporting never requires a worker process to be alive — a host with no worker still answers fully", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-past", state: "COMPLETE", counts: { total_sources: 5, completed_sources: 5, successful_sources: 5 }, completed_at: "2026-08-30T01:00:00.000Z" });

  const { stdout } = await execFileAsync(process.execPath, [CLI, "city-jobs-status", `--root=${root}`]);
  const report = JSON.parse(stdout);
  assert.equal(report.worker.worker_alive, false);
  assert.equal(report.jobs[0].total_sources, 5, "full per-job detail is available with no worker running");
  assert.ok(report.jobs[0].terminal_summary, "and so is the terminal summary");
});

test("15: has-runnable-work answers the wake's question using queue.mjs's own runnable rule", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const empty = await summariseRunnableWork({ root });
  assert.equal(empty.runnable_work, false);
  assert.equal(empty.operational_state, "IDLE_NOTHING_TO_DO");

  await seedJob(root, { jobId: "job-q", state: "QUEUED" });
  assert.equal((await summariseRunnableWork({ root })).runnable_work, true);

  // A cancel-requested RUNNING job is NOT runnable — the same exclusion
  // pickNextRunnableJobId makes, so the wake can never disagree with a worker.
  const root2 = await freshRoot();
  t.after(() => rm(root2, { recursive: true, force: true }));
  await seedJob(root2, { jobId: "job-cancelling", state: "RUNNING", cancel_requested: true });
  const cancelling = await summariseRunnableWork({ root: root2 });
  assert.equal(cancelling.runnable_work, false, "a cancel-requested job must not make the wake think there is work");
});

test("15: the has-runnable-work CLI prints flat KEY=VALUE lines the wake's shell can read, and mutates nothing", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-q", state: "QUEUED" });

  const before = await snapshotTree(root);
  const { stdout } = await execFileAsync(process.execPath, [CLI, "has-runnable-work", `--root=${root}`]);
  const after = await snapshotTree(root);

  assert.match(stdout, /^RUNNABLE_WORK=true$/m);
  assert.match(stdout, /^OPERATIONAL_STATE=WORK_NEEDS_WAKE$/m);
  for (const line of stdout.trim().split("\n")) assert.match(line, /^[A-Z_]+=\S*$/, `every line must be a single flat KEY=VALUE: ${line}`);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [path, content] of before) assert.equal(after.get(path), content, `${path} must be unchanged by the wake's read-only query`);
});

// ---------------------------------------------------------------------------
// does not expose secrets or raw page data
// ---------------------------------------------------------------------------

test("the per-source projection is an allow-list — an unexpected checkpoint field never reaches an operator summary", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "runtime/city-jobs/job-leak/sources"), { recursive: true });
  await writeFile(
    join(root, "runtime/city-jobs/job-leak/sources/alpha-venue.json"),
    JSON.stringify({
      source_id: "alpha-venue",
      status: "RESIDUE",
      residue_reason: "ACCESS_BLOCKED",
      // Everything below is exactly what must never surface.
      raw_html: "<html><body>ENTIRE FETCHED PAGE BODY</body></html>",
      response_body: "another whole page",
      ssh_private_key: "-----BEGIN OPENSSH PRIVATE KEY-----AAAA",
      BEATMAPPED_PROD_HOST: "prod.example.internal",
      authorization_header: "Bearer sk-not-a-real-token",
    }),
    "utf8",
  );

  const summary = await buildResidueSummary("job-leak", { root });
  const serialised = JSON.stringify(summary);
  for (const secret of ["ENTIRE FETCHED PAGE BODY", "another whole page", "BEGIN OPENSSH PRIVATE KEY", "prod.example.internal", "sk-not-a-real-token", "raw_html", "response_body", "ssh_private_key", "authorization_header"]) {
    assert.ok(!serialised.includes(secret), `${secret} must never reach an operator summary`);
  }
  assert.equal(summary.residue[0].source_id, "alpha-venue");
  assert.equal(summary.residue[0].residue_reason, "ACCESS_BLOCKED");
});

test("a huge free-text collector error is truncated to a bounded one-line message, never a page dump", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await recordSourceResult("job-big", "alpha-venue", { status: "FAILED", attempts: 1, completedAt: "2026-08-30T00:50:00.000Z", error: `${"X".repeat(50000)}\n<html>lots and lots</html>` }, { root });

  const summary = await buildResidueSummary("job-big", { root });
  const { error } = summary.failed[0];
  assert.ok(error.length < 400, `expected a bounded message, got ${error.length} characters`);
  assert.match(error, /…\[truncated\]$/);
  assert.ok(!error.includes("\n"), "a summary field must never carry embedded newlines");
});

test("the job projection exposes a fixed field set — a new job-record field is invisible until deliberately added", () => {
  const projected = projectJobForOperator({
    job_id: "job-x",
    country: "ZZ",
    city: "Synthetica",
    state: "QUEUED",
    configuration: { city_estate_key: "synthetic-all-active", secret_operator_token: "must-not-appear" },
    estate_ref: "runtime/city-jobs/job-x/estate.json",
    some_future_field: "must-not-appear-either",
  });
  assert.deepEqual(
    Object.keys(projected).sort(),
    [
      "cancel_requested",
      "city",
      "city_estate_key",
      "completed_at",
      "completed_sources",
      "country",
      "created_at",
      "current_source_id",
      "estate_ref",
      "failed_sources",
      "job_id",
      "last_checkpoint",
      "residue_sources",
      "runner_version_sha",
      "started_at",
      "state",
      "successful_sources",
      "total_sources",
    ],
  );
  assert.ok(!JSON.stringify(projected).includes("must-not-appear"));
});
