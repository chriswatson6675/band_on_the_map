import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCardsFromApiResponse, parseEventCardHtml } from "../ingestion/le-hasard-ludique/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/le-hasard-ludique/observation-adapter.mjs";

async function apiResponseText() {
  return readFile(new URL("../fixtures/le-hasard-ludique-paris/api-events.json", import.meta.url), "utf8");
}

test("extractEventCardsFromApiResponse: the real retained /api/events fixture yields real cards", async () => {
  const cards = extractEventCardsFromApiResponse(await apiResponseText());
  assert.ok(cards.length > 10);

  const yama = cards.find((c) => c.title === "Yama");
  assert.ok(yama);
  assert.equal(yama.eventUrl, "/concert/2026-07-09/yama");
  assert.equal(yama.dateText, "04.09.2026");
  assert.equal(yama.place, "La Salle");
  assert.equal(yama.category, "concert");
});

test("extractEventCardsFromApiResponse: an ampersand-escaped title decodes correctly", async () => {
  const cards = extractEventCardsFromApiResponse(await apiResponseText());
  const donjone = cards.find((c) => c.eventUrl === "/animations/2026-07-10/donjone-dragone-7");
  assert.ok(donjone);
  assert.equal(donjone.title, "Donjon·e & Dragon·e #7");
});

test("parseEventCardHtml: returns null for a fragment missing the expected shape", () => {
  assert.equal(parseEventCardHtml("<div>not a card</div>"), null);
  assert.equal(parseEventCardHtml(""), null);
});

test("toObservation: real Yama card adapts correctly, DATE_ONLY certainty, no fabricated time/price", async () => {
  const cards = extractEventCardsFromApiResponse(await apiResponseText());
  const yama = cards.find((c) => c.title === "Yama");
  const obs = toObservation(yama, { retrievedAt: "2026-08-26T13:35:00Z" });

  assert.equal(obs.source_id, "le-hasard-ludique-paris");
  assert.equal(obs.source_record_id, "/concert/2026-07-09/yama");
  assert.equal(obs.title, "Yama");
  assert.equal(obs.start.date, "2026-09-04");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.venue_name, "Le Hasard Ludique");
  assert.equal(obs.location_text, "La Salle");
  assert.equal(obs.event_url, "https://www.lehasardludique.paris/concert/2026-07-09/yama");
  assert.equal(obs.price_text, null);
  assert.equal(obs.end.date, null);
});

test("toObservation: a multi-day range date ('12-13.09.2026') stays TEXT_ONLY, never guessed to a single day", async () => {
  const cards = extractEventCardsFromApiResponse(await apiResponseText());
  const vinyles = cards.find((c) => c.eventUrl === "/autre/2026-07-30/vente-de-vinyles-dizonord");
  assert.ok(vinyles);
  assert.equal(vinyles.dateText, "12-13.09.2026");
  const obs = toObservation(vinyles, { retrievedAt: "2026-08-26T13:35:00Z" });
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "TEXT_ONLY");
  assert.equal(obs.start.raw, "12-13.09.2026");
});

test("toObservations: batch-adapts every real card with unique source_record_ids", async () => {
  const cards = extractEventCardsFromApiResponse(await apiResponseText());
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T13:35:00Z" });
  assert.equal(observations.length, cards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique",
  );
  assert.throws(() => extractEventCardsFromApiResponse(""), /non-empty/);
});
