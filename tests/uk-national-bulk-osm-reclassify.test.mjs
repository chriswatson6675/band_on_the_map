import assert from "node:assert/strict";
import test from "node:test";

import {
  reclassifyPermanentFailures,
  eligibleForReprocessing,
  RETRYABLE_PROVIDER_FAILURE,
} from "../ingestion/uk-national-bulk-osm/reclassify-provider-outage.mjs";
import { COVERAGE_UNIT_STATUSES } from "../ingestion/uk-national-discovery/coverage-plan.mjs";

function fixture() {
  return {
    coverage_units: [
      { coverage_unit_id: "uk-grid-r00-c00", nation_hint: "England", status: "COMPLETE" },
      { coverage_unit_id: "uk-grid-r00-c04", nation_hint: "England", status: "PERMANENT_FAILURE" },
      { coverage_unit_id: "uk-grid-r01-c00", nation_hint: "England", status: "PERMANENT_FAILURE" },
      { coverage_unit_id: "uk-grid-r02-c00", nation_hint: "Wales", status: "PENDING" },
    ],
  };
}

test("RETRYABLE_PROVIDER_FAILURE is a recognised coverage-unit status", () => {
  assert.ok(COVERAGE_UNIT_STATUSES.has(RETRYABLE_PROVIDER_FAILURE));
});

test("reclassifyPermanentFailures converts every PERMANENT_FAILURE unit, and only those, to RETRYABLE_PROVIDER_FAILURE", () => {
  const { corrected, reclassified_count, reclassified_unit_ids } = reclassifyPermanentFailures(fixture(), {
    reclassifiedAt: "2026-09-22T12:00:00.000Z",
  });
  assert.equal(reclassified_count, 2);
  assert.deepEqual(reclassified_unit_ids.sort(), ["uk-grid-r00-c04", "uk-grid-r01-c00"]);

  const byId = new Map(corrected.coverage_units.map((u) => [u.coverage_unit_id, u]));
  assert.equal(byId.get("uk-grid-r00-c00").status, "COMPLETE");
  assert.equal(byId.get("uk-grid-r02-c00").status, "PENDING");
  assert.equal(byId.get("uk-grid-r00-c04").status, RETRYABLE_PROVIDER_FAILURE);
  assert.equal(byId.get("uk-grid-r01-c00").status, RETRYABLE_PROVIDER_FAILURE);
});

test("reclassification preserves history — the original status and a reason are retained on the corrected entry, never silently overwritten with no trace", () => {
  const { corrected } = reclassifyPermanentFailures(fixture(), { reclassifiedAt: "2026-09-22T12:00:00.000Z" });
  const unit = corrected.coverage_units.find((u) => u.coverage_unit_id === "uk-grid-r00-c04");
  assert.equal(unit.reclassification.original_status, "PERMANENT_FAILURE");
  assert.equal(unit.reclassification.reclassified_status, RETRYABLE_PROVIDER_FAILURE);
  assert.equal(unit.reclassification.reclassified_at, "2026-09-22T12:00:00.000Z");
  assert.ok(unit.reclassification.reason.length > 0);
  assert.ok(unit.reclassification.source_artifact);
});

test("units that were never PERMANENT_FAILURE carry no reclassification block", () => {
  const { corrected } = reclassifyPermanentFailures(fixture());
  const complete = corrected.coverage_units.find((u) => u.coverage_unit_id === "uk-grid-r00-c00");
  assert.equal(complete.reclassification, undefined);
});

test("reclassifyPermanentFailures never mutates the input object", () => {
  const input = fixture();
  const before = JSON.parse(JSON.stringify(input));
  reclassifyPermanentFailures(input);
  assert.deepEqual(input, before);
});

test("eligibleForReprocessing returns PENDING and RETRYABLE_PROVIDER_FAILURE units, never COMPLETE ones", () => {
  const { corrected } = reclassifyPermanentFailures(fixture());
  const eligible = eligibleForReprocessing(corrected).sort();
  assert.deepEqual(eligible, ["uk-grid-r00-c04", "uk-grid-r01-c00", "uk-grid-r02-c00"].sort());
});

test("reclassifying a payload with zero PERMANENT_FAILURE units is a safe no-op", () => {
  const clean = { coverage_units: [{ coverage_unit_id: "uk-grid-r00-c00", nation_hint: "England", status: "COMPLETE" }] };
  const { reclassified_count, corrected } = reclassifyPermanentFailures(clean);
  assert.equal(reclassified_count, 0);
  assert.equal(corrected.coverage_units[0].status, "COMPLETE");
});
