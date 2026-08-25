#!/usr/bin/env node
// Bounded LIVE smoke check for the generic Events Calendar REST API family
// (ingestion/events-calendar-api/), proven against CCB's own config
// (ingestion/ccb/config.mjs). Modelled on ingestion/agendalx/probe.mjs's
// existing convention: prints a diagnostic summary to stdout, never
// writes to any canonical/production data path, and makes no assertion
// about music/genre relevance beyond what CCB's own `musica` category
// already asserts.
//
// This script demonstrates ONLY: the public API is reachable -> the
// generic collector receives records -> those records parse into the
// expected Observation shape. It does not persist observations anywhere;
// re-run it as many times as needed with zero side effects.
//
// Usage: node ingestion/ccb/probe.mjs [--max-pages N]

import { fetchAllEvents } from "../events-calendar-api/fetch-all.mjs";
import { toObservations } from "../events-calendar-api/observation-adapter.mjs";
import { CCB_MUSIC_CONFIG } from "./config.mjs";

function parseArgs(argv) {
  const args = { maxPages: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--max-pages") {
      args.maxPages = Number(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = args.maxPages ? { ...CCB_MUSIC_CONFIG, maxPages: args.maxPages } : CCB_MUSIC_CONFIG;

  const retrievedAt = new Date().toISOString();
  const result = await fetchAllEvents(config);

  const observations = toObservations(result.records, config, { retrievedAt });

  const certaintyCounts = {};
  for (const obs of observations) {
    certaintyCounts[obs.start.certainty] = (certaintyCounts[obs.start.certainty] ?? 0) + 1;
  }
  const withVenue = observations.filter((o) => o.venue_name).length;
  const withPrice = observations.filter((o) => o.price_text).length;
  const withUrl = observations.filter((o) => o.event_url).length;
  const distinctIds = new Set(observations.map((o) => o.source_record_id)).size;

  const summary = {
    source_id: config.source_id,
    ok: result.ok,
    pagesFetched: result.pagesFetched,
    truncated: result.truncated,
    totalDeclaredBySource: result.totalDeclared,
    recordsCollected: result.records.length,
    observationsBuilt: observations.length,
    distinctSourceRecordIds: distinctIds,
    startDateCertaintyCounts: certaintyCounts,
    withVenueName: withVenue,
    withPriceText: withPrice,
    withEventUrl: withUrl,
    errors: result.errors,
    sampleObservation: observations[0] ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
