import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/admiralspalast/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/admiralspalast-berlin/events-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained events-overview page yields many real cards", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length > 100);
  const cemAdrian = cards.find((c) => c.title === "Cem Adrian");
  assert.ok(cemAdrian);
  assert.equal(cemAdrian.date, "2026-11-01");
  assert.equal(cemAdrian.eventUrl, "https://www.admiralspalast.theater/veranstaltung/cem-adrian.html");
});

test("toObservation: real Cem Adrian card adapts correctly, date-only certainty", async () => {
  const cards = extractEventCards(await html());
  const cemAdrian = cards.find((c) => c.title === "Cem Adrian");
  const obs = toObservation(cemAdrian, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "admiralspalast-berlin");
  assert.equal(obs.source_record_id, "cem-adrian");
  assert.equal(obs.start.date, "2026-11-01");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.venue_name, "Admiralspalast Berlin");
  assert.equal(obs.event_url, "https://www.admiralspalast.theater/veranstaltung/cem-adrian.html");
});

test("toObservations batch-adapts real cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
