// BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01 — a small,
// deterministic, test-support resolver used ONLY to prove genuine
// process-lifetime crash/restart behaviour
// (tests/city-worker/crash-restart-real-process.test.mjs). Unlike
// resolvers/example-synthetic-resolver.mjs (instant), this resolver
// introduces a deliberate, configurable per-source delay so a test can
// reliably kill a real child process partway through a real multi-source
// job, and appends one durable, append-only log line per acquisition
// attempt so acquisition CALLS (not just final state) are independently,
// observably provable across a process boundary — the log file survives
// the killed process, unlike anything held in that process's memory.
//
// Configuration is via environment variables (this module is only ever
// loaded by a spawned `node ingestion/city-worker/cli.mjs` child process
// in tests — env vars are the simplest way to configure it without a
// second CLI flag surface):
//   INSTRUMENTED_SOURCE_IDS       comma-separated source ids for this job
//   INSTRUMENTED_DELAY_MS         delay before each source's own outcome (default 1000)
//   INSTRUMENTED_LOG_PATH         durable append-only JSONL log path (required)
//   INSTRUMENTED_RESIDUE_SOURCE_IDS  comma-separated subset that resolves to RESIDUE instead of SUCCESS (optional)

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function resolveSourceTasks() {
  const sourceIds = (process.env.INSTRUMENTED_SOURCE_IDS ?? "").split(",").filter(Boolean);
  const delayMs = Number.parseInt(process.env.INSTRUMENTED_DELAY_MS ?? "1000", 10);
  const logPath = process.env.INSTRUMENTED_LOG_PATH;
  const residueSourceIds = new Set((process.env.INSTRUMENTED_RESIDUE_SOURCE_IDS ?? "").split(",").filter(Boolean));

  async function appendLog(entry) {
    if (!logPath) throw new Error("instrumented-delay-resolver: INSTRUMENTED_LOG_PATH is required");
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify({ ...entry, pid: process.pid, at: new Date().toISOString() })}\n`, "utf8");
  }

  return sourceIds.map((sourceId) => ({
    source_id: sourceId,
    run: async () => {
      await appendLog({ source_id: sourceId, event: "attempt-start" });
      await delay(delayMs);
      if (residueSourceIds.has(sourceId)) {
        await appendLog({ source_id: sourceId, event: "attempt-done", outcome: "RESIDUE" });
        return { outcome: "RESIDUE", residue_reason: "SOURCE_UNRESOLVED" };
      }
      await appendLog({ source_id: sourceId, event: "attempt-done", outcome: "SUCCESS" });
      return { outcome: "SUCCESS", observation_count: 1 };
    },
  }));
}
