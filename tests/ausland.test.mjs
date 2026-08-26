import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/ausland/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/ausland-berlin/program-page.html", import.meta.url), "utf8");
}

test("extractEventCards: real retained program page yields real cards", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length >= 2);
  assert.equal(cards[0].date, "2026-08-20");
  assert.equal(cards[0].time, "10:00");
  assert.match(cards[0].title, /all the rivers residency/);
});

test("toObservation and toObservations adapt real cards correctly", async () => {
  const cards = extractEventCards(await html());
  const obs = toObservation(cards[0], { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "ausland-berlin");
  assert.equal(obs.source_record_id, "all-the-rivers-residency-where-writing-begins-a-dance-begins-too");
  assert.equal(obs.venue_name, "Ausland");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");

  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.throws(() => extractEventCards(""), /non-empty/);
});
