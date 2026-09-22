import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalityGazetteer, nearestLocality, localityFromTags } from "../ingestion/uk-national-discovery/locality-gazetteer.mjs";

test("localityFromTags prefers addr:city, then addr:town, then addr:suburb", () => {
  assert.deepEqual(localityFromTags({ "addr:city": "York", "addr:town": "Selby" }, 53.9, -1.08), { city: "York", latitude: 53.9, longitude: -1.08 });
  assert.deepEqual(localityFromTags({ "addr:town": "Selby" }, 1, 2), { city: "Selby", latitude: 1, longitude: 2 });
  assert.deepEqual(localityFromTags({ "addr:suburb": "Chapeltown" }, 1, 2), { city: "Chapeltown", latitude: 1, longitude: 2 });
});

test("localityFromTags returns null when no locality tag exists — never guesses", () => {
  assert.equal(localityFromTags({ amenity: "theatre" }, 1, 2), null);
  assert.equal(localityFromTags(null, 1, 2), null);
});

test("buildLocalityGazetteer deduplicates by name, keeping the first-seen coordinate", () => {
  const gaz = buildLocalityGazetteer([
    { city: "York", latitude: 53.9, longitude: -1.08 },
    { city: "york", latitude: 99, longitude: 99 }, // case-insensitive dup, later — must not override
  ]);
  assert.equal(gaz.size, 1);
  assert.equal(gaz.get("york").lat, 53.9);
});

test("buildLocalityGazetteer merges seed localities (existing known cities) with candidate-derived ones", () => {
  const gaz = buildLocalityGazetteer([{ city: "Aylesbury", latitude: 51.8, longitude: -0.8 }], [{ city: "London", latitude: 51.5, longitude: -0.1 }]);
  assert.equal(gaz.size, 2);
  assert.ok(gaz.has("london"));
  assert.ok(gaz.has("aylesbury"));
});

test("nearestLocality returns the closest named place by coordinate", () => {
  const gaz = buildLocalityGazetteer([], [
    { city: "London", latitude: 51.5, longitude: -0.1 },
    { city: "Manchester", latitude: 53.48, longitude: -2.24 },
  ]);
  // A point much closer to Manchester than London
  assert.equal(nearestLocality(gaz, 53.5, -2.2), "Manchester");
  assert.equal(nearestLocality(gaz, 51.51, -0.12), "London");
});

test("nearestLocality returns null for an empty gazetteer or non-finite coordinates — never fabricates a place name", () => {
  const gaz = buildLocalityGazetteer([], []);
  assert.equal(nearestLocality(gaz, 51.5, -0.1), null);
  const nonEmpty = buildLocalityGazetteer([], [{ city: "London", latitude: 51.5, longitude: -0.1 }]);
  assert.equal(nearestLocality(nonEmpty, NaN, -0.1), null);
});
