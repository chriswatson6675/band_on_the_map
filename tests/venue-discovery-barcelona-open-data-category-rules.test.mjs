import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSecondaryFilters } from "../ingestion/venue-discovery/barcelona-open-data/category-rules.mjs";

function levels(signals) {
  return signals.map((s) => s.level).sort();
}

test("Locals de música en viu is STRONG", () => {
  assert.deepEqual(levels(evaluateSecondaryFilters(["Locals de música en viu"])), ["STRONG"]);
});

test("Tablaos flamencs is STRONG", () => {
  assert.deepEqual(levels(evaluateSecondaryFilters(["Tablaos flamencs"])), ["STRONG"]);
});

test("Bars i pubs musicals is MEDIUM, including with trailing whitespace as seen in the live dataset", () => {
  assert.deepEqual(levels(evaluateSecondaryFilters(["Bars i pubs musicals "])), ["MEDIUM"]);
});

test("Discoteques alone is WEAK", () => {
  assert.deepEqual(levels(evaluateSecondaryFilters(["Discoteques"])), ["WEAK"]);
});

test("purely food/restaurant categories produce zero signals", () => {
  assert.deepEqual(evaluateSecondaryFilters(["Restaurants", "Tapes", "Cuina de mercat"]), []);
});

test("an empty or missing category list produces zero signals", () => {
  assert.deepEqual(evaluateSecondaryFilters([]), []);
  assert.deepEqual(evaluateSecondaryFilters(undefined), []);
});

test("a record with several categories accumulates one signal per matching category, deduplicated", () => {
  const signals = evaluateSecondaryFilters(["Locals de música en viu", "Locals de música en viu", "Discoteques"]);
  assert.equal(levels(signals).join(","), ["STRONG", "WEAK"].join(","));
});

test("matching is exact against the known vocabulary, never fuzzy/partial", () => {
  assert.deepEqual(evaluateSecondaryFilters(["Locals de música en viu (annex)"]), []);
});
