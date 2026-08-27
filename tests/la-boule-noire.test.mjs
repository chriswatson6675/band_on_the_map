import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, extractEventPrice, parseCardDateText } from "../ingestion/la-boule-noire/discovery.mjs";
import { toObservation, toObservations, deriveEuroPriceText } from "../ingestion/la-boule-noire/observation-adapter.mjs";

async function homepageHtml() {
  return readFile(new URL("../fixtures/la-boule-noire-paris/homepage-programmation.html", import.meta.url), "utf8");
}

async function eventHtml() {
  return readFile(new URL("../fixtures/la-boule-noire-paris/event-alexis-muratti.html", import.meta.url), "utf8");
}

test("parseCardDateText: real retained date text parses deterministically", () => {
  const parsed = parseCardDateText("MERCREDI 30 SEPTEMBRE 2026 &#8211; 19H30");
  assert.deepEqual(parsed, { date: "2026-09-30", hour: "19", minute: "30" });
  assert.equal(parseCardDateText("not a date"), null);
});

test("extractEventCards: the real retained homepage yields real cards", async () => {
  const cards = extractEventCards(await homepageHtml());
  assert.ok(cards.length > 5, "expected multiple real event cards");

  const alexis = cards.find((c) => c.slug === "alexis-muratti");
  assert.ok(alexis);
  assert.equal(alexis.title, "ALEXIS MURATTI");
  assert.equal(alexis.eventUrl, "https://laboule-noire.fr/alexis-muratti/");
  assert.deepEqual(alexis.parsedDate, { date: "2026-09-30", hour: "19", minute: "30" });

  const afar = cards.find((c) => c.slug === "afar");
  assert.ok(afar);
  assert.deepEqual(afar.parsedDate, { date: "2026-10-01", hour: "19", minute: "30" });
});

test("extractEventPrice: the real retained Alexis Muratti event page yields its bare numeral", async () => {
  const price = extractEventPrice(await eventHtml());
  assert.equal(price, "20");
});

test("deriveEuroPriceText: DETERMINISTIC_CONTEXT combination of the numeral + this site's own CSS currency rule", () => {
  assert.equal(deriveEuroPriceText("20"), "20 EUR");
  assert.equal(deriveEuroPriceText(null), null);
});

test("toObservation: real Alexis Muratti card + real detail-page price adapts correctly", async () => {
  const cards = extractEventCards(await homepageHtml());
  const alexis = cards.find((c) => c.slug === "alexis-muratti");
  const price = extractEventPrice(await eventHtml());

  const obs = toObservation(alexis, { priceNumber: price, retrievedAt: "2026-08-26T22:40:00Z" });
  assert.equal(obs.source_id, "la-boule-noire-paris");
  assert.equal(obs.source_record_id, "alexis-muratti");
  assert.equal(obs.start.date, "2026-09-30");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "La Boule Noire");
  assert.equal(obs.price_text, "20 EUR");
  assert.equal(obs.event_url, "https://laboule-noire.fr/alexis-muratti/");
});

test("toObservations: batch-adapts real cards; every source_record_id unique; missing price stays null", async () => {
  const cards = extractEventCards(await homepageHtml());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T22:40:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);
  assert.ok(observations.every((o) => o.price_text === null), "no price fetched in this batch call — never fabricated");
});
