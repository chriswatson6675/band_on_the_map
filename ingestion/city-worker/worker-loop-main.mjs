#!/usr/bin/env node
// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the actual systemd
// entry point: `node ingestion/city-worker/worker-loop-main.mjs`
// (`npm run city-worker:daemon`). DRAIN-AND-EXIT: acquires the single-
// worker lock, drains every runnable city job, then exits — see
// deploy/systemd/beatmapped-city-worker.service and worker-loop.mjs's own
// header for why the previous always-on shape was replaced
// (BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01).
//
// EXIT CODES — these are a real contract, because
// beatmapped-city-worker.service is `Restart=on-failure`, so systemd
// respawns on any non-zero exit and does not respawn on zero:
//
//   0  the queue drained (or was already empty), or a cooperative
//      SIGTERM/SIGINT shutdown completed. NOT restarted by systemd —
//      this is the normal end of a city-acquisition run, and it is what
//      lets the service return to `inactive` so a deployment is allowed
//      again.
//   2  ANOTHER_WORKER_RUNNING / lock contention — "refused, not failed",
//      the same convention ingestion/unattended-runner/run.mjs uses. This
//      IS non-zero on purpose: under drain-and-exit an operator wake can
//      legitimately land while a previous worker still holds the lock, and
//      `Restart=on-failure` + `RestartSec=10s` then retries until the lock
//      frees, which drains the newly-queued job instead of stranding it.
//   1  a genuine fatal error (bad/missing resolver, unhandled exception).
//      Restarted by systemd, deliberately, exactly as before.
//
// BEATMAPPED_CITY_WORKER_RESOLVER (required): path to the ES module
// exporting `resolveSourceTasks(job, { root })` — the injected city-
// acquisition interface (see runner.mjs, cli.mjs). This file never
// hardcodes one, for the same geography-neutrality reason runner.mjs
// never does.

import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { runWorkerUntilQueueDrained } from "./worker-loop.mjs";
import { CITY_WORKER_ROOT } from "./job-store.mjs";

// BEATMAPPED_CITY_WORKER_ROOT points this entry point at an alternate
// runtime tree instead of this repository's own — the SAME test-only
// escape hatch cli.mjs already exposes (see its own note). It exists so
// the drain-and-exit lifecycle and its real EXIT CODES can be proven
// against THIS module — the exact ExecStart the systemd unit runs —
// rather than against a proxy. Every real production invocation omits it
// and gets this repository's real runtime/city-jobs/.
const ROOT = process.env.BEATMAPPED_CITY_WORKER_ROOT ? resolvePath(process.cwd(), process.env.BEATMAPPED_CITY_WORKER_ROOT) : CITY_WORKER_ROOT;

async function main() {
  const resolverPath = process.env.BEATMAPPED_CITY_WORKER_RESOLVER;
  if (!resolverPath) {
    console.error("[city-worker] FATAL: BEATMAPPED_CITY_WORKER_RESOLVER must name a module exporting resolveSourceTasks(job)");
    process.exitCode = 1;
    return;
  }
  const absolute = resolvePath(ROOT, resolverPath);
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

  const outcome = await runWorkerUntilQueueDrained({
    root: ROOT,
    resolveSourceTasksForJob: (job) => mod.resolveSourceTasks(job, { root: ROOT }),
    shouldStop: () => stopRequested,
    log: (...args) => console.log(...args),
  });

  if (outcome.started === false) {
    // See this module's own EXIT CODES note: deliberately non-zero, so
    // systemd's Restart=on-failure retries once the lock frees rather than
    // leaving a freshly-queued job stranded.
    process.exitCode = 2;
  }
  // Otherwise the queue is drained (or the shutdown request was honoured)
  // and this process exits 0 — systemd does NOT respawn it, and the
  // service returns to `inactive` until the next operator wake.
}

main().catch((error) => {
  console.error(`[city-worker] FATAL: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
