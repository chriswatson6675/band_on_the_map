import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseSearchResponse } from "../ingestion/prismic-api/client.mjs";
import { parsePointEphemereEvents } from "../ingestion/point-ephemere/discovery.mjs";
import { deriveStart, toObservation, toObservations } from "../ingestion/point-ephemere/observation-adapter.mjs";

async function body() {
  return readFile(new URL("../fixtures/point-ephemere-paris/prismic-events-sample.json", import.meta.url), "utf8");
}

test("parseSearchResponse: the real retained Prismic response envelope parses correctly", async () => {
  const parsed = parseSearchResponse(await body());
  assert.equal(parsed.documents.length, 5);
  assert.equal(parsed.totalResultsSize, 66);
  assert.equal(parsed.page, 1);
  assert.ok(parsed.nextPage.startsWith("https://pointf.cdn.prismic.io/api/v2/documents/search"));
});

test("parsePointEphemereEvents: real retained event documents map correctly", async () => {
  const records = parsePointEphemereEvents(await body());
  assert.equal(records.length, 5);

  const distraction = records.find((r) => r.uid === "distraction4ever");
  assert.ok(distraction);
  assert.equal(distraction.source_record_id, "akJQmRIAACkAtp-r");
  assert.equal(distraction.title, "distraction4ever + Sad Madona");
  assert.equal(distraction.start_date, "2026-08-27");
  assert.equal(distraction.time_text, "20h");
  assert.equal(distraction.price_text, "10€ / 12€");
  assert.equal(distraction.ticket_url, "https://link.dice.fm/f9f411fba599");
});

test("deriveStart: various real time-text shapes parse to FLOATING_LOCAL local times", () => {
  assert.deepEqual(deriveStart({ start_date: "2026-08-27", time_text: "20h" }).iso, "2026-08-27T20:00:00");
  assert.equal(deriveStart({ start_date: "2026-08-27", time_text: "20h" }).certainty, "FLOATING_LOCAL");

  const withMinutes = deriveStart({ start_date: "2026-08-28", time_text: "22H - 03H" });
  assert.equal(withMinutes.iso, "2026-08-28T22:00:00");
  assert.equal(withMinutes.certainty, "FLOATING_LOCAL");

  const noTime = deriveStart({ start_date: "2026-08-28", time_text: null });
  assert.equal(noTime.date, "2026-08-28");
  assert.equal(noTime.certainty, "DATE_ONLY");

  const nothing = deriveStart({ start_date: null, time_text: null });
  assert.equal(nothing.certainty, "UNKNOWN");
});

test("toObservation: real distraction4ever record adapts correctly", async () => {
  const records = parsePointEphemereEvents(await body());
  const distraction = records.find((r) => r.uid === "distraction4ever");
  const obs = toObservation(distraction, { retrievedAt: "2026-08-26T22:00:00Z" });

  assert.equal(obs.source_id, "point-ephemere-paris");
  assert.equal(obs.source_record_id, "akJQmRIAACkAtp-r");
  assert.equal(obs.title, "distraction4ever + Sad Madona");
  assert.equal(obs.start.date, "2026-08-27");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Point Éphémère");
  assert.equal(obs.price_text, "10€ / 12€");
  assert.equal(obs.event_url, "https://link.dice.fm/f9f411fba599");
});

test("toObservations: batch-adapts every real retained record; every id unique", async () => {
  const records = parsePointEphemereEvents(await body());
  const observations = toObservations(records, { retrievedAt: "2026-08-26T22:00:00Z" });
  assert.equal(observations.length, 5);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);

  // ENTRÉE LIBRE / entrée libre records: real, honestly no fabricated
  // numeric price — price_text is passed through verbatim, never invented.
  const freeEntry = observations.find((o) => o.title === "BABY-B");
  assert.equal(freeEntry.price_text, "ENTRÉE LIBRE");
});
