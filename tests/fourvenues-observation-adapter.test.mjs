import assert from "node:assert/strict";
import test from "node:test";
import { deriveDateTimeFromUnixSeconds, toObservation, toObservations } from "../ingestion/fourvenues/observation-adapter.mjs";

function baseRecord(overrides = {}) {
  return {
    source_record_id: "abc123",
    title: "TYGA CRIB",
    slug: "tyga-crib-25-08-2026",
    event_url: "https://www.fourvenues.com/opium-barcelona/events/tyga-crib-25-08-2026",
    start_unix: 1787693400,
    end_unix: 1787713200,
    genres: ["hits"],
    artists: [],
    age_restriction: 18,
    is_private: false,
    ...overrides,
  };
}

test("a Unix-second timestamp converts to a confirmed UTC instant deterministically", () => {
  const dt = deriveDateTimeFromUnixSeconds(1787693400);
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.is_utc, true);
  assert.equal(dt.iso, "2026-08-25T21:30:00.000Z");
  assert.equal(dt.date, "2026-08-25");
});

test("a missing/non-numeric timestamp is honestly UNKNOWN, never fabricated", () => {
  assert.equal(deriveDateTimeFromUnixSeconds(null).certainty, "UNKNOWN");
  assert.equal(deriveDateTimeFromUnixSeconds("not-a-number").certainty, "UNKNOWN");
});

test("toObservation maps every field through to the Observation contract", () => {
  const observation = toObservation(baseRecord(), { source_id: "opium-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://api.fourvenues.com/no-auth/events?slug=opium-barcelona" });
  assert.equal(observation.source_id, "opium-barcelona");
  assert.equal(observation.source_record_id, "abc123");
  assert.equal(observation.title, "TYGA CRIB");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.venue_name, null); // resolved by source_id, never fabricated
  assert.deepEqual(observation.source_fields.genres, ["hits"]);
  assert.equal(observation.event_url, "https://www.fourvenues.com/opium-barcelona/events/tyga-crib-25-08-2026");
});

test("toObservation throws without a source_record_id or config.source_id", () => {
  assert.throws(() => toObservation({ ...baseRecord(), source_record_id: null }, { source_id: "s" }), /non-empty source_record_id/);
  assert.throws(() => toObservation(baseRecord(), {}), /config.source_id/);
});

test("toObservations maps an array sharing retrieval metadata", () => {
  const observations = toObservations([baseRecord({ source_record_id: "a" }), baseRecord({ source_record_id: "b" })], { source_id: "s" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observations.length, 2);
  assert.equal(observations[1].source_record_id, "b");
});

test("toObservations returns [] for empty/missing input", () => {
  assert.deepEqual(toObservations(null, { source_id: "s" }), []);
});
