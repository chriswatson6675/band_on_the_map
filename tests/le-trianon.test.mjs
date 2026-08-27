// Offline, no-network DETERMINISTIC_DERIVATION proof for
// research/source-investigations/le-trianon-paris-01/ — re-parses the
// retained fixture (a real, byte-faithful excerpt of Le Trianon's own
// /en/event/ archive page) through the shared ingestion/wp-evenement-cards/
// family and confirms the exact claimed field values reproduce
// deterministically.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractEventCards, parseCardDateText } from "../ingestion/wp-evenement-cards/discovery.mjs";
import { toObservations } from "../ingestion/wp-evenement-cards/observation-adapter.mjs";

const FIXTURE_PATH = resolve("fixtures/le-trianon-paris/events-page-sample.html");
const SOURCE_ID = "le-trianon-paris";
const VENUE_NAME = "Le Trianon";

test("parseCardDateText parses this theme's English 'Weekday DD Month YYYY' card date", () => {
  assert.equal(parseCardDateText("Sunday 30 August 2026"), "2026-08-30");
  assert.equal(parseCardDateText("Friday 04 September 2026"), "2026-09-04");
  assert.equal(parseCardDateText("not a date"), null);
});

test("extractEventCards finds every well-formed card in the retained fixture", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  assert.equal(cards.length, 4);
  assert.deepEqual(
    cards.map((c) => c.title),
    ["EARTHEATER", "KHAMARI", "YEBBA", "TRANSFERT – LES 10ANS !"],
  );
});

test("extractEventCards reproduces the exact claimed EARTHEATER field values (title/date/id/url/sold-out)", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const eartheater = cards.find((c) => c.title === "EARTHEATER");
  assert.ok(eartheater);
  assert.equal(eartheater.sourceRecordId, "13452");
  assert.equal(eartheater.eventUrl, "https://www.letrianon.fr/en/event/eartheater/");
  assert.equal(eartheater.dateText, "Sunday 30 August 2026");
  assert.equal(eartheater.soldOut, true);
});

test("toObservations builds valid Observations with basis-consistent, non-fabricated fields", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const observations = toObservations(cards, {
    source_id: SOURCE_ID,
    venueName: VENUE_NAME,
    retrievedAt: "2026-08-26T22:37:34.000Z",
    fixturePath: "fixtures/le-trianon-paris/events-page-sample.html",
  });

  assert.equal(observations.length, 4);
  const eartheater = observations.find((o) => o.title === "EARTHEATER");
  assert.equal(eartheater.source_id, SOURCE_ID);
  assert.equal(eartheater.source_record_id, "13452");
  assert.equal(eartheater.venue_name, VENUE_NAME);
  assert.equal(eartheater.start.date, "2026-08-30");
  assert.equal(eartheater.start.certainty, "DATE_ONLY");
  assert.equal(eartheater.end.certainty, "UNKNOWN");
  assert.equal(eartheater.event_url, "https://www.letrianon.fr/en/event/eartheater/");
  assert.equal(eartheater.price_text, null);
  assert.equal(eartheater.source_fields.sold_out, true);
  assert.equal(eartheater.raw_evidence.byte_faithful, true);
});
