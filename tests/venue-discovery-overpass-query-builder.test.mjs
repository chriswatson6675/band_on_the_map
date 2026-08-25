import assert from "node:assert/strict";
import test from "node:test";
import { buildOverpassQuery, OVERPASS_LEAD_SELECTORS } from "../ingestion/venue-discovery/overpass/query-builder.mjs";

const area = { centre: { latitude: 41.3851, longitude: 2.1734 }, radius_km: 25 };

test("radius_km is converted to meters, never hardcoded", () => {
  const query = buildOverpassQuery(area);
  assert.ok(query.includes("around:25000,41.3851,2.1734"));
});

test("a different area's radius_km produces a different query — nothing here is fixed to 25km", () => {
  const query = buildOverpassQuery({ centre: area.centre, radius_km: 5 });
  assert.ok(query.includes("around:5000,41.3851,2.1734"));
  assert.ok(!query.includes("around:25000"));
});

test("every OVERPASS_LEAD_SELECTORS entry appears for node/way/relation", () => {
  const query = buildOverpassQuery(area);
  for (const { key, value } of OVERPASS_LEAD_SELECTORS) {
    const filter = value === null ? `["${key}"]` : `["${key}"="${value}"]`;
    for (const elementType of ["node", "way", "relation"]) {
      assert.ok(query.includes(`${elementType}${filter}`), `missing ${elementType}${filter}`);
    }
  }
});

test("the query requests out center tags so ways/relations carry coordinates", () => {
  assert.ok(buildOverpassQuery(area).includes("out center tags;"));
});

test("throws for a missing centre", () => {
  assert.throws(() => buildOverpassQuery({ radius_km: 10 }), /centre/);
});

test("throws for a non-positive radius_km", () => {
  assert.throws(() => buildOverpassQuery({ centre: area.centre, radius_km: 0 }), /radius_km/);
});

test("does not blindly select every generic bar/pub — only via the live_music key-existence filter", () => {
  const query = buildOverpassQuery(area);
  assert.ok(!query.includes(`["amenity"="bar"]`));
  assert.ok(!query.includes(`["amenity"="pub"]`));
  assert.ok(query.includes(`["live_music"]`));
});
