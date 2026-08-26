import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractBalancedJsonArray, parseCityHallEvents } from "../ingestion/city-hall-barcelona/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/city-hall-barcelona/observation-adapter.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/city-hall-barcelona/${name}`, import.meta.url), "utf8");
}

test("extractBalancedJsonArray correctly skips brackets inside string values", () => {
  const text = 'prefix "events":[{"title":"A [not a bracket] show"},{"title":"B"}] suffix';
  const marker = '"events":[';
  const extracted = extractBalancedJsonArray(text, text.indexOf(marker) + marker.length - 1);
  const parsed = JSON.parse(extracted);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, "A [not a bracket] show");
});

test("parseCityHallEvents parses the real retained sample (5 events)", async () => {
  const records = parseCityHallEvents(await loadFixture("event-list-sample.html"));
  assert.equal(records.length, 5);
  const first = records[0];
  assert.equal(first.title, "ANGELS GAVIRIA ALL NIGHT LONG at SECRET ROOM II Hard Techno II DOWNLOAD YOU FREE PASS");
  assert.equal(first.start_iso, "2026-08-25T21:59:00.000Z");
  assert.equal(first.location_lat, 41.387778);
  assert.equal(first.location_lng, 2.168208);
  assert.equal(first.event_url, `https://www.cityhallbarcelona.com/event-details/${first.slug}`);
});

test("parseCityHallEvents throws when the events marker is entirely absent", async () => {
  await assert.rejects(async () => parseCityHallEvents(await loadFixture("no-events-marker.html")), /No embedded/);
});

test("parseCityHallEvents throws when the extracted brackets never balance", async () => {
  await assert.rejects(async () => parseCityHallEvents(await loadFixture("unbalanced.html")), /never balanced/);
});

test("parseCityHallEvents throws for empty input", () => {
  assert.throws(() => parseCityHallEvents(""), /non-empty/);
});

test("toObservation maps a confirmed-UTC start/end through to the Observation contract", () => {
  const record = {
    source_record_id: "abc-123",
    title: "Test Night",
    slug: "test-night",
    event_url: "https://www.cityhallbarcelona.com/event-details/test-night",
    start_iso: "2026-08-25T21:59:00.000Z",
    end_iso: "2026-08-26T03:00:00.000Z",
    location_name: "DISCO CITY HALL BARCELONA",
    location_lat: 41.387778,
    location_lng: 2.168208,
  };
  const observation = toObservation(record, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observation.source_id, "city-hall-barcelona");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.start.iso, "2026-08-25T21:59:00.000Z");
  assert.equal(observation.venue_name, null);
  assert.equal(observation.source_fields.location_lat, 41.387778);
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}), /non-empty source_record_id/);
});

test("toObservations maps every parsed record from the real sample", async () => {
  const records = parseCityHallEvents(await loadFixture("event-list-sample.html"));
  const observations = toObservations(records, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observations.length, 5);
  assert.ok(observations.every((o) => o.source_id === "city-hall-barcelona"));
});
