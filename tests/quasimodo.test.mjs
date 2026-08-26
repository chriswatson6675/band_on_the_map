import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  extractDetailFields,
  decodeSourceEntities,
  toObservation,
  toObservations,
} from "../ingestion/quasimodo/observation-adapter.mjs";

async function listHtml() {
  return readFile(new URL("../fixtures/quasimodo-berlin/events-page.html", import.meta.url), "utf8");
}

async function detailHtml() {
  return readFile(new URL("../fixtures/quasimodo-berlin/event-detail-blues-caravan-3-7229.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained events page yields 29 real cards", async () => {
  const cards = extractEventCards(await listHtml());
  assert.equal(cards.length, 29);
  const blues = cards.find((c) => c.title === "Blues Caravan");
  assert.ok(blues);
  assert.equal(blues.date, "2026-09-25");
  assert.equal(blues.time, "22:00");
  assert.equal(blues.eventUrl, "https://quasimodo.club/en/events/blues-caravan-3-7229");
});

test("extractEventCards: decodes this source's own observed HTML entities in titles", async () => {
  const cards = extractEventCards(await listHtml());
  const marcos = cards.find((c) => c.eventUrl.endsWith("marcos-coll-album-release-concert-7387"));
  assert.ok(marcos);
  assert.equal(marcos.title, "Marcos Coll – Album Release Concert");
  const eb = cards.find((c) => c.eventUrl.endsWith("eb-davis-the-superband-7-7399"));
  assert.ok(eb);
  assert.equal(eb.title, "EB Davis & The Superband");
});

test("decodeSourceEntities: narrow, mechanical decode only for observed entities", () => {
  assert.equal(decodeSourceEntities("A &#8211; B"), "A – B");
  assert.equal(decodeSourceEntities("A &#038; B"), "A & B");
  assert.equal(decodeSourceEntities("plain text"), "plain text");
  assert.equal(decodeSourceEntities("&unknownentity;"), "&unknownentity;");
});

test("extractDetailFields: real Blues Caravan detail page yields start/door-time/price", async () => {
  const fields = extractDetailFields(await detailHtml());
  assert.equal(fields.start, "22:00");
  assert.equal(fields.doorTime, "20:30");
  assert.equal(fields.priceText, "ab 30€ (plus fee)");
});

test("toObservation: real Blues Caravan card adapts correctly, floating-local certainty, no detail enrichment", async () => {
  const cards = extractEventCards(await listHtml());
  const blues = cards.find((c) => c.title === "Blues Caravan");
  const obs = toObservation(blues, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "quasimodo-berlin");
  assert.equal(obs.source_record_id, "blues-caravan-3-7229");
  assert.equal(obs.start.date, "2026-09-25");
  assert.equal(obs.start.raw, "2026-09-25 22:00");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Quasimodo");
  assert.equal(obs.event_url, "https://quasimodo.club/en/events/blues-caravan-3-7229");
  assert.equal(obs.price_text, null);
});

test("toObservation: optional detail-page enrichment adds price_text and door_time, never required", async () => {
  const cards = extractEventCards(await listHtml());
  const blues = cards.find((c) => c.title === "Blues Caravan");
  const detailFields = extractDetailFields(await detailHtml());
  const obs = toObservation(blues, { retrievedAt: "2026-08-26T13:00:00Z", detailFields });
  assert.equal(obs.price_text, "ab 30€ (plus fee)");
  assert.equal(obs.source_fields.door_time, "20:30");
});

test("toObservations: batch-adapts all 29 real cards; every source_record_id unique; throws on malformed input", async () => {
  const cards = extractEventCards(await listHtml());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(observations.length, 29);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractDetailFields(""), /non-empty/);
  assert.throws(() => toObservation({}), /eventUrl/);
});
