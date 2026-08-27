import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  deriveDateTimeFromMeta,
  isMusicRecord,
  toObservation,
  toObservations,
} from "../ingestion/olympia-paris/observation-adapter.mjs";

async function records() {
  const raw = await readFile(new URL("../fixtures/olympia-paris/search-evenements-response-subset.json", import.meta.url), "utf8");
  return JSON.parse(raw).items;
}

test("deriveDateTimeFromMeta: this source's own 'YYYY-MM-DD HH:MM:SS' shape parses as FLOATING_LOCAL, never a guessed UTC instant", () => {
  const dt = deriveDateTimeFromMeta("2026-09-03 20:30:00");
  assert.equal(dt.date, "2026-09-03");
  assert.equal(dt.certainty, "FLOATING_LOCAL");
  assert.equal(dt.is_utc, null);
  assert.equal(dt.iso, null);

  const unknown = deriveDateTimeFromMeta(null);
  assert.equal(unknown.certainty, "UNKNOWN");
});

test("isMusicRecord: this source's own genre taxonomy discriminates Comedy from real music genres", async () => {
  const items = await records();
  const babyKeem = items.find((r) => r.post_title === "Baby Keem");
  const jarry = items.find((r) => r.post_title === "Jarry");
  assert.equal(isMusicRecord(babyKeem), true); // genre: International Rap / Hip-Hop
  assert.equal(isMusicRecord(jarry), false); // genre: Comedy only
});

test("toObservation: real Baby Keem record adapts correctly, floating-local certainty, real price text", async () => {
  const items = await records();
  const babyKeem = items.find((r) => r.post_title === "Baby Keem");
  const obs = toObservation(babyKeem, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(obs.source_id, "olympia-paris");
  assert.equal(obs.source_record_id, String(babyKeem.ID));
  assert.equal(obs.title, "Baby Keem");
  assert.equal(obs.start.date, "2026-09-03");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.end.date, "2026-09-03");
  assert.equal(obs.venue_name, "L'Olympia");
  assert.equal(obs.event_url, babyKeem.permalink);
  assert.equal(obs.price_text, babyKeem.meta.gamme_de_prix);
  assert.equal(obs.source_fields.genre[0], "International Rap / Hip-Hop");
});

test("toObservation: a real multi-day record (Jarry) carries a distinct end date", async () => {
  const items = await records();
  const jarry = items.find((r) => r.post_title === "Jarry");
  const obs = toObservation(jarry, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(obs.start.date, "2026-09-09");
  assert.equal(obs.end.date, "2026-09-11");
});

test("toObservations batch-adapts real records; every source_record_id is unique; throws on malformed input", async () => {
  const items = await records();
  const observations = toObservations(items, { retrievedAt: "2026-08-26T18:00:00Z" });
  assert.equal(observations.length, items.length);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length);
  assert.throws(() => toObservation({}), /record\.ID/);
});
