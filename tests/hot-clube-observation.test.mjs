import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  SOURCE_ID,
  toObservation,
  toObservations,
} from "../ingestion/hot-clube/observation-adapter.mjs";

const EVENTS_DIR = new URL("../fixtures/hot-clube/events/", import.meta.url);
const METADATA_PATH = new URL("../fixtures/hot-clube/metadata.json", import.meta.url);

async function loadMetadata() {
  return JSON.parse(await readFile(METADATA_PATH, "utf8"));
}

async function loadEntries() {
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    const eventId = name.replace(/\.ics$/, "");
    entries.push({
      eventId,
      icsText: await readFile(new URL(name, EVENTS_DIR), "utf8"),
      fixturePath: `fixtures/hot-clube/events/${name}`,
    });
  }
  return entries;
}

test("all 9 retained Hot Clube fixtures produce exactly 9 Observations", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  assert.equal(entries.length, 9);
  const observations = toObservations(entries, metadata);
  assert.equal(observations.length, 9);
});

test("every Hot Clube Observation carries the canonical source_id and a non-empty source_record_id", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const observation of observations) {
    assert.equal(observation.source_id, SOURCE_ID);
    assert.equal(observation.source_id, "hot-clube-de-portugal");
    assert.equal(typeof observation.source_record_id, "string");
    assert.ok(observation.source_record_id.length > 0);
  }
});

test("source_record_id values equal the EventON event_id (the fixture filename), not the ICS UID", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);

  assert.deepEqual(
    observations.map((o) => o.source_record_id).sort(),
    entries.map((e) => e.eventId).sort(),
  );

  for (const observation of observations) {
    assert.notEqual(
      observation.source_record_id,
      observation.source_fields.ics_uid,
      "source_record_id must never equal the (unstable) ICS UID",
    );
  }
});

test("ICS UID is preserved separately, in source_fields.ics_uid, never as source_record_id", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const observation of observations) {
    assert.equal(typeof observation.source_fields.ics_uid, "string");
    assert.ok(observation.source_fields.ics_uid.length > 0);
  }
});

test("no Observation generates a canonical Event ID; event_id only appears inside source_fields as the Hot Clube source identifier", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const observation of observations) {
    const topLevelKeys = Object.keys(observation);
    for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId"]) {
      assert.equal(topLevelKeys.includes(forbidden), false, `${forbidden} must not be a top-level field`);
    }
    assert.equal(observation.source_fields.event_id, observation.source_record_id);
  }
});

test("retrieved_at comes from metadata.json's retained provenance, not the current time", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const observation of observations) {
    assert.equal(observation.retrieved_at, metadata.retrieved_at);
  }
  assert.equal(metadata.retrieved_at, "2026-08-23T18:20:00Z");
});

test("raw evidence points at the retained .ics fixture, byte-faithful — never unfoldedBlock", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const [index, observation] of observations.entries()) {
    assert.equal(observation.raw_evidence.fixture_path, entries[index].fixturePath);
    assert.equal(observation.raw_evidence.evidence_kind, "RAW_HTTP_RESPONSE_BYTES");
    assert.equal(observation.raw_evidence.byte_faithful, true);
  }
});

test("start/end DTSTART/DTEND map through as confirmed UTC instants for event 3794", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const entry = entries.find((e) => e.eventId === "3794");
  const observation = toObservation({ ...entry, metadata });

  assert.equal(observation.start.iso, "2026-08-02T18:30:00Z");
  assert.equal(observation.start.is_utc, true);
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.end.iso, "2026-08-02T22:50:00Z");
});

test("venue_name is left null (ICS LOCATION is not cleanly split); location_text carries the raw LOCATION text", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const observation of observations) {
    assert.equal(observation.venue_name, null);
    assert.equal(typeof observation.location_text, "string");
    assert.ok(observation.location_text.length > 0);
  }
});

test("no coordinates, price, or unproven event_url are invented", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  const observations = toObservations(entries, metadata);
  for (const observation of observations) {
    assert.equal(observation.price_text, null, "no price field exists in any retained VEVENT");
    assert.equal(observation.event_url, null, "the permalink pattern was only noticed, not confirmed");
    const keys = Object.keys(observation);
    for (const forbidden of ["latitude", "longitude", "coordinates"]) {
      assert.equal(keys.includes(forbidden), false, forbidden);
    }
  }
});

test("toObservation throws without a caller-supplied eventId (never derives one from the ICS payload)", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  assert.throws(
    () => toObservation({ eventId: undefined, icsText: entries[0].icsText, fixturePath: entries[0].fixturePath, metadata }),
    /eventId/,
  );
});

test("Observation generation is deterministic from the retained fixtures", async () => {
  const entries = await loadEntries();
  const metadata = await loadMetadata();
  assert.deepEqual(toObservations(entries, metadata), toObservations(entries, metadata));
});
