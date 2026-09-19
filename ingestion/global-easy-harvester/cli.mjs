#!/usr/bin/env node
// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — CLI entrypoint.
//
//   node ingestion/global-easy-harvester/cli.mjs                    dry run, all cities
//   node ingestion/global-easy-harvester/cli.mjs --execute --max-admissions=10
//   node ingestion/global-easy-harvester/cli.mjs --run-id=<id>       resume a specific run
//   node ingestion/global-easy-harvester/cli.mjs --city=berlin,paris restrict to given city keys
//
// Defaults to DRY RUN (Phase 7 of this package's brief is mandatory before
// any real admission) — `--execute` is required to actually admit.

import { randomUUID } from "node:crypto";

import { fetchText } from "../http/fetch.mjs";
import { runHarvester } from "./controller.mjs";
import { captureProductSnapshot, formatBeforeAfter, formatCounters } from "./report.mjs";

function parseArgs(argv) {
  const args = { dryRun: true, maxAdmissions: 10, runId: null, cityFilter: null };
  for (const arg of argv) {
    if (arg === "--execute") args.dryRun = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--max-admissions=")) args.maxAdmissions = Number(arg.slice("--max-admissions=".length));
    else if (arg.startsWith("--run-id=")) args.runId = arg.slice("--run-id=".length);
    else if (arg.startsWith("--city=")) args.cityFilter = arg.slice("--city=".length).split(",").filter(Boolean);
    else throw new Error(`cli.mjs: unrecognised argument "${arg}"`);
  }
  return args;
}

/** Reuses (never duplicates) this repository's own generic HTTP fetch helper — see ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs's defaultFetchDocument, which this mirrors exactly. */
async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId ?? `harvest-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;

  console.log("BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01");
  console.log(`run_id=${runId} mode=${args.dryRun ? "DRY_RUN" : "EXECUTE"} max_admissions=${args.maxAdmissions}${args.cityFilter ? ` cities=${args.cityFilter.join(",")}` : ""}`);
  console.log("");

  const before = await captureProductSnapshot({});
  const summary = await runHarvester({
    runId,
    dryRun: args.dryRun,
    maxAdmissions: args.maxAdmissions,
    fetchDocument: defaultFetchDocument,
    cityFilter: args.cityFilter,
    // See controller.mjs's own header comment on interCandidateDelayMs — a
    // real dry run showed materially elevated transient NETWORK_FAILURE
    // under tight back-to-back sequential load against ~500 different
    // external hosts; a modest pacing gap costs little wall-clock time and
    // measurably reduces false-negative defers.
    interCandidateDelayMs: 500,
  });
  const after = await captureProductSnapshot({});

  console.log(formatCounters(summary));
  console.log("");
  console.log(formatBeforeAfter(before, after));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
