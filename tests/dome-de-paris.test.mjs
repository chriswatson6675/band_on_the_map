import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  parseListingDateText,
  isConcertCard,
  extractDetailSchedule,
  toObservation,
  toObservations,
} from "../ingestion/dome-de-paris/observation-adapter.mjs";

async function listingHtml() {
  return readFile(new URL("../fixtures/dome-de-paris-paris/a-laffiche-listing.html", import.meta.url), "utf8");
}

async function detailHtml() {
  return readFile(new URL("../fixtures/dome-de-paris-paris/spectacle-detail-cheb-mami.html", import.meta.url), "utf8");
}

test("extractEventCards: the real retained listing page yields all 26 real cards", async () => {
  const cards = extractEventCards(await listingHtml());
  assert.equal(cards.length, 26);
  const chebMami = cards.find((c) => c.title === "CHEB MAMI");
  assert.ok(chebMami);
  assert.equal(chebMami.spectacleId, "337");
  assert.equal(chebMami.category, "Concert");
  assert.equal(chebMami.dateText, "05 septembre 2026");
  assert.equal(chebMami.eventUrl, "https://www.ledomedeparis.com/fr/spectacle/337/cheb-mami");
});

test("parseListingDateText: single dates are DIRECT_SOURCE; multi-day ranges mechanically inherit the trailing month/year (DETERMINISTIC_CONTEXT)", () => {
  assert.deepEqual(parseListingDateText("05 septembre 2026"), {
    startDate: "2026-09-05",
    endDate: null,
    isRange: false,
  });
  // day-only + month-only leading fragment, trailing "Month YYYY" governs both
  assert.deepEqual(parseListingDateText("Du 06 au 07 novembre 2026"), {
    startDate: "2026-11-06",
    endDate: "2026-11-07",
    isRange: true,
  });
  // day+month leading fragment (year only), trailing month/year still governs
  assert.deepEqual(parseListingDateText("Du 12 septembre au 18 octobre 2026"), {
    startDate: "2026-09-12",
    endDate: "2026-10-18",
    isRange: true,
  });
  assert.deepEqual(parseListingDateText("Du 27 février au 02 mai 2027"), {
    startDate: "2027-02-27",
    endDate: "2027-05-02",
    isRange: true,
  });
  assert.deepEqual(parseListingDateText("n'importe quoi"), { startDate: null, endDate: null, isRange: false });
});

test("parseListingDateText: every one of the 26 real retained listing dates parses deterministically to a non-null start date", async () => {
  const cards = extractEventCards(await listingHtml());
  for (const card of cards) {
    const parsed = parseListingDateText(card.dateText);
    assert.ok(parsed.startDate, `expected a parsed startDate for "${card.dateText}" (${card.title})`);
  }
});

test("isConcertCard: only this source's own literal 'Concert' category counts, not 'Comédie musicale'/'One man show'/'Spectacle'", () => {
  assert.equal(isConcertCard("Concert"), true);
  assert.equal(isConcertCard("Comédie musicale"), false);
  assert.equal(isConcertCard("One man show"), false);
  assert.equal(isConcertCard("Spectacle"), false);
});

test("extractDetailSchedule: the real retained Cheb Mami detail page yields time/doors/price", async () => {
  const schedule = extractDetailSchedule(await detailHtml());
  assert.equal(schedule.time, "20:00");
  assert.equal(schedule.doorsTime, "19:00");
  assert.ok(schedule.priceText.includes("Prestige : 95€"));
  assert.ok(schedule.priceText.includes("PMR : gratuit"));
});

test("toObservation: real CHEB MAMI card + detail page adapts correctly, floating-local certainty once time is known", async () => {
  const cards = extractEventCards(await listingHtml());
  const chebMami = cards.find((c) => c.title === "CHEB MAMI");
  const detail = extractDetailSchedule(await detailHtml());
  const obs = toObservation(chebMami, { retrievedAt: "2026-08-26T18:00:00Z", detail });
  assert.equal(obs.source_id, "dome-de-paris");
  assert.equal(obs.source_record_id, "337");
  assert.equal(obs.start.date, "2026-09-05");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Le Dôme de Paris");
  assert.ok(obs.price_text.includes("95€"));
  assert.equal(obs.source_fields.doors_time, "19:00");
});

test("toObservation: without a retained detail page, date is still PROVEN (DATE_ONLY) and price stays null rather than guessed", async () => {
  const cards = extractEventCards(await listingHtml());
  const chebMami = cards.find((c) => c.title === "CHEB MAMI");
  const obs = toObservation(chebMami, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(obs.start.date, "2026-09-05");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.price_text, null);
});

test("toObservation: a real multi-day card (LE ROI SOLEIL) carries a distinct end date", async () => {
  const cards = extractEventCards(await listingHtml());
  const roiSoleil = cards.find((c) => c.title === "LE ROI SOLEIL");
  assert.ok(roiSoleil);
  const obs = toObservation(roiSoleil, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(obs.start.date, "2026-09-12");
  assert.equal(obs.end.date, "2026-10-18");
});

test("toObservations batch-adapts real cards; every source_record_id is unique; throws on malformed input", async () => {
  const cards = extractEventCards(await listingHtml());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);
  assert.throws(() => extractEventCards(""), /non-empty/);
});
