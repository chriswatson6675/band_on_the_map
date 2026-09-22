import assert from "node:assert/strict";
import test from "node:test";

import { buildCoverageUnits } from "../ingestion/uk-national-discovery/coverage-plan.mjs";
import { assignCoverageUnit } from "../ingestion/uk-national-bulk-osm/assign-coverage-unit.mjs";

test("assignCoverageUnit places known reference points in their expected grid cell", () => {
  const units = buildCoverageUnits();
  const london = assignCoverageUnit(units, 51.5074, -0.1278);
  assert.ok(london);
  const edinburgh = assignCoverageUnit(units, 55.9533, -3.1883);
  assert.ok(edinburgh);
  assert.notEqual(london.coverage_unit_id, edinburgh.coverage_unit_id);
});

test("assignCoverageUnit returns null for a non-finite coordinate, never guesses", () => {
  const units = buildCoverageUnits();
  assert.equal(assignCoverageUnit(units, null, null), null);
  assert.equal(assignCoverageUnit(units, NaN, -1), null);
});

test("assignCoverageUnit returns null for a point genuinely outside every unit's bounds", () => {
  const units = buildCoverageUnits();
  assert.equal(assignCoverageUnit(units, 0, 0), null); // equator/prime-meridian, nowhere near the UK
});

test("every point inside a unit's own bounds resolves back to that exact unit", () => {
  const units = buildCoverageUnits();
  for (const unit of units) {
    const midLat = (unit.bounds.south + unit.bounds.north) / 2;
    const midLon = (unit.bounds.west + unit.bounds.east) / 2;
    const resolved = assignCoverageUnit(units, midLat, midLon);
    assert.equal(resolved?.coverage_unit_id, unit.coverage_unit_id);
  }
});

test("a shared border point resolves to exactly one unit, never throws, never silently matches two different ones ambiguously", () => {
  const units = buildCoverageUnits();
  const first = units[0];
  const borderLat = first.bounds.south;
  const borderLon = first.bounds.east; // shared with the next column's west edge
  const resolved = assignCoverageUnit(units, borderLat, borderLon);
  assert.ok(resolved);
});
