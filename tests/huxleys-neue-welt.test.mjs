import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  toObservation,
  toObservations,
  extractEndFromDetailPage,
  enrichEndFromDetailPage,
} from "../ingestion/huxleys-neue-welt/observation-adapter.mjs";

async function listHtml() {
  return readFile(new URL("../fixtures/huxleys-neue-welt-berlin/events-page.html", import.meta.url), "utf8");
}

async function detailHtml() {
  return readFile(new URL("../fixtures/huxleys-neue-welt-berlin/event-detail-yebba.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained events page yields many real cards", async () => {
  const cards = extractEventCards(await listHtml());
  assert.ok(cards.length > 100, `expected > 100 cards, got ${cards.length}`);

  const yebba = cards.find((c) => c.title === "YEBBA");
  assert.ok(yebba);
  assert.equal(yebba.date, "2026-09-02");
  assert.equal(yebba.startTime, "20:00");
  assert.equal(yebba.doorsTime, "19:00");
  assert.equal(yebba.eventUrl, "https://huxleysneuewelt.de/en/event/2026-09-02-yebba");
  assert.equal(yebba.support, "ASTYN");
  assert.equal(yebba.status, "SCHEDULED");
});

test("extractEventCards: German-labelled ('Beginn'/'Einlass') card parses the same as English-labelled ones", async () => {
  const cards = extractEventCards(await listHtml());
  const kard = cards.find((c) => c.title === "KARD");
  assert.ok(kard);
  assert.equal(kard.date, "2026-09-01");
  assert.equal(kard.startTime, "19:30");
  assert.equal(kard.doorsTime, "18:30");
});

test("extractEventCards: HTML entities in titles are decoded", async () => {
  const cards = extractEventCards(await listHtml());
  const kurtVile = cards.find((c) => c.eventUrl === "https://huxleysneuewelt.de/en/event/2026-09-03-kurt-vile-the-violators");
  assert.ok(kurtVile);
  assert.equal(kurtVile.title, "Kurt Vile & The Violators");
});

test("extractEventCards: sold-out and cancelled status is captured honestly, never dropped", async () => {
  const cards = extractEventCards(await listHtml());
  const soldOut = cards.find((c) => c.eventUrl === "https://huxleysneuewelt.de/en/event/2026-09-05-the-dresden-dolls");
  assert.ok(soldOut);
  assert.equal(soldOut.status, "SOLD_OUT");

  const cancelled = cards.find((c) => c.eventUrl === "https://huxleysneuewelt.de/en/event/2026-09-10-farid-bang");
  assert.ok(cancelled);
  assert.equal(cancelled.status, "CANCELLED");
});

test("toObservation: real YEBBA card adapts correctly, floating-local certainty", async () => {
  const cards = extractEventCards(await listHtml());
  const yebba = cards.find((c) => c.title === "YEBBA");
  const obs = toObservation(yebba, { retrievedAt: "2026-08-26T13:00:00Z" });

  assert.equal(obs.source_id, "huxleys-neue-welt-berlin");
  assert.equal(obs.source_record_id, "2026-09-02-yebba");
  assert.equal(obs.start.date, "2026-09-02");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.raw, "2026-09-02 20:00");
  assert.equal(obs.venue_name, "Huxleys Neue Welt");
  assert.equal(obs.event_url, "https://huxleysneuewelt.de/en/event/2026-09-02-yebba");
  assert.equal(obs.end.date, null, "end must remain NOT_PRESENT until enriched from the detail page");
  assert.equal(obs.source_fields.support, "ASTYN");
});

test("toObservations batch-adapts real cards; every source_record_id is unique; throws on malformed input", async () => {
  const cards = extractEventCards(await listHtml());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => toObservation({}), /eventUrl/);
});

test("extractEndFromDetailPage: the real retained YEBBA detail page states an explicit end time only in og:description", async () => {
  const parsed = extractEndFromDetailPage(await detailHtml());
  assert.ok(parsed);
  assert.equal(parsed.date, "2026-09-02");
  assert.equal(parsed.start, "20:00");
  assert.equal(parsed.end, "22:30");
});

test("extractEndFromDetailPage: returns null, never a guess, when the tag is absent/unparseable", () => {
  assert.equal(extractEndFromDetailPage("<html><head></head><body>no meta here</body></html>"), null);
  assert.equal(extractEndFromDetailPage(""), null);
});

test("enrichEndFromDetailPage: applies the detail page's own end time onto the matching Observation", async () => {
  const cards = extractEventCards(await listHtml());
  const yebba = cards.find((c) => c.title === "YEBBA");
  const obs = toObservation(yebba, { retrievedAt: "2026-08-26T13:00:00Z" });

  const enriched = enrichEndFromDetailPage(obs, await detailHtml(), {
    fixturePath: "fixtures/huxleys-neue-welt-berlin/event-detail-yebba.html",
  });

  assert.equal(enriched.end.date, "2026-09-02");
  assert.equal(enriched.end.raw, "2026-09-02 22:30");
  assert.equal(enriched.end.certainty, "FLOATING_LOCAL");
  assert.equal(enriched.source_fields.end_source, "og:description");
});

test("enrichEndFromDetailPage: never attaches a mismatched-date detail page's end time", async () => {
  const cards = extractEventCards(await listHtml());
  const kard = cards.find((c) => c.title === "KARD"); // 2026-09-01, not the YEBBA detail page's own 2026-09-02
  const obs = toObservation(kard, { retrievedAt: "2026-08-26T13:00:00Z" });

  const result = enrichEndFromDetailPage(obs, await detailHtml());
  assert.equal(result.end.date, null, "must not borrow another event's end time");
});
