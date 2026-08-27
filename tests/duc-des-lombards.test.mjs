import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventOccurrences } from "../ingestion/duc-des-lombards/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/duc-des-lombards/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/duc-des-lombards-paris/agenda-excerpt.html", import.meta.url), "utf8");
}

test("extractEventOccurrences: DETERMINISTIC_CONTEXT year+month derivation from the nearest preceding separator", async () => {
  const occurrences = await extractEventOccurrences(await html());
  assert.ok(occurrences.length >= 9, "3 retained cards x (2-4 showtimes each) should yield >= 9 occurrences");

  const tierney = occurrences.filter((o) => o.slug === occurrences[0].slug);
  assert.ok(tierney.length > 0);

  // "Tierney Sutton meets Charlier/Sourisse" card: "26 août" + "27 août",
  // governed by the "2026-08" separator that precedes it on the page.
  const first = occurrences.find((o) => o.nodeId === "14019");
  assert.ok(first);
  assert.equal(first.title, "Tierney Sutton meets Charlier/Sourisse");
  assert.equal(first.date, "2026-08-26");
  assert.equal(first.hour, "19");
  assert.equal(first.minute, "30");

  const second = occurrences.find((o) => o.nodeId === "14024");
  assert.ok(second);
  assert.equal(second.date, "2026-08-27");
  assert.equal(second.hour, "22");

  // "April Varner Quintet": 4 showtimes across 28/29 août.
  const april = occurrences.filter((o) => o.title === "April Varner Quintet");
  assert.equal(april.length, 4);
  assert.ok(april.every((o) => o.date === "2026-08-28" || o.date === "2026-08-29"));

  // "JAM DU DUC": single showtime, 23H30, no minutes ambiguity.
  const jam = occurrences.find((o) => o.title === "JAM DU DUC");
  assert.ok(jam);
  assert.equal(jam.date, "2026-08-28");
  assert.equal(jam.hour, "23");
  assert.equal(jam.minute, "30");

  // every node id genuinely distinct, even across showtimes of one run
  const nodeIds = occurrences.map((o) => o.nodeId);
  assert.equal(new Set(nodeIds).size, nodeIds.length);
});

test("extractEventOccurrences: throws on empty input; never throws on a well-formed page with no cards", () => {
  assert.throws(() => extractEventOccurrences(""), /non-empty/);
  assert.deepEqual(extractEventOccurrences("<html><body>nothing here</body></html>"), []);
});

test("toObservation: real Tierney Sutton occurrence adapts correctly", async () => {
  const occurrences = await extractEventOccurrences(await html());
  const first = occurrences.find((o) => o.nodeId === "14019");
  const obs = toObservation(first, { retrievedAt: "2026-08-27T09:00:00Z" });

  assert.equal(obs.source_id, "duc-des-lombards-paris");
  assert.equal(obs.source_record_id, "14019");
  assert.equal(obs.title, "Tierney Sutton meets Charlier/Sourisse");
  assert.equal(obs.start.date, "2026-08-26");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Le Duc des Lombards");
  assert.equal(obs.price_text, null);
  assert.ok(obs.event_url.startsWith("https://ducdeslombards.com/fr/l-agenda/"));
});

test("toObservations: batch-adapts every real retained occurrence; every id unique", async () => {
  const occurrences = await extractEventOccurrences(await html());
  const observations = toObservations(occurrences, { retrievedAt: "2026-08-27T09:00:00Z" });
  assert.equal(observations.length, occurrences.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);
});
