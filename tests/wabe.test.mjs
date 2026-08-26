import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/wabe/observation-adapter.mjs";

async function html(month) {
  return readFile(new URL(`../fixtures/wabe-berlin/programme-${month}-2026.html`, import.meta.url), "utf8");
}

test("extractEventCards: September 2026 yields all 10 real event rows, DEFA Songbook parsed correctly", async () => {
  const cards = extractEventCards(await html("sep"));
  assert.equal(cards.length, 10);
  const defa = cards.find((c) => c.title === "DEFA Songbook");
  assert.ok(defa);
  assert.equal(defa.date, "2026-09-24");
  assert.equal(defa.timeRaw, "20:00");
  assert.equal(defa.weekday, "Donnerstag");
  assert.equal(defa.genre, "Jazz | Pop");
  assert.equal(defa.locationText, "Schönfließer Straße 7, (Saal)");
  assert.match(defa.priceText, /^20 € \/ 15 € \(Abendkasse\)/);
});

test("extractEventCards: tolerates the hand-edited weekday+day-merged-into-one-<p> row shape", async () => {
  // The "Arno Zillmers Open Mic" row on every sampled month uses a
  // structurally different (but genuinely real) markup where weekday and
  // day share one <p> joined by <br/>, instead of two separate <p> tags.
  const cards = extractEventCards(await html("sep"));
  const openMic = cards.find((c) => c.title === "Arno Zillmers Open Mic");
  assert.ok(openMic);
  assert.equal(openMic.date, "2026-09-09");
  assert.equal(openMic.weekday, "Mittwoch");
  assert.equal(openMic.priceText, "5 € (Abendkasse)");
});

test("extractEventCards: honestly extracts free-entry and open-ended ('ab HH:MM') events without inventing a price/time", async () => {
  const cards = extractEventCards(await html("sep"));
  const sommerfest = cards.find((c) => c.title === "Sommerfest auf der Kulturinsel");
  assert.ok(sommerfest);
  assert.equal(sommerfest.timeRaw, "ab 15:00");
  assert.equal(sommerfest.priceText, "Eintritt frei.");
  assert.equal(sommerfest.locationText, "Kulturinsel, Danziger Str. 101");
});

test("extractEventCards: October and November pages parse their own real event counts", async () => {
  const oct = extractEventCards(await html("okt"));
  assert.equal(oct.length, 5);
  assert.ok(oct.find((c) => c.title === "All These Feelings" && c.date === "2026-10-03"));

  const nov = extractEventCards(await html("nov"));
  assert.equal(nov.length, 2);
  assert.ok(nov.find((c) => c.title === "Bielfeldts Begegnungen" && c.date === "2026-11-05"));
});

test("extractEventCards: never fabricates a year — throws if the page's own month/year heading is missing", () => {
  assert.throws(() => extractEventCards("<html><body>no heading here, just a stray <p>hello</p></body></html>"), /month\/year heading/);
  assert.throws(() => extractEventCards(""), /non-empty/);
});

test("toObservation: real DEFA Songbook card adapts correctly, floating-local certainty, deterministic non-source source_record_id", async () => {
  const cards = extractEventCards(await html("sep"));
  const defa = cards.find((c) => c.title === "DEFA Songbook");
  const obs = toObservation(defa, { retrievedAt: "2026-08-26T21:00:00Z" });
  assert.equal(obs.source_id, "wabe-berlin");
  assert.equal(obs.source_record_id, "2026-09-24-2000-defa-songbook");
  assert.equal(obs.title, "DEFA Songbook");
  assert.equal(obs.start.date, "2026-09-24");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "WABE");
  assert.equal(obs.location_text, "Schönfließer Straße 7, (Saal)");
  assert.equal(obs.event_url, null, "no dedicated per-event URL is proven stable on this source");
});

test("toObservations: batch-adapts every real card across all four retained months; every id unique; throws on malformed input", async () => {
  const allCards = [
    ...extractEventCards(await html("aug")),
    ...extractEventCards(await html("sep")),
    ...extractEventCards(await html("okt")),
    ...extractEventCards(await html("nov")),
  ];
  assert.equal(allCards.length, 19, "19 real event rows across the 4 retained, genuinely-populated month pages");

  const observations = toObservations(allCards, { retrievedAt: "2026-08-26T21:00:00Z" });
  assert.equal(observations.length, allCards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractEventCards(null), /non-empty/);
});
