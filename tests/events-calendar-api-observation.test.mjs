import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeEventRecord, parseEventsPage } from "../ingestion/events-calendar-api/client.mjs";
import { deriveDateTime, toObservation, toObservations } from "../ingestion/events-calendar-api/observation-adapter.mjs";
import { CCB_MUSIC_CONFIG } from "../ingestion/ccb/config.mjs";

async function loadFixture(path) {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
}

async function loadRecord(fixturePath, id) {
  const body = await loadFixture(fixturePath);
  const { events } = parseEventsPage(body);
  const raw = events.find((e) => e.id === id);
  if (!raw) throw new Error(`fixture record ${id} not found in ${fixturePath}`);
  return normalizeEventRecord(raw);
}

// --- deriveDateTime certainty tiers ---

test("deriveDateTime: UTC_INSTANT when the source's own utc_* field is present", async () => {
  const record = await loadRecord("ccb/events-page-1.json", 281912);
  const start = deriveDateTime(record, "start");
  assert.equal(start.certainty, "UTC_INSTANT");
  assert.equal(start.iso, "2026-09-27T16:00:00Z");
  assert.equal(start.is_utc, true);
  assert.equal(start.date, "2026-09-27");
  assert.equal(start.tzid, "Europe/Lisbon");
});

test("deriveDateTime: TZID_QUALIFIED_UNRESOLVED when only a local date+timezone are present, no UTC field", () => {
  const record = { start_local: "2026-11-05 19:00:00", start_utc: null, timezone: "Europe/Lisbon" };
  const start = deriveDateTime(record, "start");
  assert.equal(start.certainty, "TZID_QUALIFIED_UNRESOLVED");
  assert.equal(start.date, "2026-11-05");
  assert.equal(start.iso, null);
  assert.equal(start.is_utc, false);
});

test("deriveDateTime: FLOATING_LOCAL when only a local date is present, no timezone at all", async () => {
  const record = await loadRecord("events-calendar-api/missing-optional-fields.json", 500001);
  const start = deriveDateTime(record, "start");
  assert.equal(start.certainty, "FLOATING_LOCAL");
  assert.equal(start.date, "2026-11-05");
  assert.equal(start.tzid, null);
});

test("deriveDateTime: TEXT_ONLY when raw text exists but does not parse as a full date-time", () => {
  const record = { start_local: "sometime in November", start_utc: null, timezone: null };
  const start = deriveDateTime(record, "start");
  assert.equal(start.certainty, "TEXT_ONLY");
  assert.equal(start.raw, "sometime in November");
  assert.equal(start.date, null);
});

test("deriveDateTime: UNKNOWN when nothing at all is present (e.g. the 'end' edge for a sparse record)", async () => {
  const record = await loadRecord("events-calendar-api/missing-optional-fields.json", 500001);
  const end = deriveDateTime(record, "end");
  assert.equal(end.certainty, "UNKNOWN");
  assert.equal(end.raw, null);
});

// --- toObservation ---

test("toObservation maps a real CCB event into a well-formed Observation with venue/price/url populated correctly", async () => {
  const record = await loadRecord("ccb/events-page-1.json", 281912);
  const obs = toObservation(record, CCB_MUSIC_CONFIG, {
    retrievedAt: "2026-08-25T09:00:00Z",
    sourceUrl: "https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica",
    fixturePath: "fixtures/ccb/events-page-1.json",
  });

  assert.equal(obs.source_id, "ccb-centro-cultural-belem");
  assert.equal(obs.source_record_id, "281912");
  assert.equal(obs.title, "Sinfonia n.º 5 de Beethoven");
  assert.equal(obs.venue_name, "Centro Cultural de Belém");
  assert.equal(obs.location_text, "Praça do Império, Lisboa, 1449-003, Portugal");
  assert.equal(obs.price_text, null); // real CCB events never populate cost — honestly null, not fabricated
  assert.equal(obs.event_url, "https://www.ccb.pt/evento/sinfonia-n-o-5-de-beethoven/");
  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.start.iso, "2026-09-27T16:00:00Z");
  assert.equal(obs.end.iso, "2026-09-27T17:30:00Z");
  assert.equal(obs.source_fields.wp_post_id, "281912");
  assert.deepEqual(obs.source_fields.categories.includes("musica"), true);
  assert.equal(obs.raw_evidence.byte_faithful, false);
  assert.equal(obs.raw_evidence.fixture_path, "fixtures/ccb/events-page-1.json");
});

test("toObservation maps a populated cost field into price_text verbatim for a compatible (non-CCB) source", async () => {
  const record = await loadRecord("events-calendar-api/price-populated.json", 500002);
  const obs = toObservation(record, { source_id: "example-compatible-site" }, { retrievedAt: "2026-08-25T09:00:00Z" });
  assert.equal(obs.price_text, "15€ - 30€");
  assert.equal(obs.venue_name, "Example Compatible Venue");
});

test("toObservation leaves venue_name/location_text null for a record with no venue data", async () => {
  const record = await loadRecord("events-calendar-api/missing-optional-fields.json", 500001);
  const obs = toObservation(record, { source_id: "example-compatible-site" }, { retrievedAt: "2026-08-25T09:00:00Z" });
  assert.equal(obs.venue_name, null);
  assert.equal(obs.location_text, null);
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}, { source_id: "x" }), /source_record_id/);
});

test("toObservation throws without config.source_id", () => {
  assert.throws(() => toObservation({ source_record_id: "1" }, {}), /source_id/);
});

test("toObservation never produces a top-level canonical event-identity field", async () => {
  const record = await loadRecord("ccb/events-page-1.json", 281912);
  const obs = toObservation(record, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });
  assert.equal("event_id" in obs, false);
  assert.equal("canonical_event_id" in obs, false);
  assert.equal("canonicalEventId" in obs, false);
});

test("toObservation is deterministic — running twice on the same fixture produces deep-equal output (no Date.now() leakage besides the explicit retrievedAt)", async () => {
  const record = await loadRecord("ccb/events-page-1.json", 281912);
  const obsA = toObservation(record, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });
  const obsB = toObservation(record, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });
  assert.deepEqual(obsA, obsB);
});

// --- toObservations (batch) ---

test("toObservations maps every record in a batch, preserving stable source_record_id across repeated acquisition", async () => {
  const body = await loadFixture("ccb/events-page-1.json");
  const { events } = parseEventsPage(body);
  const records = events.map(normalizeEventRecord);

  const first = toObservations(records, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });
  const second = toObservations(records, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });

  assert.equal(first.length, 3);
  assert.deepEqual(
    first.map((o) => o.source_record_id),
    second.map((o) => o.source_record_id),
  );
  assert.deepEqual(first, second);
});
