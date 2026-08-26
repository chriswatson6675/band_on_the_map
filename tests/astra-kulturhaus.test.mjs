import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  toObservation,
  toObservations,
  extractDetailIdentity,
} from "../ingestion/astra-kulturhaus/observation-adapter.mjs";

async function homepageHtml() {
  return readFile(new URL("../fixtures/astra-kulturhaus-berlin/homepage.html", import.meta.url), "utf8");
}

async function detailHtml() {
  return readFile(new URL("../fixtures/astra-kulturhaus-berlin/event-detail-fkj.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained homepage yields many real cards", async () => {
  const cards = extractEventCards(await homepageHtml());
  assert.ok(cards.length >= 50, `expected at least 50 cards, got ${cards.length}`);

  const fkj = cards.find((c) => c.title === "FKJ");
  assert.ok(fkj);
  assert.equal(fkj.date, "2026-10-21");
  assert.equal(fkj.offset, "+0200");
  assert.equal(fkj.startTime, "20:00");
  assert.equal(fkj.eventUrl, "https://www.astra-berlin.de/events/2026-10-21-fkj");

  const buzzcocks = cards.find((c) => c.title === "BUZZCOCKS");
  assert.ok(buzzcocks);
  assert.equal(buzzcocks.date, "2026-09-05");
  assert.equal(buzzcocks.startTime, "20:00");

  // A decoded HTML entity in a real title.
  const blackStarRiders = cards.find((c) => c.eventUrl.includes("black-star-riders"));
  assert.ok(blackStarRiders);
  assert.equal(blackStarRiders.title, "BLACK STAR RIDERS & TYKETTO");
});

test("extractEventCards: a real cancelled card with no Start time-value is retained honestly, not fabricated", async () => {
  const cards = extractEventCards(await homepageHtml());
  const oliverTree = cards.find((c) => c.title === "OLIVER TREE");
  assert.ok(oliverTree);
  assert.equal(oliverTree.startTime, null);
  assert.equal(oliverTree.status, "cancelled");
});

test("toObservation: real FKJ card derives the correct UTC instant, bypassing the confirmed-buggy JSON-LD offset", async () => {
  const cards = extractEventCards(await homepageHtml());
  const fkj = cards.find((c) => c.title === "FKJ");
  const obs = toObservation(fkj, { retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(obs.source_id, "astra-kulturhaus-berlin");
  assert.equal(obs.source_record_id, "2026-10-21-fkj");
  assert.equal(obs.title, "FKJ");
  assert.equal(obs.start.date, "2026-10-21");
  // Start time-value 20:00 + data-realdate's own correct +0200 offset =>
  // 18:00Z. The source's own JSON-LD startDate for this exact event
  // states "2026-10-21T20:00:00+00:00" (see
  // fixtures/astra-kulturhaus-berlin/event-detail-fkj.html) — a
  // materially different, WRONG instant this adapter must never produce.
  assert.equal(obs.start.iso, "2026-10-21T18:00:00Z");
  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.start.is_utc, true);
  assert.equal(obs.venue_name, "Astra Berlin");
  assert.equal(obs.location_text, "Revaler Str. 99, 10245 Berlin");
  assert.equal(obs.event_url, "https://www.astra-berlin.de/events/2026-10-21-fkj");
});

test("toObservation: a card with no Start time-value is retained as DATE_ONLY, never a fabricated instant", async () => {
  const cards = extractEventCards(await homepageHtml());
  const oliverTree = cards.find((c) => c.title === "OLIVER TREE");
  const obs = toObservation(oliverTree, { retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(obs.start.date, "2026-09-13");
  assert.equal(obs.start.iso, null);
  assert.equal(obs.start.is_utc, null);
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.source_fields.status, "cancelled");
});

test("toObservations: batch-adapts real cards; every source_record_id unique; throws on malformed input", async () => {
  const cards = extractEventCards(await homepageHtml());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T20:30:00Z" });

  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );

  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({}), /eventUrl/);
});

test("extractDetailIdentity: genuinely reuses ingestion/json-ld/parse.mjs against a real detail-page fixture, and never reads startDate", async () => {
  const identity = extractDetailIdentity(await detailHtml());

  assert.equal(identity.title, "FKJ");
  assert.equal(identity.source_record_id, "2026-10-21-fkj");
  assert.equal(identity.event_url, "https://www.astra-berlin.de/events/2026-10-21-fkj");
  assert.equal(identity.venue_name, "Astra Berlin");
  assert.equal(identity.venue_address, "Revaler Str. 99, 10245 Berlin");
  assert.ok(!("startDate" in identity) && !("start_raw" in identity));
});

test("the confirmed JSON-LD offset bug is still present live in the retained detail-page fixture (documents why deriveStart never uses it)", async () => {
  const html = await detailHtml();
  const match = /"startDate"\s*:\s*"([^"]+)"/.exec(html);
  assert.ok(match, "expected a startDate field in the retained JSON-LD fixture");
  // The bug: local wall-clock Start time (20:00) with a WRONG +00:00
  // offset, instead of the venue's true +02:00 (CEST) offset for this
  // date.
  assert.equal(match[1], "2026-10-21T20:00:00+00:00");
});
