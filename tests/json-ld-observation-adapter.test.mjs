import assert from "node:assert/strict";
import test from "node:test";
import { deriveDateTimeFromIso, toObservation, toObservations } from "../ingestion/json-ld/observation-adapter.mjs";

function baseRecord(overrides = {}) {
  return {
    source_record_id: "test-1",
    title: "Test Gig",
    description: null,
    event_url: "https://example.cat/evento/test-1/",
    start_raw: "2026-09-17T21:00:00+02:00",
    end_raw: null,
    location_name: null,
    location_address: null,
    performers: [],
    price_text: null,
    ticket_url: null,
    types: ["MusicEvent"],
    event_status: null,
    event_attendance_mode: null,
    ...overrides,
  };
}

test("an explicit UTC offset is converted to a confirmed UTC instant", () => {
  const dt = deriveDateTimeFromIso("2026-09-17T21:00:00+02:00");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.is_utc, true);
  assert.equal(dt.iso, "2026-09-17T19:00:00.000Z");
  assert.equal(dt.date, "2026-09-17");
});

test("a bare Z offset is a confirmed UTC instant", () => {
  const dt = deriveDateTimeFromIso("2026-09-17T19:00:00Z");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-09-17T19:00:00.000Z");
});

test("a named CEST offset (Sala Apolo's own non-standard shape) converts to a confirmed UTC instant", () => {
  const dt = deriveDateTimeFromIso("2026-08-26 CEST 23:59");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-08-26T21:59:00.000Z");
});

test("a named CET (winter) offset converts with the correct +01:00 offset", () => {
  const dt = deriveDateTimeFromIso("2026-01-15 CET 20:00");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-01-15T19:00:00.000Z");
});

test("a non-zero-padded ISO offset (Harlem Jazz Club's own real shape) converts to a confirmed UTC instant", () => {
  const dt = deriveDateTimeFromIso("2026-8-27T22:30+2:00");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-08-27T20:30:00.000Z");
});

test("a non-zero-padded ISO offset with a double-digit day still parses correctly", () => {
  const dt = deriveDateTimeFromIso("2026-8-9T09:05+2:00");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.date, "2026-08-09");
});

test("an ISO basic numeric offset is normalized without inferring a timezone", () => {
  const dt = deriveDateTimeFromIso("2026-09-25T21:00:00+0200");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-09-25T19:00:00.000Z");
  assert.equal(dt.date, "2026-09-25");
});

test("a datetime with no offset at all is honestly FLOATING_LOCAL, never guessed into UTC", () => {
  const dt = deriveDateTimeFromIso("2026-09-17T21:00:00");
  assert.equal(dt.certainty, "FLOATING_LOCAL");
  assert.equal(dt.is_utc, false);
  assert.equal(dt.iso, null);
  assert.equal(dt.date, "2026-09-17");
});

test("a bare date is DATE_ONLY", () => {
  const dt = deriveDateTimeFromIso("2026-09-17");
  assert.equal(dt.certainty, "DATE_ONLY");
  assert.equal(dt.date, "2026-09-17");
});

test("free text that isn't a recognisable date shape is TEXT_ONLY", () => {
  const dt = deriveDateTimeFromIso("mid-September");
  assert.equal(dt.certainty, "TEXT_ONLY");
  assert.equal(dt.raw, "mid-September");
});

test("a missing value is UNKNOWN, never fabricated", () => {
  assert.equal(deriveDateTimeFromIso(null).certainty, "UNKNOWN");
  assert.equal(deriveDateTimeFromIso("").certainty, "UNKNOWN");
});

test("toObservation maps every field through to the Observation contract", () => {
  const record = baseRecord({
    location_name: "Sala Test",
    location_address: { streetAddress: "Carrer Test 1", postalCode: "08001", addressLocality: "Barcelona", addressRegion: null, addressCountry: "ES" },
    performers: ["Test Band"],
    price_text: "15 EUR",
  });
  const observation = toObservation(record, { source_id: "test-source" }, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://example.cat/agenda" });

  assert.equal(observation.source_id, "test-source");
  assert.equal(observation.source_record_id, "test-1");
  assert.equal(observation.title, "Test Gig");
  assert.equal(observation.venue_name, "Sala Test");
  assert.equal(observation.location_text, "Carrer Test 1, 08001, Barcelona");
  assert.equal(observation.price_text, "15 EUR");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.deepEqual(observation.source_fields.performers, ["Test Band"]);
});

test("venue_name falls back to venueNameOverride only when the record itself has none", () => {
  const opts = { retrievedAt: "2026-08-26T00:00:00.000Z", venueNameOverride: "Fallback Name" };
  const withName = toObservation(baseRecord({ location_name: "Sala Real" }), { source_id: "s" }, opts);
  assert.equal(withName.venue_name, "Sala Real");

  const withoutName = toObservation(baseRecord({ location_name: null }), { source_id: "s" }, opts);
  assert.equal(withoutName.venue_name, "Fallback Name");
});

test("event_url falls back to ticket_url only when the record has no own event_url", () => {
  const observation = toObservation(
    baseRecord({ event_url: null, ticket_url: "https://tickets.example.cat/x" }),
    { source_id: "s" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.event_url, "https://tickets.example.cat/x");
});

test("a known detail-page URL fills a missing event URL without overriding better explicit URLs", () => {
  const options = {
    retrievedAt: "2026-08-26T00:00:00.000Z",
    sourceUrl: "https://example.cat/events/test-1",
    eventDetailUrl: "https://example.cat/events/test-1",
  };
  const fallback = toObservation(baseRecord({ event_url: null, ticket_url: null }), { source_id: "s" }, options);
  assert.equal(fallback.event_url, options.eventDetailUrl);
  assert.equal(fallback.source_fields.event_detail_url, options.eventDetailUrl);

  const explicit = toObservation(baseRecord({ event_url: "https://canonical.example/event/1" }), { source_id: "s" }, options);
  assert.equal(explicit.event_url, "https://canonical.example/event/1");

  const ticket = toObservation(baseRecord({ event_url: null, ticket_url: "https://tickets.example/event/1" }), { source_id: "s" }, options);
  assert.equal(ticket.event_url, "https://tickets.example/event/1");
});

test("programme, API, feed, and search source URLs are provenance only", () => {
  for (const sourceUrl of [
    "https://example.cat/programme",
    "https://example.cat/api/events",
    "https://example.cat/calendar.ics",
    "https://example.cat/search?q=music",
  ]) {
    const observation = toObservation(
      baseRecord({ event_url: null, ticket_url: null }),
      { source_id: "s" },
      { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl },
    );
    assert.equal(observation.source_url, sourceUrl);
    assert.equal(observation.event_url, null);
    assert.equal(observation.source_fields.event_detail_url, null);
  }
});

test("toObservation throws without a source_record_id or config.source_id", () => {
  assert.throws(() => toObservation({ ...baseRecord(), source_record_id: null }, { source_id: "s" }), /non-empty source_record_id/);
  assert.throws(() => toObservation(baseRecord(), {}), /config.source_id/);
});

test("toObservations maps an array and shares the same retrieval metadata", () => {
  const observations = toObservations([baseRecord({ source_record_id: "a" }), baseRecord({ source_record_id: "b" })], { source_id: "s" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observations.length, 2);
  assert.equal(observations[0].retrieved_at, "2026-08-26T00:00:00.000Z");
  assert.equal(observations[1].source_record_id, "b");
});

test("toObservations returns an empty array for empty/missing input", () => {
  assert.deepEqual(toObservations(null, { source_id: "s" }), []);
});
