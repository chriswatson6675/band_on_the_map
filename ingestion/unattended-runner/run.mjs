#!/usr/bin/env node
// BOTM-UNATTENDED-COLLECTION-RUNNER-01 — the ONE canonical unattended
// command: `npm run unattended` (optionally `-- --from=YYYY-MM-DD
// --to=YYYY-MM-DD`).
//
// This is orchestration ONLY. Every real step is the SAME already-proven
// production component every other entry point in this repository already
// uses — nothing here re-implements acquisition, Observation creation,
// venue resolution, display projection, or publication:
//
//   acquireLisbonPorto()            ingestion/lisbon-porto/run.mjs — the
//                                    exact same 14-source acquisition
//                                    `npm run ingest:lisbon-porto` and
//                                    `npm run publish:map-data` already
//                                    use, now with an opt-in bounded retry
//                                    policy (see that module's own
//                                    acquireAll() changes for this
//                                    package — every other caller that
//                                    omits retryPolicy is byte-for-byte
//                                    unchanged)
//   acquireBarcelona()               ingestion/barcelona/run.mjs — the
//                                    exact same 23-source acquisition
//                                    `npm run ingest:barcelona` and
//                                    `npm run publish:map-data` already
//                                    use (BEATMAPPED-UNATTENDED-MULTI-
//                                    COUNTRY-PUBLICATION-01). It does not
//                                    yet accept a retryPolicy — a known,
//                                    pre-existing, documented limitation
//                                    of ingestion/barcelona/run.mjs itself
//                                    (see that module's own comment) — not
//                                    something this narrow package adds.
//   buildPortugalMarkers()          ingestion/map/publication.mjs
//   buildSpainMarkers()              ingestion/map/publication.mjs
//   buildPublicationArtifact()      ingestion/map/publication.mjs
//   isCatastrophicPublicationRun()  ingestion/map/publication.mjs
//   writePublicationArtifactAtomic() ingestion/map/publish-artifact-io.mjs
//     — validates BEFORE ever touching disk; a failing/catastrophic run
//       leaves the previously committed data/public/lisbon-porto-map.json
//       completely untouched, exactly as `npm run publish:map-data`
//       already guarantees.
//
// COUNTRY-LEVEL FAILURE ISOLATION (BEATMAPPED-UNATTENDED-MULTI-COUNTRY-
// PUBLICATION-01): Portugal and Barcelona are acquired independently, each
// wrapped in its own try/catch — a total, unexpected failure of ONE
// country's acquisition call (as opposed to the per-source isolation
// acquireAll() already provides inside each country) must never abort the
// other country's already-successful data, and must never crash the run.
// A country that fails this way publishes with zero markers THIS RUN ONLY
// (never fabricated) and the failure is recorded as one synthetic FAILED
// source entry in the health report, so it is visible, not silent.
//
// What THIS package actually adds, all new and all in
// ingestion/unattended-runner/:
//   lock.mjs           overlapping-run protection (a local PID lockfile)
//   retry.mjs           the bounded retry policy acquireAll() now accepts
//   health-report.mjs   the machine-readable HEALTHY/DEGRADED/FAILED report
//   run.mjs (this file) wires the above around the existing pipeline
//
// EXIT SEMANTICS (documented once, here — see docs/UNATTENDED_RUNNER.md
// for the full rationale): a run that could not safely publish at all is
// FAILED and exits non-zero (1) — a real service-health problem a
// systemd unit should surface as failed. A run refused because another
// instance is already in progress exits 2 — distinct from a run that
// actually executed and failed, so log/monitoring tooling never conflates
// "didn't run" with "ran and failed". HEALTHY and DEGRADED both exit 0:
// one isolated venue failing must never make systemd treat the whole
// scheduled service unit as crashed merely because a single small venue
// site was unreachable — that distinction lives in the health report
// file (`overall_status`), which a separate, future monitoring step reads,
// not in the process exit code.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLisbonPorto } from "../lisbon-porto/run.mjs";
import { acquireBarcelona } from "../barcelona/run.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";
import { loadArtistRegistry, loadArtistLinks } from "../artist/registry-store.mjs";
import { buildPortugalMarkers, buildSpainMarkers, buildPublicationArtifact, isCatastrophicPublicationRun } from "../map/publication.mjs";
import { writePublicationArtifactAtomic } from "../map/publish-artifact-io.mjs";
import { acquireRunLock, releaseRunLock } from "./lock.mjs";
import { buildHealthReport, writeHealthReport } from "./health-report.mjs";
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_RETRY_DELAY_MS } from "./retry.mjs";

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

// BEATMAPPED-UNATTENDED-MULTI-COUNTRY-PUBLICATION-01 — one synthetic
// FAILED source entry recording a total, unexpected acquisition-function
// failure (see runUnattendedCycle's own try/catch around each country's
// acquisition call below) — never a real registry source_id, deliberately
// distinct so it reads unambiguously as "the whole country's acquisition
// call itself threw", not "one venue's source failed" (that per-source
// case is already caught and reported inside acquireAll(), one level
// below this).
function acquisitionFailureSource(sourceId, error) {
  return { source_id: sourceId, success: false, error: error?.message ?? String(error), raw_record_count: 0, observation_count: 0 };
}

/**
 * Run exactly one unattended collection + publication cycle. Returns
 * `{ runId, refused: true, reason }` if another run already holds the
 * lock (the public artifact is never touched in that case), or
 * `{ runId, report }` once a full cycle (successful or not) has completed
 * and its health report has been written. Never throws for an ordinary
 * source/publication failure — those are captured in the returned report;
 * a genuine bug/unexpected exception still propagates (after the lock is
 * released in `finally`), matching this repository's existing convention
 * for truly unexpected I/O failures elsewhere.
 *
 * Every dependency the caller might want to substitute for a deterministic
 * offline test is accepted as an option here, defaulting to the real
 * implementation — this function is never duplicated for tests, only
 * exercised with different inputs (see tests/unattended-runner.test.mjs).
 */
export async function runUnattendedCycle(args = {}) {
  const root = args.root ?? ROOT;
  const runId = args.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const acquire = args.acquireLisbonPorto ?? acquireLisbonPorto;
  const acquireSpain = args.acquireBarcelona ?? acquireBarcelona;

  console.log(`[unattended] run ${runId} starting at ${startedAt}`);

  const lock = await acquireRunLock({ root, staleAfterMs: args.staleAfterMs });
  if (!lock.ok) {
    console.error(`[unattended] refusing to start: ${lock.reason} (a run is already in progress, or was refused for safety)`);
    return { runId, refused: true, reason: lock.reason };
  }

  try {
    const retryPolicy = {
      maxAttempts: args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      retryDelayMs: args.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      ...(args.delayFn ? { delayFn: args.delayFn } : {}),
      ...(args.isTransient ? { isTransient: args.isTransient } : {}),
    };

    const {
      lisbonRegistry,
      portoRegistry,
      lisbonResults,
      portoResults,
      lisbonObservations,
      portoObservations,
      lisbonAssociations,
    } = await acquire({ from: args.from, to: args.to, retryPolicy });

    // BEATMAPPED-UNATTENDED-MULTI-COUNTRY-PUBLICATION-01: Barcelona/Spain
    // joins Portugal in the same recurring cycle, reusing acquireBarcelona()
    // exactly as `npm run publish:map-data` already does — never a second,
    // independently-drifting acquisition path. Wrapped in its own
    // try/catch (see acquisitionFailureSource's own doc comment above):
    // acquireBarcelona() does not accept a retryPolicy yet (a pre-existing
    // limitation of ingestion/barcelona/run.mjs itself, not something this
    // package changes), and if the call throws entirely, Barcelona simply
    // publishes zero markers this run — Portugal's own already-acquired
    // data is never lost because of it.
    let barcelonaRegistry = { entries: [] };
    let barcelonaResults;
    let barcelonaObservations;
    try {
      ({ barcelonaRegistry, barcelonaResults, barcelonaObservations } = await acquireSpain());
    } catch (error) {
      barcelonaResults = [acquisitionFailureSource("barcelona-acquisition", error)];
      barcelonaObservations = [];
      console.error(`[unattended] Barcelona acquisition failed entirely: ${error?.message ?? error} — publishing with zero Spain markers this run, Portugal unaffected`);
    }

    const sourceResults = [...lisbonResults, ...portoResults, ...barcelonaResults];
    const observationCount = lisbonObservations.length + portoObservations.length + barcelonaObservations.length;
    const successCount = sourceResults.filter((result) => result.success).length;

    console.log(`[unattended] acquisition complete: ${successCount}/${sourceResults.length} sources succeeded, ${observationCount} observations`);
    for (const result of sourceResults) {
      if (!result.success) {
        console.log(`[unattended]   FAILED ${result.source_id} after ${result.attempts ?? 1} attempt(s): ${result.error}`);
      } else if (result.attempts > 1) {
        console.log(`[unattended]   ${result.source_id} succeeded after ${result.attempts} attempt(s) (retried)`);
      }
    }

    const lisbonVenues = JSON.parse(await readFile(resolve(root, "venues/lisbon.json"), "utf8"));
    const portoVenues = JSON.parse(await readFile(resolve(root, "venues/porto.json"), "utf8"));
    const barcelonaVenues = JSON.parse(await readFile(resolve(root, "venues/barcelona.json"), "utf8"));
    // BEATMAPPED-ENRICHMENT-PILOT-01: read-only, same convention as the
    // venue registries above — falls back to an empty registry/link set
    // for an isolated test root that never seeded artists/*.json, exactly
    // like loadManualCoordinateStore() already does for a missing
    // venues/manual-coordinates.json.
    const artistRegistry = await loadArtistRegistry({ root });
    const artistLinks = await loadArtistLinks({ root });
    // Shared across every country — the SAME store already carries KU
    // Barcelona's own operator coordinate alongside Lisbon/Porto's
    // entries (venues/manual-coordinates.json), matching
    // ingestion/barcelona/run.mjs's own main() convention exactly.
    const manualStore = await loadManualCoordinateStore({ root });
    const manualCoordinatesByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));

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
    const displayListingCount =
      portugalMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0) +
      spainMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0);
    const mapMarkerCount = portugalMarkers.length + spainMarkers.length;

    const catastrophic = isCatastrophicPublicationRun({
      sourceSuccessCount: successCount,
      portugalMarkerCount: portugalMarkers.length,
      spainMarkerCount: spainMarkers.length,
    });

    let publicationStatus;
    if (catastrophic) {
      publicationStatus = { succeeded: false, reason: "CATASTROPHIC_RUN" };
      console.error(
        `[unattended] CATASTROPHIC RUN (${successCount} successful source(s), ${portugalMarkers.length} Portugal + ${spainMarkers.length} Spain map marker(s)) — preserving the previous public artifact untouched`,
      );
    } else {
      const generatedAt = new Date().toISOString();
      const artifact = buildPublicationArtifact({
        generatedAt,
        from: args.from ?? null,
        to: args.to ?? null,
        portugalMarkers,
        spainMarkers,
        sourceResults,
        observationCount,
        artistRegistry: artistRegistry.artists,
      });
      const writeResult = await writePublicationArtifactAtomic(artifact, { root });
      if (writeResult.ok) {
        publicationStatus = { succeeded: true, path: writeResult.path };
        console.log(`[unattended] publication succeeded: ${writeResult.path}`);
      } else {
        publicationStatus = { succeeded: false, reason: "VALIDATION_FAILED", errors: writeResult.errors };
        console.error(
          `[unattended] publication REFUSED (artifact failed its own schema validation) — preserving the previous public artifact untouched: ${writeResult.errors.join("; ")}`,
        );
      }
    }

    const completedAt = new Date().toISOString();
    const report = buildHealthReport({
      runId,
      startedAt,
      completedAt,
      sourceResults,
      publicationStatus,
      artifactPreserved: publicationStatus.succeeded !== true,
      counts: { displayListingCount, mapMarkerCount },
      window: { from: args.from ?? null, to: args.to ?? null },
    });

    const { runPath } = await writeHealthReport(report, { root });
    console.log(`[unattended] health report written: ${runPath}`);
    console.log(`[unattended] run ${runId} ${report.overall_status} (duration ${report.duration_ms}ms)`);

    return { runId, report };
  } finally {
    await releaseRunLock({ root });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outcome = await runUnattendedCycle(args);

  if (outcome.refused) {
    process.exitCode = 2; // distinct from a run that executed and failed — see this file's own doc comment
    return;
  }
  if (outcome.report.overall_status === "FAILED") {
    process.exitCode = 1;
  }
  // HEALTHY and DEGRADED: exit 0 — see this file's own "EXIT SEMANTICS" doc comment.
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[unattended] FATAL: ${error?.stack ?? error?.message ?? error}`);
    process.exitCode = 1;
  });
}

export { main };
