// BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01 — the most
// important proof in this package (sections 9 and 10 of its own brief):
// a GENUINE process-lifetime interruption, not a same-process shouldStop()
// simulation. This test spawns the real operator CLI
// (`node ingestion/city-worker/cli.mjs run-worker`) as an actual child OS
// process, lets it make real, durably-logged progress against a 5-source
// job, SIGKILLs it mid-flight (source 3 left RUNNING, never reaching its
// own terminal checkpoint — the harder boundary from section 10), then
// spawns a FRESH child process to resume and verifies, from durable state
// and an independent append-only log file alone:
//   - completed sources (1, 2) are never re-invoked
//   - the source killed mid-flight (3) is safely re-attempted
//   - the remaining sources (4, 5) are processed
//   - the job reaches COMPLETE only once every source is truly terminal

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCityJob } from "../../ingestion/city-worker/job.mjs";
import { saveJob, loadJob } from "../../ingestion/city-worker/job-store.mjs";
import { enqueueJob } from "../../ingestion/city-worker/queue.mjs";
import { loadSourceCheckpoints } from "../../ingestion/city-worker/checkpoint-store.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = resolve(REPO_ROOT, "ingestion/city-worker/cli.mjs");
const RESOLVER_PATH = "ingestion/city-worker/resolvers/instrumented-delay-resolver.mjs";
const SOURCE_IDS = ["src-1", "src-2", "src-3", "src-4", "src-5"];

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-crash-restart-"));
}

function spawnWorker(root, logPath, { delayMs = 700 } = {}) {
  return spawn(
    process.execPath,
    [CLI_PATH, "run-worker", `--resolver=${RESOLVER_PATH}`, `--root=${root}`, "--concurrency=1"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        INSTRUMENTED_SOURCE_IDS: SOURCE_IDS.join(","),
        INSTRUMENTED_DELAY_MS: String(delayMs),
        INSTRUMENTED_LOG_PATH: logPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function readLogLines(logPath) {
  try {
    const raw = await readFile(logPath, "utf8");
    return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

/** Poll until `predicate(checkpoints)` is true, or throw after `timeoutMs`. */
async function waitFor(predicate, { root, jobId, timeoutMs = 20_000, intervalMs = 50 }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const checkpoints = await loadSourceCheckpoints(jobId, { root });
    if (predicate(checkpoints)) return checkpoints;
    if (Date.now() > deadline) throw new Error(`waitFor: condition never became true within ${timeoutMs}ms`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
}

function waitForExit(child) {
  return new Promise((resolvePromise) => child.once("exit", (code, signal) => resolvePromise({ code, signal })));
}

test(
  "genuine crash mid-source + restart: completed sources are not repeated, the source RUNNING at crash time is safely re-attempted, the city still reaches COMPLETE",
  { timeout: 60_000 },
  async (t) => {
    const root = await freshRoot();
    const logPath = join(root, "instrumented.log");
    t.after(() => rm(root, { recursive: true, force: true }));

    const jobId = "crash-restart-job-01";
    const job = createCityJob({ jobId, country: "ZZ", city: "Instrumented Test City", estateRef: "n/a (instrumented resolver ignores estate_ref)", createdAt: "2026-08-29T00:00:00.000Z" });
    await saveJob(job, { root });
    await enqueueJob(jobId, { root });

    // --- Phase 1: run, then genuinely kill mid-source ---------------
    const firstChild = spawnWorker(root, logPath, { delayMs: 700 });
    let firstStderr = "";
    firstChild.stderr.on("data", (chunk) => { firstStderr += chunk.toString(); });

    // Wait until exactly 2 sources are SUCCESS and a 3rd is RUNNING
    // (attempted, not yet terminal) — the harder "crash during a source"
    // boundary (section 10), not merely "between sources" (section 9).
    const checkpointsAtCrash = await waitFor(
      (checkpoints) => {
        const successCount = [...checkpoints.values()].filter((c) => c.status === "SUCCESS").length;
        const runningCount = [...checkpoints.values()].filter((c) => c.status === "RUNNING").length;
        return successCount === 2 && runningCount === 1;
      },
      { root, jobId },
    );

    const pidBeforeKill = firstChild.pid;
    firstChild.kill("SIGKILL");
    const { signal } = await waitForExit(firstChild);
    assert.equal(signal, "SIGKILL", "the first child process must have been genuinely, forcibly terminated");

    // --- Evidence at the moment of crash ------------------------------
    const runningSourceAtCrash = [...checkpointsAtCrash.entries()].find(([, c]) => c.status === "RUNNING")?.[0];
    assert.ok(runningSourceAtCrash, "one source must be recorded RUNNING (attempted, not terminal) at crash time");
    const successSourcesAtCrash = [...checkpointsAtCrash.entries()].filter(([, c]) => c.status === "SUCCESS").map(([id]) => id);
    assert.equal(successSourcesAtCrash.length, 2);

    const jobAtCrash = await loadJob(jobId, { root });
    assert.equal(jobAtCrash.state, "RUNNING", "the job itself must not be terminal after a hard kill");

    const logAfterCrash = await readLogLines(logPath);
    const startsAfterCrash = logAfterCrash.filter((entry) => entry.event === "attempt-start").map((entry) => entry.source_id);
    const donesAfterCrash = logAfterCrash.filter((entry) => entry.event === "attempt-done").map((entry) => entry.source_id);
    assert.equal(donesAfterCrash.length, 2, "exactly 2 sources' acquisition genuinely completed before the kill");
    assert.ok(startsAfterCrash.includes(runningSourceAtCrash), "the interrupted source's acquisition genuinely started before the kill");
    assert.ok(!donesAfterCrash.includes(runningSourceAtCrash), "the interrupted source's acquisition genuinely never finished before the kill");

    // --- Phase 2: restart (a fresh, independent process) --------------
    const secondChild = spawnWorker(root, logPath, { delayMs: 50 }); // faster now — only proving completion/non-repetition, not timing
    const { code: secondExitCode } = await waitForExit(secondChild);
    assert.equal(secondExitCode, 0, "the resumed run must exit cleanly (HEALTHY-equivalent completion)");
    assert.notEqual(secondChild.pid, pidBeforeKill, "the restart is a genuinely separate OS process");

    // --- Final durable state -------------------------------------------
    const finalJob = await loadJob(jobId, { root });
    assert.equal(finalJob.state, "COMPLETE");
    assert.equal(finalJob.total_sources, 5);
    assert.equal(finalJob.successful_sources, 5);

    const finalCheckpoints = await loadSourceCheckpoints(jobId, { root });
    for (const sourceId of SOURCE_IDS) {
      assert.equal(finalCheckpoints.get(sourceId)?.status, "SUCCESS", `${sourceId} must be SUCCESS in the end`);
    }

    // --- The decisive non-repetition proof: independent log evidence --
    const finalLog = await readLogLines(logPath);
    const doneCountBySource = new Map();
    for (const entry of finalLog) {
      if (entry.event !== "attempt-done") continue;
      doneCountBySource.set(entry.source_id, (doneCountBySource.get(entry.source_id) ?? 0) + 1);
    }
    for (const sourceId of successSourcesAtCrash) {
      assert.equal(doneCountBySource.get(sourceId), 1, `${sourceId} completed before the crash and must NEVER be re-acquired after restart (saw ${doneCountBySource.get(sourceId)} completions total)`);
    }
    assert.equal(doneCountBySource.get(runningSourceAtCrash), 1, `the source interrupted mid-flight must complete EXACTLY once after being safely re-attempted (saw ${doneCountBySource.get(runningSourceAtCrash)})`);

    // Sanity: nothing hung/crashed silently.
    assert.equal(firstStderr.includes("FATAL"), false, `first child's stderr must show no fatal error:\n${firstStderr}`);
  },
);
