// BOTM-UNATTENDED-COLLECTION-RUNNER-01 — machine-readable health/run
// report contract and persistence. Pure, dependency-free composition
// (`buildHealthReport`/`determineOverallStatus`) separated from the one
// function that touches the filesystem (`writeHealthReport`), matching
// this project's existing split (e.g. ingestion/map/publication.mjs vs
// ingestion/map/publish-artifact-io.mjs).
//
// THE CANONICAL OUTPUT LOCATION is runtime/health-reports/ (git-ignored —
// see .gitignore — these are ephemeral, per-run runtime artifacts, never
// committed source). One file per run (`<run_id>.json`), plus
// `latest.json` always overwritten with the most recent run's report, for
// a future monitoring check that only wants "what happened last time"
// without needing to know a run_id.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// This project's own governed vocabulary for this package (see
// docs/UNATTENDED_RUNNER.md):
//   HEALTHY  — every active source succeeded AND publication succeeded.
//   DEGRADED — at least one source failed, but publication still safely
//              completed using the valid data the successful sources
//              produced. Never conflated with HEALTHY.
//   FAILED   — publication could not safely complete (a catastrophic run
//              — ingestion/map/publication.mjs's isCatastrophicPublicationRun()
//              — or the built artifact failed its own schema validation),
//              regardless of how many individual sources succeeded.
export const RUN_STATUSES = Object.freeze(["HEALTHY", "DEGRADED", "FAILED"]);

export function resolveHealthReportDir({ root = ROOT } = {}) {
  return resolve(root, "runtime/health-reports");
}

/** Pure status decision — see RUN_STATUSES above for the exact meaning of each. */
export function determineOverallStatus({ sourceResults, publicationSucceeded }) {
  if (!publicationSucceeded) return "FAILED";
  const anyFailed = (sourceResults ?? []).some((result) => !result.success);
  return anyFailed ? "DEGRADED" : "HEALTHY";
}

/**
 * Build the full health-report object for one run. Pure — never touches
 * the clock or the filesystem itself; `startedAt`/`completedAt` are
 * supplied by the caller (matching ingestion/map/publication.mjs's
 * `buildPublicationArtifact` convention of accepting `generatedAt` rather
 * than calling `new Date()` internally, so this function stays
 * deterministic and directly unit-testable).
 *
 *   sourceResults      — the same per-source result array
 *                         ingestion/lisbon-porto/run.mjs's acquireAll()/
 *                         acquireLisbonPorto() already produces (now with
 *                         an `attempts` field — see that module's own
 *                         changes for this package)
 *   publicationStatus  — { succeeded, path?, reason?, errors? }
 *   artifactPreserved  — true when the previously committed public
 *                         artifact was left untouched this run (i.e.
 *                         publication did NOT succeed)
 *   counts             — { displayListingCount, mapMarkerCount } as
 *                         computed by this run (even when not published —
 *                         see run.mjs's own doc comment for why that is
 *                         still honestly reported, clearly labelled)
 *   window             — { from, to } exactly as passed to acquisition
 */
export function buildHealthReport({ runId, startedAt, completedAt, sourceResults, publicationStatus, artifactPreserved, counts, window }) {
  const overallStatus = determineOverallStatus({ sourceResults, publicationSucceeded: publicationStatus?.succeeded === true });
  const successfulSources = (sourceResults ?? []).filter((result) => result.success);
  const failedSources = (sourceResults ?? []).filter((result) => !result.success);
  const startedAtMs = Date.parse(startedAt);
  const completedAtMs = Date.parse(completedAt);

  return {
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Number.isNaN(startedAtMs) || Number.isNaN(completedAtMs) ? null : completedAtMs - startedAtMs,
    overall_status: overallStatus,
    publication_status: publicationStatus?.succeeded === true ? "PUBLISHED" : "PRESERVED_PREVIOUS",
    publication_reason: publicationStatus?.succeeded === true ? null : (publicationStatus?.reason ?? null),
    artifact_preserved: artifactPreserved === true,
    artifact_path: publicationStatus?.path ?? null,
    window: { from: window?.from ?? null, to: window?.to ?? null },
    active_source_count: (sourceResults ?? []).length,
    successful_source_count: successfulSources.length,
    failed_source_count: failedSources.length,
    // Only genuinely successful sources' own observation_count is counted
    // — a failed source's observation_count is always 0 in real pipeline
    // output (ingestion/lisbon-porto/run.mjs's acquireAll()), but this
    // sums over successfulSources explicitly anyway, so this figure can
    // never accidentally include a failed source's claimed count.
    total_observations_acquired: successfulSources.reduce((sum, result) => sum + (result.observation_count ?? 0), 0),
    display_listing_count: counts?.displayListingCount ?? 0,
    map_marker_count: counts?.mapMarkerCount ?? 0,
    sources: (sourceResults ?? []).map((result) => ({
      source_id: result.source_id,
      status: result.success ? "SUCCESS" : "FAILED",
      attempts: result.attempts ?? 1,
      records_acquired: result.observation_count ?? 0,
      ...(result.success ? {} : { error: result.error ?? null }),
      // BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: optional, additive
      // provenance — see ingestion/map/publication.mjs's own
      // source_report.sources[] doc comment for the exact same fields.
      // Only present when the caller supplied annotated results (see
      // ingestion/map/source-retention.mjs's annotateSourceProvenance());
      // every existing caller/test keeps today's exact shape unchanged.
      ...(result.last_success_at !== undefined ? { last_success_at: result.last_success_at } : {}),
      ...(result.retained_eligible === true ? { retained: true } : {}),
    })),
  };
}

/**
 * Persist one health report: `<run_id>.json` (permanent per-run record for
 * this process's lifetime — see .gitignore, these are never committed)
 * plus `latest.json` (always overwritten). Returns the two paths written.
 */
export async function writeHealthReport(report, { root = ROOT } = {}) {
  const dir = resolveHealthReportDir({ root });
  await mkdir(dir, { recursive: true });
  const runPath = resolve(dir, `${report.run_id}.json`);
  const latestPath = resolve(dir, "latest.json");
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(runPath, serialized, "utf8");
  await writeFile(latestPath, serialized, "utf8");
  return { runPath, latestPath };
}

export { ROOT as HEALTH_REPORT_ROOT };
