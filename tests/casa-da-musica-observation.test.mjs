import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseCasaDaMusicaAgenda, parseCasaDaMusicaNextPageUrl } from "../ingestion/casa-da-musica/discovery.mjs";
import { SOURCE_ID, toObservation, toObservations } from "../ingestion/casa-da-musica/observation-adapter.mjs";
import { resolveCasaDaMusicaObservation, resolveObservation } from "../ingestion/venue/resolver.mjs";

async function loadRecords() {
  const html = await readFile(new URL("../fixtures/casa-da-musica/agenda-page-1-excerpt.html", import.meta.url), "utf8");
  return parseCasaDaMusicaAgenda(html);
}

test("discovery extracts real cards with stable numeric session ids and first-party event URLs", async () => {
  const records = await loadRecords();
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.match(record.source_record_id, /^\d+$/);
    assert.ok(record.event_url.startsWith("https://casadamusica.com/event/"));
    assert.ok(record.datetime_text);
    assert.ok(record.title);
  }
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseCasaDaMusicaAgenda(""), /non-empty/);
});

test("discovery deduplicates by session id and preserves first-occurrence order", async () => {
  const records = await loadRecords();
  const ids = records.map((r) => r.source_record_id);
  assert.deepEqual(ids, ["54265", "53899", "53742"]);
});

test("discovery reads the document's own rel=next pagination link", async () => {
  const html = await readFile(new URL("../fixtures/casa-da-musica/agenda-page-1-excerpt.html", import.meta.url), "utf8");
  // This bounded excerpt does not retain the <head>, so no next link is present —
  // confirms the parser returns null rather than guessing one.
  assert.equal(parseCasaDaMusicaNextPageUrl(html), null);
  assert.equal(
    parseCasaDaMusicaNextPageUrl('<link rel="next" href="https://casadamusica.com/agenda/page/2/" />'),
    "https://casadamusica.com/agenda/page/2/",
  );
});

test("every retained live card adapts to an Observation", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, {
    retrievedAt: "2026-08-24T01:34:47.000Z",
    sourceUrl: "https://casadamusica.com/agenda/",
  });
  assert.equal(observations.length, records.length);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "casa-da-musica");
  }
});

test("start.date is honestly derived from the machine-readable datetime attribute, certainty FLOATING_LOCAL", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" });
  assert.deepEqual(
    observations.map((o) => o.start.date),
    ["2026-08-25", "2026-08-26", "2026-08-28"],
  );
  for (const o of observations) {
    assert.equal(o.start.certainty, "FLOATING_LOCAL");
    assert.equal(o.start.is_utc, null);
    assert.equal(o.start.iso, null);
    assert.ok(o.start.raw.startsWith(o.start.date));
  }
});

test("end is honestly empty; no duration is fabricated", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" });
  for (const o of observations) {
    assert.deepEqual(o.end, { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" });
  }
});

test("venue_name/location_text are honestly null; room is retained only in source_fields", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" });
  for (const [i, o] of observations.entries()) {
    assert.equal(o.venue_name, null);
    assert.equal(o.location_text, null);
    assert.equal(o.source_fields.room, records[i].room);
  }
});

test("price_text and subtitle survive from source-provided text", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" });
  assert.equal(observations[0].price_text, "14,00€");
  assert.equal(observations[0].source_fields.subtitle, "Fado e Música Tradicional POrtuguesa");
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

test("every Casa da Música Observation resolves to the one canonical Casa da Música venue", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" });
  for (const o of observations) {
    const result = resolveCasaDaMusicaObservation(o);
    assert.equal(result.resolution_status, "RESOLVED");
    assert.equal(result.venue_id, "venue-porto-casa-da-musica");
    assert.deepEqual(resolveObservation(o), result);
  }
});

test("a different source_id never resolves via the Casa da Música fixed-venue mapping", () => {
  const result = resolveCasaDaMusicaObservation({ source_id: "some-other-source" });
  assert.equal(result.resolution_status, "UNRESOLVED");
});

test("adaptation is deterministic against the same retained fixture", async () => {
  const records = await loadRecords();
  assert.deepEqual(
    toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" }),
    toObservations(records, { retrievedAt: "2026-08-24T01:34:47.000Z" }),
  );
});
