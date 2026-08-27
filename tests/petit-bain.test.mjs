// Offline, no-network DETERMINISTIC_DERIVATION proof for
// research/source-investigations/petit-bain-paris-01/ — re-parses the
// retained fixture (a real, byte-faithful excerpt of Petit Bain's own
// /agenda/ page, covering both of this theme's card sub-templates: a
// "concert" card with support acts and a "soirée/club" card) through the
// bespoke ingestion/petit-bain-paris/ collector and confirms the exact
// claimed field values reproduce deterministically.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractEventCards, parseCardDateText } from "../ingestion/petit-bain-paris/discovery.mjs";
import { toObservations } from "../ingestion/petit-bain-paris/observation-adapter.mjs";

const FIXTURE_PATH = resolve("fixtures/petit-bain-paris/agenda-page-sample.html");

test("parseCardDateText parses this theme's own 'weekday day month' (NO year) card date text", () => {
  assert.deepEqual(parseCardDateText("mar 20 octobre"), { day: 20, month: 10 });
  assert.deepEqual(parseCardDateText("jeu 03 septembre"), { day: 3, month: 9 });
  assert.equal(parseCardDateText("not a date"), null);
  assert.equal(parseCardDateText(null), null);
});

test("extractEventCards finds every well-formed card in the retained fixture, both sub-templates", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  assert.equal(cards.length, 3);
  assert.deepEqual(
    cards.map((c) => c.title),
    ["Chrysalide : Indian Summer Party", "Lüma-G", "Boris"],
  );
});

test("extractEventCards reproduces the exact claimed field values for a concert card with support acts", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const boris = cards.find((c) => c.title === "Boris");
  assert.ok(boris);
  assert.equal(boris.sourceRecordId, "10537");
  assert.equal(boris.eventUrl, "https://petitbain.org/evenement/boris/");
  assert.equal(boris.dateText, "mar 20 octobre");
  assert.deepEqual(boris.supportActs, ["Planning for Burial"]);
  assert.equal(boris.soldOut, true);
});

test("extractEventCards reproduces the exact claimed field values for a soirée/club card (nomsoiree template)", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const chrysalide = cards.find((c) => c.sourceRecordId === "10954");
  assert.ok(chrysalide);
  assert.equal(chrysalide.title, "Chrysalide : Indian Summer Party");
  assert.equal(chrysalide.eventUrl, "https://petitbain.org/evenement/chrysalide/");
  assert.equal(chrysalide.dateText, "jeu 03 septembre");
  assert.deepEqual(chrysalide.supportActs, []);
  assert.equal(chrysalide.soldOut, false);
});

test("toObservations builds valid Observations that never fabricate a year — start.date stays null, certainty TEXT_ONLY", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const cards = extractEventCards(html);
  const observations = toObservations(cards, {
    retrievedAt: "2026-08-26T22:00:00.000Z",
    fixturePath: "fixtures/petit-bain-paris/agenda-page-sample.html",
  });

  assert.equal(observations.length, 3);
  const boris = observations.find((o) => o.title === "Boris");
  assert.equal(boris.source_id, "petit-bain-paris");
  assert.equal(boris.source_record_id, "10537");
  assert.equal(boris.venue_name, "Petit Bain");
  assert.equal(boris.location_text, "7 Port de la Gare, 75013 Paris");
  assert.equal(boris.event_url, "https://petitbain.org/evenement/boris/");
  assert.equal(boris.description, "with Planning for Burial");
  assert.equal(boris.price_text, null);

  // The critical, deliberate non-fabrication: this source never states a
  // year anywhere, so `start.date` must stay null (never invented) even
  // though day+month parse cleanly, and certainty must be TEXT_ONLY.
  assert.equal(boris.start.date, null);
  assert.equal(boris.start.certainty, "TEXT_ONLY");
  assert.equal(boris.start.raw, "mar 20 octobre");
  assert.equal(boris.end.certainty, "UNKNOWN");

  assert.equal(boris.source_fields.sold_out, true);
  assert.deepEqual(boris.source_fields.support_acts, ["Planning for Burial"]);
});

test("toObservations throws rather than silently skipping a malformed card missing required identity fields", async () => {
  const { toObservation } = await import("../ingestion/petit-bain-paris/observation-adapter.mjs");
  assert.throws(() => toObservation({ title: "No ID or URL", dateText: "mar 20 octobre" }), /sourceRecordId/);
  assert.throws(() => toObservation({ sourceRecordId: "1", dateText: "mar 20 octobre" }), /eventUrl/);
});
