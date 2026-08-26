import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/urban-spree/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/urban-spree-berlin/program-page.html", import.meta.url), "utf8");
}

test("extractEventCards: real retained program page yields real cards with date/time/price", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length >= 5);
  const first = cards[0];
  assert.equal(first.date, "2027-04-23");
  assert.equal(first.time, "20:00:00");
  assert.equal(first.title, "Pure Obsessions & Red Nights + Nico Amara…");
  assert.equal(first.priceText, "17.00€");
});

test("toObservation: adapts correctly with floating-local certainty and EUR price", async () => {
  const cards = extractEventCards(await html());
  const obs = toObservation(cards[0], { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "urban-spree-berlin");
  assert.equal(obs.source_record_id, "pure-obsessions-and-red-nights-nico-amara-urban-spree-berlin");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.price_text, "17.00€");
  assert.equal(obs.venue_name, "Urban Spree");
});

test("toObservations batch-adapts every real card; throws on empty input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.throws(() => extractEventCards(""), /non-empty/);
});
