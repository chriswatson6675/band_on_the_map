import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/tresor/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/tresor-berlin/events-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained events page yields the real cards", async () => {
  const cards = extractEventCards(await html());
  assert.equal(cards.length, 17);

  const klubnacht = cards.find((c) => c.sourceRecordId === "20260829-tresor-klubnacht");
  assert.ok(klubnacht);
  assert.equal(klubnacht.title, "Tresor Klubnacht");
  assert.equal(klubnacht.date, "2026-08-29");
  assert.equal(klubnacht.eventUrl, "https://tresorberlin.com/event/20260829-tresor-klubnacht/");

  const buroSiebzig = cards.find((c) => c.sourceRecordId === "20260826-buro-siebzig-tresor-new-faces");
  assert.ok(buroSiebzig);
  assert.equal(buroSiebzig.title, "Büro Siebzig • Tresor New Faces");
  assert.equal(buroSiebzig.date, "2026-08-26");

  // every source_record_id must be unique and derived from the URL's own
  // YYYYMMDD-prefixed permalink slug
  assert.equal(new Set(cards.map((c) => c.sourceRecordId)).size, cards.length);
  for (const card of cards) {
    assert.match(card.sourceRecordId, /^\d{8}-[a-z0-9-]+$/);
  }
});

test("toObservation: real Tresor Klubnacht card adapts correctly, date-only certainty", async () => {
  const cards = extractEventCards(await html());
  const klubnacht = cards.find((c) => c.sourceRecordId === "20260829-tresor-klubnacht");
  const obs = toObservation(klubnacht, { retrievedAt: "2026-08-26T20:30:00Z" });
  assert.equal(obs.source_id, "tresor-berlin");
  assert.equal(obs.source_record_id, "20260829-tresor-klubnacht");
  assert.equal(obs.title, "Tresor Klubnacht");
  assert.equal(obs.start.date, "2026-08-29");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.venue_name, "Tresor Berlin");
  assert.equal(obs.event_url, "https://tresorberlin.com/event/20260829-tresor-klubnacht/");
  assert.equal(obs.raw_evidence.byte_faithful, true);
});

test("toObservations batch-adapts all real cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T20:30:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({}), /eventUrl/);
});
