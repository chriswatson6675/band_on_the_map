import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/frannz-club/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/frannz-club-berlin/homepage.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained homepage yields many real cards, each with a unique WP post id", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length > 50);
  assert.equal(new Set(cards.map((c) => c.wpPostId)).size, cards.length, "every wpPostId must be unique (highlight-teaser stubs must not be double-counted or cross-matched)");

  const marleneKuntz = cards.find((c) => c.title === "Marlene Kuntz");
  assert.ok(marleneKuntz);
  assert.equal(marleneKuntz.wpPostId, "9922");
  assert.equal(marleneKuntz.dayname, "Donnerstag");
  assert.equal(marleneKuntz.day, "15");
  assert.equal(marleneKuntz.month, "Oktober");
  assert.equal(marleneKuntz.entranceTime, "19:00");
  assert.equal(marleneKuntz.startTime, "20:00");
  assert.equal(marleneKuntz.subtitle, "live!");
  assert.equal(marleneKuntz.location, "Club");
  assert.equal(marleneKuntz.eventTyp, "Konzert");
  assert.equal(
    marleneKuntz.ticketUrl,
    "https://dice.fm/event/8eqg32-marlene-kuntz-suona-il-vile-15th-oct-frannz-club-berlin-tickets",
  );
});

test("extractEventCards: correctly separates an event with no Einlass (door) time from one with a price", async () => {
  const cards = extractEventCards(await html());

  const tannz = cards.find((c) => c.title === "Tannz im Frannz -auf 2 Floors" && c.wpPostId === "9945");
  assert.ok(tannz);
  assert.equal(tannz.entranceTime, null, "this card genuinely has no Einlass field on the source page");
  assert.equal(tannz.startTime, "22:00");
  assert.equal(tannz.location, "Club, Lounge");

  const withPrice = cards.find((c) => c.priceText != null);
  assert.ok(withPrice, "at least one real card must carry an Abendkasse price");
  assert.match(withPrice.priceText, /Abendkasse/);
});

test("extractEventCards: correctly reads the id= post attribute rather than cross-matching an unrelated article's fields", async () => {
  // This exact pairing (WP post id 9944 <-> title "Rock@Frannz") is the
  // adapter's own regression case: id 9944 is genuinely reused twice on
  // the homepage — once as a short "highlight" teaser stub (span-based,
  // no day/month/start-time/h2 fields), and once as the real, full event
  // card. A naive whole-document regex incorrectly paired 9944's id with
  // a much later, unrelated article's title during this adapter's own
  // development; this assertion guards against that regression.
  const cards = extractEventCards(await html());
  const rockAtFrannz = cards.find((c) => c.wpPostId === "9944");
  assert.ok(rockAtFrannz);
  assert.equal(rockAtFrannz.title, "Rock@Frannz");
  assert.equal(rockAtFrannz.dayname, "Freitag");
  assert.equal(rockAtFrannz.day, "28");
  assert.equal(rockAtFrannz.month, "August");
});

test("toObservation: real Marlene Kuntz card adapts correctly, TEXT_ONLY certainty (no year on the source)", async () => {
  const cards = extractEventCards(await html());
  const marleneKuntz = cards.find((c) => c.title === "Marlene Kuntz");
  const obs = toObservation(marleneKuntz, { retrievedAt: "2026-08-26T20:36:00Z", fixturePath: "fixtures/frannz-club-berlin/homepage.html" });

  assert.equal(obs.source_id, "frannz-club-berlin");
  assert.equal(obs.source_record_id, "9922");
  assert.equal(obs.title, "Marlene Kuntz");
  assert.equal(obs.description, "live!");
  assert.equal(obs.start.date, null, "no year is stated anywhere on the source; the date must never be guessed");
  assert.equal(obs.start.certainty, "TEXT_ONLY");
  assert.match(obs.start.raw, /Donnerstag 15\. Oktober/);
  assert.equal(obs.venue_name, "Frannz Club");
  assert.equal(obs.location_text, "Club");
  assert.equal(obs.event_url, null, "no first-party per-event permalink exists on frannz.eu");
  assert.equal(obs.source_fields.wp_post_id, "9922");
  assert.equal(obs.raw_evidence.byte_faithful, true);
});

test("toObservations: batch-adapts real cards; unique source_record_ids; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T20:36:00Z" });

  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");

  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({}), /wpPostId/);
  assert.throws(() => toObservation({ wpPostId: "1" }), /title/);
});
