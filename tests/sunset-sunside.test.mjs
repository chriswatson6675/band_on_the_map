// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Sunset/Sunside (60 rue des
// Lombards, 75001 Paris). PARIS_ZERO_CODE: this source is fully served by
// the EXISTING, already-generic ingestion/events-calendar-api/ family
// (client.mjs / observation-adapter.mjs) — no new ingestion/sunset-sunside/
// directory, no new collector code. This test proves that existing family
// reproduces this source's real retained fixture deterministically,
// exactly as ingestion/ccb/config.mjs's own config object does for CCB —
// the DETERMINISTIC_DERIVATION offline-proof evidence required for
// READY_FOR_ACTIVATION (see
// research/source-investigations/sunset-sunside-paris-01/investigation.json).
//
// Config used (mirrors ingestion/ccb/config.mjs's shape; not a new file
// since PARIS_ZERO_CODE requires none — the same one-off object a future
// npm run ingest:paris orchestrator would construct inline):
//   { baseUrl: "https://www.sunset-sunside.com", source_id: "sunset-sunside-paris" }

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseEventsPage, normalizeEventRecord, buildEventsUrl } from "../ingestion/events-calendar-api/client.mjs";
import { toObservations, deriveDateTime } from "../ingestion/events-calendar-api/observation-adapter.mjs";

const CONFIG = { baseUrl: "https://www.sunset-sunside.com", source_id: "sunset-sunside-paris" };

async function body() {
  return readFile(new URL("../fixtures/sunset-sunside-paris/tribe-events-sample.json", import.meta.url), "utf8");
}

test("buildEventsUrl: builds the real, proven wp-json/tribe/events/v1/events request URL", () => {
  const url = buildEventsUrl({ ...CONFIG, perPage: 20 });
  assert.equal(url, "https://www.sunset-sunside.com/wp-json/tribe/events/v1/events/?per_page=20");
});

test("parseEventsPage + normalizeEventRecord: real retained fixture parses to both Sunset and Sunside rooms", async () => {
  const page = parseEventsPage(await body());
  assert.equal(page.events.length, 5);

  const records = page.events.map(normalizeEventRecord);
  const rooms = new Set(records.map((r) => r.venue?.name));
  assert.deepEqual([...rooms].sort(), ["Sunset", "Sunside"]);

  const laurent = records.find((r) => r.source_record_id === "152278");
  assert.ok(laurent);
  assert.equal(laurent.title, "Laurent Epstein Quartet");
  assert.equal(laurent.start_utc, "2026-08-26 19:00:00");
  assert.equal(laurent.timezone, "Europe/Paris");
  assert.equal(laurent.venue.name, "Sunside");
  assert.equal(laurent.venue.address, "60 rue des Lombards");
  assert.equal(laurent.venue.zip, "75001");

  const sunsetRoom = records.find((r) => r.venue?.name === "Sunset");
  assert.ok(sunsetRoom, "at least one real retained record from the Sunset room");
  // same physical venue, same address, distinct room name — one venue,
  // two rooms, per this investigation's own field_assessment.venue_location
  assert.equal(sunsetRoom.venue.address, "60 rue des Lombards");
});

test("deriveDateTime: the API's own utc_start_date is a genuine UTC_INSTANT — the strongest certainty tier this project models", async () => {
  const page = parseEventsPage(await body());
  const records = page.events.map(normalizeEventRecord);
  const laurent = records.find((r) => r.source_record_id === "152278");

  const start = deriveDateTime(laurent, "start");
  assert.equal(start.certainty, "UTC_INSTANT");
  assert.equal(start.iso, "2026-08-26T19:00:00Z");
  assert.equal(start.is_utc, true);
});

test("toObservation / toObservations: real retained records adapt correctly via the EXISTING generic family (zero new collector code)", async () => {
  const page = parseEventsPage(await body());
  const records = page.events.map(normalizeEventRecord);

  const observations = toObservations(records, CONFIG, { retrievedAt: "2026-08-27T09:00:00Z" });
  assert.equal(observations.length, 5);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);

  const laurentObs = observations.find((o) => o.source_record_id === "152278");
  assert.equal(laurentObs.source_id, "sunset-sunside-paris");
  assert.equal(laurentObs.venue_name, "Sunside");
  assert.ok(laurentObs.location_text.includes("60 rue des Lombards"));
  assert.ok(laurentObs.price_text.includes("18"));
  assert.equal(laurentObs.event_url, "https://www.sunset-sunside.com/concert/laurent-epstein-quartet-4/");
});
