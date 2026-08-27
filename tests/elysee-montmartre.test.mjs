// Offline, no-network DETERMINISTIC_DERIVATION proof for
// research/source-investigations/elysee-montmartre-paris-01/ — re-parses
// the retained fixture (a real, byte-faithful excerpt of Élysée
// Montmartre's own /fr/programmation/ archive page) through the SAME
// shared ingestion/wp-evenement-cards/ family Le Trianon uses (see
// tests/le-trianon.test.mjs), confirming the shared parser handles the
// French-locale variant of this shared theme's card date text.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractEventCards, parseCardDateText } from "../ingestion/wp-evenement-cards/discovery.mjs";
import { toObservations } from "../ingestion/wp-evenement-cards/observation-adapter.mjs";

const FIXTURE_PATH = resolve("fixtures/elysee-montmartre-paris/events-page-sample.html");
const SOURCE_ID = "elysee-montmartre-paris";
const VENUE_NAME = "Élysée Montmartre";

test("parseCardDateText parses this theme's French 'weekday DD month YYYY' card date", () => {
  assert.equal(parseCardDateText("mardi 01 septembre 2026"), "2026-09-01");
  assert.equal(parseCardDateText("dimanche 06 septembre 2026"), "2026-09-06");
});

test("extractEventCards finds every well-formed card in the retained fixture", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  assert.equal(cards.length, 4);
  assert.deepEqual(
    cards.map((c) => c.title),
    ["CURRENT JOYS", "EARL SWEATSHIRT & MIKE", "ZEYNE", "THE DRESDEN DOLLS"],
  );
});

test("extractEventCards reproduces the exact claimed CURRENT JOYS field values (title/date/id/url)", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const currentJoys = cards.find((c) => c.title === "CURRENT JOYS");
  assert.ok(currentJoys);
  assert.equal(currentJoys.sourceRecordId, "8341");
  assert.equal(currentJoys.eventUrl, "https://www.elyseemontmartre.com/fr/programmation/current-joys/");
  assert.equal(currentJoys.dateText, "mardi 01 septembre 2026");
  assert.equal(currentJoys.soldOut, false);
});

test("toObservations builds valid Observations with basis-consistent, non-fabricated fields", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const observations = toObservations(cards, {
    source_id: SOURCE_ID,
    venueName: VENUE_NAME,
    retrievedAt: "2026-08-26T23:00:00.000Z",
    fixturePath: "fixtures/elysee-montmartre-paris/events-page-sample.html",
  });

  assert.equal(observations.length, 4);
  const currentJoys = observations.find((o) => o.title === "CURRENT JOYS");
  assert.equal(currentJoys.source_id, SOURCE_ID);
  assert.equal(currentJoys.source_record_id, "8341");
  assert.equal(currentJoys.venue_name, VENUE_NAME);
  assert.equal(currentJoys.start.date, "2026-09-01");
  assert.equal(currentJoys.start.certainty, "DATE_ONLY");
  assert.equal(currentJoys.event_url, "https://www.elyseemontmartre.com/fr/programmation/current-joys/");
  assert.equal(currentJoys.price_text, null);
  assert.equal(currentJoys.raw_evidence.byte_faithful, true);
});
