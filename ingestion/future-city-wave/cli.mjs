#!/usr/bin/env node
// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — CLI entrypoint.
//
//   node ingestion/future-city-wave/cli.mjs                       full Wave-1 sweep
//   node ingestion/future-city-wave/cli.mjs --run-id=<id>          resume a specific run
//   node ingestion/future-city-wave/cli.mjs --city=manchester-gb,dublin-ie   restrict to given city ids
//
// PROOF ONLY: this CLI has no --execute/--admit mode of any kind — there
// is no code path in this package that writes to a production registry.

import { randomUUID } from "node:crypto";

import { fetchText } from "../http/fetch.mjs";
import { runFutureCityWave } from "./controller.mjs";
import { formatCounters, formatCityTable, computeYieldRate } from "./report.mjs";

function parseArgs(argv) {
  const args = { runId: null, cityFilter: null };
  for (const arg of argv) {
    if (arg.startsWith("--run-id=")) args.runId = arg.slice("--run-id=".length);
    else if (arg.startsWith("--city=")) args.cityFilter = arg.slice("--city=".length).split(",").filter(Boolean);
    else throw new Error(`cli.mjs: unrecognised argument "${arg}"`);
  }
  return args;
}

async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId ?? `wave1-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;

  console.log("BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01");
  console.log(`run_id=${runId}${args.cityFilter ? ` cities=${args.cityFilter.join(",")}` : ""}`);
  console.log("");

  const summary = await runFutureCityWave({
    runId,
    fetchDocument: defaultFetchDocument,
    cityFilter: args.cityFilter,
    interCandidateDelayMs: 500,
    interCityDelayMs: 1000,
  });

  console.log(formatCounters(summary));
  console.log("");
  console.log(`TIER-1 YIELD RATE: ${(computeYieldRate(summary) * 100).toFixed(1)}%`);
  console.log("");
  console.log(formatCityTable(summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
