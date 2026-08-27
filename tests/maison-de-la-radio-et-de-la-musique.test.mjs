import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, filterMusicCards } from "../ingestion/maison-de-la-radio-et-de-la-musique/discovery.mjs";
import { toObservation, toObservations, parseTimeText } from "../ingestion/maison-de-la-radio-et-de-la-musique/observation-adapter.mjs";

async function agendaHtml() {
  return readFile(new URL("../fixtures/maison-de-la-radio-et-de-la-musique-paris/agenda-raw.html", import.meta.url), "utf8");
}
async function detailHtml() {
  return readFile(new URL("../fixtures/maison-de-la-radio-et-de-la-musique-paris/event-detail-fontaines-dc-raw.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained /agenda fixture yields real cards", async () => {
  const cards = extractEventCards(await agendaHtml());
  assert.equal(cards.length, 12);

  const fontaines = cards.find((c) => c.sourceRecordId === "1513800");
  assert.ok(fontaines);
  assert.equal(fontaines.title, "Concert de Fontaines DC");
  assert.equal(fontaines.date, "2026-09-02");
  assert.equal(fontaines.weekday, "Mercredi");
  assert.equal(fontaines.time, "20h30");
  assert.equal(fontaines.location, "Bal Chavaux");
  assert.equal(fontaines.eventType, "Concert");
  assert.equal(fontaines.eventUrl, "/evenement/concert-de-fontaines-dc?s=1513800");
  assert.equal(fontaines.isFree, false);
});

test("extractEventCards: a free event ('Gratuit') is detected directly, never fabricated for others", async () => {
  const cards = extractEventCards(await agendaHtml());
  const masque = cards.find((c) => c.sourceRecordId === "1474830");
  assert.ok(masque);
  assert.equal(masque.isFree, true);

  const bigBang = cards.find((c) => c.sourceRecordId === "1507944");
  assert.ok(bigBang);
  assert.equal(bigBang.isFree, false);
});

test("extractEventCards: off-site tour dates keep their OWN real location, never overwritten with the main venue", async () => {
  const cards = extractEventCards(await agendaHtml());
  const laon = cards.find((c) => c.sourceRecordId === "1382612");
  assert.ok(laon);
  assert.equal(laon.title, "Tournée du Philhar : Laon");
  assert.equal(laon.location, "Cathédrale de Laon");

  const london = cards.find((c) => c.sourceRecordId === "1382599");
  assert.ok(london);
  assert.equal(london.location, "Royal Albert Hall, Londres");
});

test("filterMusicCards: selects only the source's own 'Concert' category, rejecting broadcasts/masterclasses", async () => {
  const cards = extractEventCards(await agendaHtml());
  const { musicCards, rejectedCards } = filterMusicCards(cards);
  assert.equal(musicCards.length, 5);
  assert.equal(rejectedCards.length, 7);
  assert.ok(musicCards.every((c) => c.eventType === "Concert"));
  assert.ok(rejectedCards.every((c) => c.eventType !== "Concert"));
});

test("parseTimeText: converts this source's own 'HHhMM' text; null for anything else", () => {
  assert.equal(parseTimeText("20h30"), "20:30");
  assert.equal(parseTimeText("09h00"), "09:00");
  assert.equal(parseTimeText(null), null);
  assert.equal(parseTimeText("TBC"), null);
});

test("toObservation: Concert de Fontaines DC adapts correctly, FLOATING_LOCAL certainty, venue_name from the card's own location", async () => {
  const cards = extractEventCards(await agendaHtml());
  const fontaines = cards.find((c) => c.sourceRecordId === "1513800");
  const obs = toObservation(fontaines, { retrievedAt: "2026-08-27T09:00:00Z" });

  assert.equal(obs.source_id, "maison-de-la-radio-et-de-la-musique-paris");
  assert.equal(obs.source_record_id, "1513800");
  assert.equal(obs.title, "Concert de Fontaines DC");
  assert.equal(obs.start.date, "2026-09-02");
  assert.equal(obs.start.raw, "2026-09-02 20h30");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Bal Chavaux");
  assert.equal(obs.event_url, "https://www.maisondelaradioetdelamusique.fr/evenement/concert-de-fontaines-dc?s=1513800");
  assert.equal(obs.price_text, null);
});

test("toObservation: a 'Gratuit' card's price_text is honestly 'Gratuit', never a fabricated amount", async () => {
  const cards = extractEventCards(await agendaHtml());
  const masque = cards.find((c) => c.sourceRecordId === "1474830");
  const obs = toObservation(masque, { retrievedAt: "2026-08-27T09:00:00Z" });
  assert.equal(obs.price_text, "Gratuit");
});

test("toObservation: a card with no time text stays DATE_ONLY, never a fabricated time", async () => {
  const cards = extractEventCards(await agendaHtml());
  const nancy = cards.find((c) => c.sourceRecordId === "1502264");
  assert.ok(nancy);
  assert.equal(nancy.time, null);
  const obs = toObservation(nancy, { retrievedAt: "2026-08-27T09:00:00Z" });
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.start.raw, "2026-09-11");
});

test("toObservations: batch-adapts every real card with unique source_record_ids", async () => {
  const cards = extractEventCards(await agendaHtml());
  const observations = toObservations(cards, { retrievedAt: "2026-08-27T09:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractEventCards(""), /non-empty/);
});

test("DOCUMENTED DATA-QUALITY FINDING: the per-event 'MusicEvent' JSON-LD startDate genuinely disagrees with the corroborated list-card time — this is why this adapter never consumes that JSON-LD block", async () => {
  const html = await detailHtml();
  const eventBlockMatch = /"@type":\s*"Event"[\s\S]*?"startDate":\s*"([^"]+)"/.exec(html);
  const musicEventBlockMatch = /"@type":\s*"MusicEvent"[\s\S]*?"startDate":\s*"([^"]+)"/.exec(html);
  assert.ok(eventBlockMatch, "expected a generic Event JSON-LD block with its own startDate");
  assert.ok(musicEventBlockMatch, "expected a MusicEvent JSON-LD block with its own startDate");

  // The 'Event' block's own text startDate corroborates the list card (20:30)...
  assert.match(eventBlockMatch[1], /20:30/);
  // ...while the 'MusicEvent' block's own ISO startDate disagrees (14:00) —
  // a real, retained inconsistency, not a transcription error.
  assert.match(musicEventBlockMatch[1], /^2026-09-02T14:00:00/);
});
