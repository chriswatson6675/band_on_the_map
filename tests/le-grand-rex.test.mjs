import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  parseDateText,
  isConcertCard,
  toObservation,
  toObservations,
} from "../ingestion/le-grand-rex/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/le-grand-rex-paris/evenement-listing.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained events page yields many real cards", async () => {
  const cards = extractEventCards(await html());
  assert.equal(cards.length, 48);
  const naruto = cards.find((c) => c.title === "NARUTO SYMPHONIC EXPERIENCE");
  assert.ok(naruto);
  assert.equal(naruto.eventUrl, "https://www.legrandrex.com/evenement/1776");
  assert.equal(naruto.eventId, "1776");
  assert.equal(naruto.dateText, "Le 19 Septembre 2026  à 15:00");
  assert.equal(naruto.isConcert, true);
});

test("parseDateText: single-day date+time, single-day date-only, and multi-day range are all DIRECT_SOURCE parseable", () => {
  assert.deepEqual(parseDateText("Le 19 Septembre 2026  à 15:00"), {
    startDate: "2026-09-19",
    endDate: null,
    time: "15:00",
  });
  assert.deepEqual(parseDateText("Le 19 Septembre 2026"), { startDate: "2026-09-19", endDate: null, time: null });
  assert.deepEqual(parseDateText("Le 2 Octobre 2026  à 20h"), {
    startDate: "2026-10-02",
    endDate: null,
    time: "20:00",
  });
  assert.deepEqual(parseDateText("Du 9 Janvier 2027  au 10 Janvier 2027"), {
    startDate: "2027-01-09",
    endDate: "2027-01-10",
    time: null,
  });
  assert.deepEqual(parseDateText("Du 7 Octobre 2026  au 8 Octobre 2026  à 20:00"), {
    startDate: "2026-10-07",
    endDate: "2026-10-08",
    time: "20:00",
  });
  // Unrecognised shape never guesses a value.
  assert.deepEqual(parseDateText("Bientôt"), { startDate: null, endDate: null, time: null });
});

test("isConcertCard: the literal standalone 'concerts' class token discriminates from the non-discriminating 'concerts-spectacles' compound class", () => {
  assert.equal(isConcertCard("row row-fe row-event tout upcoming concerts grande-salle concerts-spectacles date-2026-09-19"), true);
  assert.equal(isConcertCard("row row-fe row-event tout upcoming spectacles shows conference concerts-spectacles date-2026-10-17"), false);
});

test("toObservation: real NARUTO SYMPHONIC EXPERIENCE card adapts correctly, floating-local certainty", async () => {
  const cards = extractEventCards(await html());
  const naruto = cards.find((c) => c.title === "NARUTO SYMPHONIC EXPERIENCE");
  const obs = toObservation(naruto, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(obs.source_id, "le-grand-rex-paris");
  assert.equal(obs.source_record_id, "1776");
  assert.equal(obs.title, "NARUTO SYMPHONIC EXPERIENCE");
  assert.equal(obs.start.date, "2026-09-19");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.end.date, null);
  assert.equal(obs.venue_name, "Le Grand Rex");
  assert.equal(obs.event_url, "https://www.legrandrex.com/evenement/1776");
  assert.equal(obs.price_text, "De 25€ à 85€");
});

test("toObservation: a real multi-day card carries a distinct PROVEN end date", async () => {
  const cards = extractEventCards(await html());
  const lacDesCygnes = cards.find((c) => c.title === "LE LAC DES CYGNES");
  assert.ok(lacDesCygnes);
  const obs = toObservation(lacDesCygnes, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(obs.start.date, "2027-01-09");
  assert.equal(obs.end.date, "2027-01-10");
});

test("toObservations batch-adapts real cards; every source_record_id is unique; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);
  assert.throws(() => extractEventCards(""), /non-empty/);
});
