import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards } from "../ingestion/le-trabendo/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/le-trabendo/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/le-trabendo-paris/programmation-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained programmation page yields many real cards", async () => {
  const cards = extractEventCards(await html());
  // This page renders every real event TWICE (main grid + a server-rendered
  // "Votre sélection" filter-section duplicate) — extractEventCards
  // de-duplicates by event URL, so this asserts the real distinct count.
  assert.ok(cards.length > 50, `expected >50 distinct cards, got ${cards.length}`);
  const spectrum = cards.find((c) => c.title === "Spectrum Waves");
  assert.ok(spectrum);
  assert.equal(spectrum.date, "2026-09-05");
  assert.equal(spectrum.eventUrl, "https://www.letrabendo.net/programmation/spectrum-waves/");
});

test("toObservation: real Spectrum Waves card adapts correctly, date-only certainty", async () => {
  const cards = extractEventCards(await html());
  const spectrum = cards.find((c) => c.title === "Spectrum Waves");
  const obs = toObservation(spectrum, { retrievedAt: "2026-08-26T13:38:00Z" });
  assert.equal(obs.source_id, "le-trabendo-paris");
  assert.equal(obs.source_record_id, "spectrum-waves");
  assert.equal(obs.start.date, "2026-09-05");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.venue_name, "Le Trabendo");
  assert.equal(obs.location_text, "211 Avenue Jean Jaurès, 75019 Paris (Parc de la Villette)");
  assert.equal(obs.event_url, "https://www.letrabendo.net/programmation/spectrum-waves/");
  assert.equal(obs.price_text, null);
});

test("toObservations batch-adapts real cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:38:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
