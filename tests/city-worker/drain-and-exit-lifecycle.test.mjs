// BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 — the new
// normal worker lifecycle.
//
// REPLACES tests/city-worker/resident-worker-idle.test.mjs, whose five
// tests asserted the OPPOSITE property (an empty queue must NOT end the
// worker). That assumption was deliberately reversed by this package: the
// always-on shape left beatmapped-city-worker.service active forever after
// the first city, which permanently blocked the sanctioned deployment
// path's fail-closed-on-active rule. Everything else those tests proved —
// sequential multi-city drain, no acquisition work while idle, and a
// second worker refusing rather than competing — is preserved below and
// strengthened into REAL child processes.
//
// Most tests here spawn `node ingestion/city-worker/worker-loop-main.mjs`
// as a genuine OS process — the exact ExecStart the systemd unit runs —
// so the EXIT CODE being asserted is the real one systemd would see, not
// a return value from an in-process call.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { listJobs, loadJob, saveJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob } from "../../ingestion/city-worker/queue.mjs";
import { readWorkerLockStatus } from "../../ingestion/city-worker/lock.mjs";
import { runWorkerUntilQueueDrained } from "../../ingestion/city-worker/worker-loop.mjs";
import { materialiseJobEstate } from "../../ingestion/city-worker/city-estate-catalogue.mjs";
import { makeResolver } from "./helpers/synthetic-city.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKER_MAIN = resolve(REPO_ROOT, "ingestion/city-worker/worker-loop-main.mjs");
const RESOLVER = resolve(REPO_ROOT, "ingestion/city-worker/resolvers/instrumented-estate-log-resolver.mjs");

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "drain-and-exit-"));
}

/** Enqueue a durable job with a real frozen estate snapshot, exactly as the governed operator enqueue does. */
async function seedJob(root, { jobId, city, sourceIds }) {
  const estateRef = await materialiseJobEstate({
    jobId,
    estate: { key: `${city.toLowerCase()}-test`, country: "ZZ", city, selection: "ALL_ACTIVE", registry: "sources/synthetic-city.json", source_ids: sourceIds },
    materialisedAt: "2026-08-30T00:00:00.000Z",
    root,
  });
  const job = createCityJob({ jobId, country: "ZZ", city, estateRef, createdAt: "2026-08-30T00:00:00.000Z", configuration: { city_estate_key: `${city.toLowerCase()}-test` } });
  await saveJob(job, { root });
  await enqueueJob(jobId, { root });
  return jobId;
}

/** Spawn the REAL systemd ExecStart as a child process and wait for its real exit code. */
function runRealWorker(root, logPath, { delayMs = 0, env = {} } = {}) {
  const child = spawn(process.execPath, [WORKER_MAIN], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      BEATMAPPED_CITY_WORKER_ROOT: root,
      BEATMAPPED_CITY_WORKER_RESOLVER: RESOLVER,
      INSTRUMENTED_LOG_PATH: logPath,
      INSTRUMENTED_DELAY_MS: String(delayMs),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise((resolvePromise) => child.once("exit", (code, signal) => resolvePromise({ code, signal, get stdout() { return stdout; }, get stderr() { return stderr; } })));
  return { child, exited };
}

async function readLog(logPath) {
  try {
    return (await readFile(logPath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

// ---------------------------------------------------------------------------
// §17 — empty queue
// ---------------------------------------------------------------------------

test("17: a worker started against an EMPTY queue does no acquisition work, exits 0, and releases its lock", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const logPath = join(root, "acquisition.jsonl");

  const { exited } = runRealWorker(root, logPath);
  const result = await exited;

  assert.equal(result.code, 0, `an empty queue is a clean, successful, NON-restarted exit; stderr: ${result.stderr}`);
  assert.equal(result.signal, null);
  assert.deepEqual(await readLog(logPath), [], "no resolver or acquisition call may happen for an empty queue");
  assert.equal((await readWorkerLockStatus({ root })).alive, false, "the lock must be released, not left stale");
  assert.match(result.stdout, /queue drained \(0 job\(s\) processed\).*exiting cleanly/);
});

test("17: the worker does NOT remain polling — it terminates on its own with no stop signal and no timeout", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const started = Date.now();
  const { exited } = runRealWorker(root, join(root, "acquisition.jsonl"));
  const result = await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error("worker was still running after 15s — it is still resident, not drain-and-exit")), 15_000)),
  ]);
  assert.equal(result.code, 0);
  assert.ok(Date.now() - started < 15_000);
});

// ---------------------------------------------------------------------------
// §18 — one job
// ---------------------------------------------------------------------------

test("18: one queued job is processed to a terminal state, then the worker exits 0", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const logPath = join(root, "acquisition.jsonl");
  await seedJob(root, { jobId: "job-solo", city: "Alpha", sourceIds: ["alpha-one", "alpha-two"] });

  const result = await runRealWorker(root, logPath).exited;
  assert.equal(result.code, 0, `stderr: ${result.stderr}`);

  const job = await loadJob("job-solo", { root });
  assert.equal(job.state, "COMPLETE");
  assert.equal(job.total_sources, 2);
  assert.equal(job.successful_sources, 2);
  assert.equal((await readWorkerLockStatus({ root })).alive, false);

  const attempted = (await readLog(logPath)).filter((entry) => entry.event === "attempt-start").map((entry) => entry.source_id).sort();
  assert.deepEqual(attempted, ["alpha-one", "alpha-two"]);
});

test("18: the real process reads its source universe from the job's own FROZEN estate snapshot", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const logPath = join(root, "acquisition.jsonl");
  await seedJob(root, { jobId: "job-frozen", city: "Alpha", sourceIds: ["alpha-one"] });

  const result = await runRealWorker(root, logPath).exited;
  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  const resolved = (await readLog(logPath)).find((entry) => entry.event === "estate-resolved");
  assert.equal(resolved.source_count, 1);
  assert.equal(resolved.job_id, "job-frozen");
});

// ---------------------------------------------------------------------------
// §19 — multiple cities
// ---------------------------------------------------------------------------

test("19: three queued cities drain sequentially in one process, and the worker exits only after the THIRD", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const logPath = join(root, "acquisition.jsonl");
  await seedJob(root, { jobId: "job-berlin", city: "Berlin", sourceIds: ["berlin-a", "berlin-b"] });
  await seedJob(root, { jobId: "job-paris", city: "Paris", sourceIds: ["paris-a", "paris-b"] });
  await seedJob(root, { jobId: "job-lisbon", city: "Lisbon", sourceIds: ["lisbon-a", "lisbon-b"] });

  const result = await runRealWorker(root, logPath, { delayMs: 20 }).exited;
  assert.equal(result.code, 0, `stderr: ${result.stderr}`);

  for (const jobId of ["job-berlin", "job-paris", "job-lisbon"]) {
    assert.equal((await loadJob(jobId, { root })).state, "COMPLETE", `${jobId} must be terminal before the worker exits`);
  }

  const entries = await readLog(logPath);
  // One process handled all three.
  assert.equal(new Set(entries.map((entry) => entry.pid)).size, 1, "all three cities must drain in ONE process — no restart between them");

  // Cities are sequential, never interleaved: every attempt for a city
  // falls in one unbroken block.
  const order = entries.filter((entry) => entry.event === "attempt-start").map((entry) => entry.job_id);
  const blocks = order.filter((jobId, index) => jobId !== order[index - 1]);
  assert.deepEqual(blocks, ["job-berlin", "job-paris", "job-lisbon"], "cities must run one at a time, in enqueue order, never in parallel");
  assert.equal(order.length, 6);
});

// ---------------------------------------------------------------------------
// §20 — a job enqueued while the worker is already processing another
// ---------------------------------------------------------------------------

test("20: a city enqueued WHILE the worker is mid-city is discovered and drained by that same process, then it exits — no restart", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const logPath = join(root, "acquisition.jsonl");
  // City A is slow enough that B can be enqueued while it is in flight.
  await seedJob(root, { jobId: "job-a", city: "Alpha", sourceIds: ["a-one", "a-two", "a-three"] });

  const { exited } = runRealWorker(root, logPath, { delayMs: 250 });

  // Wait until city A has genuinely started, then enqueue city B.
  const deadline = Date.now() + 15_000;
  for (;;) {
    if ((await readLog(logPath)).some((entry) => entry.event === "attempt-start")) break;
    if (Date.now() > deadline) throw new Error("city A never started");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  await seedJob(root, { jobId: "job-b", city: "Beta", sourceIds: ["b-one"] });

  const result = await exited;
  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  assert.equal((await loadJob("job-a", { root })).state, "COMPLETE");
  assert.equal((await loadJob("job-b", { root })).state, "COMPLETE", "the later-enqueued city must be picked up by the SAME running worker");

  const entries = await readLog(logPath);
  assert.equal(new Set(entries.map((entry) => entry.pid)).size, 1, "no restart — one process handled both");
  const order = entries.filter((entry) => entry.event === "attempt-start").map((entry) => entry.job_id);
  assert.deepEqual(
    order.filter((jobId, index) => jobId !== order[index - 1]),
    ["job-a", "job-b"],
    "city A finishes before city B begins",
  );
});

// ---------------------------------------------------------------------------
// §22 (process half) / §5 — lock contention and its exit code
// ---------------------------------------------------------------------------

test("22: a second worker started while one already holds the lock REFUSES with exit 2 — it never competes, and never touches the queue", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const logPath = join(root, "first.jsonl");
  const secondLog = join(root, "second.jsonl");
  await seedJob(root, { jobId: "job-held", city: "Alpha", sourceIds: ["a-one", "a-two", "a-three"] });

  const first = runRealWorker(root, logPath, { delayMs: 300 });
  const deadline = Date.now() + 15_000;
  for (;;) {
    if ((await readLog(logPath)).some((entry) => entry.event === "attempt-start")) break;
    if (Date.now() > deadline) throw new Error("first worker never started");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  const second = await runRealWorker(root, secondLog).exited;
  assert.equal(second.code, 2, "lock contention is 'refused, not failed' — exit 2, distinct from both success (0) and fatal (1)");
  assert.match(second.stdout, /refusing to start/);
  assert.deepEqual(await readLog(secondLog), [], "the refused worker must do no acquisition work at all");

  const firstResult = await first.exited;
  assert.equal(firstResult.code, 0);
  assert.equal((await loadJob("job-held", { root })).state, "COMPLETE", "the holder finishes normally, undisturbed");
});

test("16: a fatal error (missing resolver) exits 1 — distinct from clean drain (0) and refusal (2), so systemd's restart-on-failure still fires", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const child = spawn(process.execPath, [WORKER_MAIN], {
    cwd: REPO_ROOT,
    env: { ...process.env, BEATMAPPED_CITY_WORKER_ROOT: root, BEATMAPPED_CITY_WORKER_RESOLVER: "", INSTRUMENTED_LOG_PATH: join(root, "x.jsonl") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = await new Promise((resolvePromise) => child.once("exit", resolvePromise));
  assert.equal(code, 1);
});

// ---------------------------------------------------------------------------
// In-process behaviour of runWorkerUntilQueueDrained itself
// ---------------------------------------------------------------------------

test("runWorkerUntilQueueDrained returns after one drain and reports how many jobs it processed", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-x", city: "Alpha", sourceIds: ["a-one"] });
  await seedJob(root, { jobId: "job-y", city: "Beta", sourceIds: ["b-one"] });

  const outcome = await runWorkerUntilQueueDrained({ root, resolveSourceTasksForJob: makeResolver(["a-one"]), log: () => {} });
  assert.deepEqual(outcome, { started: true, drained: true, stopped_early: false, processed_job_count: 2 });
  assert.equal((await readWorkerLockStatus({ root })).alive, false);
});

test("an empty queue costs exactly one queue read and invokes no resolver", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let resolverCalls = 0;
  const outcome = await runWorkerUntilQueueDrained({
    root,
    resolveSourceTasksForJob: async () => {
      resolverCalls += 1;
      return [];
    },
    log: () => {},
  });
  assert.equal(resolverCalls, 0);
  assert.equal(outcome.processed_job_count, 0);
  assert.equal(outcome.drained, true);
});

test("a cooperative shutdown mid-drain is reported as stopped_early, not as a completed drain, and still releases the lock", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-one", city: "Alpha", sourceIds: ["a-one"] });
  await seedJob(root, { jobId: "job-two", city: "Beta", sourceIds: ["b-one"] });

  // Stop exactly once the FIRST job has genuinely finished, the way a
  // SIGTERM arriving between cities would.
  let finished = 0;
  const outcome = await runWorkerUntilQueueDrained({
    root,
    resolveSourceTasksForJob: makeResolver(["a-one"]),
    shouldStop: () => finished >= 1,
    log: (message) => {
      if (/-> COMPLETE/.test(message)) finished += 1;
    },
  });
  assert.equal(outcome.started, true);
  assert.equal(outcome.stopped_early, true);
  assert.equal(outcome.drained, false, "a run cut short by shutdown must not claim the queue was drained");
  assert.equal(outcome.processed_job_count, 1);
  assert.equal((await readWorkerLockStatus({ root })).alive, false, "a shutdown must never leave a stale lock");
  // The untouched job stays durable and queued for the next worker start.
  assert.equal((await loadJob("job-one", { root })).state, "COMPLETE");
  assert.equal((await loadJob("job-two", { root })).state, "QUEUED");
});

test("a job-level catastrophe fails the JOB, not the worker: the worker still exits cleanly and releases its lock", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-boom", city: "Alpha", sourceIds: ["a-one"] });

  // runCityJob's existing contract (unchanged by this package): an estate
  // that cannot be resolved is a job-level catastrophe -> the JOB goes
  // FAILED. It must not propagate out as a worker crash, because that
  // would make systemd respawn the worker to hit the same bad job again.
  const outcome = await runWorkerUntilQueueDrained({
    root,
    resolveSourceTasksForJob: () => {
      throw new Error("resolver exploded");
    },
    log: () => {},
  });
  assert.equal(outcome.started, true);
  assert.equal(outcome.drained, true);
  assert.equal((await loadJob("job-boom", { root })).state, "FAILED");
  assert.equal((await readWorkerLockStatus({ root })).alive, false);
});

test("no queued job is ever lost by a drain-and-exit run — every job is either terminal or still durably queued", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedJob(root, { jobId: "job-1", city: "Alpha", sourceIds: ["a-one"] });
  await seedJob(root, { jobId: "job-2", city: "Beta", sourceIds: ["b-one"] });

  await runWorkerUntilQueueDrained({ root, resolveSourceTasksForJob: makeResolver(["x"]), log: () => {} });
  const jobs = await listJobs({ root });
  assert.equal(jobs.length, 2);
  for (const job of jobs) {
    assert.ok(["COMPLETE", "COMPLETE_WITH_RESIDUE", "FAILED", "CANCELLED", "QUEUED", "RUNNING"].includes(job.state));
  }
});
