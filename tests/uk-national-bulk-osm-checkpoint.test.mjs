import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  runBulkOsmSweep,
  loadUnitCheckpoints,
  summariseBulkOsmCoverage,
} from "../ingestion/uk-national-bulk-osm/checkpoint.mjs";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "botm-uk-bulk-osm-test-"));
}

function candidatesByUnit(pairs) {
  return new Map(pairs);
}

test("a unit with candidates is recorded COMPLETE", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const results = await runBulkOsmSweep(candidatesByUnit([["u1", [{ id: 1 }]]]), {
    runId: "run1",
    root,
    processUnit: async (unitId, candidates) => ({ candidate_count: candidates.length }),
  });
  assert.equal(results[0].status, "COMPLETE");
  assert.equal(results[0].candidate_count, 1);
});

test("a unit with zero candidates is recorded COMPLETE_NO_CANDIDATES, not silently dropped", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const results = await runBulkOsmSweep(candidatesByUnit([["u1", []]]), {
    runId: "run2",
    root,
    processUnit: async (unitId, candidates) => ({ candidate_count: candidates.length }),
  });
  assert.equal(results[0].status, "COMPLETE_NO_CANDIDATES");
});

test("a unit whose processUnit throws is recorded SOURCE_DATA_INVALID, and other units still run (one bad unit never halts the sweep)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const results = await runBulkOsmSweep(
    candidatesByUnit([
      ["bad", [{ id: 1 }]],
      ["good", [{ id: 2 }]],
    ]),
    {
      runId: "run3",
      root,
      processUnit: async (unitId) => {
        if (unitId === "bad") throw new Error("malformed candidate geometry");
        return { candidate_count: 1 };
      },
    },
  );
  const bad = results.find((r) => r.coverage_unit_id === "bad");
  const good = results.find((r) => r.coverage_unit_id === "good");
  assert.equal(bad.status, "SOURCE_DATA_INVALID");
  assert.ok(bad.error.includes("malformed candidate geometry"));
  assert.equal(good.status, "COMPLETE", "one unit's failure must never block another unit");
});

test("resume: a unit already COMPLETE under this runId is never reprocessed", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0;
  const processUnit = async () => {
    calls += 1;
    return { candidate_count: 1 };
  };
  await runBulkOsmSweep(candidatesByUnit([["u1", [{ id: 1 }]]]), { runId: "resume-run", root, processUnit });
  assert.equal(calls, 1);
  await runBulkOsmSweep(candidatesByUnit([["u1", [{ id: 1 }]]]), { runId: "resume-run", root, processUnit });
  assert.equal(calls, 1, "a COMPLETE unit must never be reprocessed on resume");
});

test("resume: a SOURCE_DATA_INVALID unit is also never reprocessed (it is one of this package's three allowed terminal statuses, same as COMPLETE)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0;
  const processUnit = async () => {
    calls += 1;
    throw new Error("still bad");
  };
  await runBulkOsmSweep(candidatesByUnit([["u1", [{ id: 1 }]]]), { runId: "resume-invalid-run", root, processUnit });
  assert.equal(calls, 1);
  await runBulkOsmSweep(candidatesByUnit([["u1", [{ id: 1 }]]]), { runId: "resume-invalid-run", root, processUnit });
  assert.equal(calls, 1, "SOURCE_DATA_INVALID is terminal — re-running the same runId must never blindly retry it");
});

test("checkpoint files persist across separate loadUnitCheckpoints calls (durability, not just in-process memory)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await runBulkOsmSweep(
    candidatesByUnit([
      ["u1", [{ id: 1 }]],
      ["u2", [{ id: 2 }]],
    ]),
    { runId: "durable-run", root, processUnit: async (unitId, candidates) => ({ candidate_count: candidates.length }) },
  );
  const reloaded = await loadUnitCheckpoints("durable-run", { root });
  assert.equal(reloaded.size, 2);
  assert.equal(reloaded.get("u1").status, "COMPLETE");
});

test("summariseBulkOsmCoverage accounts for every unit, including ones never attempted this sweep (still PENDING)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const allUnitIds = ["u1", "u2", "u3"];
  const results = await runBulkOsmSweep(candidatesByUnit([["u1", [{ id: 1 }]], ["u2", []]]), {
    runId: "partial-run",
    root,
    processUnit: async (unitId, candidates) => ({ candidate_count: candidates.length }),
  });
  const summary = summariseBulkOsmCoverage(allUnitIds, results);
  assert.equal(summary.COMPLETE, 1);
  assert.equal(summary.COMPLETE_NO_CANDIDATES, 1);
  assert.equal(summary.PENDING, 1, "u3 was never included in this sweep and must show as PENDING, not silently vanish");
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  assert.equal(total, allUnitIds.length, "no unit may be double-counted or lost from the summary");
});
