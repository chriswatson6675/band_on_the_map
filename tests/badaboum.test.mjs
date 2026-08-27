import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards } from "../ingestion/badaboum-paris/discovery.mjs";
import { extractEventDetail, toObservation, toObservations, VENUE_ADDRESS } from "../ingestion/badaboum-paris/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/badaboum-paris/${name}`, import.meta.url), "utf8");
}

test("extractEventCards: the real retained agenda page yields many real cards", async () => {
  const cards = extractEventCards(await fixture("agenda.html"));
  assert.ok(cards.length >= 30, `expected at least 30 cards, got ${cards.length}`);

  const summerPlayground = cards.find((c) => c.slug === "club-summer-playground-18");
  assert.ok(summerPlayground);
  assert.equal(summerPlayground.category, "club");
  assert.equal(summerPlayground.dateRaw, "28 août 2026");
});

test("extractEventDetail: real detail page yields a full start+end instant from the google-event data block", async () => {
  const detail = extractEventDetail(await fixture("detail-club-summer-playground.html"));
  assert.equal(detail.startDate, "2026-08-28");
  assert.equal(detail.startTime, "23:30");
  assert.equal(detail.endDate, "2026-08-29");
  assert.equal(detail.endTime, "07:00");
  assert.equal(detail.bookingUrl, "https://shotgun.live/events/area-ocean-how2fly-shakedaddy-djtry-sensu-badaboum-paris");
});

test("extractEventDetail: a second real detail page confirms the pattern generalises", async () => {
  const detail = extractEventDetail(await fixture("detail-chick.html"));
  assert.equal(detail.startDate, "2026-08-27");
  assert.equal(detail.startTime, "23:30");
  assert.equal(detail.endDate, "2026-08-28");
  assert.equal(detail.endTime, "05:00");
});

test("toObservation: real card+detail adapts correctly, floating-local certainty for both start and end", async () => {
  const cards = extractEventCards(await fixture("agenda.html"));
  const card = cards.find((c) => c.slug === "club-summer-playground-18");
  const detailHtml = await fixture("detail-club-summer-playground.html");
  const obs = toObservation({ card, detailHtml, retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.source_id, "badaboum-paris");
  assert.equal(obs.source_record_id, "club-summer-playground-18");
  assert.equal(obs.start.date, "2026-08-28");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.end.date, "2026-08-29");
  assert.equal(obs.end.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Badaboum");
  assert.equal(obs.price_text, null);
  assert.equal(VENUE_ADDRESS, "Badaboum, 2 Rue des Taillandiers, 75011 Paris");
});

test("toObservations batch-adapts real card+detail pairs; throws on malformed input", async () => {
  const cards = extractEventCards(await fixture("agenda.html"));
  const summerPlayground = cards.find((c) => c.slug === "club-summer-playground-18");
  const chick = cards.find((c) => c.slug.startsWith("club-la-chck-2006"));
  assert.ok(chick, "expected the LA CH!CK card to be discovered");
  const entries = [
    { card: summerPlayground, detailHtml: await fixture("detail-club-summer-playground.html") },
    { card: chick, detailHtml: await fixture("detail-chick.html") },
  ];
  const observations = toObservations(entries, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, 2);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, 2);
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({ card: summerPlayground, detailHtml: "" }), /requires detailHtml/);
});
