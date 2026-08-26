// BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01's retry-symmetry proof:
// exercises the REAL, unmodified Barcelona acquireAll() loop
// (ingestion/barcelona/run.mjs — the exact function
// ingestion/unattended-runner/run.mjs's acquireBarcelona() call already
// uses) against synthetic, injected test sources — never a parallel/
// duplicated orchestration loop, and never a second, Barcelona-specific
// retry implementation (it forwards straight to the SAME
// ingestion/unattended-runner/retry.mjs withRetries() Portugal's own
// acquireAll() already uses — see tests/unattended-runner-acquire-all.test.mjs,
// which this file deliberately mirrors test-for-test to prove the two are
// now genuinely symmetric). Fully offline (no live network, no real
// sleeping).

import assert from "node:assert/strict";
import test from "node:test";
import { acquireAll } from "../ingestion/barcelona/run.mjs";

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

  const results = await acquireAll(["source-a", "source-b", "source-c"], REGISTRY, { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(results.length, 3);
  const [a, b, c] = results;

  assert.equal(a.source_id, "source-a");
  assert.equal(a.success, true);
  assert.equal(a.attempts, 1);
  assert.equal(a.observation_count, 2);

  assert.equal(b.source_id, "source-b");
  assert.equal(b.success, false);
  assert.equal(b.attempts, 3); // initial attempt + 2 retries, all exhausted
  assert.equal(bAttempts, 3);
  assert.match(b.error, /transport failure/);
  assert.equal(b.observation_count, 0);
  assert.deepEqual(b.observations, []);

  assert.equal(c.source_id, "source-c");
  assert.equal(c.success, true);
  assert.equal(c.attempts, 1);
  assert.equal(c.observation_count, 1);
});

test("a transiently-failing Barcelona source that recovers within the retry budget is retained as successful, with attempts > 1", async () => {
  let attemptCount = 0;
  const collectors = {
    "l-auditori-barcelona": async () => {
      attemptCount += 1;
      if (attemptCount < 2) throw new Error("fetch failed"); // the real, observed L'Auditori failure shape
      return { rawRecordCount: 3, observations: [makeObservation("l-auditori-barcelona", 1)], notes: [] };
    },
  };

  const [result] = await acquireAll(["l-auditori-barcelona"], [{ id: "l-auditori-barcelona" }], { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, true);
  assert.equal(result.attempts, 2);
  assert.equal(attemptCount, 2);
});

test("a persistently-failing (deterministic, e.g. TLS-shaped) transient-looking source exhausts every retry and is reported FAILED with the true attempt count", async () => {
  let attemptCount = 0;
  const collectors = {
    "l-auditori-barcelona": async () => {
      attemptCount += 1;
      throw new Error("fetch failed"); // matches this project's own real, documented TLS-chain incident — retries absorb one-off blips, never a deterministic upstream fault
    },
  };

  const [result] = await acquireAll(["l-auditori-barcelona"], [{ id: "l-auditori-barcelona" }], { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, false);
  assert.equal(result.attempts, 3);
  assert.equal(attemptCount, 3);
  assert.match(result.error, /fetch failed/);
});

test("a permanently-failing (non-transient) Barcelona source fails after exactly 1 attempt, never retried", async () => {
  let attemptCount = 0;
  const collectors = {
    "source-a": async () => {
      attemptCount += 1;
      throw new Error("HTTP 404 response");
    },
  };

  const [result] = await acquireAll(["source-a"], [{ id: "source-a" }], { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.equal(attemptCount, 1);
});

test("without a retryPolicy (the default, matching every existing caller), a transient failure is NOT retried — byte-identical to pre-existing Barcelona behaviour", async () => {
  let attemptCount = 0;
  const collectors = {
    "source-a": async () => {
      attemptCount += 1;
      throw new Error("transport failure: aborted");
    },
  };

  const [result] = await acquireAll(["source-a"], [{ id: "source-a" }], null, collectors); // no retryPolicy argument at all

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.equal(attemptCount, 1);
});

test("without a retryPolicy, a successful Barcelona source is unaffected — same shape/attempts=1 as before this package", async () => {
  const collectors = {
    "source-a": async () => ({ rawRecordCount: 5, observations: [makeObservation("source-a", 1)], notes: ["ok"] }),
  };

  const [result] = await acquireAll(["source-a"], [{ id: "source-a" }], null, collectors);

  assert.equal(result.success, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.observation_count, 1);
});

test("a missing registry entry fails closed WITHOUT being retried — a config problem, not a transient network one", async () => {
  const collectors = {
    "source-x": async () => ({ rawRecordCount: 0, observations: [], notes: [] }),
  };
  const [result] = await acquireAll(["source-x"], [{ id: "source-a" }], { maxAttempts: 3, retryDelayMs: 10, delayFn: instantDelay() }, collectors);

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.match(result.error, /not present in sources\/barcelona\.json/);
});
