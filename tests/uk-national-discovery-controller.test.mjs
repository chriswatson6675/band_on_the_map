import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCoverageSweep, loadUnitStates, summariseCoverage, MAX_ATTEMPTS_PER_UNIT } from "../ingestion/uk-national-discovery/controller.mjs";

function unit(id) {
  return { coverage_unit_id: id, bounds: { south: 0, west: 0, north: 1, east: 1 }, nation_hint: "England", status: "PENDING", attempt_count: 0, candidate_count: 0, started_at: null, completed_at: null, error: null };
}

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "botm-uk-discovery-test-"));
}

test("a successful unit is recorded COMPLETE with its candidates", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const units = [unit("u1")];
  const results = await runCoverageSweep(units, {
    runId: "run1",
    root,
    discover: async () => ({ candidates: [{ candidate_id: "c1" }], error: null }),
    sleep: async () => {},
  });
  assert.equal(results[0].status, "COMPLETE");
  assert.equal(results[0].candidate_count, 1);
});

test("a persistently failing unit retries up to MAX_ATTEMPTS_PER_UNIT then becomes PERMANENT_FAILURE, without halting other units", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const units = [unit("bad"), unit("good")];
  let attempts = 0;
  const results = await runCoverageSweep(units, {
    runId: "run2",
    root,
    discover: async (u) => {
      if (u.coverage_unit_id === "bad") {
        attempts += 1;
        return { candidates: [], error: "HTTP 504" };
      }
      return { candidates: [{ candidate_id: "c1" }], error: null };
    },
    sleep: async () => {},
  });
  assert.equal(attempts, MAX_ATTEMPTS_PER_UNIT);
  const bad = results.find((r) => r.coverage_unit_id === "bad");
  const good = results.find((r) => r.coverage_unit_id === "good");
  assert.equal(bad.status, "PERMANENT_FAILURE");
  assert.equal(good.status, "COMPLETE", "one unit's exhausted retries must never block another unit");
});

test("a unit that fails once then succeeds on retry ends COMPLETE, not failed", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  let call = 0;
  const results = await runCoverageSweep([unit("flaky")], {
    runId: "run3",
    root,
    discover: async () => {
      call += 1;
      if (call === 1) return { candidates: [], error: "transient" };
      return { candidates: [{ candidate_id: "c1" }, { candidate_id: "c2" }], error: null };
    },
    sleep: async () => {},
  });
  assert.equal(results[0].status, "COMPLETE");
  assert.equal(results[0].attempt_count, 2);
  assert.equal(results[0].candidate_count, 2);
});

test("resume: a unit already COMPLETE under this runId is never re-queried", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0;
  const discover = async () => {
    calls += 1;
    return { candidates: [{ candidate_id: "c1" }], error: null };
  };
  await runCoverageSweep([unit("u1")], { runId: "resume-run", root, discover, sleep: async () => {} });
  assert.equal(calls, 1);
  // Second sweep with the same runId over the same unit set — must skip u1 entirely.
  await runCoverageSweep([unit("u1")], { runId: "resume-run", root, discover, sleep: async () => {} });
  assert.equal(calls, 1, "a COMPLETE unit must never be re-queried on resume");
});

test("resume: a PERMANENT_FAILURE unit is also never re-queried (retries are bounded per unit, not per sweep)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0;
  const discover = async () => {
    calls += 1;
    return { candidates: [], error: "still broken" };
  };
  await runCoverageSweep([unit("u1")], { runId: "resume-fail-run", root, discover, sleep: async () => {} });
  assert.equal(calls, MAX_ATTEMPTS_PER_UNIT);
  await runCoverageSweep([unit("u1")], { runId: "resume-fail-run", root, discover, sleep: async () => {} });
  assert.equal(calls, MAX_ATTEMPTS_PER_UNIT, "a PERMANENT_FAILURE unit must never be re-attempted on a later resume");
});

test("checkpoint files persist across separate loadUnitStates calls (durability, not just in-process memory)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await runCoverageSweep([unit("u1"), unit("u2")], {
    runId: "durable-run",
    root,
    discover: async () => ({ candidates: [{ candidate_id: "c1" }], error: null }),
    sleep: async () => {},
  });
  const reloaded = await loadUnitStates("durable-run", { root });
  assert.equal(reloaded.size, 2);
  assert.equal(reloaded.get("u1").status, "COMPLETE");
});

test("summariseCoverage accounts for every unit, including ones never attempted this sweep (still PENDING)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const units = [unit("u1"), unit("u2"), unit("u3")];
  const results = await runCoverageSweep([units[0], units[1]], {
    runId: "partial-run",
    root,
    discover: async () => ({ candidates: [], error: null }),
    sleep: async () => {},
  });
  const summary = summariseCoverage(units, results);
  assert.equal(summary.COMPLETE, 2);
  assert.equal(summary.PENDING, 1, "u3 was never included in this sweep and must show as PENDING, not silently vanish");
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  assert.equal(total, units.length, "no unit may be double-counted or lost from the summary");
});
