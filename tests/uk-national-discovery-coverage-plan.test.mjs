import assert from "node:assert/strict";
import test from "node:test";

import { buildCoverageUnits, approximateNation, UK_BBOX, COVERAGE_UNIT_STATUSES } from "../ingestion/uk-national-discovery/coverage-plan.mjs";

test("buildCoverageUnits is deterministic — same inputs always produce the same ids in the same order", () => {
  const a = buildCoverageUnits();
  const b = buildCoverageUnits();
  assert.deepEqual(
    a.map((u) => u.coverage_unit_id),
    b.map((u) => u.coverage_unit_id),
  );
});

test("every coverage_unit_id is unique", () => {
  const units = buildCoverageUnits();
  assert.equal(new Set(units.map((u) => u.coverage_unit_id)).size, units.length);
});

test("the union of every unit's bounds exactly covers UK_BBOX, with no gap", () => {
  const units = buildCoverageUnits();
  const west = Math.min(...units.map((u) => u.bounds.west));
  const east = Math.max(...units.map((u) => u.bounds.east));
  const south = Math.min(...units.map((u) => u.bounds.south));
  const north = Math.max(...units.map((u) => u.bounds.north));
  assert.equal(west, UK_BBOX.west);
  assert.ok(east >= UK_BBOX.east);
  assert.equal(south, UK_BBOX.south);
  assert.ok(north >= UK_BBOX.north);
});

test("adjacent cells in the same row share an exact boundary — no gap, no overlap", () => {
  const units = buildCoverageUnits();
  const row0 = units.filter((u) => u.coverage_unit_id.startsWith("uk-grid-r00-")).sort((a, b) => a.bounds.west - b.bounds.west);
  for (let i = 0; i < row0.length - 1; i += 1) {
    assert.equal(row0[i].bounds.east, row0[i + 1].bounds.west);
  }
});

test("every unit starts PENDING with zeroed counters", () => {
  const units = buildCoverageUnits();
  for (const unit of units) {
    assert.equal(unit.status, "PENDING");
    assert.equal(unit.attempt_count, 0);
    assert.equal(unit.candidate_count, 0);
    assert.equal(unit.started_at, null);
    assert.equal(unit.completed_at, null);
    assert.ok(COVERAGE_UNIT_STATUSES.has(unit.status));
  }
});

test("a smaller cell size produces more, smaller units covering the same bbox", () => {
  const coarse = buildCoverageUnits({ cellWidthDeg: 2, cellHeightDeg: 2 });
  const fine = buildCoverageUnits({ cellWidthDeg: 0.5, cellHeightDeg: 0.5 });
  assert.ok(fine.length > coarse.length);
});

// --- approximateNation ---

test("approximateNation places known reference points in their real nation", () => {
  assert.equal(approximateNation(51.5074, -0.1278), "England"); // London
  assert.equal(approximateNation(55.9533, -3.1883), "Scotland"); // Edinburgh
  assert.equal(approximateNation(51.4816, -3.1791), "Wales"); // Cardiff
  assert.equal(approximateNation(54.5973, -5.9301), "Northern Ireland"); // Belfast
  assert.equal(approximateNation(53.4808, -2.2426), "England"); // Manchester
});

test("approximateNation returns UNKNOWN for non-finite input, never guesses", () => {
  assert.equal(approximateNation(null, null), "UNKNOWN");
  assert.equal(approximateNation(NaN, 1), "UNKNOWN");
});
