import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards } from "../ingestion/la-machine-du-moulin-rouge/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/la-machine-du-moulin-rouge/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/la-machine-du-moulin-rouge-paris/agenda-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained agenda page yields many real cards", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length > 30, `expected >30 cards, got ${cards.length}`);
  const chronologic = cards.find((c) => c.eventUrl.endsWith("/chronologic-2/"));
  assert.ok(chronologic);
  assert.equal(chronologic.title, "Chronologic");
  assert.equal(chronologic.isoDatetime, "2026-08-28T23:59:00+00:00");
  assert.deepEqual(chronologic.rooms, ["Central"]);
});

test("toObservation: real Chronologic card adapts correctly, FLOATING_LOCAL certainty (never UTC_INSTANT)", async () => {
  const cards = extractEventCards(await html());
  const chronologic = cards.find((c) => c.eventUrl.endsWith("/chronologic-2/"));
  const obs = toObservation(chronologic, { retrievedAt: "2026-08-26T13:38:00Z" });
  assert.equal(obs.source_id, "la-machine-du-moulin-rouge-paris");
  assert.equal(obs.source_record_id, "chronologic-2");
  assert.equal(obs.start.date, "2026-08-28");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.is_utc, false);
  assert.equal(obs.start.iso, null, "the source's own '+00:00' suffix must never be trusted as a real UTC instant");
  assert.equal(obs.venue_name, "La Machine du Moulin Rouge");
  assert.equal(obs.location_text, "Central, 90 Boulevard de Clichy, 75018 Paris");
  assert.equal(obs.event_url, chronologic.eventUrl);
});

test("toObservations batch-adapts real cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:38:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
