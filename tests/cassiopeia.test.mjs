import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/cassiopeia/observation-adapter.mjs";

async function html(name = "events-page.html") {
  return readFile(new URL(`../fixtures/cassiopeia-berlin/${name}`, import.meta.url), "utf8");
}

const ALL_PAGE_FIXTURES = [
  "events-page.html",
  "events-page-2.html",
  "events-page-3.html",
  "events-page-4.html",
  "events-page-5.html",
  "events-page-6.html",
  "events-page-7.html",
  "events-page-8.html",
];

test("extractEventCards: the real retained club page (page 1) yields real cards", async () => {
  const cards = extractEventCards(await html());
  assert.equal(cards.length, 8);
  const szene = cards.find((c) => c.title === "SZENE // SAVE RAW");
  assert.ok(szene);
  assert.equal(szene.date, "2026-08-28");
  assert.equal(szene.time, "19:15");
  assert.equal(szene.eventUrl, "https://cassiopeia-berlin.de/event/szene-save-raw-111685127");
});

test("extractEventCards: decodes HTML entities in titles from a later page", async () => {
  const cards = extractEventCards(await html("events-page-8.html"));
  const band = cards.find((c) => c.eventUrl.endsWith("/matze-rossi-band-111664365"));
  assert.ok(band);
  assert.equal(band.title, "Matze Rossi & Band");
});

test("toObservation: real SZENE // SAVE RAW card adapts correctly, floating-local certainty", async () => {
  const cards = extractEventCards(await html());
  const szene = cards.find((c) => c.title === "SZENE // SAVE RAW");
  const obs = toObservation(szene, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "cassiopeia-berlin");
  assert.equal(obs.source_record_id, "szene-save-raw-111685127");
  assert.equal(obs.start.date, "2026-08-28");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Cassiopeia");
  assert.equal(obs.event_url, "https://cassiopeia-berlin.de/event/szene-save-raw-111685127");
});

test("toObservations batch-adapts real cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});

test("full future-programme harvest: concatenating every retained paginated page yields 61 unique real events", async () => {
  let allCards = [];
  for (const page of ALL_PAGE_FIXTURES) {
    allCards = allCards.concat(extractEventCards(await html(page)));
  }
  assert.equal(allCards.length, 61);
  const urls = allCards.map((c) => c.eventUrl);
  assert.equal(new Set(urls).size, 61, "every harvested event URL must be unique across all pages");

  const observations = toObservations(allCards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, 61);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, 61);

  // Spot-check the earliest and latest events discovered across the full
  // paginated harvest, both real cards from the retained fixtures.
  const first = observations.find((o) => o.source_record_id === "szene-save-raw-111685127");
  assert.ok(first);
  assert.equal(first.start.date, "2026-08-28");

  const last = observations.find((o) => o.source_record_id === "haggefugg-111656484");
  assert.ok(last);
  assert.equal(last.start.date, "2027-04-23");
});
