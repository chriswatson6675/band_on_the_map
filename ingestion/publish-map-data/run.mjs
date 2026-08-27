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
// via loadManualCoordinateStore()) and never touches any of the source
// collectors themselves (Lisbon/Porto's 13, or — as of
// BARCELONA-30-VENUE-POPULATION-01 — Barcelona's own 15, acquired via
// acquireBarcelona() from ingestion/barcelona/run.mjs exactly as proven
// by `npm run ingest:barcelona`, published as a new `countries.Spain`
// bucket alongside the existing Portugal/Croatia ones — see
// ingestion/map/publication.mjs's buildSpainMarkers()).

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLisbonPorto } from "../lisbon-porto/run.mjs";
import { acquireBarcelona } from "../barcelona/run.mjs";
import { acquireBerlin } from "../berlin/run.mjs";
import { acquireParis } from "../paris/run.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";
import { loadArtistRegistry, loadArtistLinks } from "../artist/registry-store.mjs";
import { buildPortugalMarkers, buildSpainMarkers, buildGermanyMarkers, buildFranceMarkers, buildPublicationArtifact, isCatastrophicPublicationRun } from "../map/publication.mjs";
import { writePublicationArtifactAtomic, resolvePublicationArtifactPath } from "../map/publish-artifact-io.mjs";
import { loadValidatedArtifact } from "../publication-server/run.mjs";
import {
  DEFAULT_RETENTION_GRACE_MS,
  annotateSourceProvenance,
  extractRetainableMarkersForSource,
  combineRetainedVenueMaps,
  mergeRetainedMarkers,
} from "../map/source-retention.mjs";

// BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
// this manual/operator entry point now routes through the SAME canonical
// source-retention module ingestion/unattended-runner/run.mjs already
// uses — the exact same pure functions, never a second, independently
// -drifting retention decision path. Only the orchestration (which
// acquisition functions to call, which venue registries to read) is
// necessarily duplicated between the two entry points, matching this
// file's pre-existing convention of each entry point wiring the same
// shared building blocks (buildPortugalMarkers/buildSpainMarkers/
// buildGermanyMarkers/buildPublicationArtifact) independently. No new
// retry policy is added here — this script remains a single-attempt,
// on-demand run, exactly as before; only last-known-good retention (for a
// source that fails outright) is now available to it, closing the gap
// that let a single transient failure here silently drop real venues
// (see BEATMAPPED-BERLIN-PRE-INTEGRATION-REUSE-AND-PUBLICATION-AUDIT-01's
// own finding for the Barcelona incident this was written to fix).

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

  // BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
  // read (never write) the previously published artifact BEFORE this run
  // acquires/builds anything new — see ingestion/unattended-runner/run.mjs's
  // identical read for why this ordering matters and why this is the ONLY
  // source of last-known-good data this run may carry forward. Re-validated
  // with the SAME canonical validator; a missing/unreadable/invalid
  // previous artifact simply makes retention unavailable this run, never a
  // fatal error.
  const previousArtifactResult = await loadValidatedArtifact({ artifactPath: resolvePublicationArtifactPath() });
  const previousArtifact = previousArtifactResult.ok ? previousArtifactResult.artifact : null;
  if (!previousArtifactResult.ok) {
    console.log(`  no usable previous publication artifact for source-failure retention this run (${previousArtifactResult.error}) — proceeding with fresh data only`);
  }

  const lisbonVenues = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));
  const portoVenues = JSON.parse(await readFile(resolve(ROOT, "venues/porto.json"), "utf8"));
  // BARCELONA-30-VENUE-POPULATION-01: read-only, same convention as the
  // Lisbon/Porto registries above.
  const barcelonaVenues = JSON.parse(await readFile(resolve(ROOT, "venues/barcelona.json"), "utf8"));
  // BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01: read-only,
  // same convention as the Lisbon/Porto/Barcelona registries above.
  const berlinVenues = JSON.parse(await readFile(resolve(ROOT, "venues/berlin.json"), "utf8"));
  // BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01: read-only, same convention
  // as the Lisbon/Porto/Barcelona/Berlin registries above.
  const parisVenues = JSON.parse(await readFile(resolve(ROOT, "venues/paris.json"), "utf8"));

  // BEATMAPPED-ENRICHMENT-PILOT-01: read-only, same convention as the
  // venue registries above — this script never writes artists/*.json.
  const artistRegistry = await loadArtistRegistry();
  const artistLinks = await loadArtistLinks();

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

  // BARCELONA-30-VENUE-POPULATION-01: Barcelona's own acquisition,
  // reusing acquireBarcelona() (ingestion/barcelona/run.mjs) exactly as
  // proven by `npm run ingest:barcelona` — never a second, independently
  // -drifting acquisition path. Barcelona's own collectors do not yet
  // support the --from/--to date-bounding Lisbon/Porto have; every
  // acquired Observation is passed through unbounded.
  const { barcelonaRegistry, barcelonaResults, barcelonaObservations } = await acquireBarcelona();

  // BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01: Berlin's own
  // acquisition, reusing acquireBerlin() (ingestion/berlin/run.mjs)
  // exactly as proven by `npm run ingest:berlin` — never a second,
  // independently-drifting acquisition path.
  const { berlinRegistry, berlinResults, berlinObservations } = await acquireBerlin();

  // BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01: Paris's own acquisition,
  // reusing acquireParis() (ingestion/paris/run.mjs) exactly as proven by
  // `npm run ingest:paris` — never a second, independently-drifting
  // acquisition path.
  const { parisRegistry, parisResults, parisObservations } = await acquireParis();

  const rawSourceResults = [...lisbonResults, ...portoResults, ...barcelonaResults, ...berlinResults, ...parisResults];
  const observationCount = lisbonObservations.length + portoObservations.length + barcelonaObservations.length + berlinObservations.length + parisObservations.length;
  const successCount = rawSourceResults.filter((result) => result.success).length;
  const failureCount = rawSourceResults.length - successCount;

  // BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
  // annotate every source result with durable last_success_at/
  // retained_eligible provenance — see ingestion/map/source-retention.mjs's
  // own doc comment. This is the ONE place `sourceResults` gains this
  // annotation; everything downstream (published source_report, the
  // retention merge below) uses this SAME annotated array, never the raw
  // one. This script performs no retry of its own (unlike `npm run
  // unattended`) — a source either succeeds or fails on its single
  // attempt, exactly as before; only what happens to a FAILED source's
  // previously-published data changes here.
  const sourceResults = annotateSourceProvenance({
    sourceResults: rawSourceResults,
    previousSourceReportSources: previousArtifact?.source_report?.sources ?? [],
    // BEATMAPPED-RETENTION-COLD-START-BOOTSTRAP-AND-BERLIN-INTEGRATION-01:
    // the SAME already-validated previousArtifact (loaded above via
    // loadValidatedArtifact()) — only consulted as a cold-start fallback
    // when a source has no explicit last_success_at yet.
    previousArtifact,
    generatedAt,
    graceMs: DEFAULT_RETENTION_GRACE_MS,
  });

  const portugalMarkers = buildPortugalMarkers({
    lisbonObservations,
    portoObservations,
    lisbonVenues: lisbonVenues.venues,
    portoVenues: portoVenues.venues,
    lisbonSourceRegistry: lisbonRegistry.entries,
    portoSourceRegistry: portoRegistry.entries,
    lisbonAssociations,
    manualCoordinatesByVenueId,
    artistRegistry: artistRegistry.artists,
    artistLinks: artistLinks.links,
  });

  const spainMarkers = buildSpainMarkers({
    barcelonaObservations,
    barcelonaVenues: barcelonaVenues.venues,
    barcelonaSourceRegistry: barcelonaRegistry.entries,
    manualCoordinatesByVenueId,
    artistRegistry: artistRegistry.artists,
    artistLinks: artistLinks.links,
  });

  const germanyMarkers = buildGermanyMarkers({
    berlinObservations,
    berlinVenues: berlinVenues.venues,
    berlinSourceRegistry: berlinRegistry.entries,
    manualCoordinatesByVenueId,
    artistRegistry: artistRegistry.artists,
    artistLinks: artistLinks.links,
  });

  const franceMarkers = buildFranceMarkers({
    parisObservations,
    parisVenues: parisVenues.venues,
    parisSourceRegistry: parisRegistry.entries,
    manualCoordinatesByVenueId,
    artistRegistry: artistRegistry.artists,
    artistLinks: artistLinks.links,
  });

  // BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
  // fill in eligible last-known-good venues for every source that FAILED
  // this run but is still within its 24-hour grace — see
  // ingestion/unattended-runner/run.mjs's identical wiring for the full
  // rationale; this reuses the exact same source-retention.mjs functions,
  // never a second implementation.
  const retainedEligibleSourceIds = sourceResults.filter((result) => result.retained_eligible).map((result) => result.source_id);
  const todayDateString = generatedAt.slice(0, 10);
  const lastSuccessAtBySourceId = new Map(sourceResults.map((result) => [result.source_id, result.last_success_at ?? null]));
  const combinedRetainedVenues = previousArtifact
    ? combineRetainedVenueMaps(
        retainedEligibleSourceIds.map((sourceId) =>
          extractRetainableMarkersForSource({ previousArtifact, sourceId, todayDateString, retainedSince: lastSuccessAtBySourceId.get(sourceId) ?? null }),
        ),
      )
    : new Map();

  if (combinedRetainedVenues.size > 0) {
    console.log(
      `  retaining ${combinedRetainedVenues.size} venue(s) worth of last-known-good data across ${retainedEligibleSourceIds.length} failed-but-in-grace source(s): ${retainedEligibleSourceIds.join(", ")}`,
    );
  }

  const retainedPortugalVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "Portugal"));
  const retainedSpainVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "Spain"));
  const retainedGermanyVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "Germany"));
  const retainedFranceVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "France"));
  const mergedPortugalMarkers = mergeRetainedMarkers(portugalMarkers, retainedPortugalVenues);
  const mergedSpainMarkers = mergeRetainedMarkers(spainMarkers, retainedSpainVenues);
  const mergedGermanyMarkers = mergeRetainedMarkers(germanyMarkers, retainedGermanyVenues);
  const mergedFranceMarkers = mergeRetainedMarkers(franceMarkers, retainedFranceVenues);

  console.log(`\n=== Acquisition summary ===`);
  for (const result of sourceResults) {
    const status = result.success ? "OK" : result.retained_eligible ? "FAILED (retained)" : "FAILED";
    console.log(
      `  [${status}] ${result.source_id}: raw=${result.raw_record_count} observations=${result.observation_count}${result.error ? ` error="${result.error}"` : ""}`,
    );
  }
  console.log(`  Sources: ${successCount}/${sourceResults.length} succeeded, ${failureCount} failed`);
  console.log(`  Observations (in window): ${observationCount}`);
  console.log(`  Portugal map markers: ${mergedPortugalMarkers.length}`);
  console.log(`  Spain map markers: ${mergedSpainMarkers.length}`);
  console.log(`  Germany map markers: ${mergedGermanyMarkers.length}`);
  console.log(`  Paris map markers: ${mergedFranceMarkers.length}`);

  if (
    isCatastrophicPublicationRun({
      sourceSuccessCount: successCount,
      portugalMarkerCount: mergedPortugalMarkers.length,
      spainMarkerCount: mergedSpainMarkers.length,
      germanyMarkerCount: mergedGermanyMarkers.length,
      franceMarkerCount: mergedFranceMarkers.length,
    })
  ) {
    console.error(
      `\nCATASTROPHIC RUN: ${successCount}/${sourceResults.length} sources succeeded, ${mergedPortugalMarkers.length} Portugal + ${mergedSpainMarkers.length} Spain + ${mergedGermanyMarkers.length} Germany + ${mergedFranceMarkers.length} France map markers produced. ` +
        `Refusing to replace the last known good publication artifact at ${resolvePublicationArtifactPath()}.`,
    );
    process.exitCode = 1;
    return;
  }

  const artifact = buildPublicationArtifact({
    generatedAt,
    from: args.from,
    to: args.to,
    portugalMarkers: mergedPortugalMarkers,
    spainMarkers: mergedSpainMarkers,
    germanyMarkers: mergedGermanyMarkers,
    franceMarkers: mergedFranceMarkers,
    sourceResults,
    observationCount,
    artistRegistry: artistRegistry.artists,
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
