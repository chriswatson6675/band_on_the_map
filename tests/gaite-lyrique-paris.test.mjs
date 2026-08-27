// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — offline, deterministic,
// no-network proof for La Gaîté Lyrique (Paris): a new, small,
// microdata-card parser (ingestion/gaite-lyrique-paris/) reproduces real
// events from one retained "Musique" (concerts-filtered) agenda page
// fixture. See research/source-investigations/gaite-lyrique-paris-01/
// for the governed investigation this is the required
// DETERMINISTIC_DERIVATION offline proof for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, deriveSourceRecordId } from "../ingestion/gaite-lyrique-paris/discovery.mjs";
import { toObservation, toObservations, deriveDateTimeFromMicrodata } from "../ingestion/gaite-lyrique-paris/observation-adapter.mjs";

function fixture() {
  return readFile(new URL("../fixtures/gaite-lyrique-paris/agenda-concerts.html", import.meta.url), "utf8");
}

test("extractEventCards: real 'Musique' agenda page yields 15 concert cards", async () => {
  const html = await fixture();
  const cards = extractEventCards(html);
  assert.equal(cards.length, 15);
  assert.ok(cards.every((c) => typeof c.eventUrl === "string" && c.eventUrl.startsWith("https://www.gaite-lyrique.net/agenda/")));
  assert.ok(cards.every((c) => typeof c.title === "string" && c.title.length > 0));
});

test("extractEventCards: throws on empty input, never on zero matches for well-formed non-matching HTML", () => {
  assert.throws(() => extractEventCards(""));
  assert.deepEqual(extractEventCards("<div>no cards here</div>"), []);
});

test("Wolfgang Voigt présente GAS Live: real card reproduces title/dates/room/category", async () => {
  const html = await fixture();
  const cards = extractEventCards(html);
  const card = cards.find((c) => c.title === "Wolfgang Voigt présente GAS Live");
  assert.ok(card, "expected to find the Wolfgang Voigt card in the retained fixture");

  assert.equal(card.eventUrl, "https://www.gaite-lyrique.net/agenda/2026/wolfang-voigt-1/");
  assert.equal(card.startRaw, "2026-09-23T19:30");
  assert.equal(card.endRaw, "2026-09-23");
  assert.equal(card.room, "Grande Salle");
  assert.deepEqual(card.categories, ["Musique"]);
  assert.equal(deriveSourceRecordId(card), "wolfang-voigt-1");
});

test("deriveDateTimeFromMicrodata: date+time with no offset is FLOATING_LOCAL; date-only is DATE_ONLY", () => {
  const withTime = deriveDateTimeFromMicrodata("2026-09-23T19:30");
  assert.equal(withTime.certainty, "FLOATING_LOCAL");
  assert.equal(withTime.date, "2026-09-23");
  assert.equal(withTime.iso, null, "never upgraded to a UTC instant — no offset was stated");

  const dateOnly = deriveDateTimeFromMicrodata("2026-09-23");
  assert.equal(dateOnly.certainty, "DATE_ONLY");
  assert.equal(dateOnly.date, "2026-09-23");
});

test("toObservation: builds a full Observation with room appended to venue_name", async () => {
  const html = await fixture();
  const cards = extractEventCards(html);
  const card = cards.find((c) => c.title === "Wolfgang Voigt présente GAS Live");

  const observation = toObservation(card, {
    retrievedAt: "2026-08-26T23:05:00Z",
    fixturePath: "fixtures/gaite-lyrique-paris/agenda-concerts.html",
  });

  assert.equal(observation.source_id, "gaite-lyrique-paris");
  assert.equal(observation.source_record_id, "wolfang-voigt-1");
  assert.equal(observation.title, "Wolfgang Voigt présente GAS Live");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.date, "2026-09-23");
  assert.equal(observation.end.certainty, "DATE_ONLY");
  assert.equal(observation.venue_name, "La Gaîté Lyrique (Grande Salle)");
  assert.equal(observation.event_url, "https://www.gaite-lyrique.net/agenda/2026/wolfang-voigt-1/");
  assert.equal(observation.price_text, null);
  assert.equal(observation.raw_evidence.byte_faithful, true);
});

test("toObservations: converts every real card on the page without throwing", async () => {
  const html = await fixture();
  const cards = extractEventCards(html);
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T23:05:00Z" });
  assert.equal(observations.length, 15);
  assert.ok(observations.every((o) => o.source_id === "gaite-lyrique-paris" && o.source_record_id));
});
