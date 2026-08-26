import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/badehaus/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/badehaus-berlin/events-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained events page yields many real cards", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length > 50);
  const atlas = cards.find((c) => c.title === "Atlas");
  assert.ok(atlas);
  assert.equal(atlas.date, "2026-09-02");
  assert.equal(atlas.time, "19:00");
  assert.equal(atlas.eventUrl, "https://badehaus-berlin.com/en/events/atlas/");
});

test("toObservation: real Atlas card adapts correctly, floating-local certainty", async () => {
  const cards = extractEventCards(await html());
  const atlas = cards.find((c) => c.title === "Atlas");
  const obs = toObservation(atlas, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "badehaus-berlin");
  assert.equal(obs.source_record_id, "atlas");
  assert.equal(obs.start.date, "2026-09-02");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Badehaus Berlin");
  assert.equal(obs.event_url, "https://badehaus-berlin.com/en/events/atlas/");
});

test("toObservations batch-adapts real cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
