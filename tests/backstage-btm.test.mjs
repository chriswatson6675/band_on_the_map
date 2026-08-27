import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards } from "../ingestion/backstage-btm-paris/discovery.mjs";
import { extractEventDetail, toObservation, toObservations, VENUE_ADDRESS } from "../ingestion/backstage-btm-paris/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/backstage-btm-paris/${name}`, import.meta.url), "utf8");
}

test("extractEventCards: the real retained calendar page yields many real cards", async () => {
  const cards = extractEventCards(await fixture("calendar.html"));
  assert.equal(cards.length, 30);

  const atlas = cards.find((c) => c.slug === "atlas");
  assert.ok(atlas);
  assert.equal(atlas.title, "ATLAS");
  assert.equal(atlas.genre, "metal");
  assert.equal(atlas.date, "2026-09-08");
});

test("extractEventCards: honestly leaves a bare 2-digit year unresolved rather than guessing the century", async () => {
  const cards = extractEventCards(await fixture("calendar.html"));
  const anyGivenDay = cards.find((c) => c.slug === "any-given-day");
  assert.ok(anyGivenDay);
  assert.equal(anyGivenDay.dateRaw, "07/11/26");
  assert.equal(anyGivenDay.date, null, "a bare 2-digit year must never be silently expanded to a 4-digit one");
});

test("extractEventDetail: real Atlas detail page yields title/date/address", async () => {
  const detail = extractEventDetail(await fixture("detail-atlas.html"));
  assert.equal(detail.title, "ATLAS");
  assert.equal(detail.date, "2026-09-08");
  assert.equal(detail.address, "O’Sullivans By The Mill, 92 bis bd de Clichy - Paris");
});

test("toObservation: real Atlas card+detail adapts correctly, date-only certainty, address from detail page", async () => {
  const cards = extractEventCards(await fixture("calendar.html"));
  const card = cards.find((c) => c.slug === "atlas");
  const detailHtml = await fixture("detail-atlas.html");
  const obs = toObservation({ card, detailHtml, retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "backstage-btm-paris");
  assert.equal(obs.source_record_id, "atlas");
  assert.equal(obs.start.date, "2026-09-08");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.venue_name, "Backstage By The Mill");
  assert.equal(obs.location_text, "O’Sullivans By The Mill, 92 bis bd de Clichy - Paris");
  assert.equal(obs.price_text, null);
  assert.ok(VENUE_ADDRESS.includes("92 Bis Boulevard de Clichy"));
});

test("toObservations batch-adapts real card+detail pairs; throws on malformed input", async () => {
  const cards = extractEventCards(await fixture("calendar.html"));
  const atlas = cards.find((c) => c.slug === "atlas");
  const southArcade = cards.find((c) => c.slug === "south-arcade");
  const entries = [
    { card: atlas, detailHtml: await fixture("detail-atlas.html") },
    { card: southArcade, detailHtml: await fixture("detail-south-arcade.html") },
  ];
  const observations = toObservations(entries, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, 2);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, 2);
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({ card: atlas, detailHtml: "" }), /requires detailHtml/);
});
