// Offline, no-network DETERMINISTIC_DERIVATION proof for
// research/source-investigations/le-bataclan-paris-01/ — re-decodes the
// retained fixture (the real, byte-faithful, full response body of Le
// Bataclan's own public /programmation/_payload.json Nuxt data endpoint)
// and confirms the exact claimed field values reproduce deterministically.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { decodeBataclanPayload, extractEventRecords, extractEventRecordsFromPayloadText } from "../ingestion/le-bataclan/discovery.mjs";
import { toObservations, SOURCE_ID, VENUE_NAME } from "../ingestion/le-bataclan/observation-adapter.mjs";

const FIXTURE_PATH = resolve("fixtures/le-bataclan-paris/payload-sample.json");

async function loadRecords() {
  const text = await readFile(FIXTURE_PATH, "utf8");
  return extractEventRecordsFromPayloadText(text);
}

test("decodeBataclanPayload + extractEventRecords reproduce the full 114-record event list", async () => {
  const text = await readFile(FIXTURE_PATH, "utf8");
  const pageData = decodeBataclanPayload(text);
  const events = extractEventRecords(pageData);
  assert.equal(events.length, 114);
});

test("extractEventRecordsFromPayloadText reproduces NAI BARGHOUTI's exact claimed fields", async () => {
  const records = await loadRecords();
  const naiBarghouti = records.find((r) => r.attributes?.title === "NAI BARGHOUTI");
  assert.ok(naiBarghouti);
  assert.equal(naiBarghouti.id, 5776);
  assert.equal(naiBarghouti.attributes.uid, "nai-barghouti_2024-05-12_en");
  assert.equal(naiBarghouti.attributes.date, "2024-05-12T16:30:00.000Z");
  assert.equal(naiBarghouti.attributes.ticketingUrl, "https://billetterie.bataclan.fr/fr/manifestation/189/nai_barghouti");
});

test("extractEventRecordsFromPayloadText reproduces a genuine 2026 record (SPORT & YOGA + METAL) with its price fields", async () => {
  const records = await loadRecords();
  const sportYoga = records.find((r) => r.attributes?.title === "SPORT & YOGA + METAL - PASS 2 SEANCES");
  assert.ok(sportYoga);
  assert.equal(sportYoga.attributes.date, "2026-09-15T17:00:00.000Z");
  assert.equal(sportYoga.attributes.meetings[0].price_min, "39.000000");
  assert.equal(sportYoga.attributes.meetings[0].price_max, "78.000000");
});

test("toObservations builds valid Observations with basis-consistent, non-fabricated fields", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, {
    retrievedAt: "2026-08-26T20:00:00.000Z",
    fixturePath: "fixtures/le-bataclan-paris/payload-sample.json",
  });

  assert.equal(observations.length, 114);
  const sportYoga = observations.find((o) => o.title === "SPORT & YOGA + METAL - PASS 2 SEANCES");
  assert.equal(sportYoga.source_id, SOURCE_ID);
  assert.equal(sportYoga.venue_name, VENUE_NAME);
  assert.equal(sportYoga.start.date, "2026-09-15");
  assert.equal(sportYoga.start.is_utc, true);
  assert.equal(sportYoga.start.certainty, "UTC_INSTANT");
  assert.equal(sportYoga.end.certainty, "UNKNOWN");
  assert.equal(sportYoga.price_text, "39.00-78.00 EUR");
  assert.equal(sportYoga.event_url, "https://billetterie.bataclan.fr/fr/manifestation/769/metal_workout");
  assert.equal(sportYoga.raw_evidence.byte_faithful, false);
});
