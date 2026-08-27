import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, parseDateHeading } from "../ingestion/le-baiser-sale/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/le-baiser-sale/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/le-baiser-sale-paris/agenda-raw.html", import.meta.url), "utf8");
}

test("parseDateHeading: real retained heading text, including the site's own no-dot 'août'", () => {
  assert.equal(parseDateHeading("Jeu. 27 août 2026"), "2026-08-27");
  assert.equal(parseDateHeading("Lun. 7 sept. 2026"), "2026-09-07");
  assert.throws(() => parseDateHeading("not a date"), /did not match/);
});

test("extractEventCards: the real retained agenda page yields real dated cards", async () => {
  const cards = await extractEventCards(await html());
  assert.ok(cards.length >= 27, `expected at least 27 cards, got ${cards.length}`);

  const constantin = cards.find((c) => c.eventUrl === "/fr/agenda/5971-lajamdulundi-de-francois-constantin");
  assert.ok(constantin, "expected to find the sampled François Constantin card");
  assert.equal(constantin.date, "2026-09-07");
  assert.equal(constantin.time, "21:00");
  assert.equal(constantin.title, "#LaJamDuLundi de FRANÇOIS CONSTANTIN");

  // Every card must resolve to a real, non-null date derived from a
  // preceding heading — never fabricated when a heading is genuinely
  // missing (this fixture always has one, but the assertion documents the
  // guarantee).
  assert.ok(cards.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date)));
});

test("toObservation: the sampled card adapts correctly, floating-local certainty, no venue/price fabricated", async () => {
  const cards = await extractEventCards(await html());
  const constantin = cards.find((c) => c.eventUrl === "/fr/agenda/5971-lajamdulundi-de-francois-constantin");
  const obs = toObservation(constantin, { retrievedAt: "2026-08-26T13:00:00Z" });

  assert.equal(obs.source_id, "le-baiser-sale-paris");
  assert.equal(obs.source_record_id, "5971-lajamdulundi-de-francois-constantin#2026-09-07");
  assert.equal(obs.title, "#LaJamDuLundi de FRANÇOIS CONSTANTIN");
  assert.equal(obs.start.date, "2026-09-07");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.event_url, "https://www.lebaisersale.com/fr/agenda/5971-lajamdulundi-de-francois-constantin");
  assert.equal(obs.venue_name, null, "venue_name must never be fabricated — this source does not state it structurally");
  assert.equal(obs.price_text, null, "price must never be fabricated from a third-party ticketing link");
});

test("toObservations batch-adapts real cards; unique source_record_id; throws on malformed input", async () => {
  const cards = await extractEventCards(await html());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractEventCards(""), /non-empty/);
});
