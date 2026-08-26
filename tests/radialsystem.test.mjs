import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  filterMusicEventCards,
  toObservation,
  toObservations,
} from "../ingestion/radialsystem/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/radialsystem-berlin/programm-page.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained programme list-view yields real occurrence rows, excluding out-of-scope festival URLs", async () => {
  const cards = extractEventCards(await html());
  assert.ok(cards.length > 20, `expected more than 20 in-scope rows, got ${cards.length}`);

  // Every extracted card must be a "/en/veranstaltungen/{slug}/" detail
  // page — the "/en/festivals/20-years-radialsystem-for-everyone/" umbrella
  // page must never appear.
  assert.ok(cards.every((c) => c.eventUrl.includes("/en/veranstaltungen/")));
  assert.ok(cards.every((c) => !c.eventUrl.includes("/en/festivals/")));

  const zweiland = cards.filter((c) => c.slug === "zweiland");
  assert.equal(zweiland.length, 6, "Zweiland has 6 real, distinct performance occurrences on the retained page");
  const first = zweiland.find((c) => c.date === "2026-08-27" && c.time === "21:00");
  assert.ok(first);
  assert.equal(first.location, "Halle");
  assert.deepEqual(first.tags, ["Dance"]);
  assert.equal(first.eventUrl, "https://www.radialsystem.de/en/veranstaltungen/zweiland/");
  assert.ok(/^\d+$/.test(first.occurrenceTimestamp));

  // Every occurrence's compound key (slug + occurrenceTimestamp) must be
  // genuinely unique, resolving the source investigation's earlier PARTIAL
  // source_record_id note.
  const keys = cards.map((c) => `${c.slug}__${c.occurrenceTimestamp}`);
  assert.equal(new Set(keys).size, keys.length, "every occurrence key must be unique");
});

test("filterMusicEventCards: genuinely separates real concert-tagged rows from real dance/exhibition/workshop rows", async () => {
  const cards = extractEventCards(await html());
  const { musicCards, rejectedCards } = filterMusicEventCards(cards);

  assert.equal(musicCards.length + rejectedCards.length, cards.length);
  assert.ok(musicCards.length > 0);
  assert.ok(rejectedCards.length > 0);

  // Real, named, music-tagged productions must be included.
  const walden = musicCards.find((c) => c.slug === "heiner-goebbels-walden");
  assert.ok(walden, "Heiner Goebbels' Walden (tagged Concert) must be classified music-relevant");
  assert.deepEqual(walden.tags, ["Concert"]);

  const zukunft = musicCards.find((c) => c.slug === "20-jahre-zukunft");
  assert.ok(zukunft, "20 Jahre Zukunft (tagged Concert) must be classified music-relevant");

  const noise = musicCards.find((c) => c.slug === "whats-that-noise");
  assert.ok(noise, "What's That Noise? (tagged Performance/Musik/Party) must be classified music-relevant");
  assert.ok(noise.tags.includes("Musik"));

  // Real, named, genuinely non-music productions must be excluded.
  const zweiland = rejectedCards.find((c) => c.slug === "zweiland");
  assert.ok(zweiland, "Zweiland (tagged Dance only) must be rejected as non-music");

  const timeBeing = rejectedCards.find((c) => c.slug === "for-the-time-being-08-2026");
  assert.ok(timeBeing, "for the time being (tagged Dance only) must be rejected as non-music");

  // No rejected card may carry a music tag, and no accepted card may lack one.
  assert.ok(rejectedCards.every((c) => !c.tags.some((t) => ["Concert", "Concerts", "Musik"].includes(t))));
  assert.ok(musicCards.every((c) => c.tags.some((t) => ["Concert", "Concerts", "Musik"].includes(t))));
});

test("toObservation: real Heiner Goebbels 'Walden' card adapts correctly, floating-local certainty", async () => {
  const cards = extractEventCards(await html());
  const { musicCards } = filterMusicEventCards(cards);
  const walden = musicCards.find((c) => c.slug === "heiner-goebbels-walden");

  const obs = toObservation(walden, { retrievedAt: "2026-08-26T20:32:02Z" });
  assert.equal(obs.source_id, "radialsystem-berlin");
  assert.equal(obs.source_record_id, "heiner-goebbels-walden__1788976800");
  assert.equal(obs.title, "20 Jahre Radialsystem: Heiner Goebbels‘ „Walden“ (1998/2008/2026)");
  assert.equal(obs.start.date, "2026-09-09");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.raw, "2026-09-09 20:00");
  assert.equal(obs.venue_name, "Radialsystem");
  assert.equal(obs.location_text, "Halle");
  assert.equal(obs.event_url, "https://www.radialsystem.de/en/veranstaltungen/heiner-goebbels-walden/");
  assert.deepEqual(obs.source_fields.tags, ["Concert"]);
  assert.equal(obs.raw_evidence.byte_faithful, true);
});

test("toObservations: batch-adapts only the music-relevant cards; throws on malformed input", async () => {
  const cards = extractEventCards(await html());
  const { musicCards } = filterMusicEventCards(cards);
  const observations = toObservations(musicCards, { retrievedAt: "2026-08-26T20:32:02Z" });

  assert.equal(observations.length, musicCards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique"
  );
  assert.ok(observations.every((o) => o.source_id === "radialsystem-berlin"));

  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractEventCards("<html><body>no list view here</body></html>"), /list.*view/i);
});
