import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/cafe-de-la-danse-paris/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/cafe-de-la-danse-paris/programmation.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained programmation page yields many real, deduplicated cards", async () => {
  const cards = await html().then(extractEventCards);
  assert.ok(cards.length >= 30, `expected at least 30 cards, got ${cards.length}`);
  assert.equal(new Set(cards.map((c) => c.slug)).size, cards.length, "every card's slug must be unique — the page's own 'Nouvelles dates !' widget re-renders a subset of events and must be deduplicated");

  const foyVance = cards.find((c) => c.slug === "foy-vance");
  assert.ok(foyVance);
  assert.equal(foyVance.title, "FOY VANCE : THE WAKE WORLD TOUR");
  assert.equal(foyVance.date, "2026-09-15");
  assert.equal(foyVance.time, "19:00");
  assert.equal(foyVance.eventUrl, "https://www.cafedeladanse.com/event/foy-vance/");
});

test("extractEventCards: every card resolves a full DIRECT_SOURCE date (day+month+year all stated on the card)", async () => {
  const cards = await html().then(extractEventCards);
  const undated = cards.filter((c) => !c.date);
  assert.equal(undated.length, 0, `expected every card to have a resolvable date, missing: ${JSON.stringify(undated)}`);
});

test("toObservation: real Foy Vance card adapts correctly, floating-local certainty", async () => {
  const cards = await html().then(extractEventCards);
  const foyVance = cards.find((c) => c.slug === "foy-vance");
  const obs = toObservation(foyVance, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "cafe-de-la-danse-paris");
  assert.equal(obs.source_record_id, "foy-vance");
  assert.equal(obs.start.date, "2026-09-15");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Café de la Danse");
  assert.equal(obs.event_url, "https://www.cafedeladanse.com/event/foy-vance/");
  assert.equal(obs.price_text, null);
});

test("toObservations batch-adapts real cards; throws on malformed input", async () => {
  const cards = await html().then(extractEventCards);
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
