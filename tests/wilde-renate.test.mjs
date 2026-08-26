import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/wilde-renate/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/wilde-renate-berlin/homepage.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained homepage accordion yields 18 real event rows", async () => {
  const cards = extractEventCards(await html());
  assert.equal(cards.length, 18);

  const birthday = cards.find((c) => c.title === "13 YRS Rebellion der Träumer*");
  assert.ok(birthday, "expected the '13 YRS Rebellion der Träumer*' row to be extracted");
  assert.equal(birthday.day, "Fri.");
  assert.equal(birthday.date, "16.10."); // no year stated by the source — never fabricated
  assert.equal(birthday.ticketUrl, "https://de.ra.co/events/2355667");
  assert.equal(birthday.raEventId, "2355667");

  const gardenRow = cards.find((c) => c.title.startsWith("Renate Klubnacht + Open Air (Free Entry) w/ S3XI"));
  assert.ok(gardenRow);
  assert.deepEqual(gardenRow.rooms, ["GARDEN", "GREEN", "BLACK", "RED"]);
});

test("extractEventCards: entity decoding is correct on real rows", async () => {
  const cards = extractEventCards(await html());
  const anniversary = cards.find((c) => c.title.startsWith("19 Years Renate"));
  assert.ok(anniversary);
  assert.equal(anniversary.title, "19 Years Renate – 7 Floors – 66 Hours Birthday Party");

  const spookhouse = cards.find((c) => c.title.includes("Spookhouse"));
  assert.ok(spookhouse);
  assert.equal(spookhouse.title, "Antina’s Spookhouse by Antina Christ");
});

test("extractEventCards: two rows genuinely sharing one RA ticket link get disambiguated dedupeIds", async () => {
  const cards = extractEventCards(await html());
  const sat15 = cards.filter((c) => c.raEventId === "2485799");
  assert.equal(sat15.length, 2, "15.08. has a main Klubnacht row and a companion Garden row sharing one RA link");
  assert.equal(sat15[0].dedupeId, "2485799");
  assert.equal(sat15[1].dedupeId, "2485799-2");
});

test("toObservation: real 'Träumer' card adapts correctly, TEXT_ONLY date certainty, no fabricated year", async () => {
  const cards = extractEventCards(await html());
  const birthday = cards.find((c) => c.title === "13 YRS Rebellion der Träumer*");
  const obs = toObservation(birthday, { retrievedAt: "2026-08-26T20:31:00Z" });

  assert.equal(obs.source_id, "wilde-renate-berlin");
  assert.equal(obs.source_record_id, "2355667");
  assert.equal(obs.start.raw, "Fri. 16.10.");
  assert.equal(obs.start.date, null, "no year is stated by the source — must never be invented");
  assert.equal(obs.start.certainty, "TEXT_ONLY");
  assert.equal(obs.venue_name, "Wilde Renate / Salon zur wilden Renate");
  assert.equal(obs.event_url, null, "no first-party detail page exists on this source");
  assert.equal(obs.source_fields.ticket_url, "https://de.ra.co/events/2355667");
});

test("toObservations: batch-adapts all 18 real rows with unique source_record_id; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T20:31:00Z" });
  assert.equal(observations.length, 18);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique within one extraction batch",
  );
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractEventCards("<html><body>no accordion here</body></html>"), /program-accordion/);
});
