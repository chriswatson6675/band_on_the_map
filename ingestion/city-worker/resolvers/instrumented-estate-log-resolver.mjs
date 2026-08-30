// BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 — a small,
// deterministic, test-support resolver used ONLY to prove the drain-and-
// exit lifecycle against REAL child processes
// (tests/city-worker/drain-and-exit-lifecycle.test.mjs).
//
// It differs from resolvers/instrumented-delay-resolver.mjs (which this
// package deliberately leaves untouched, so the existing crash/restart
// proof keeps running byte-identically) in two ways that matter here:
//
//   1. It reads its source ids from THE JOB'S OWN FROZEN ESTATE SNAPSHOT
//      (`job.estate_ref`), not from an environment variable. So a
//      multi-city drain test gives each city its real, distinct estate,
//      and the frozen-snapshot path from
//      BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 is exercised end
//      to end inside a genuine spawned process.
//   2. Every log line carries `job_id` as well as `source_id` and `pid`,
//      so a test can prove SEQUENCING ACROSS CITIES ("no source of city B
//      was ever attempted while city A was still in flight") from a
//      durable, append-only file rather than from in-process state.
//
// Configuration (env vars, matching the existing instrumented resolver's
// convention — this module is only ever loaded by a spawned child):
//   INSTRUMENTED_LOG_PATH            durable append-only JSONL log (required)
//   INSTRUMENTED_DELAY_MS            delay before each source's outcome (default 0)
//   INSTRUMENTED_RESIDUE_SOURCE_IDS  comma-separated subset resolving to RESIDUE

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function delay(ms) {
  return ms > 0 ? new Promise((resolvePromise) => setTimeout(resolvePromise, ms)) : Promise.resolve();
}

export async function resolveSourceTasks(job, { root } = {}) {
  const logPath = process.env.INSTRUMENTED_LOG_PATH;
  if (!logPath) throw new Error("instrumented-estate-log-resolver: INSTRUMENTED_LOG_PATH is required");
  const delayMs = Number.parseInt(process.env.INSTRUMENTED_DELAY_MS ?? "0", 10);
  const residueSourceIds = new Set((process.env.INSTRUMENTED_RESIDUE_SOURCE_IDS ?? "").split(",").filter(Boolean));

  const estate = JSON.parse(await readFile(resolve(root, job.estate_ref), "utf8"));

  async function appendLog(entry) {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify({ ...entry, job_id: job.job_id, pid: process.pid, at: new Date().toISOString() })}\n`, "utf8");
  }

  await appendLog({ event: "estate-resolved", source_count: estate.source_ids.length });

  return estate.source_ids.map((sourceId) => ({
    source_id: sourceId,
    run: async () => {
      await appendLog({ event: "attempt-start", source_id: sourceId });
      await delay(delayMs);
      if (residueSourceIds.has(sourceId)) {
        await appendLog({ event: "attempt-done", source_id: sourceId, outcome: "RESIDUE" });
        return { outcome: "RESIDUE", residue_reason: "SOURCE_UNRESOLVED" };
      }
      await appendLog({ event: "attempt-done", source_id: sourceId, outcome: "SUCCESS" });
      return { outcome: "SUCCESS", observation_count: 1 };
    },
  }));
}
