import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/glazart/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/glazart-paris/agenda-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained agenda page yields many real cards", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length > 15, `expected >15 cards, got ${cards.length}`);
  const funebrarum = cards.find((c) => c.eventUrl.includes("funebrarum"));
  assert.ok(funebrarum);
  assert.equal(funebrarum.date, "2026-09-15");
  assert.equal(funebrarum.title, "Concert : FUNEBRARUM");
  assert.equal(funebrarum.category, "concert");
  assert.equal(funebrarum.eventUrl, "https://www.glazart.com/15-09-26-concert-funebrarum/");
});

test("extractEventCards: two-digit year is expanded mechanically (20YY), never guessed", async () => {
  const cards = extractEventCards(await html());
  const after = cards.find((c) => c.eventUrl.includes("29-08-26-after-oclock"));
  assert.ok(after);
  assert.equal(after.date, "2026-08-29");
  assert.equal(after.category, "after");
});

test("toObservation: real Funebrarum card adapts correctly, date-only certainty", async () => {
  const cards = extractEventCards(await html());
  const funebrarum = cards.find((c) => c.eventUrl.includes("funebrarum"));
  const obs = toObservation(funebrarum, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "glazart-paris");
  assert.equal(obs.source_record_id, "15-09-26-concert-funebrarum");
  assert.equal(obs.start.date, "2026-09-15");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.venue_name, "Glazart");
  assert.equal(obs.event_url, "https://www.glazart.com/15-09-26-concert-funebrarum/");
  assert.equal(obs.price_text, null);
});

test("toObservations: batch-adapts real cards with unique source_record_id; throws on empty input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
