// BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01 — proves item 11:
// a source-execution.mjs result can be mapped deterministically to the
// checkpoint shape worker candidate 8411a8d's checkpoint-store.mjs
// expects. Pure unit tests against synthetic result objects — see
// ingestion/programme-acquisition/worker-checkpoint-mapping.mjs's own
// header comment for the full mapping table and the one documented
// compatibility gap.

import assert from "node:assert/strict";
import test from "node:test";
import { mapAcquisitionResultToCheckpoint } from "../ingestion/programme-acquisition/worker-checkpoint-mapping.mjs";

function baseResult(overrides) {
  return {
    source_id: "arbitrary-source",
    venue: "Arbitrary Venue",
    started_at: "2026-08-29T00:00:00.000Z",
    completed_at: "2026-08-29T00:00:05.000Z",
    normalized_event_count: 0,
    proven_event_count: 0,
    retry_count: 0,
    ...overrides,
  };
}

test("ACQUISITION_PROVEN maps to SUCCESS", () => {
  const checkpoint = mapAcquisitionResultToCheckpoint(baseResult({ state: "ACQUISITION_PROVEN", collector: "JSON_LD_EVENT", proven_event_count: 3 }));
  assert.equal(checkpoint.status, "SUCCESS");
  assert.equal(checkpoint.attempts, 1);
  assert.equal(checkpoint.startedAt, "2026-08-29T00:00:00.000Z");
  assert.equal(checkpoint.completedAt, "2026-08-29T00:00:05.000Z");
  assert.equal(checkpoint.proven_event_count, 3);
  assert.equal(checkpoint.source_state, "ACQUISITION_PROVEN");
});

const RESIDUE_CASES = [
  ["ACCESS_BLOCKED", "ACCESS_BLOCKED"],
  ["BROWSER_REQUIRED", "BROWSER_REQUIRED"],
  ["SOCIAL_FIRST_PROGRAMME", "SOCIAL_FIRST_PROGRAMME"],
  ["IMAGE_OR_POSTER_ONLY", "IMAGE_OR_POSTER_ONLY"],
  ["SOURCE_FINGERPRINT_UNSUPPORTED", "UNSUPPORTED_COLLECTOR_FAMILY"],
  ["PROGRAMME_SOURCE_UNRESOLVED", "SOURCE_UNRESOLVED"],
  ["PROGRAMME_EMPTY", "SOURCE_UNRESOLVED"],
];

for (const [state, expectedReason] of RESIDUE_CASES) {
  test(`${state} maps to RESIDUE with residue_reason ${expectedReason}`, () => {
    const checkpoint = mapAcquisitionResultToCheckpoint(baseResult({ state }));
    assert.equal(checkpoint.status, "RESIDUE");
    assert.equal(checkpoint.residue_reason, expectedReason);
    assert.equal(checkpoint.source_state, state, "the original, un-collapsed repository state is always preserved");
  });
}

const FAILED_CASES = ["NETWORK_FAILURE", "STABLE_IDENTITY_PROOF_FAILED", "SUPPORTED_COLLECTOR_NO_VALID_EVENTS"];

for (const state of FAILED_CASES) {
  test(`${state} maps to FAILED`, () => {
    const checkpoint = mapAcquisitionResultToCheckpoint(baseResult({ state, error: "network unreachable" }));
    assert.equal(checkpoint.status, "FAILED");
    assert.equal(checkpoint.error, "network unreachable");
  });
}

test("FAILED without an explicit error falls back to the state name, never leaving error undefined", () => {
  const checkpoint = mapAcquisitionResultToCheckpoint(baseResult({ state: "NETWORK_FAILURE" }));
  assert.equal(checkpoint.error, "NETWORK_FAILURE");
});

test("an unrecognised state throws rather than silently misclassifying", () => {
  assert.throws(() => mapAcquisitionResultToCheckpoint(baseResult({ state: "SOME_FUTURE_STATE_NOT_YET_MAPPED" })), /unrecognised state/);
});

test("a result missing state throws", () => {
  assert.throws(() => mapAcquisitionResultToCheckpoint({}), /state is required/);
});

test("every terminal state this repository's orchestrator/source-execution can produce has a mapping (no silent gaps)", () => {
  // Kept in sync by hand with source-execution.mjs's own documented
  // vocabulary — a new state added there without a matching case here
  // must fail this test, not fail silently at real integration time.
  const ALL_KNOWN_STATES = [
    "ACQUISITION_PROVEN",
    "NETWORK_FAILURE",
    "PROGRAMME_SOURCE_UNRESOLVED",
    "ACCESS_BLOCKED",
    "BROWSER_REQUIRED",
    "SOCIAL_FIRST_PROGRAMME",
    "IMAGE_OR_POSTER_ONLY",
    "PROGRAMME_EMPTY",
    "SOURCE_FINGERPRINT_UNSUPPORTED",
    "STABLE_IDENTITY_PROOF_FAILED",
    "SUPPORTED_COLLECTOR_NO_VALID_EVENTS",
  ];
  for (const state of ALL_KNOWN_STATES) {
    assert.doesNotThrow(() => mapAcquisitionResultToCheckpoint(baseResult({ state })), `state "${state}" must have a mapping`);
  }
});
