import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  deriveCardDate,
  extractEventCards,
  extractDetailFields,
  toObservation,
  toObservations,
} from "../ingestion/la-bellevilloise/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/la-bellevilloise-paris/${name}`, import.meta.url), "utf8");
}

test("deriveCardDate: combines data-categories YYYY-MM with the card's own day (DETERMINISTIC_CONTEXT)", () => {
  assert.equal(deriveCardDate("concert;club;2026-09", "Jeu 10 septembre"), "2026-09-10");
  assert.equal(deriveCardDate("concert;club;2026-10", "Sam 10 octobre"), "2026-10-10");
});

test("deriveCardDate: refuses to guess when the card's own two fields disagree or are absent", () => {
  assert.equal(deriveCardDate("concert;club;2026-09", "Sam 10 octobre"), null, "month name disagrees with data-categories's own month");
  assert.equal(deriveCardDate("concert;club", "Jeu 10 septembre"), null, "no YYYY-MM tag present");
});

test("extractEventCards: the real retained agenda page yields many real cards, every date deterministically resolved", async () => {
  const cards = extractEventCards(await fixture("agenda-page.html"));
  assert.ok(cards.length > 40, `expected >40 cards, got ${cards.length}`);
  const polica = cards.find((c) => c.eventUrl.endsWith("/evenement/polica/"));
  assert.ok(polica);
  assert.equal(polica.date, "2026-09-02");
  assert.equal(polica.title, "Poliça");
  assert.ok(polica.categories.includes("concert"));

  const symptomes = cards.find((c) => c.eventUrl.endsWith("/evenement/symptomes-negatifs/"));
  assert.ok(symptomes);
  assert.equal(symptomes.date, "2026-09-10");
});

test("extractDetailFields: real Poliça detail page yields its own explicit start/end time", async () => {
  const fields = extractDetailFields(await fixture("event-detail-polica.html"));
  assert.equal(fields.startTime, "20:00");
  assert.equal(fields.endTime, "22:00");
  assert.equal(fields.priceText, null, "this sampled event's own detail page states no explicit price");
});

test("extractDetailFields: real Symptômes Négatifs detail page yields its own time AND starting price", async () => {
  const fields = extractDetailFields(await fixture("event-detail-symptomes-negatifs.html"));
  assert.equal(fields.startTime, "19:00");
  assert.equal(fields.endTime, "00:30");
  assert.equal(fields.priceText, "À partir de  13€");
});

test("toObservation: real Poliça card+detail adapts correctly, floating-local certainty", async () => {
  const cards = extractEventCards(await fixture("agenda-page.html"));
  const polica = cards.find((c) => c.eventUrl.endsWith("/evenement/polica/"));
  const detail = extractDetailFields(await fixture("event-detail-polica.html"));
  const obs = toObservation(polica, { retrievedAt: "2026-08-26T13:00:00Z", detail });
  assert.equal(obs.source_id, "la-bellevilloise-paris");
  assert.equal(obs.source_record_id, "polica");
  assert.equal(obs.start.date, "2026-09-02");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.raw, "2026-09-02 20:00");
  assert.equal(obs.venue_name, "La Bellevilloise");
  assert.equal(obs.event_url, "https://labellevilloise.com/evenement/polica/");
});

test("toObservations: batch-adapts real cards with unique source_record_id; throws on empty input", async () => {
  const cards = extractEventCards(await fixture("agenda-page.html"));
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
});
