#!/usr/bin/env node
// BOTM-PUBLIC-MAP-LIVE-DATA-01 — the one manual/operator/scheduler entry
// point this package adds: `npm run publish:map-data` (optionally
// `-- --from=YYYY-MM-DD --to=YYYY-MM-DD`).
//
// This is the PUBLICATION BOUNDARY the task brief describes:
//
//   live source ingestion (acquireLisbonPorto(), unchanged, reused from
//     ingestion/lisbon-porto/run.mjs — the exact same 13-source
//     acquisition already proven by `npm run ingest:lisbon-porto` and
//     `npm run onboard:venues`)
//     -> Observation / venue resolution / manual-coordinate composition
//        (ingestion/venue/resolver.mjs, ingestion/geocoding/
//        manual-coordinate-store.mjs, ingestion/map/projection.mjs — all
//        unchanged, reused)
//     -> display marker projection (ingestion/map/
//        group-associated-listings.mjs's projectObservationsToDisplayMarkers,
//        wrapped by ingestion/map/publication.mjs's buildPortugalMarkers,
//        which does nothing but combine the Lisbon+Porto halves into one
//        "Portugal" list — no second projection path)
//     -> PRODUCT PUBLICATION ARTIFACT (ingestion/map/publication.mjs's
//        buildPublicationArtifact(), schema-validated and atomically
//        written by ingestion/map/publish-artifact-io.mjs to
//        data/public/lisbon-porto-map.json)
//     -> public homepage (app/page.tsx reads that committed file — never
//        this script, never a live network call, at build or render
//        time)
//
// This is a live-network, manually-triggered command — exactly like `npm
// run ingest:lisbon-porto` — never run automatically during `npm run
// build`, `npm test`, or ordinary page rendering. It performs no live
// acquisition itself beyond what acquireLisbonPorto() already does; every
// source remains independently isolated in its own try/catch exactly as
// today (see ingestion/lisbon-porto/run.mjs's acquireAll()) — one
// source's failure is recorded and reported, never allowed to abort any
// other source or the run as a whole.
//
// CATASTROPHIC-RUN SAFETY: see isCatastrophicPublicationRun()'s own doc
// comment in ingestion/map/publication.mjs for the exact, single rule.
// When a run is catastrophic, this script exits non-zero WITHOUT calling
// the atomic writer at all — the previously committed
// data/public/lisbon-porto-map.json is left completely untouched.
//
// This script never edits venues/manual-coordinates.json (only reads it,
// via loadManualCoordinateStore()) and never touches any of the 13 source
// collectors themselves.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLisbonPorto } from "../lisbon-porto/run.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";
import { buildPortugalMarkers, buildPublicationArtifact, isCatastrophicPublicationRun } from "../map/publication.mjs";
import { writePublicationArtifactAtomic, resolvePublicationArtifactPath } from "../map/publish-artifact-io.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const args = { from: null, to: null };
  for (const arg of argv) {
    const fromMatch = /^--from=(.+)$/.exec(arg);
    const toMatch = /^--to=(.+)$/.exec(arg);
    if (fromMatch) args.from = fromMatch[1];
    if (toMatch) args.to = toMatch[1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  console.log(`BOTM-PUBLIC-MAP-LIVE-DATA-01 publication run starting (${generatedAt})`);
  if (args.from || args.to) console.log(`  date bounds: from=${args.from ?? "(none)"} to=${args.to ?? "(none)"}`);

  const lisbonVenues = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));
  const portoVenues = JSON.parse(await readFile(resolve(ROOT, "venues/porto.json"), "utf8"));

  // Read-only: this script never writes venues/manual-coordinates.json.
  const manualStore = await loadManualCoordinateStore();
  const manualCoordinatesByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));

  const {
    lisbonRegistry,
    portoRegistry,
    lisbonResults,
    portoResults,
    lisbonObservations,
    portoObservations,
    lisbonAssociations,
  } = await acquireLisbonPorto(args);

  const sourceResults = [...lisbonResults, ...portoResults];
  const observationCount = lisbonObservations.length + portoObservations.length;
  const successCount = sourceResults.filter((result) => result.success).length;
  const failureCount = sourceResults.length - successCount;

  const portugalMarkers = buildPortugalMarkers({
    lisbonObservations,
    portoObservations,
    lisbonVenues: lisbonVenues.venues,
    portoVenues: portoVenues.venues,
    lisbonSourceRegistry: lisbonRegistry.entries,
    portoSourceRegistry: portoRegistry.entries,
    lisbonAssociations,
    manualCoordinatesByVenueId,
  });

  console.log(`\n=== Acquisition summary ===`);
  for (const result of sourceResults) {
    const status = result.success ? "OK" : "FAILED";
    console.log(
      `  [${status}] ${result.source_id}: raw=${result.raw_record_count} observations=${result.observation_count}${result.error ? ` error="${result.error}"` : ""}`,
    );
  }
  console.log(`  Sources: ${successCount}/${sourceResults.length} succeeded, ${failureCount} failed`);
  console.log(`  Observations (in window): ${observationCount}`);
  console.log(`  Portugal map markers: ${portugalMarkers.length}`);

  if (isCatastrophicPublicationRun({ sourceSuccessCount: successCount, portugalMarkerCount: portugalMarkers.length })) {
    console.error(
      `\nCATASTROPHIC RUN: ${successCount}/${sourceResults.length} sources succeeded, ${portugalMarkers.length} Portugal map markers produced. ` +
        `Refusing to replace the last known good publication artifact at ${resolvePublicationArtifactPath()}.`,
    );
    process.exitCode = 1;
    return;
  }

  const artifact = buildPublicationArtifact({
    generatedAt,
    from: args.from,
    to: args.to,
    portugalMarkers,
    sourceResults,
    observationCount,
  });

  const result = await writePublicationArtifactAtomic(artifact);
  if (!result.ok) {
    console.error(`\nPublication artifact failed schema validation — NOT written. Errors:`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nWrote ${result.path}`);
  console.log(`  generated_at: ${artifact.generated_at}`);
  console.log(`  window: ${artifact.window.from ?? "(none)"} .. ${artifact.window.to ?? "(none)"}`);
  console.log(`  display listings: ${artifact.counts.display_listing_count}`);
  console.log(`  map markers: ${artifact.counts.map_marker_count}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
