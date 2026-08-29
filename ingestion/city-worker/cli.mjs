#!/usr/bin/env node
// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — the minimal operator
// interface: `npm run city-worker -- <command> ...args`. Proves that a
// future dashboard's buttons can all call this same stable control plane
// (job-store.mjs / queue.mjs / runner.mjs) — no web UI here, deliberately
// (see this package's own brief, "Do not build dashboard").
//
// Commands:
//   enqueue-city <country> <city> <estateRef> [--job-id=ID] [--config=JSON]
//   list-jobs [--state=STATE]
//   show-job <jobId>
//   resume-job <jobId> --resolver=<path> [--concurrency=N]
//   cancel-job <jobId>
//   run-worker --resolver=<path> [--concurrency=N]
//
// `--resolver=<path>` names an ES module (relative to the current working
// directory, or absolute) exporting `resolveSourceTasks(job)` — the
// injected, geography-neutral city-acquisition interface runner.mjs
// requires (see that module's own header comment). The real adapter,
// wired to this repository's actual collector engine, is
// resolvers/programme-acquisition-resolver.mjs; resolvers/example-
// synthetic-resolver.mjs remains for demonstration/smoke-testing without
// any network dependency.
//
// `--root=<path>` (or env BEATMAPPED_CITY_WORKER_ROOT) points every
// command at an alternate runtime/ tree instead of this repository's own
// — used ONLY by tests and isolated proof runs; every real, unattended
// invocation omits it and gets this repository's real `runtime/city-jobs/`.

import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

import { createCityJob } from "./job.mjs";
import { saveJob, loadJob, listJobs, CITY_WORKER_ROOT } from "./job-store.mjs";
import { enqueueJob } from "./queue.mjs";
import { runCityJob } from "./runner.mjs";
import { drainQueueOnce } from "./worker-loop.mjs";
import { getWorkerHealth, getJobHealth } from "./health.mjs";
import { resolveRunnerVersionSha } from "./version.mjs";

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) flags[match[1]] = match[2];
    else positional.push(arg);
  }
  return { flags, positional };
}

async function loadResolver(resolverPath, root) {
  if (!resolverPath) throw new Error("this command requires --resolver=<path to a module exporting resolveSourceTasks(job)>");
  const absolute = resolvePath(process.cwd(), resolverPath);
  const mod = await import(pathToFileURL(absolute).href);
  if (typeof mod.resolveSourceTasks !== "function") {
    throw new Error(`${resolverPath} does not export resolveSourceTasks(job)`);
  }
  return (job) => mod.resolveSourceTasks(job, { root });
}

async function cmdEnqueueCity({ flags, positional }, root) {
  const [country, city, estateRef] = positional;
  if (!country || !city || !estateRef) {
    throw new Error("usage: enqueue-city <country> <city> <estateRef> [--job-id=ID] [--config=JSON]");
  }
  const jobId = flags["job-id"] ?? randomUUID();
  const configuration = flags.config ? JSON.parse(flags.config) : {};
  const runnerVersionSha = await resolveRunnerVersionSha({ root });
  const job = createCityJob({
    jobId,
    country,
    city,
    estateRef,
    createdAt: new Date().toISOString(),
    runnerVersionSha,
    configuration,
  });
  await saveJob(job, { root });
  await enqueueJob(jobId, { root });
  console.log(JSON.stringify({ job_id: jobId, state: job.state }, null, 2));
}

async function cmdListJobs({ flags }, root) {
  const jobs = await listJobs({ root });
  const filtered = flags.state ? jobs.filter((job) => job.state === flags.state) : jobs;
  console.log(JSON.stringify(filtered.map((job) => ({ job_id: job.job_id, country: job.country, city: job.city, state: job.state })), null, 2));
}

async function cmdShowJob({ positional }, root) {
  const [jobId] = positional;
  if (!jobId) throw new Error("usage: show-job <jobId>");
  const health = await getJobHealth(jobId, { root });
  if (!health) throw new Error(`no such job: ${jobId}`);
  console.log(JSON.stringify(health, null, 2));
}

async function cmdResumeJob({ flags, positional }, root) {
  const [jobId] = positional;
  if (!jobId) throw new Error("usage: resume-job <jobId> --resolver=<path>");
  const resolveSourceTasks = await loadResolver(flags.resolver, root);
  const concurrency = flags.concurrency ? Number.parseInt(flags.concurrency, 10) : undefined;
  const job = await runCityJob(jobId, { root, resolveSourceTasks, concurrency });
  console.log(JSON.stringify({ job_id: job.job_id, state: job.state, final_metrics: job.final_metrics }, null, 2));
}

async function cmdCancelJob({ positional }, root) {
  const [jobId] = positional;
  if (!jobId) throw new Error("usage: cancel-job <jobId>");
  const job = await loadJob(jobId, { root });
  if (!job) throw new Error(`no such job: ${jobId}`);
  if (job.state !== "QUEUED" && job.state !== "RUNNING") {
    console.log(JSON.stringify({ job_id: jobId, state: job.state, note: "already terminal — cancel is a no-op" }, null, 2));
    return;
  }
  const updated = { ...job, cancel_requested: true, state: job.state === "QUEUED" ? "CANCELLED" : job.state, completed_at: job.state === "QUEUED" ? new Date().toISOString() : job.completed_at };
  await saveJob(updated, { root });
  console.log(JSON.stringify({ job_id: jobId, state: updated.state, note: updated.state === "RUNNING" ? "cancellation requested — will take effect between sources" : "cancelled" }, null, 2));
}

async function cmdRunWorker({ flags }, root) {
  const resolveSourceTasksForJob = await loadResolver(flags.resolver, root);
  const concurrency = flags.concurrency ? Number.parseInt(flags.concurrency, 10) : undefined;
  const processed = await drainQueueOnce({ root, resolveSourceTasksForJob, concurrency, log: (msg) => console.log(msg) });
  console.log(JSON.stringify(processed.map((job) => ({ job_id: job.job_id, state: job.state })), null, 2));
}

async function cmdHealth(_args, root) {
  console.log(JSON.stringify(await getWorkerHealth({ root }), null, 2));
}

const COMMANDS = {
  "enqueue-city": cmdEnqueueCity,
  "list-jobs": cmdListJobs,
  "show-job": cmdShowJob,
  "resume-job": cmdResumeJob,
  "cancel-job": cmdCancelJob,
  "run-worker": cmdRunWorker,
  health: cmdHealth,
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command ?? "(none)"}\nAvailable: ${Object.keys(COMMANDS).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const parsed = parseFlags(rest);
  // Real production usage never passes --root or sets this env var —
  // both exist solely so tests (and any future isolated staging/proof
  // run) can point this exact same CLI at a scratch directory instead of
  // the real runtime/city-jobs/ tree, without a second code path.
  const root = parsed.flags.root
    ? resolvePath(process.cwd(), parsed.flags.root)
    : process.env.BEATMAPPED_CITY_WORKER_ROOT
      ? resolvePath(process.cwd(), process.env.BEATMAPPED_CITY_WORKER_ROOT)
      : CITY_WORKER_ROOT;
  try {
    await handler(parsed, root);
  } catch (error) {
    console.error(`[city-worker] ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

main();
