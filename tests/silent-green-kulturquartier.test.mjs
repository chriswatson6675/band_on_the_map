import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, filterMusicEventCards } from "../ingestion/silent-green-kulturquartier/discovery.mjs";
import {
  extractEventDetail,
  toObservation,
  toObservations,
  SOURCE_ID,
  VENUE_NAME,
} from "../ingestion/silent-green-kulturquartier/observation-adapter.mjs";

const FIXTURES = "../fixtures/silent-green-kulturquartier-berlin";

async function fixture(name) {
  return readFile(new URL(`${FIXTURES}/${name}`, import.meta.url), "utf8");
}

async function augustProgramme() {
  return fixture("programme-2026-08.html");
}

test("extractEventCards: the real retained August 2026 programme page yields real, deduplicated cards", async () => {
  const cards = extractEventCards(await augustProgramme());
  assert.equal(cards.length, 19);

  const htrk = cards.find((c) => c.slug === "htrk");
  assert.ok(htrk);
  assert.equal(htrk.title, "HTRK + Loraine James – sold out");
  assert.equal(htrk.category, "Concert");
  assert.equal(htrk.eventUrl, "https://www.silent-green.net/en/programme/detail/htrk");
  assert.equal(htrk.dateHintRaw, "2026-08-02");

  const sommerfest = cards.find((c) => c.slug === "silent-green-sommerfest-2026");
  assert.ok(sommerfest, "a real card with no <span class=\"cat\"> at all must still be extracted");
  assert.equal(sommerfest.category, null);
});

test("filterMusicEventCards: real August cards split into genuinely music-relevant vs rejected", async () => {
  const cards = extractEventCards(await augustProgramme());
  const { musicCards, rejectedCards } = filterMusicEventCards(cards);

  assert.equal(musicCards.length, 10);
  assert.equal(rejectedCards.length, 9);
  assert.equal(musicCards.length + rejectedCards.length, cards.length);

  assert.ok(musicCards.some((c) => c.slug === "htrk"), "Concert-category card must pass");
  assert.ok(
    musicCards.some((c) => c.slug === "silent-green-open-lab-9-jkzq-franna"),
    "Concert-category card must pass",
  );

  const rejectedSlugs = rejectedCards.map((c) => c.slug);
  assert.ok(rejectedSlugs.includes("bjoern-melhus-lost-in-finity"), "Exhibition card must be rejected");
  assert.ok(rejectedSlugs.includes("pop-kultur-festival-2026"), "Panel-category card with no music keyword in its title must be rejected");
  assert.ok(rejectedSlugs.includes("silent-green-sommerfest-2026"), "uncategorised card with no music keyword must be rejected");
});

test("extractEventDetail: the real retained htrk detail page yields exact fields", async () => {
  const detail = extractEventDetail(await fixture("event-detail-htrk.html"));
  assert.equal(detail.title, "HTRK + Loraine James – sold out");
  assert.equal(detail.eventUrl, "https://www.silent-green.net/en/programme/detail/htrk");
  assert.equal(detail.location, "Kuppelhalle");
  assert.equal(detail.startDate, "2026-08-02");
  assert.equal(detail.startTime, "19:45");
  assert.equal(detail.doorsTime, "19:00");
  assert.equal(detail.endDate, null);
});

test("extractEventDetail: a real multi-day record (hanno-leichtmann-oscillazioni) yields a date range with no time", async () => {
  const detail = extractEventDetail(await fixture("event-detail-hanno-leichtmann.html"));
  assert.equal(detail.title, "Hanno Leichtmann: OSCILLAZIONI");
  assert.ok(detail.startDate, "a real start date must be present");
  assert.ok(detail.endDate, "a real multi-day record must expose an end date");
  assert.notEqual(detail.startDate, detail.endDate);
});

test("toObservation: real htrk detail page adapts correctly, floating-local certainty", async () => {
  const detailHtml = await fixture("event-detail-htrk.html");
  const obs = toObservation({ card: { slug: "htrk", category: "Concert" }, detailHtml, retrievedAt: "2026-08-26T13:00:00Z" });

  assert.equal(obs.source_id, SOURCE_ID);
  assert.equal(obs.source_record_id, "htrk");
  assert.equal(obs.retrieved_at, "2026-08-26T13:00:00Z");
  assert.equal(obs.title, "HTRK + Loraine James – sold out");
  assert.equal(obs.start.date, "2026-08-02");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.end.certainty, "UNKNOWN", "a single-evening concert with no end span must not have a fabricated end");
  assert.equal(obs.venue_name, VENUE_NAME);
  assert.equal(obs.location_text, "Kuppelhalle");
  assert.equal(obs.event_url, "https://www.silent-green.net/en/programme/detail/htrk");
  assert.equal(obs.price_text, null);
  assert.equal(obs.source_fields.doors_time, "19:00");
});

test("toObservation: a real multi-category record (goat-jp) adapts correctly", async () => {
  const detailHtml = await fixture("event-detail-goat-jp.html");
  const obs = toObservation({ card: { slug: "goat-jp", category: "Concert" }, detailHtml, retrievedAt: "2026-08-26T13:00:00Z" });

  assert.equal(obs.source_record_id, "goat-jp");
  assert.equal(obs.title, "goat (jp) + Camila Nebbia");
  assert.equal(obs.start.date, "2026-11-04");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.location_text, "Betonhalle");
});

test("toObservations: batch-adapts several real detail pages; every source_record_id is unique", async () => {
  const slugs = ["htrk", "goat-jp", "hub-pres-doorman-franco-franco"];
  const entries = await Promise.all(
    slugs.map(async (slug) => ({
      card: { slug, category: "Concert" },
      detailHtml: await fixture(`event-detail-${slug}.html`),
      fixturePath: `fixtures/silent-green-kulturquartier-berlin/event-detail-${slug}.html`,
    })),
  );

  const observations = toObservations(entries, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, entries.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);
  for (const obs of observations) {
    assert.equal(obs.raw_evidence.byte_faithful, true);
    assert.ok(obs.raw_evidence.fixture_path);
  }
});

test("malformed input throws: empty calendar HTML, empty detail HTML, and toObservation with no detailHtml", async () => {
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractEventDetail(""), /non-empty/);
  assert.throws(() => toObservation({ card: { slug: "htrk" } }), /detailHtml/);
});
