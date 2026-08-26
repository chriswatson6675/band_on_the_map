import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { toObservation, toObservations, deriveDateTime } from "../ingestion/festsaal-kreuzberg/observation-adapter.mjs";

async function fixture(name) {
  const text = await readFile(new URL(`../fixtures/festsaal-kreuzberg-berlin/${name}`, import.meta.url), "utf8");
  return JSON.parse(text);
}

test("a real event genuinely at Festsaal Kreuzberg resolves venue_name to Festsaal Kreuzberg", async () => {
  const record = await fixture("event-844.json");
  const obs = toObservation(record, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.title, "Popkultur Festival 2026");
  assert.equal(obs.venue_name, "Festsaal Kreuzberg");
  assert.equal(obs.start.date, "2026-08-27");
  assert.equal(obs.source_fields.relocation_note, null);
});

test("a real event genuinely relocated to a DIFFERENT venue is NEVER forced onto Festsaal Kreuzberg", async () => {
  const record = await fixture("event-702.json");
  const obs = toObservation(record, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.title, "Moka Efti Orchestra");
  assert.equal(obs.venue_name, null, "must not silently default to Festsaal Kreuzberg when the source itself says otherwise");
  assert.match(obs.location_text, /Freilichtbühne Weissensee/);
  assert.equal(obs.source_fields.relocation_note, "Diese Veranstaltung findet in der Freilichtbühne Weissensee statt!");
});

test("deriveDateTime: floating-local when both date and time are present, DATE_ONLY otherwise", () => {
  assert.equal(deriveDateTime("2026-08-28", "19:30:00").certainty, "FLOATING_LOCAL");
  assert.equal(deriveDateTime("2026-08-28", null).certainty, "DATE_ONLY");
  assert.equal(deriveDateTime(null, null).certainty, "UNKNOWN");
});

test("toObservations batch-adapts both real records; toObservation throws without record.id", async () => {
  const a = await fixture("event-844.json");
  const b = await fixture("event-702.json");
  const observations = toObservations([a, b], { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, 2);
  assert.throws(() => toObservation({}), /record.id/);
});
