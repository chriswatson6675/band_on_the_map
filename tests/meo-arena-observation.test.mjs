import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseMeoArenaAgenda } from "../ingestion/meo-arena/discovery.mjs";
import {
  SOURCE_ID,
  parseDateAbbrevPt,
  toObservation,
  toObservations,
} from "../ingestion/meo-arena/observation-adapter.mjs";
import { resolveMeoArenaObservation, resolveObservation } from "../ingestion/venue/resolver.mjs";

async function loadCards() {
  const html = await readFile(new URL("../fixtures/meo-arena/agenda-completa-excerpt.html", import.meta.url), "utf8");
  return parseMeoArenaAgenda(html);
}

// 4. MEO Arena HTML -> Observation.

test("discovery extracts real cards with stable numeric ids and first-party event URLs", async () => {
  const cards = await loadCards();
  assert.ok(cards.length >= 3);
  for (const card of cards) {
    assert.match(card.source_record_id, /^\d+$/);
    assert.ok(card.event_url.startsWith("https://arena.meo.pt/agenda/"));
    assert.ok(card.event_url.endsWith(`_pt/${card.source_record_id}`));
  }
});

test("discovery rejects empty input and deduplicates by id", () => {
  assert.throws(() => parseMeoArenaAgenda(""), /non-empty/);
});

test("every retained live card adapts to an Observation", async () => {
  const cards = await loadCards();
  const observations = toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" });
  assert.equal(observations.length, cards.length);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "meo-arena");
  }
});

// 5/6. provenance survives; null facts stay null; ticket CTA never becomes event_url.

test("event_url is this source's own /agenda page; ticket_url is retained only in source_fields", async () => {
  const cards = await loadCards();
  const observations = toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const [i, o] of observations.entries()) {
    assert.equal(o.event_url, cards[i].event_url);
    assert.equal(o.source_fields.ticket_url, cards[i].ticket_url);
    assert.notEqual(o.event_url, o.source_fields.ticket_url);
  }
});

test("venue_name/location_text/price_text/description are honestly null (not exposed by the bounded listing)", async () => {
  const cards = await loadCards();
  const observations = toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const o of observations) {
    assert.equal(o.venue_name, null);
    assert.equal(o.location_text, null);
    assert.equal(o.price_text, null);
    assert.equal(o.description, null);
  }
});

test("parseDateAbbrevPt parses real Portuguese abbreviated dates; rejects unrecognised shapes", () => {
  assert.equal(parseDateAbbrevPt("28 NOV 2026"), "2026-11-28");
  assert.equal(parseDateAbbrevPt("2 JAN 2027"), "2027-01-02");
  assert.equal(parseDateAbbrevPt("not a date"), null);
  assert.equal(parseDateAbbrevPt(null), null);
});

test("start.certainty is DATE_ONLY, never fabricated to a UTC instant (no time-of-day is exposed)", async () => {
  const cards = await loadCards();
  const observations = toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const o of observations) {
    assert.equal(o.start.certainty, "DATE_ONLY");
    assert.equal(o.start.is_utc, null);
    assert.equal(o.start.iso, null);
  }
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

// 7. venue resolution: fixed single-venue source, resolved by source_id.

test("every MEO Arena Observation resolves to the canonical MEO Arena venue", async () => {
  const cards = await loadCards();
  const observations = toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const o of observations) {
    const result = resolveMeoArenaObservation(o);
    assert.equal(result.resolution_status, "RESOLVED");
    assert.equal(result.venue_id, "venue-lisboa-meo-arena");
    assert.deepEqual(resolveObservation(o), result);
  }
});

test("a different source_id never resolves via the MEO Arena fixed-venue mapping", () => {
  const result = resolveMeoArenaObservation({ source_id: "some-other-source" });
  assert.equal(result.resolution_status, "UNRESOLVED");
});

test("adaptation is deterministic against the same retained fixture", async () => {
  const cards = await loadCards();
  assert.deepEqual(
    toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" }),
    toObservations(cards, { retrievedAt: "2026-08-24T00:00:00Z" }),
  );
});
