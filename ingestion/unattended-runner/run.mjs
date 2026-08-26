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
//                                    COUNTRY-PUBLICATION-01), now also with
//                                    the same opt-in bounded retry policy
//                                    Portugal already had (BEATMAPPED-
//                                    SOURCE-FAILURE-GRACE-AND-RETRY-01 —
//                                    see that module's own acquireAll()
//                                    changes; every other caller that omits
//                                    retryPolicy is byte-for-byte unchanged).
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
// SOURCE-FAILURE GRACE AND RETRY (BEATMAPPED-SOURCE-FAILURE-GRACE-AND-
// RETRY-01): a single FAILED source (as opposed to a country-level
// acquisition-function throw, above) means this source's CURRENT state is
// unknown, not that its venues genuinely have no events — before this
// package those two cases were mechanically indistinguishable downstream,
// so a source failing for any reason immediately zeroed out every venue
// only it covered. Now:
//   - Barcelona acquisition finally gets the SAME bounded per-source retry
//     ingestion/lisbon-porto/run.mjs's acquireAll() already had (passed
//     through identically, see the retryPolicy wiring below) — absorbing
//     genuine one-off transient blips before a source is even classified
//     FAILED.
//   - A source that still ends up FAILED after retries may have its most
//     recently PUBLISHED data (from the previous, already-validated
//     publication artifact — never a second datastore) carried forward
//     for up to 24 hours from that source's own last real success (see
//     ingestion/map/source-retention.mjs — the entire mechanism lives
//     there, pure and independently tested; this file only wires it in).
//   - A source that succeeds with zero current/future observations is
//     authoritative and is NEVER retained — only a genuine acquisition
//     failure triggers this.
//   - Retained data is always clearly marked in source_report/health
//     (`retained: true`, `last_success_at`) — never silently
//     indistinguishable from freshly-acquired data — and a run carrying
//     any retained data is truthfully DEGRADED (a retained source's own
//     sourceResults entry still has `success: false`, which
//     determineOverallStatus() already treats as DEGRADED with no change
//     needed there).
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
import { acquireBerlin } from "../berlin/run.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";
import { loadArtistRegistry, loadArtistLinks } from "../artist/registry-store.mjs";
import { buildPortugalMarkers, buildSpainMarkers, buildGermanyMarkers, buildPublicationArtifact, isCatastrophicPublicationRun } from "../map/publication.mjs";
import { writePublicationArtifactAtomic, resolvePublicationArtifactPath } from "../map/publish-artifact-io.mjs";
import { loadValidatedArtifact } from "../publication-server/run.mjs";
import {
  DEFAULT_RETENTION_GRACE_MS,
  annotateSourceProvenance,
  extractRetainableMarkersForSource,
  combineRetainedVenueMaps,
  mergeRetainedMarkers,
} from "../map/source-retention.mjs";
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
  // BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: computed once, here, and
  // reused for everything this run does — the published artifact's own
  // `generated_at`, every source's `last_success_at` when this run
  // succeeded, and the retention-grace "now" — rather than a second,
  // slightly later timestamp computed just before writing (harmless
  // previously, since nothing depended on the two ever differing; now
  // load-bearing, since retention eligibility must be judged against the
  // SAME instant the artifact itself claims to be generated at).
  const generatedAt = startedAt;
  const acquire = args.acquireLisbonPorto ?? acquireLisbonPorto;
  const acquireSpain = args.acquireBarcelona ?? acquireBarcelona;
  const acquireGermany = args.acquireBerlin ?? acquireBerlin;
  const retentionGraceMs = args.retentionGraceMs ?? DEFAULT_RETENTION_GRACE_MS;

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

    // BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: read (never write) the
    // previously published artifact BEFORE this run acquires/builds
    // anything new — the ONLY source of last-known-good data this run may
    // carry forward (see ingestion/map/source-retention.mjs's own doc
    // comment: no second datastore). Re-validated with the SAME canonical
    // validator the atomic writer itself enforces
    // (ingestion/publication-server/run.mjs's loadValidatedArtifact(),
    // reused unchanged) — a missing, unreadable, malformed, or
    // schema-invalid previous artifact is never trusted; retention is
    // simply unavailable this run (`previousArtifact` stays null), never a
    // fatal error. This read happens strictly before
    // writePublicationArtifactAtomic()'s own eventual atomic rename below,
    // so it can never observe a partially-written file, and never risks
    // this run corrupting the very data it might still need to read.
    const previousArtifactResult = await loadValidatedArtifact({ artifactPath: resolvePublicationArtifactPath({ root }) });
    const previousArtifact = previousArtifactResult.ok ? previousArtifactResult.artifact : null;
    if (!previousArtifactResult.ok) {
      console.log(`[unattended] no usable previous publication artifact for source-failure retention this run (${previousArtifactResult.error}) — proceeding with fresh data only`);
    }

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
    // try/catch (see acquisitionFailureSource's own doc comment above): if
    // the call throws entirely (as opposed to one of its own per-source
    // failures, already isolated one level down), Barcelona simply
    // publishes zero FRESH markers this run — Portugal's own already-
    // acquired data is never lost because of it (source-failure retention,
    // below, can still fill in eligible Barcelona venues from the previous
    // artifact even in this total-throw case, exactly as it would for any
    // ordinary per-source failure).
    //
    // `retryPolicy` (BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01): the
    // SAME bounded retry policy Portugal already receives above, now also
    // given to Barcelona's own acquireAll() — closing a previously
    // documented, pre-existing gap where Barcelona had no retry at all.
    let barcelonaRegistry = { entries: [] };
    let barcelonaResults;
    let barcelonaObservations;
    try {
      ({ barcelonaRegistry, barcelonaResults, barcelonaObservations } = await acquireSpain({ retryPolicy }));
    } catch (error) {
      barcelonaResults = [acquisitionFailureSource("barcelona-acquisition", error)];
      barcelonaObservations = [];
      console.error(`[unattended] Barcelona acquisition failed entirely: ${error?.message ?? error} — publishing with zero Spain markers this run, Portugal unaffected`);
    }

    // BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
    // Berlin/Germany joins Portugal and Barcelona in the same recurring
    // cycle, reusing acquireBerlin() exactly as `npm run publish:map-data`
    // already does — same total-throw isolation and same bounded retry
    // policy as Barcelona above (closing the same previously-documented
    // gap Barcelona had before BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01).
    let berlinRegistry = { entries: [] };
    let berlinResults;
    let berlinObservations;
    try {
      ({ berlinRegistry, berlinResults, berlinObservations } = await acquireGermany({ retryPolicy }));
    } catch (error) {
      berlinResults = [acquisitionFailureSource("berlin-acquisition", error)];
      berlinObservations = [];
      console.error(`[unattended] Berlin acquisition failed entirely: ${error?.message ?? error} — publishing with zero Germany markers this run, Portugal/Spain unaffected`);
    }

    const rawSourceResults = [...lisbonResults, ...portoResults, ...barcelonaResults, ...berlinResults];
    const observationCount = lisbonObservations.length + portoObservations.length + barcelonaObservations.length + berlinObservations.length;
    const successCount = rawSourceResults.filter((result) => result.success).length;

    // BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: annotate every source
    // result with durable last_success_at/retained_eligible provenance —
    // see ingestion/map/source-retention.mjs's own doc comment. This is
    // the ONE place `sourceResults` gains this annotation; everything
    // downstream (health report, published source_report, the retention
    // merge below) uses this SAME annotated array, never the raw one.
    const sourceResults = annotateSourceProvenance({
      sourceResults: rawSourceResults,
      previousSourceReportSources: previousArtifact?.source_report?.sources ?? [],
      generatedAt,
      graceMs: retentionGraceMs,
    });

    console.log(`[unattended] acquisition complete: ${successCount}/${sourceResults.length} sources succeeded, ${observationCount} observations`);
    for (const result of sourceResults) {
      if (!result.success) {
        const graceNote = result.retained_eligible ? " — RETAINING last-known-good data (within 24h grace)" : result.last_success_at ? " — grace expired, no retention" : " — never observed to succeed, no retention";
        console.log(`[unattended]   FAILED ${result.source_id} after ${result.attempts ?? 1} attempt(s): ${result.error}${graceNote}`);
      } else if (result.attempts > 1) {
        console.log(`[unattended]   ${result.source_id} succeeded after ${result.attempts} attempt(s) (retried)`);
      }
    }

    const lisbonVenues = JSON.parse(await readFile(resolve(root, "venues/lisbon.json"), "utf8"));
    const portoVenues = JSON.parse(await readFile(resolve(root, "venues/porto.json"), "utf8"));
    const barcelonaVenues = JSON.parse(await readFile(resolve(root, "venues/barcelona.json"), "utf8"));
    const berlinVenues = JSON.parse(await readFile(resolve(root, "venues/berlin.json"), "utf8"));
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
    const germanyMarkers = buildGermanyMarkers({
      berlinObservations,
      berlinVenues: berlinVenues.venues,
      berlinSourceRegistry: berlinRegistry.entries,
      manualCoordinatesByVenueId,
      artistRegistry: artistRegistry.artists,
      artistLinks: artistLinks.links,
    });

    // BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: fill in eligible
    // last-known-good venues for every source that FAILED this run but is
    // still within its 24-hour grace (retained_eligible, computed above) —
    // reusing the previous artifact read at the very top of this function,
    // never a second acquisition or a second datastore. A run with no
    // usable previous artifact, or with no retained-eligible sources at
    // all, leaves portugalMarkers/spainMarkers completely untouched here
    // (mergeRetainedMarkers is a no-op for an empty/absent retained-venues
    // map — see that function's own doc comment).
    const retainedEligibleSourceIds = sourceResults.filter((result) => result.retained_eligible).map((result) => result.source_id);
    const todayDateString = generatedAt.slice(0, 10);
    // BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
    // each eligible source's own already-computed last_success_at is
    // passed through as that source's `retained_since` — see
    // extractRetainableMarkersForSource()'s own doc comment for why this
    // reuses the existing durable value rather than deriving a second one.
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
        `[unattended] retaining ${combinedRetainedVenues.size} venue(s) worth of last-known-good data across ${retainedEligibleSourceIds.length} failed-but-in-grace source(s): ${retainedEligibleSourceIds.join(", ")}`,
      );
    }

    const retainedPortugalVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "Portugal"));
    const retainedSpainVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "Spain"));
    const retainedGermanyVenues = new Map([...combinedRetainedVenues].filter(([, venue]) => venue.country === "Germany"));
    const mergedPortugalMarkers = mergeRetainedMarkers(portugalMarkers, retainedPortugalVenues);
    const mergedSpainMarkers = mergeRetainedMarkers(spainMarkers, retainedSpainVenues);
    const mergedGermanyMarkers = mergeRetainedMarkers(germanyMarkers, retainedGermanyVenues);

    // BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: every count/validation/
    // publication step from here on uses the MERGED (fresh + eligible
    // retained) marker lists — `portugalMarkers`/`spainMarkers`/
    // `germanyMarkers` themselves are never referenced again below this
    // point, only their merged counterparts.
    const displayListingCount =
      mergedPortugalMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0) +
      mergedSpainMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0) +
      mergedGermanyMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0);
    const mapMarkerCount = mergedPortugalMarkers.length + mergedSpainMarkers.length + mergedGermanyMarkers.length;

    const catastrophic = isCatastrophicPublicationRun({
      sourceSuccessCount: successCount,
      portugalMarkerCount: mergedPortugalMarkers.length,
      spainMarkerCount: mergedSpainMarkers.length,
      germanyMarkerCount: mergedGermanyMarkers.length,
    });

    let publicationStatus;
    if (catastrophic) {
      publicationStatus = { succeeded: false, reason: "CATASTROPHIC_RUN" };
      console.error(
        `[unattended] CATASTROPHIC RUN (${successCount} successful source(s), ${mergedPortugalMarkers.length} Portugal + ${mergedSpainMarkers.length} Spain + ${mergedGermanyMarkers.length} Germany map marker(s)) — preserving the previous public artifact untouched`,
      );
    } else {
      const artifact = buildPublicationArtifact({
        generatedAt,
        from: args.from ?? null,
        to: args.to ?? null,
        portugalMarkers: mergedPortugalMarkers,
        spainMarkers: mergedSpainMarkers,
        germanyMarkers: mergedGermanyMarkers,
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
