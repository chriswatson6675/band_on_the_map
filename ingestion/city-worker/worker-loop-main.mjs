#!/usr/bin/env node
// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the actual systemd
// entry point: `node ingestion/city-worker/worker-loop-main.mjs`
// (`npm run city-worker:daemon`). Long-running: acquires the single-
// worker lock, then drains the queue forever, until SIGTERM/SIGINT asks
// for a clean shutdown — see deploy/systemd/beatmapped-city-worker.service.
//
// BEATMAPPED_CITY_WORKER_RESOLVER (required): path to the ES module
// exporting `resolveSourceTasks(job, { root })` — the injected city-
// acquisition interface (see runner.mjs, cli.mjs). This file never
// hardcodes one, for the same geography-neutrality reason runner.mjs
// never does.

import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { runWorkerLoop } from "./worker-loop.mjs";
import { CITY_WORKER_ROOT } from "./job-store.mjs";

async function main() {
  const resolverPath = process.env.BEATMAPPED_CITY_WORKER_RESOLVER;
  if (!resolverPath) {
    console.error("[city-worker] FATAL: BEATMAPPED_CITY_WORKER_RESOLVER must name a module exporting resolveSourceTasks(job)");
    process.exitCode = 1;
    return;
  }
  const absolute = resolvePath(CITY_WORKER_ROOT, resolverPath);
  const mod = await import(pathToFileURL(absolute).href);
  if (typeof mod.resolveSourceTasks !== "function") {
    console.error(`[city-worker] FATAL: ${resolverPath} does not export resolveSourceTasks(job)`);
    process.exitCode = 1;
    return;
  }

  let stopRequested = false;
  const requestStop = (signal) => {
    console.log(`[city-worker] received ${signal} — finishing the current batch of sources, then shutting down cleanly`);
    stopRequested = true;
  };
  process.on("SIGTERM", () => requestStop("SIGTERM"));
  process.on("SIGINT", () => requestStop("SIGINT"));

  const pollIntervalMs = process.env.BEATMAPPED_CITY_WORKER_POLL_INTERVAL_MS
    ? Number.parseInt(process.env.BEATMAPPED_CITY_WORKER_POLL_INTERVAL_MS, 10)
    : undefined;

  const outcome = await runWorkerLoop({
    root: CITY_WORKER_ROOT,
    resolveSourceTasksForJob: (job) => mod.resolveSourceTasks(job, { root: CITY_WORKER_ROOT }),
    pollIntervalMs,
    shouldStop: () => stopRequested,
    log: (...args) => console.log(...args),
  });

  if (outcome.started === false) {
    process.exitCode = 2; // another worker already running — same "refused, not failed" convention as ingestion/unattended-runner/run.mjs
  }
}

main().catch((error) => {
  console.error(`[city-worker] FATAL: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
