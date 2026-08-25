import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  RUN_STATUSES,
  buildHealthReport,
  determineOverallStatus,
  resolveHealthReportDir,
  writeHealthReport,
} from "../ingestion/unattended-runner/health-report.mjs";

function source(overrides = {}) {
  return { source_id: "test-source", success: true, observation_count: 5, attempts: 1, ...overrides };
}

// --- determineOverallStatus / vocabulary ---

test("RUN_STATUSES is exactly HEALTHY/DEGRADED/FAILED", () => {
  assert.deepEqual([...RUN_STATUSES].sort(), ["DEGRADED", "FAILED", "HEALTHY"]);
});

test("determineOverallStatus: HEALTHY when every source succeeded and publication succeeded", () => {
  const status = determineOverallStatus({ sourceResults: [source(), source()], publicationSucceeded: true });
  assert.equal(status, "HEALTHY");
});

test("determineOverallStatus: DEGRADED when at least one source failed but publication still succeeded", () => {
  const status = determineOverallStatus({
    sourceResults: [source(), source({ source_id: "b", success: false })],
    publicationSucceeded: true,
  });
  assert.equal(status, "DEGRADED");
});

test("determineOverallStatus: FAILED when publication did not succeed, regardless of source outcomes", () => {
  assert.equal(determineOverallStatus({ sourceResults: [source(), source()], publicationSucceeded: false }), "FAILED");
  assert.equal(determineOverallStatus({ sourceResults: [source({ success: false })], publicationSucceeded: false }), "FAILED");
});

test("determineOverallStatus: DEGRADED is never reported as HEALTHY — a single failed source is enough", () => {
  const status = determineOverallStatus({
    sourceResults: [source(), source(), source({ source_id: "c", success: false })],
    publicationSucceeded: true,
  });
  assert.notEqual(status, "HEALTHY");
  assert.equal(status, "DEGRADED");
});

// --- buildHealthReport shape ---

test("buildHealthReport: UTC ISO timestamps, correct duration, and every required field present", () => {
  const report = buildHealthReport({
    runId: "run-123",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedAt: "2026-08-25T10:00:05.500Z",
    sourceResults: [source({ source_id: "a" }), source({ source_id: "b", success: false, error: "boom", attempts: 3 })],
    publicationStatus: { succeeded: true, path: "/tmp/data/public/lisbon-porto-map.json" },
    artifactPreserved: false,
    counts: { displayListingCount: 42, mapMarkerCount: 7 },
    window: { from: "2026-08-24", to: "2026-12-31" },
  });

  assert.equal(report.run_id, "run-123");
  assert.equal(report.started_at, "2026-08-25T10:00:00.000Z");
  assert.equal(report.completed_at, "2026-08-25T10:00:05.500Z");
  assert.equal(report.duration_ms, 5500);
  assert.equal(report.overall_status, "DEGRADED");
  assert.equal(report.publication_status, "PUBLISHED");
  assert.equal(report.artifact_preserved, false);
  assert.equal(report.active_source_count, 2);
  assert.equal(report.successful_source_count, 1);
  assert.equal(report.failed_source_count, 1);
  assert.equal(report.total_observations_acquired, 5); // only the successful source's own observation_count
  assert.equal(report.display_listing_count, 42);
  assert.equal(report.map_marker_count, 7);
  assert.deepEqual(report.window, { from: "2026-08-24", to: "2026-12-31" });

  assert.deepEqual(report.sources, [
    { source_id: "a", status: "SUCCESS", attempts: 1, records_acquired: 5 },
    { source_id: "b", status: "FAILED", attempts: 3, records_acquired: 5, error: "boom" },
  ]);
});

test("buildHealthReport: a preserved-previous-artifact run reports publication_status/reason honestly", () => {
  const report = buildHealthReport({
    runId: "run-fail",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedAt: "2026-08-25T10:00:01.000Z",
    sourceResults: [source({ success: false, error: "all failed" })],
    publicationStatus: { succeeded: false, reason: "CATASTROPHIC_RUN" },
    artifactPreserved: true,
    counts: { displayListingCount: 0, mapMarkerCount: 0 },
    window: { from: null, to: null },
  });

  assert.equal(report.overall_status, "FAILED");
  assert.equal(report.publication_status, "PRESERVED_PREVIOUS");
  assert.equal(report.publication_reason, "CATASTROPHIC_RUN");
  assert.equal(report.artifact_preserved, true);
  assert.equal(report.artifact_path, null);
});

// --- writeHealthReport persistence ---

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "botm-unattended-health-report-test-"));
}

test("writeHealthReport writes both <run_id>.json and latest.json under runtime/health-reports/", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = buildHealthReport({
    runId: "run-abc",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedAt: "2026-08-25T10:00:02.000Z",
    sourceResults: [source()],
    publicationStatus: { succeeded: true, path: "x" },
    artifactPreserved: false,
    counts: { displayListingCount: 1, mapMarkerCount: 1 },
    window: { from: null, to: null },
  });

  const { runPath, latestPath } = await writeHealthReport(report, { root });
  const dir = resolveHealthReportDir({ root });
  assert.ok(runPath.startsWith(dir));
  assert.ok(latestPath.endsWith("latest.json"));

  const persistedRun = JSON.parse(await readFile(runPath, "utf8"));
  const persistedLatest = JSON.parse(await readFile(latestPath, "utf8"));
  assert.deepEqual(persistedRun, report);
  assert.deepEqual(persistedLatest, report);
});

test("writeHealthReport overwrites latest.json on each call, always reflecting the most recent run", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = buildHealthReport({
    runId: "run-1",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedAt: "2026-08-25T10:00:01.000Z",
    sourceResults: [source()],
    publicationStatus: { succeeded: true },
    artifactPreserved: false,
    counts: { displayListingCount: 1, mapMarkerCount: 1 },
    window: {},
  });
  const second = buildHealthReport({
    runId: "run-2",
    startedAt: "2026-08-25T11:00:00.000Z",
    completedAt: "2026-08-25T11:00:01.000Z",
    sourceResults: [source()],
    publicationStatus: { succeeded: true },
    artifactPreserved: false,
    counts: { displayListingCount: 2, mapMarkerCount: 2 },
    window: {},
  });

  await writeHealthReport(first, { root });
  const { latestPath } = await writeHealthReport(second, { root });

  const persisted = JSON.parse(await readFile(latestPath, "utf8"));
  assert.equal(persisted.run_id, "run-2");
});
