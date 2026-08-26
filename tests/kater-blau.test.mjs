import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  deriveDateTimes,
  toObservation,
  toObservations,
} from "../ingestion/kater-blau/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/kater-blau-berlin/homepage.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained homepage yields every real event card", async () => {
  const cards = extractEventCards(await html());
  assert.equal(cards.length, 20);

  const forever25 = cards.find((c) => c.postId === "1777");
  assert.ok(forever25);
  assert.equal(forever25.title, "FOREVER 25 curated by Franca & Mimi Love");
  assert.equal(forever25.dateHeader, "11.09.");
  assert.equal(forever25.rangeText, "Fr. 11.09 22:00 — Mo. 14.09 01:00");
  assert.equal(forever25.ticketUrl, "https://de.ra.co/events/2353106");

  const katergarten = cards.find((c) => c.postId === "1920");
  assert.ok(katergarten);
  assert.equal(katergarten.title, "Katergarten");
  assert.equal(katergarten.ticketUrl, null, "free event with no ticket link");
});

test("deriveDateTimes: day/month/time parse, year never fabricated", () => {
  const { start, end } = deriveDateTimes("Fr. 28.08 22:00 — So. 30.08 10:00");
  assert.equal(start.raw, "Fr. 28.08 22:00 — So. 30.08 10:00");
  assert.equal(start.date, null, "year is genuinely unknown — must never be guessed");
  assert.equal(start.iso, null);
  assert.equal(start.certainty, "TEXT_ONLY");
  assert.equal(end.raw, "Fr. 28.08 22:00 — So. 30.08 10:00");
  assert.equal(end.certainty, "TEXT_ONLY");
});

test("deriveDateTimes: malformed/empty range text degrades honestly, never throws", () => {
  const empty = deriveDateTimes("");
  assert.equal(empty.start.certainty, "UNKNOWN");
  const garbled = deriveDateTimes("not a date range");
  assert.equal(garbled.start.certainty, "TEXT_ONLY");
});

test("toObservation: real FOREVER 25 card adapts correctly, TEXT_ONLY certainty, ticket url kept out of event_url", async () => {
  const cards = extractEventCards(await html());
  const forever25 = cards.find((c) => c.postId === "1777");
  const obs = toObservation(forever25, { retrievedAt: "2026-08-26T20:30:00Z" });
  assert.equal(obs.source_id, "kater-blau-berlin");
  assert.equal(obs.source_record_id, "1777");
  assert.equal(obs.title, "FOREVER 25 curated by Franca & Mimi Love");
  assert.equal(obs.start.certainty, "TEXT_ONLY");
  assert.equal(obs.start.date, null);
  assert.equal(obs.venue_name, "Kater");
  assert.equal(obs.event_url, null, "no first-party per-event detail page exists on this source");
  assert.equal(obs.source_fields.ticket_url, "https://de.ra.co/events/2353106");
  assert.equal(obs.raw_evidence.byte_faithful, true);
});

test("toObservations: batch-adapts every real card; source_record_id uniqueness; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T20:30:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({}), /postId/);
});
