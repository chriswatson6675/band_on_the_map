import assert from "node:assert/strict";
import test from "node:test";
import { createAreaConfig, validateAreaConfig, AREA_STATUSES } from "../ingestion/area/contract.mjs";

function baseFields(overrides = {}) {
  return {
    area_id: "testville-xx",
    country: "Testland",
    country_code: "XX",
    city: "Testville",
    radius_km: 25,
    languages: ["en"],
    discovery_keywords: { en: ["live music"] },
    discovery_sources: [{ source_kind: "OSM_OVERPASS" }],
    centre: { latitude: 10, longitude: 20 },
    created_at: "2026-08-25",
    ...overrides,
  };
}

test("createAreaConfig builds a valid area with defaults applied", () => {
  const area = createAreaConfig(baseFields());
  assert.equal(area.area_id, "testville-xx");
  assert.equal(area.active_status, "ACTIVE");
  assert.equal(area.metro_name, null);
});

test("AREA_STATUSES is exactly ACTIVE/INACTIVE", () => {
  assert.deepEqual([...AREA_STATUSES].sort(), ["ACTIVE", "INACTIVE"]);
});

test("area_id must be a lowercase slug", () => {
  assert.throws(() => createAreaConfig(baseFields({ area_id: "Barcelona ES" })), /area_id must be a lowercase slug/);
});

test("country_code must be an ISO alpha-2 code", () => {
  const errors = validateAreaConfig(baseFields({ country_code: "esp" }));
  assert.ok(errors.some((e) => e.includes("country_code")));
});

test("centre coordinates must be in range", () => {
  const errors = validateAreaConfig(baseFields({ centre: { latitude: 200, longitude: 20 } }));
  assert.ok(errors.some((e) => e.includes("latitude")));
});

test("radius_km must be a positive number", () => {
  const errors = validateAreaConfig(baseFields({ radius_km: 0 }));
  assert.ok(errors.some((e) => e.includes("radius_km")));
});

test("radius_km is configurable, never fixed to one value by the contract", () => {
  assert.doesNotThrow(() => createAreaConfig(baseFields({ radius_km: 5 })));
  assert.doesNotThrow(() => createAreaConfig(baseFields({ radius_km: 100 })));
});

test("languages must be a non-empty array of strings", () => {
  assert.ok(validateAreaConfig(baseFields({ languages: [] })).length > 0);
  assert.ok(validateAreaConfig(baseFields({ languages: [1, 2] })).length > 0);
});

test("discovery_sources entries require a non-empty source_kind", () => {
  const errors = validateAreaConfig(baseFields({ discovery_sources: [{}] }));
  assert.ok(errors.some((e) => e.includes("discovery_sources[0]")));
});

test("active_status must be one of AREA_STATUSES", () => {
  const errors = validateAreaConfig(baseFields({ active_status: "PAUSED" }));
  assert.ok(errors.some((e) => e.includes("active_status")));
});

test("created_at must be a YYYY-MM-DD string", () => {
  const errors = validateAreaConfig(baseFields({ created_at: "25-08-2026" }));
  assert.ok(errors.some((e) => e.includes("created_at")));
});

test("missing area_id is reported, never silently defaulted", () => {
  const errors = validateAreaConfig(baseFields({ area_id: null }));
  assert.ok(errors.some((e) => e.includes("area_id is required")));
});
