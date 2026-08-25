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
//   buildPortugalMarkers()          ingestion/map/publication.mjs
//   buildPublicationArtifact()      ingestion/map/publication.mjs
//   isCatastrophicPublicationRun()  ingestion/map/publication.mjs
//   writePublicationArtifactAtomic() ingestion/map/publish-artifact-io.mjs
//     — validates BEFORE ever touching disk; a failing/catastrophic run
//       leaves the previously committed data/public/lisbon-porto-map.json
//       completely untouched, exactly as `npm run publish:map-data`
//       already guarantees.
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
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";
import { buildPortugalMarkers, buildPublicationArtifact, isCatastrophicPublicationRun } from "../map/publication.mjs";
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

    const sourceResults = [...lisbonResults, ...portoResults];
    const observationCount = lisbonObservations.length + portoObservations.length;
    const successCount = sourceResults.filter((result) => result.success).length;

    console.log(`[unattended] acquisition complete: ${successCount}/${sourceResults.length} sources succeeded, ${observationCount} observations`);
    for (const result of sourceResults) {
      if (!result.success) {
        console.log(`[unattended]   FAILED ${result.source_id} after ${result.attempts} attempt(s): ${result.error}`);
      } else if (result.attempts > 1) {
        console.log(`[unattended]   ${result.source_id} succeeded after ${result.attempts} attempt(s) (retried)`);
      }
    }

    const lisbonVenues = JSON.parse(await readFile(resolve(root, "venues/lisbon.json"), "utf8"));
    const portoVenues = JSON.parse(await readFile(resolve(root, "venues/porto.json"), "utf8"));
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
    });
    const displayListingCount = portugalMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0);

    const catastrophic = isCatastrophicPublicationRun({ sourceSuccessCount: successCount, portugalMarkerCount: portugalMarkers.length });

    let publicationStatus;
    if (catastrophic) {
      publicationStatus = { succeeded: false, reason: "CATASTROPHIC_RUN" };
      console.error(
        `[unattended] CATASTROPHIC RUN (${successCount} successful source(s), ${portugalMarkers.length} Portugal map marker(s)) — preserving the previous public artifact untouched`,
      );
    } else {
      const generatedAt = new Date().toISOString();
      const artifact = buildPublicationArtifact({
        generatedAt,
        from: args.from ?? null,
        to: args.to ?? null,
        portugalMarkers,
        sourceResults,
        observationCount,
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
      counts: { displayListingCount, mapMarkerCount: portugalMarkers.length },
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
