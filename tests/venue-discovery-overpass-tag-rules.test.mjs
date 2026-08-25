import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOsmTags } from "../ingestion/venue-discovery/overpass/tag-rules.mjs";

function levels(signals) {
  return signals.map((s) => s.level).sort();
}

test("amenity=music_venue is STRONG", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "music_venue" })), ["STRONG"]);
});

test("leisure=music_venue is STRONG", () => {
  assert.deepEqual(levels(evaluateOsmTags({ leisure: "music_venue" })), ["STRONG"]);
});

test("amenity=concert_hall is STRONG", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "concert_hall" })), ["STRONG"]);
});

test("amenity=theatre + theatre:type=concert_hall is STRONG", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "theatre", "theatre:type": "concert_hall" })), ["STRONG"]);
});

test("plain amenity=theatre with no music evidence is WEAK only", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "theatre" })), ["WEAK"]);
});

test("amenity=nightclub with live_music=yes is MEDIUM only, not also WEAK", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "nightclub", live_music: "yes" })), ["MEDIUM"]);
});

test("amenity=nightclub with no live_music evidence is WEAK", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "nightclub" })), ["WEAK"]);
});

test("live_music=no is negative evidence, never a signal", () => {
  assert.deepEqual(evaluateOsmTags({ amenity: "bar", live_music: "no" }), []);
});

test("a bar with live_music=yes is MEDIUM", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "bar", live_music: "yes" })), ["MEDIUM"]);
});

test("amenity=events_venue is MEDIUM", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "events_venue" })), ["MEDIUM"]);
});

test("cultural centre amenities with music/genre evidence are MEDIUM", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "community_centre", music: "folk" })), ["MEDIUM"]);
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "arts_centre", genre: "jazz" })), ["MEDIUM"]);
});

test("cultural centre amenities with no music-specific evidence are WEAK", () => {
  assert.deepEqual(levels(evaluateOsmTags({ amenity: "social_centre" })), ["WEAK"]);
});

test("a plain restaurant/cafe with no relevant tags produces zero signals", () => {
  assert.deepEqual(evaluateOsmTags({ amenity: "restaurant" }), []);
  assert.deepEqual(evaluateOsmTags({}), []);
});

test("evaluateOsmTags tolerates a missing tags object", () => {
  assert.deepEqual(evaluateOsmTags(undefined), []);
});
