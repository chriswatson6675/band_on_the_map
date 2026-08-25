// BOTM-UNATTENDED-COLLECTION-RUNNER-01's central failure-isolation proof:
// exercises the REAL, unmodified acquireAll() loop
// (ingestion/lisbon-porto/run.mjs — the exact function every real
// production entry point already uses) against 3 synthetic, injected test
// sources — never a parallel/duplicated orchestration loop. Fully offline
// (no live network, no real sleeping).

import assert from "node:assert/strict";
import test from "node:test";
import { acquireAll } from "../ingestion/lisbon-porto/run.mjs";

const REGISTRY = [{ id: "source-a" }, { id: "source-b" }, { id: "source-c" }];

function instantDelay() {
  return async () => {};
}

function makeObservation(sourceId, i) {
  return { source_id: sourceId, source_record_id: String(i), title: `Event ${i}`, start: { date: null } };
}

test("3-source proof: A succeeds, B fails transiently/retries/then permanently fails, C succeeds — B never blocks A or C", async () => {
  let bAttempts = 0;
  const collectors = {
    "source-a": async () => ({ rawRecordCount: 2, observations: [makeObservation("source-a", 1), makeObservation("source-a", 2)], notes: [] }),
    "source-b": async () => {
      bAttempts += 1;
      throw new Error("transport failure: This operation was aborted"); // transient every time — genuinely exhausts retries
    },
    "source-c": async () => ({ rawRecordCount: 1, observations: [makeObservation("source-c", 1)], notes: [] }),
  };

  const results = await acquireAll(
    ["source-a", "source-b", "source-c"],
    REGISTRY,
    "test-registry",
    { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() },
    collectors,
  );

  assert.equal(results.length, 3);
  const [a, b, c] = results;

  // A: retained, untouched by B's failure.
  assert.equal(a.source_id, "source-a");
  assert.equal(a.success, true);
  assert.equal(a.attempts, 1);
  assert.equal(a.observation_count, 2);
  assert.equal(a.observations.length, 2);

  // B: recorded as failed, with the full retry attempt count and a final error — never "0 events, success".
  assert.equal(b.source_id, "source-b");
  assert.equal(b.success, false);
  assert.equal(b.attempts, 3); // initial attempt + 2 retries, all exhausted
  assert.equal(bAttempts, 3);
  assert.match(b.error, /transport failure/);
  assert.equal(b.observation_count, 0);
  assert.deepEqual(b.observations, []);

  // C: retained, untouched by B's failure — proves source isolation, not just B's own retry behaviour.
  assert.equal(c.source_id, "source-c");
  assert.equal(c.success, true);
  assert.equal(c.attempts, 1);
  assert.equal(c.observation_count, 1);
});

test("a transiently-failing source that recovers within the retry budget is retained as successful, with attempts > 1", async () => {
  let attemptCount = 0;
  const collectors = {
    "source-a": async () => {
      attemptCount += 1;
      if (attemptCount < 2) throw new Error("HTTP 503 response");
      return { rawRecordCount: 3, observations: [makeObservation("source-a", 1)], notes: [] };
    },
  };

  const [result] = await acquireAll(["source-a"], [{ id: "source-a" }], "test-registry", { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, true);
  assert.equal(result.attempts, 2);
  assert.equal(attemptCount, 2);
});

test("a permanently-failing (non-transient) source fails after exactly 1 attempt, never retried", async () => {
  let attemptCount = 0;
  const collectors = {
    "source-a": async () => {
      attemptCount += 1;
      throw new Error("HTTP 404 response");
    },
  };

  const [result] = await acquireAll(["source-a"], [{ id: "source-a" }], "test-registry", { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.equal(attemptCount, 1);
});

test("without a retryPolicy (the default, matching every existing caller), a transient failure is NOT retried — byte-identical to pre-existing behaviour", async () => {
  let attemptCount = 0;
  const collectors = {
    "source-a": async () => {
      attemptCount += 1;
      throw new Error("transport failure: aborted");
    },
  };

  const [result] = await acquireAll(["source-a"], [{ id: "source-a" }], "test-registry", null, collectors); // no retryPolicy argument at all

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.equal(attemptCount, 1);
});

test("a missing registry entry fails closed WITHOUT being retried — a config problem, not a transient network one", async () => {
  const collectors = {
    "source-x": async () => ({ rawRecordCount: 0, observations: [], notes: [] }),
  };
  const [result] = await acquireAll(["source-x"], [{ id: "source-a" }], "test-registry", { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.match(result.error, /not present in test-registry/);
});
