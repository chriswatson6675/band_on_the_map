import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseHotFiveShows } from "../ingestion/hot-five-porto/discovery.mjs";
import {
  SOURCE_ID,
  VENUE_LOCATION_TEXT,
  compositeSourceRecordId,
  toObservation,
  toObservations,
} from "../ingestion/hot-five-porto/observation-adapter.mjs";

async function loadFixtureRecords() {
  const html = await readFile(new URL("../fixtures/hot-five-porto/shows-excerpt.html", import.meta.url), "utf8");
  return parseHotFiveShows(html);
}

const RETRIEVED_AT = "2026-08-25T01:31:00.000Z";

// 1. the core regression this collector exists to prove: NEVER a fabricated year

test("start.date and start.iso are null, certainty TEXT_ONLY, for every produced Observation", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  assert.equal(observations.length, 6);
  for (const o of observations) {
    assert.equal(o.start.date, null, `${o.title}: start.date must stay null`);
    assert.equal(o.start.iso, null, `${o.title}: start.iso must stay null`);
    assert.equal(o.start.is_utc, null);
    assert.equal(o.start.tzid, null);
    assert.equal(o.start.certainty, "TEXT_ONLY");
    assert.ok(o.start.raw, "start.raw must retain the verbatim date text");
    assert.doesNotMatch(o.start.raw, /\b(19|20)\d{2}\b/, "start.raw must never contain a fabricated/derived year");
  }
});

test("end is entirely NOT_PRESENT (UNKNOWN certainty, all fields null) for every Observation", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.equal(o.end.raw, null);
    assert.equal(o.end.date, null);
    assert.equal(o.end.iso, null);
    assert.equal(o.end.certainty, "UNKNOWN");
  }
});

// 2. source_record_id: the documented composite-key alternative identity strategy

test("compositeSourceRecordId derives a stable, first-party (title + date_text) key", () => {
  assert.equal(compositeSourceRecordId("Live Jazz", "28 ago"), "live-jazz-28-ago");
  assert.equal(compositeSourceRecordId("Amy Winehouse (Back to Amy)", "03 jul"), "amy-winehouse-back-to-amy-03-jul");
});

test("compositeSourceRecordId throws rather than accepting an empty title or date_text", () => {
  assert.throws(() => compositeSourceRecordId("", "28 ago"), /title/);
  assert.throws(() => compositeSourceRecordId("Live Jazz", ""), /dateText/);
});

test("source_record_id is the composite key, never the third-party lebillet.eu numeric id", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  const liveJazz = observations.find((o) => o.title === "Live Jazz");
  assert.equal(liveJazz.source_record_id, "live-jazz-28-ago");
  assert.notEqual(liveJazz.source_record_id, "1981");
  assert.equal(liveJazz.source_fields.ticketing_numeric_id, "1981");
});

test("source_record_id is unique across every Observation produced from the fixture", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  const ids = observations.map((o) => o.source_record_id);
  assert.equal(new Set(ids).size, ids.length);
});

// 3. ticketing id/url retained honestly as provenance only, never promoted

test("ticketing_url/ticketing_numeric_id are retained in source_fields, never used as event_url or source_record_id", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  const allAboutBlues = observations.find((o) => o.title === "All About... Blues");
  assert.equal(allAboutBlues.source_fields.ticketing_url, "https://lebillet.eu/event/1877/all-about-blues-02-julho-Porto-POR");
  assert.equal(allAboutBlues.source_fields.ticketing_numeric_id, "1877");
  assert.equal(allAboutBlues.event_url, null);

  const jamSession = observations.find((o) => o.title === "Jam Session");
  assert.equal(jamSession.source_fields.ticketing_url, null);
  assert.equal(jamSession.source_fields.ticketing_numeric_id, null);
});

// 4. NOT_PRESENT fields stay honestly null

test("price_text and event_url are null for every Observation (NOT_PRESENT in the source)", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.equal(o.price_text, null);
    assert.equal(o.event_url, null);
  }
});

// 5. venue_location: PROVEN, single fixed venue, exact evidenced address text

test("location_text is the exact PROVEN venue address for every Observation; venue_name stays null", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  assert.equal(VENUE_LOCATION_TEXT, "R. de Guerra Junqueiro 495, 4150-098 Porto");
  for (const o of observations) {
    assert.equal(o.location_text, "R. de Guerra Junqueiro 495, 4150-098 Porto");
    assert.equal(o.venue_name, null);
  }
});

// 6. source identity / contract validity

test("source_id is the exact registry id this collector was built against", async () => {
  const records = await loadFixtureRecords();
  const [o] = toObservations(records, { retrievedAt: RETRIEVED_AT });
  assert.equal(o.source_id, SOURCE_ID);
  assert.equal(o.source_id, "hot-five-porto");
});

test("every Observation is contract-valid and carries no canonical Event field", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
  }
});

test("toObservation throws without a title or date_text, never fabricates a card", () => {
  assert.throws(() => toObservation({ date_text: "28 ago" }), /title/);
  assert.throws(() => toObservation({ title: "Live Jazz" }), /date_text/);
});

// 7. deterministic rerun against the same retained fixture

test("adaptation is deterministic against the same retained fixture", async () => {
  const records = await loadFixtureRecords();
  assert.deepEqual(
    toObservations(records, { retrievedAt: RETRIEVED_AT }),
    toObservations(records, { retrievedAt: RETRIEVED_AT }),
  );
});

// 8. title retained verbatim (PROVEN field)

test("title is retained for every Observation", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.ok(o.title && o.title.length > 0);
  }
});
