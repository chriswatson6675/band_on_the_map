import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEventsResponse } from "../ingestion/coliseu-porto/client.mjs";
import {
  SOURCE_ID,
  parseColiseuUtcInstant,
  toObservation,
  toObservations,
} from "../ingestion/coliseu-porto/observation-adapter.mjs";

async function loadRealNodes() {
  const body = await readFile(new URL("../fixtures/coliseu-porto/events-page-1.json", import.meta.url), "utf8");
  return parseEventsResponse(body).nodes;
}

async function loadSyntheticNodes() {
  const body = await readFile(new URL("../fixtures/coliseu-porto/events-page-2-synthetic.json", import.meta.url), "utf8");
  return parseEventsResponse(body).nodes;
}

const RETRIEVED_AT = "2026-08-27T00:00:00.000Z";
const SOURCE_URL = "https://nest.coliseu.pt/graph/";

// 1. every real sampled event becomes a valid Observation

test("toObservations produces one Observation per node on the real retained sample", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT, sourceUrl: SOURCE_URL });
  assert.equal(observations.length, 5);
});

test("every Observation carries the existing sources/porto.json registry id, never a new one", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT, sourceUrl: SOURCE_URL });
  assert.equal(SOURCE_ID, "coliseu-do-porto");
  for (const o of observations) {
    assert.equal(o.source_id, "coliseu-do-porto");
  }
});

// 2. start is UTC_INSTANT, never fabricated

test("start is derived as confirmed UTC_INSTANT for every real sampled event", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  const first = observations.find((o) => o.source_record_id === "1951");
  assert.equal(first.start.date, "2026-09-12");
  assert.equal(first.start.iso, "2026-09-12T20:00:00.000Z");
  assert.equal(first.start.is_utc, true);
  assert.equal(first.start.certainty, "UTC_INSTANT");
  for (const o of observations) {
    assert.equal(o.start.certainty, "UTC_INSTANT");
    assert.equal(o.start.is_utc, true);
    assert.ok(/Z$/.test(o.start.iso));
  }
});

test("parseColiseuUtcInstant fails closed on non-UTC or malformed instants, never guesses", () => {
  assert.deepEqual(parseColiseuUtcInstant("2026-09-12T20:00:00.000Z"), {
    date: "2026-09-12",
    iso: "2026-09-12T20:00:00.000Z",
  });
  assert.equal(parseColiseuUtcInstant("2026-09-12T20:00:00+01:00"), null);
  assert.equal(parseColiseuUtcInstant("2026-09-12"), null);
  assert.equal(parseColiseuUtcInstant(null), null);
  assert.equal(parseColiseuUtcInstant(undefined), null);
});

// 3. end is deliberately NOT promoted beyond what was proven

test("end is never derived from estimatedDuration; estimatedDuration is retained only as informational provenance", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  const michaelJackson = observations.find((o) => o.source_record_id === "1951");
  assert.equal(michaelJackson.end.certainty, "UNKNOWN");
  assert.equal(michaelJackson.end.iso, null);
  assert.equal(michaelJackson.end.date, null);
  assert.equal(michaelJackson.source_fields.estimatedDuration_seconds, 8100);
  for (const o of observations) {
    assert.equal(o.end.certainty, "UNKNOWN");
    assert.equal(o.end.iso, null);
  }
});

// 4. price is honestly NOT_PRESENT

test("price_text is always null — no price field exists in this source's schema", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.equal(o.price_text, null);
  }
});

// 5. location_text is the room name; venue_name stays null (resolved by source_id elsewhere)

test("location_text is the source's own room.name; venue_name is left null", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  const salaPrincipal = observations.find((o) => o.source_record_id === "1951");
  assert.equal(salaPrincipal.location_text, "Sala Principal");
  assert.equal(salaPrincipal.venue_name, null);

  const coliseuBox = observations.find((o) => o.source_record_id === "1977");
  assert.equal(coliseuBox.location_text, "Coliseu Box");
  assert.equal(coliseuBox.venue_name, null);
});

// 6. event_url deterministically constructed from slug

test("event_url is deterministically constructed as https://www.coliseu.pt/evento/{slug}", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  const first = observations.find((o) => o.source_record_id === "1951");
  assert.equal(first.event_url, "https://www.coliseu.pt/evento/20260912-he-s-back-michael-jackson-tribute");
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://www.coliseu.pt/evento/"));
  }
});

// 7. source_record_id is the GraphQL id, as a string

test("source_record_id is the GraphQL node's own id, coerced to a string", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  assert.deepEqual(
    observations.map((o) => o.source_record_id),
    ["1951", "1923", "1955", "1911", "1977"],
  );
  for (const o of observations) {
    assert.equal(typeof o.source_record_id, "string");
  }
});

// 8. provenance retained, never promoted to a stronger canonical field

test("ticketsSeller/ticketsUrl/category/promoter/minimumAge are retained in source_fields only", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  const sigurRos = observations.find((o) => o.source_record_id === "1923");
  assert.equal(sigurRos.source_fields.ticketsSeller, "TICKETLINE");
  assert.equal(sigurRos.source_fields.ticketsUrl, "sigur-ros-102947");
  assert.equal(sigurRos.source_fields.category, "Música");
  assert.equal(sigurRos.source_fields.promoter, "Everything is New");
  assert.equal(sigurRos.source_fields.minimumAge, "M/6");
  assert.equal(sigurRos.source_fields.room, "Sala Principal");
  assert.equal(sigurRos.source_fields.slug, "20260913-sigur-ros-the-orchestral-tour");
});

// 9. fails closed rather than fabricating an identity

test("toObservation throws without a node id, never fabricates a source_record_id", () => {
  assert.throws(() => toObservation({ name: "x" }), /non-empty id/);
  assert.throws(() => toObservation(null), /non-empty id/);
});

// 10. Observation contract validity / no direct Event fields

test("every Observation is a valid Observation, never a canonical Event field", async () => {
  const nodes = await loadRealNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
  }
});

// 11. deterministic rerun

test("adaptation is deterministic against the same retained fixture", async () => {
  const nodes = await loadRealNodes();
  assert.deepEqual(
    toObservations(nodes, { retrievedAt: RETRIEVED_AT }),
    toObservations(nodes, { retrievedAt: RETRIEVED_AT }),
  );
});

// 12. the synthetic pagination fixture also exercises the adapter cleanly
// (structural coverage only — never asserted as real retained evidence)

test("synthetic fixture nodes also adapt into valid Observations (structural pagination coverage only)", async () => {
  const nodes = await loadSyntheticNodes();
  const observations = toObservations(nodes, { retrievedAt: RETRIEVED_AT });
  assert.equal(observations.length, 2);
  for (const o of observations) {
    assert.equal(o.source_id, "coliseu-do-porto");
    assert.equal(o.start.certainty, "UTC_INSTANT");
    assert.equal(o.price_text, null);
  }
});
