// Test-only helpers for building synthetic, geography-neutral city
// estates and resolveSourceTasks() functions — never real collectors,
// never a real venue/hostname (see docs/UNATTENDED_CITY_WORKER.md,
// "Synthetic multi-city proof").

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Fixtures live in the repository tree itself, never under a per-test
// scratch `root` (which is a throwaway temp directory standing in for
// runtime/) — callers pass the repository root explicitly.
export async function loadSyntheticEstateFrom(fixturesRoot, cityKey) {
  const path = resolve(fixturesRoot, "fixtures/city-worker/synthetic-estates.json");
  const raw = JSON.parse(await readFile(path, "utf8"));
  return raw[cityKey].source_ids;
}

/**
 * Build a resolveSourceTasks(job) function for tests. `outcomes` maps
 * source_id -> a fixed outcome object, `{ throws: Error }`, or a function
 * `(attempt) => outcome`  — matching the real SourceTask.run contract
 * (see ingestion/city-worker/runner.mjs). Every invocation is recorded
 * into `callLog` for assertions (call counts, attempt numbers, dispatch
 * order).
 */
export function makeResolver(sourceIds, outcomes = {}, { callLog = [] } = {}) {
  async function resolveSourceTasks() {
    return sourceIds.map((sourceId) => ({
      source_id: sourceId,
      run: async (attempt) => {
        callLog.push({ source_id: sourceId, attempt });
        const behavior = outcomes[sourceId];
        if (typeof behavior === "function") return behavior(attempt);
        if (behavior?.throws) throw behavior.throws;
        return behavior ?? { outcome: "SUCCESS" };
      },
    }));
  }
  return resolveSourceTasks;
}

export const instantRetryPolicy = { maxAttempts: 3, retryDelayMs: 1, delayFn: () => Promise.resolve() };
