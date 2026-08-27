// Offline, no-network proof for ingestion/adidas-arena/ — parses the
// retained fixture (a real, disclosed excerpt of
// research/source-investigations/adidas-arena-paris-01/evidence/) and
// deterministically reproduces the claimed field values. This IS the
// DETERMINISTIC_DERIVATION evidence item cited by that investigation's
// evidence[] and field_assessment entries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { extractEventCards, filterMusicEventCards } from "../ingestion/adidas-arena/discovery.mjs";
import { toObservations } from "../ingestion/adidas-arena/observation-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = "fixtures/adidas-arena-paris/programmation.html";
const html = readFileSync(resolve(ROOT, FIXTURE_PATH), "utf8");

test("extractEventCards finds multiple retained cards with their own category", () => {
  const cards = extractEventCards(html);
  assert.ok(cards.length >= 3);
  assert.ok(cards.every((c) => typeof c.category === "string" && c.category.length > 0));
});

test("filterMusicEventCards keeps only category=concert cards", () => {
  const cards = extractEventCards(html);
  const { musicCards, rejectedCards } = filterMusicEventCards(cards);
  assert.ok(musicCards.length > 0);
  assert.ok(musicCards.every((c) => c.category === "concert"));
  assert.ok(rejectedCards.every((c) => c.category !== "concert"));
});

test("toObservations deterministically derives title/date/price/url for Diljit Dosanjh", () => {
  const cards = extractEventCards(html);
  const { musicCards } = filterMusicEventCards(cards);
  const observations = toObservations(musicCards, { retrievedAt: "2026-08-26T00:00:00Z", fixturePath: FIXTURE_PATH });
  const diljit = observations.find((o) => o.source_record_id === "diljit-dosanjh-aura-world-tour--1471");
  assert.ok(diljit);
  assert.equal(diljit.title, "Diljit Dosanjh - Aura World Tour");
  assert.equal(diljit.start.date, "2026-08-28");
  assert.equal(diljit.start.certainty, "FLOATING_LOCAL");
  assert.equal(diljit.start.is_utc, null);
  assert.equal(diljit.price_text, "From 78.5€");
  assert.equal(diljit.event_url, "https://www.adidasarena.com/programmation/diljit-dosanjh-aura-world-tour--1471");
  assert.equal(diljit.venue_name, "adidas arena");
});

test("re-parsing the same fixture is fully deterministic", () => {
  const first = toObservations(filterMusicEventCards(extractEventCards(html)).musicCards, { retrievedAt: "2026-08-26T00:00:00Z" });
  const second = toObservations(filterMusicEventCards(extractEventCards(html)).musicCards, { retrievedAt: "2026-08-26T00:00:00Z" });
  assert.deepEqual(first, second);
});
