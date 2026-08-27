import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractResidencyCards,
  parsePageMonthHeading,
  parseDatePhrase,
} from "../ingestion/caveau-de-la-huchette/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/caveau-de-la-huchette/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/caveau-de-la-huchette-paris/month-septembre-2026-raw.html", import.meta.url), "utf8");
}

test("parsePageMonthHeading: real retained page heading", () => {
  assert.deepEqual(parsePageMonthHeading("Septembre 2026"), { month: "09", year: "2026" });
  assert.throws(() => parsePageMonthHeading("not a heading"), /did not match/);
});

test("parseDatePhrase: every real date-phrase shape actually observed on this source", () => {
  const ctx = { month: "09", year: "2026" };
  assert.deepEqual(parseDatePhrase("Mardi 1er et mercredi 2 septembre", ctx), {
    startDate: "2026-09-01",
    endDate: "2026-09-02",
  });
  assert.deepEqual(parseDatePhrase("Samedi 5 septembre", ctx), { startDate: "2026-09-05", endDate: "2026-09-05" });
  assert.deepEqual(parseDatePhrase("Dimanche 13", ctx), { startDate: "2026-09-13", endDate: "2026-09-13" });
  assert.deepEqual(parseDatePhrase("Mardi 15 au jeudi 17 septembre", ctx), {
    startDate: "2026-09-15",
    endDate: "2026-09-17",
  });
  assert.deepEqual(parseDatePhrase("Du dimanche 27 au mercredi 30 septembre", ctx), {
    startDate: "2026-09-27",
    endDate: "2026-09-30",
  });
  assert.throws(() => parseDatePhrase("not a date phrase at all here", ctx), /did not match/);
});

test("extractResidencyCards: the real retained September 2026 month page yields all 16 real bookings, zero unparsed", async () => {
  const { cards, unparsed } = extractResidencyCards(await html());
  assert.equal(cards.length, 16);
  assert.equal(unparsed.length, 0);

  const leigh = cards.find((c) => c.title === "Leigh Barker Swing Band");
  assert.ok(leigh);
  assert.equal(leigh.startDate, "2026-09-01");
  assert.equal(leigh.endDate, "2026-09-02");

  const roaring = cards.find((c) => c.title === "Roaring Cats");
  assert.ok(roaring);
  assert.equal(roaring.startDate, "2026-09-21");
  assert.equal(roaring.endDate, "2026-09-24");

  // Every date must be a real "YYYY-MM-DD" string — never fabricated.
  for (const c of cards) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(c.startDate));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(c.endDate));
  }
});

test("toObservation: single-day and multi-day residencies adapt correctly, no venue/price/time fabricated", async () => {
  const { cards } = extractResidencyCards(await html());
  const monthPageUrl = "https://www.caveaudelahuchette.fr/1/concerts_septembre_2026_1483451.html";

  const panama = cards.find((c) => c.title === "Panama Swing");
  const single = toObservation(panama, { retrievedAt: "2026-08-26T13:00:00Z", monthPageUrl });
  assert.equal(single.source_id, "caveau-de-la-huchette-paris");
  assert.equal(single.source_record_id, "panama-swing-2026-09-05");
  assert.equal(single.start.date, "2026-09-05");
  assert.equal(single.start.certainty, "DATE_ONLY");
  assert.equal(single.end.date, null, "a single-day booking must not carry a fabricated end date");
  assert.equal(single.venue_name, null);
  assert.equal(single.price_text, null);

  const roaring = cards.find((c) => c.title === "Roaring Cats");
  const multi = toObservation(roaring, { retrievedAt: "2026-08-26T13:00:00Z", monthPageUrl });
  assert.equal(multi.source_record_id, "roaring-cats-2026-09-21");
  assert.equal(multi.start.date, "2026-09-21");
  assert.equal(multi.end.date, "2026-09-24", "a multi-night residency's end must be its own real last night");
});

test("toObservations batch-adapts real cards; unique source_record_id; throws on malformed input", async () => {
  const { cards } = extractResidencyCards(await html());
  const monthPageUrl = "https://www.caveaudelahuchette.fr/1/concerts_septembre_2026_1483451.html";
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z", monthPageUrl });
  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractResidencyCards(""), /non-empty/);
});
