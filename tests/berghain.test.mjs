import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  extractDetailStartInstant,
  toObservation,
  toObservations,
} from "../ingestion/berghain/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/berghain-berlin/${name}`, import.meta.url), "utf8");
}

test("extractEventCards: the real retained program page yields real cards", async () => {
  const cards = extractEventCards(await fixture("program-page.html"));
  assert.ok(cards.length >= 14);
  const keyi = cards.find((c) => c.permalinkId === "80841");
  assert.ok(keyi);
  assert.equal(keyi.title, "KEYI Magazine");
  assert.equal(keyi.date, "2026-08-27");
  assert.equal(keyi.time, "22:00");
  assert.equal(keyi.room, "Säule");
  assert.equal(keyi.eventUrl, "https://www.berghain.berlin/en/event/80841/");
});

test("extractEventCards: handles cards with a separate 'doors' time before 'start'", async () => {
  const cards = extractEventCards(await fixture("kantine-program-page.html"));
  assert.ok(cards.length >= 50);
  const kenny = cards.find((c) => c.permalinkId === "82397");
  assert.ok(kenny);
  assert.equal(kenny.title, "Kenny Mason");
  assert.equal(kenny.date, "2026-09-02");
  assert.equal(kenny.time, "20:00");
  assert.equal(kenny.room, "Kantine am Berghain");
});

test("extractEventCards: real second program-page pagination fragment ('?page=2') also parses", async () => {
  const cards = extractEventCards(await fixture("program-page-2.html"));
  assert.ok(cards.length >= 1);
  const krallice = cards.find((c) => c.permalinkId === "82270");
  assert.ok(krallice);
  assert.equal(krallice.title, "Krallice");
});

test("extractDetailStartInstant: real detail page exposes the exact UTC-offset instant", async () => {
  const instant = extractDetailStartInstant(await fixture("event-detail.html"));
  assert.equal(instant, "2026-08-27T22:00:00+02:00");
});

test("extractDetailStartInstant: a genuine anomalous event with no running-order sets yields null, never a fabricated instant", async () => {
  const instant = extractDetailStartInstant(await fixture("event-detail-error-82435.html"));
  assert.equal(instant, null);
});

test("extractDetailStartInstant: a normal, non-anomalous event whose running order has no set times yet also yields null", async () => {
  // A real, retained finding from harvesting the full live programme: only
  // the imminent event(s) had a data-set-item-start attribute at all — 75
  // of 76 real detail pages fetched had a genuine running order (artist
  // names, floors) but NO per-set start/end timestamps published yet.
  // "Love On The Rocks" (2026-08-28, Panorama Bar) is a real, ordinary
  // example of that far-more-common shape.
  const instant = extractDetailStartInstant(await fixture("event-detail-no-precise-time.html"));
  assert.equal(instant, null);
});

test("toObservation: real KEYI Magazine card + detail instant adapts to a precise UTC instant", async () => {
  const cards = extractEventCards(await fixture("program-page.html"));
  const keyi = cards.find((c) => c.permalinkId === "80841");
  const detailInstant = extractDetailStartInstant(await fixture("event-detail.html"));

  const obs = toObservation(keyi, { detailStartInstant: detailInstant, retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(obs.source_id, "berghain-berlin");
  assert.equal(obs.source_record_id, "80841");
  assert.equal(obs.title, "KEYI Magazine");
  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.start.is_utc, true);
  // 22:00 CEST (+02:00) on 2026-08-27 is 20:00 UTC.
  assert.equal(obs.start.iso, "2026-08-27T20:00:00.000Z");
  assert.equal(obs.start.date, "2026-08-27");
  assert.equal(obs.end.certainty, "UNKNOWN");
  assert.equal(obs.venue_name, "Berghain");
  assert.equal(obs.location_text, "Säule");
  assert.equal(obs.event_url, "https://www.berghain.berlin/en/event/80841/");
});

test("toObservation: card with no detail instant falls back to FLOATING_LOCAL, never fabricates a UTC instant", async () => {
  const cards = extractEventCards(await fixture("kantine-program-page.html"));
  const kenny = cards.find((c) => c.permalinkId === "82397");

  const obs = toObservation(kenny, { retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.is_utc, null);
  assert.equal(obs.start.iso, null);
  assert.equal(obs.start.date, "2026-09-02");
});

test("toObservation: real 'Love On The Rocks' card + its real (timeless) detail page also falls back honestly", async () => {
  const cards = extractEventCards(await fixture("program-page.html"));
  const loveOnTheRocks = cards.find((c) => c.permalinkId === "80790");
  assert.ok(loveOnTheRocks);
  const detailInstant = extractDetailStartInstant(await fixture("event-detail-no-precise-time.html"));
  assert.equal(detailInstant, null);

  const obs = toObservation(loveOnTheRocks, { detailStartInstant: detailInstant, retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.raw, "2026-08-28 22:00");
  assert.equal(obs.start.date, "2026-08-28");
  assert.equal(obs.location_text, "Panorama Bar");
});

test("toObservations: batch-adapts real cards from both program pages; throws on malformed input", async () => {
  const mainCards = extractEventCards(await fixture("program-page.html"));
  const observations = toObservations(mainCards, {}, { retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(observations.length, mainCards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique"
  );

  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractDetailStartInstant(""), /non-empty/);
  assert.throws(() => toObservation({}), /permalinkId/);
});
