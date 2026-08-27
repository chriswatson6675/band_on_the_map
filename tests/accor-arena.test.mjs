// Offline, no-network proof for ingestion/accor-arena/ — parses the
// retained fixture (a real, disclosed excerpt of
// research/source-investigations/accor-arena-paris-01/evidence/) and
// deterministically reproduces the claimed field values. This IS the
// DETERMINISTIC_DERIVATION evidence item cited by that investigation's
// evidence[] and field_assessment entries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { extractEventCards, filterMusicEventCards } from "../ingestion/accor-arena/discovery.mjs";
import { toObservations } from "../ingestion/accor-arena/observation-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = "fixtures/accor-arena-paris/events-and-tickets-cards.html";
const html = readFileSync(resolve(ROOT, FIXTURE_PATH), "utf8");

test("extractEventCards finds all 6 retained cards", () => {
  const cards = extractEventCards(html);
  assert.equal(cards.length, 6);
});

test("filterMusicEventCards excludes the two sports fixtures", () => {
  const cards = extractEventCards(html);
  const { musicCards, rejectedCards } = filterMusicEventCards(cards);
  assert.equal(rejectedCards.length, 2);
  assert.equal(musicCards.length, 4);
  assert.ok(rejectedCards.some((c) => /basketball/i.test(c.title)));
  assert.ok(rejectedCards.some((c) => /ufc/i.test(c.title)));
  assert.ok(!musicCards.some((c) => /basketball|ufc/i.test(c.title)));
});

test("toObservations deterministically derives title/date/price/url for KATSEYE", () => {
  const cards = extractEventCards(html);
  const { musicCards } = filterMusicEventCards(cards);
  const observations = toObservations(musicCards, { retrievedAt: "2026-08-26T00:00:00Z", fixturePath: FIXTURE_PATH });
  const katseye = observations.find((o) => o.source_record_id === "katseye-the-wildworld-tour--e0745");
  assert.ok(katseye);
  assert.equal(katseye.title, "KATSEYE - THE WILDWORLD TOUR");
  assert.equal(katseye.start.date, "2026-09-09");
  assert.equal(katseye.start.certainty, "DATE_ONLY");
  assert.equal(katseye.start.is_utc, null);
  assert.equal(katseye.event_url, "https://www.accorarena.com/en/events-and-tickets/katseye-the-wildworld-tour--e0745");
  assert.equal(katseye.venue_name, "Accor Arena");
  assert.equal(katseye.price_text, null); // this card shows no "From : €X" price (sold out)
});

test("toObservations preserves a real retained price where the source shows one", () => {
  const cards = extractEventCards(html);
  const { musicCards } = filterMusicEventCards(cards);
  const observations = toObservations(musicCards, { retrievedAt: "2026-08-26T00:00:00Z" });
  const lauryn = observations.find((o) => o.source_record_id === "lauryn-hill--cfdda");
  assert.ok(lauryn);
  assert.equal(lauryn.title, "LAURYN HILL");
  assert.equal(lauryn.start.date, "2026-09-02");
  assert.equal(lauryn.price_text, "From €73.00");
});

test("re-parsing the same fixture is fully deterministic", () => {
  const first = toObservations(filterMusicEventCards(extractEventCards(html)).musicCards, { retrievedAt: "2026-08-26T00:00:00Z" });
  const second = toObservations(filterMusicEventCards(extractEventCards(html)).musicCards, { retrievedAt: "2026-08-26T00:00:00Z" });
  assert.deepEqual(first, second);
});
