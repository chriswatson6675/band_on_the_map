import test from "node:test";
import assert from "node:assert/strict";

import {
  createCityJob,
  isTerminalJobState,
  markJobRunning,
  determineFinalJobState,
  isCatastrophicCityJob,
  JOB_STATES,
  RESIDUE_REASONS,
} from "../../ingestion/city-worker/job.mjs";

test("createCityJob starts QUEUED with zeroed counts and carries opaque metadata unchanged", () => {
  const job = createCityJob({
    jobId: "abc",
    country: "PT",
    city: "Porto",
    estateRef: "sources/porto.json",
    createdAt: "2026-08-29T00:00:00.000Z",
    runnerVersionSha: "deadbeef",
    configuration: { concurrency: 8 },
  });

  assert.equal(job.state, "QUEUED");
  assert.equal(job.total_sources, 0);
  assert.equal(job.completed_sources, 0);
  assert.equal(job.started_at, null);
  assert.equal(job.completed_at, null);
  assert.equal(job.country, "PT");
  assert.equal(job.city, "Porto");
  assert.equal(job.estate_ref, "sources/porto.json");
  assert.equal(job.runner_version_sha, "deadbeef");
  assert.deepEqual(job.configuration, { concurrency: 8 });
});

test("createCityJob requires the essential fields", () => {
  assert.throws(() => createCityJob({ country: "PT", city: "Porto", createdAt: "x" }), /jobId/);
  assert.throws(() => createCityJob({ jobId: "x", city: "Porto", createdAt: "x" }), /country/);
  assert.throws(() => createCityJob({ jobId: "x", country: "PT", createdAt: "x" }), /city/);
});

test("isTerminalJobState matches exactly the terminal states in JOB_STATES", () => {
  const expectedTerminal = new Set(["COMPLETE", "COMPLETE_WITH_RESIDUE", "FAILED", "CANCELLED"]);
  for (const state of JOB_STATES) {
    assert.equal(isTerminalJobState(state), expectedTerminal.has(state), `state ${state}`);
  }
});

test("markJobRunning sets started_at only once, never resetting it on resume", () => {
  const job = createCityJob({ jobId: "x", country: "PT", city: "Porto", createdAt: "2026-08-29T00:00:00.000Z" });
  const firstRun = markJobRunning(job, { now: "2026-08-29T01:00:00.000Z" });
  assert.equal(firstRun.started_at, "2026-08-29T01:00:00.000Z");

  const resumed = markJobRunning(firstRun, { now: "2026-08-29T05:00:00.000Z" });
  assert.equal(resumed.started_at, "2026-08-29T01:00:00.000Z", "resuming a job must never move its original start time");
});

test("determineFinalJobState: all successful -> COMPLETE", () => {
  assert.equal(determineFinalJobState({ totalSources: 5, successfulSources: 5, cancelledEarly: false }), "COMPLETE");
});

test("determineFinalJobState: some not successful -> COMPLETE_WITH_RESIDUE", () => {
  assert.equal(determineFinalJobState({ totalSources: 5, successfulSources: 3, cancelledEarly: false }), "COMPLETE_WITH_RESIDUE");
});

test("determineFinalJobState: cancelled takes precedence", () => {
  assert.equal(determineFinalJobState({ totalSources: 5, successfulSources: 5, cancelledEarly: true }), "CANCELLED");
});

test("determineFinalJobState: zero-source estate is FAILED, never COMPLETE", () => {
  assert.equal(determineFinalJobState({ totalSources: 0, successfulSources: 0, cancelledEarly: false }), "FAILED");
});

test("isCatastrophicCityJob true only for an empty estate", () => {
  assert.equal(isCatastrophicCityJob({ totalSources: 0 }), true);
  assert.equal(isCatastrophicCityJob({ totalSources: 1 }), false);
});

test("RESIDUE_REASONS is a fixed, named vocabulary (not free-form strings)", () => {
  assert.ok(RESIDUE_REASONS.includes("BROWSER_REQUIRED"));
  assert.ok(RESIDUE_REASONS.includes("AI_RESEARCH_REQUIRED"));
  assert.ok(Object.isFrozen(RESIDUE_REASONS));
});
