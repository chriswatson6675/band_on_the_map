import assert from "node:assert/strict";
import test from "node:test";

import { WAVE_1_CITIES, WAVE_1_ID, findCoverageCollisions } from "../../ingestion/future-city-wave/wave-config.mjs";
import { deriveExistingCityCoverage } from "../../ingestion/future-city-wave/existing-coverage.mjs";

test("existing (production-covered) city is excluded from the wave", () => {
  const existing = new Set(["berlin", "london", "sintra"]);
  const wave = [{ name: "Berlin" }, { name: "Sintra" }, { name: "Dublin" }];
  const collisions = findCoverageCollisions(wave, existing);
  assert.deepEqual(collisions.map((c) => c.name), ["Berlin", "Sintra"]);
});

test("a genuinely new city is accepted (no collision)", () => {
  const existing = new Set(["berlin", "london"]);
  const wave = [{ name: "Dublin" }];
  assert.deepEqual(findCoverageCollisions(wave, existing), []);
});

test("the real Wave-1 city list has zero collisions with dynamically-derived existing coverage", async () => {
  const existing = await deriveExistingCityCoverage({});
  const collisions = findCoverageCollisions(WAVE_1_CITIES, existing);
  assert.deepEqual(collisions, [], `Wave-1 must never include an already-covered city: ${collisions.map((c) => c.name).join(", ")}`);
});

test("CITY WAVE and ACQUISITION TIER are distinct concepts on every city", () => {
  for (const city of WAVE_1_CITIES) {
    assert.equal(city.wave_id, WAVE_1_ID);
    assert.equal(city.acquisition_tier, 1);
    assert.notEqual(city.wave_id, city.acquisition_tier, "wave_id and acquisition_tier must never collapse into the same field");
  }
});

test("Wave-1 city ordering is deterministic (a fixed array, not derived from iteration order of an object)", () => {
  assert.ok(Array.isArray(WAVE_1_CITIES));
  const ids = WAVE_1_CITIES.map((c) => c.city_id);
  assert.deepEqual(ids, [...ids], "re-reading the same module twice must yield the identical order");
  assert.equal(new Set(ids).size, ids.length, "no duplicate city_id");
});

test("Wave-1 is a bounded 20-30 city wave, not solely capital cities", () => {
  assert.ok(WAVE_1_CITIES.length >= 20 && WAVE_1_CITIES.length <= 30, `expected 20-30 cities, got ${WAVE_1_CITIES.length}`);
  const nonMajor = WAVE_1_CITIES.filter((c) => c.tier !== "MAJOR");
  assert.ok(nonMajor.length > 0, "wave must include secondary/smaller cities, not only major markets");
  const countries = new Set(WAVE_1_CITIES.map((c) => c.country_code));
  assert.ok(countries.size >= 5, "wave must span multiple countries");
});
