import assert from "node:assert/strict";
import test from "node:test";
import {
  createObservation,
  emptyDateTime,
  emptyRawEvidence,
  validateObservation,
} from "../ingestion/observation/contract.mjs";

test("createObservation fills every optional field with null/empty defaults, not fabricated values", () => {
  const observation = createObservation({
    source_id: "example-source",
    source_record_id: "123",
    retrieved_at: "2026-01-01T00:00:00Z",
  });

  assert.equal(observation.title, null);
  assert.equal(observation.description, null);
  assert.equal(observation.venue_name, null);
  assert.equal(observation.location_text, null);
  assert.equal(observation.price_text, null);
  assert.equal(observation.event_url, null);
  assert.deepEqual(observation.source_fields, {});
  assert.deepEqual(observation.start, emptyDateTime());
  assert.deepEqual(observation.end, emptyDateTime());
  assert.deepEqual(observation.raw_evidence, emptyRawEvidence());
});

test("createObservation throws when a required field is missing", () => {
  assert.throws(
    () => createObservation({ source_id: "x", retrieved_at: "2026-01-01T00:00:00Z" }),
    /source_record_id/,
  );
  assert.throws(
    () => createObservation({ source_id: "x", source_record_id: "1" }),
    /retrieved_at/,
  );
  assert.throws(
    () => createObservation({ source_record_id: "1", retrieved_at: "2026-01-01T00:00:00Z" }),
    /source_id/,
  );
});

test("validateObservation returns errors without throwing", () => {
  const errors = validateObservation({ source_id: "x" });
  assert.ok(errors.length >= 2);
  assert.equal(validateObservation({
    source_id: "x",
    source_record_id: "1",
    retrieved_at: "2026-01-01T00:00:00Z",
  }).length, 0);
});

test("no top-level Observation field is a canonical Event identity field", () => {
  const observation = createObservation({
    source_id: "example-source",
    source_record_id: "123",
    retrieved_at: "2026-01-01T00:00:00Z",
  });
  const keys = Object.keys(observation);
  for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId", "id"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} must not be a top-level Observation field`);
  }
});

test("emptyDateTime defaults every field to null/UNKNOWN rather than a guessed value", () => {
  assert.deepEqual(emptyDateTime(), {
    raw: null,
    date: null,
    iso: null,
    is_utc: null,
    tzid: null,
    certainty: "UNKNOWN",
  });
});

test("two calls with identical input produce deep-equal Observations (deterministic)", () => {
  const build = () =>
    createObservation({
      source_id: "example-source",
      source_record_id: "123",
      retrieved_at: "2026-01-01T00:00:00Z",
      title: "Example",
    });
  assert.deepEqual(build(), build());
});
