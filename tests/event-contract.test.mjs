// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — Event contract
// unit tests. Pure and offline.

import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_CATEGORIES,
  EVENT_ID_PATTERN,
  EVENT_STATUSES,
  EVENT_TYPES_BY_CATEGORY,
  OCCURRENCE_SHAPES,
  createEvent,
  createEventId,
  hasKnownTime,
  isEventId,
  validateEvent,
  validateEventRegistry,
} from "../ingestion/event/contract.mjs";

const utcInstant = (iso) => ({
  raw: iso,
  date: iso.slice(0, 10),
  iso,
  is_utc: true,
  tzid: null,
  certainty: "UTC_INSTANT",
});

const dateOnly = (date, raw = date) => ({
  raw,
  date,
  iso: null,
  is_utc: null,
  tzid: null,
  certainty: "DATE_ONLY",
});

const unknownTime = () => ({ raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" });

const event = (overrides = {}) =>
  createEvent({
    event_id: createEventId(),
    event_category: "MUSIC",
    event_type: "GIG",
    display_title: "A Gig",
    occurrence_shape: "POINT_IN_TIME",
    start: utcInstant("2026-11-04T20:00:00.000Z"),
    end: null,
    status: "SCHEDULED",
    venue_id: "venue-lisboa-meo-arena",
    parent_event_id: null,
    admitted_at: "2026-09-21T00:00:00.000Z",
    admission_basis: { basis_kind: "SINGLE_OBSERVATION", method: "test" },
    ...overrides,
  });

/* ---------------------------------------------------------------- */
/* IDENTITY                                                          */
/* ---------------------------------------------------------------- */

test("an Event id is event- plus a UUIDv4", () => {
  const id = createEventId();
  assert.match(id, EVENT_ID_PATTERN);
  assert.ok(id.startsWith("event-"));
  assert.ok(isEventId(id));
  assert.equal(id.length, "event-".length + 36);
});

test("createEventId takes no Event attributes at all", () => {
  // Mechanical statement of the property: the function declares no
  // required parameter, so no attribute can be an input to an id.
  assert.equal(createEventId.length, 0);

  // And passing attributes changes nothing about what comes out.
  const pinned = () => "11111111-1111-4111-8111-111111111111";
  const bare = createEventId({ uuid: pinned });
  const stuffed = createEventId({
    uuid: pinned,
    event_category: "SPORT",
    event_type: "FOOTBALL_FIXTURE",
    venue_id: "ukmec-england-ipswich-portman-road",
    start: utcInstant("2026-11-04T20:00:00.000Z"),
    fingerprint: "dof1-gc-football-20261104T140000Z-ead8dac1af8c337d1908812d",
    platform_match_id: "013f5700-aaca-11f1-b783-1d1d94fe4064",
    display_title: "Dundee v Everton",
  });
  assert.equal(stuffed, bare, "no supplied attribute may reach the id");
});

test("two admissions of anything mint different ids", () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i += 1) ids.add(createEventId());
  assert.equal(ids.size, 1000);
});

test("an id generator can be injected so tests can pin values", () => {
  const id = createEventId({ uuid: () => "22222222-2222-4222-9222-222222222222" });
  assert.equal(id, "event-22222222-2222-4222-9222-222222222222");
  assert.ok(isEventId(id));
});

test("an Event rejects an id that is not application-issued", () => {
  for (const bad of [
    "dof1-gc-football-20261104T140000Z-ead8dac1af8c337d1908812d",
    "013f5700-aaca-11f1-b783-1d1d94fe4064",
    "gcf-013f5700-aaca-11f1-b783-1d1d94fe4064-20261104T140000Z",
    "event-not-a-uuid",
    "venue-lisboa-meo-arena",
    "",
    null,
  ]) {
    const errors = validateEvent({ ...event(), event_id: bad });
    assert.ok(
      errors.some((error) => error.includes("event_id")),
      `${bad} must be rejected as an Event id`,
    );
  }
});

/* ---------------------------------------------------------------- */
/* CLASSIFICATION                                                    */
/* ---------------------------------------------------------------- */

test("the defined vocabulary is exactly what the architecture defines", () => {
  assert.deepEqual([...EVENT_CATEGORIES].sort(), ["MUSIC", "SPORT"]);
  assert.deepEqual([...EVENT_TYPES_BY_CATEGORY.get("MUSIC")].sort(), ["FESTIVAL", "GIG", "PERFORMANCE"]);
  assert.deepEqual([...EVENT_TYPES_BY_CATEGORY.get("SPORT")], ["FOOTBALL_FIXTURE"]);
  assert.equal(EVENT_TYPES_BY_CATEGORY.size, 2, "no speculative category is pre-defined");
});

test("MUSIC/GIG and SPORT/FOOTBALL_FIXTURE are both valid", () => {
  assert.deepEqual(validateEvent(event({ event_category: "MUSIC", event_type: "GIG" })), []);
  assert.deepEqual(
    validateEvent(event({ event_category: "SPORT", event_type: "FOOTBALL_FIXTURE", venue_id: null })),
    [],
  );
});

test("a type from the wrong category is rejected", () => {
  for (const [category, type] of [
    ["MUSIC", "FOOTBALL_FIXTURE"],
    ["SPORT", "GIG"],
    ["SPORT", "FESTIVAL"],
  ]) {
    const errors = validateEvent({ ...event(), event_category: category, event_type: type });
    assert.ok(errors.some((error) => error.includes("event_type")), `${category}+${type} must be rejected`);
  }
});

test("a category that is not yet defined is rejected", () => {
  for (const category of ["BUSINESS", "ARTS", "COMEDY", "THEATRE", "OTHER", null]) {
    const errors = validateEvent({ ...event(), event_category: category, event_type: "CONFERENCE" });
    assert.ok(errors.some((error) => error.includes("event_category")), `${category} must be rejected`);
  }
});

test("classification is not part of identity", () => {
  // Re-classifying an Event is a field edit. Nothing recomputes the id,
  // because nothing can: createEventId takes no attributes.
  const original = event({ event_category: "MUSIC", event_type: "GIG" });
  const reclassified = { ...original, event_category: "SPORT", event_type: "FOOTBALL_FIXTURE" };
  assert.deepEqual(validateEvent(reclassified), []);
  assert.equal(reclassified.event_id, original.event_id);
});

/* ---------------------------------------------------------------- */
/* TIME                                                              */
/* ---------------------------------------------------------------- */

test("a DATE_ONLY start is accepted, because real music evidence has one", () => {
  // The MEO Arena pilot Observations genuinely carry date "2026-10-04"
  // with iso null. Requiring an instant here would force a fabrication.
  const withDateOnly = event({ start: dateOnly("2026-10-04", "04 OUT 2026") });
  assert.deepEqual(validateEvent(withDateOnly), []);
  assert.equal(withDateOnly.start.iso, null);
});

test("a start with no genuinely known time is rejected", () => {
  const errors = validateEvent({ ...event(), start: unknownTime() });
  assert.ok(errors.some((error) => error.includes("start must carry a genuinely known")));
  assert.equal(hasKnownTime(unknownTime()), false);
});

test("a stated certainty must match what is actually carried", () => {
  const noInstant = validateEvent({
    ...event(),
    start: { ...utcInstant("2026-11-04T20:00:00.000Z"), iso: null },
  });
  assert.ok(noInstant.some((error) => error.includes("start.iso is required when certainty is UTC_INSTANT")));

  const fabricated = validateEvent({
    ...event(),
    start: { ...dateOnly("2026-10-04"), iso: "2026-10-04T00:00:00.000Z" },
  });
  assert.ok(fabricated.some((error) => error.includes("start.iso must be null when certainty is DATE_ONLY")));
});

test("POINT_IN_TIME needs a start and tolerates a null end", () => {
  assert.deepEqual(validateEvent(event({ occurrence_shape: "POINT_IN_TIME", end: null })), []);
  assert.deepEqual(
    validateEvent(event({ occurrence_shape: "POINT_IN_TIME", end: unknownTime() })),
    [],
    "an unknown end is honest, not invalid, for a point occurrence",
  );
});

test("a RUN needs a known end that does not precede its start", () => {
  const valid = event({
    occurrence_shape: "RUN",
    event_type: "FESTIVAL",
    start: dateOnly("2026-06-24"),
    end: dateOnly("2026-06-28"),
  });
  assert.deepEqual(validateEvent(valid), []);

  const noEnd = validateEvent({ ...valid, end: unknownTime() });
  assert.ok(noEnd.some((error) => error.includes("a RUN must carry a genuinely known end")));

  const backwards = validateEvent({ ...valid, end: dateOnly("2026-06-20") });
  assert.ok(backwards.some((error) => error.includes("end must not precede its start")));

  const sameDay = validateEvent({ ...valid, end: dateOnly("2026-06-24") });
  assert.deepEqual(sameDay, [], "a run that starts and ends on one day is valid");
});

test("a RUN across instants is ordered as instants", () => {
  // Built by spread, not createEvent(): createEvent throws on an invalid
  // Event, so an intentionally-backwards record must be handed straight
  // to validateEvent().
  const backwards = validateEvent({
    ...event(),
    occurrence_shape: "RUN",
    event_type: "FESTIVAL",
    start: utcInstant("2026-06-24T10:00:00.000Z"),
    end: utcInstant("2026-06-24T09:00:00.000Z"),
  });
  assert.ok(backwards.some((error) => error.includes("end must not precede its start")));

  const forwards = validateEvent({
    ...event(),
    occurrence_shape: "RUN",
    event_type: "FESTIVAL",
    start: utcInstant("2026-06-24T09:00:00.000Z"),
    end: utcInstant("2026-06-24T10:00:00.000Z"),
  });
  assert.deepEqual(forwards, []);
});

test("the occurrence shapes are exactly the two the architecture defines", () => {
  assert.deepEqual([...OCCURRENCE_SHAPES].sort(), ["POINT_IN_TIME", "RUN"]);
  assert.ok(validateEvent({ ...event(), occurrence_shape: "CONTINUOUS" }).some((e) => e.includes("occurrence_shape")));
});

/* ---------------------------------------------------------------- */
/* STATUS                                                            */
/* ---------------------------------------------------------------- */

test("the five real-world statuses are accepted", () => {
  assert.deepEqual([...EVENT_STATUSES].sort(), [
    "CANCELLED",
    "COMPLETED",
    "POSTPONED",
    "SCHEDULED",
    "UNCONFIRMED",
  ]);
  for (const status of EVENT_STATUSES) {
    assert.deepEqual(validateEvent(event({ status })), [], `${status} must be valid`);
  }
});

test("RESCHEDULED is not a status", () => {
  // A rescheduled Event is simply SCHEDULED at its new time; the move
  // itself is schedule history, not a permanent state.
  assert.equal(EVENT_STATUSES.has("RESCHEDULED"), false);
  const errors = validateEvent({ ...event(), status: "RESCHEDULED" });
  assert.ok(errors.some((error) => error.includes("status must be one of")));
});

/* ---------------------------------------------------------------- */
/* VENUE AND CONTAINMENT                                             */
/* ---------------------------------------------------------------- */

test("venue_id is nullable and its absence does not invalidate an Event", () => {
  assert.deepEqual(validateEvent(event({ venue_id: null })), []);
});

test("venue_id accepts both a music venue id and a major-event census id", () => {
  // Hardcoding a "venue-" prefix would quietly make the Event core
  // music-only: the football estate's governed venues are census ids.
  assert.deepEqual(validateEvent(event({ venue_id: "venue-lisboa-meo-arena" })), []);
  assert.deepEqual(validateEvent(event({ venue_id: "ukmec-england-ipswich-portman-road" })), []);
  assert.ok(validateEvent({ ...event(), venue_id: "Not A Ref" }).some((e) => e.includes("venue_id")));
});

test("parent_event_id is nullable, must be an Event id, and cannot be self", () => {
  assert.deepEqual(validateEvent(event({ parent_event_id: null })), []);

  const parentId = createEventId();
  assert.deepEqual(validateEvent(event({ parent_event_id: parentId })), []);

  const self = event();
  const errors = validateEvent({ ...self, parent_event_id: self.event_id });
  assert.ok(errors.some((error) => error.includes("must not be the Event's own id")));

  assert.ok(
    validateEvent({ ...event(), parent_event_id: "dof1-gc-football-20261104T140000Z-ead8" })
      .some((error) => error.includes("parent_event_id")),
  );
});

/* ---------------------------------------------------------------- */
/* WHAT MUST NOT BE ON THE EVENT CORE                                */
/* ---------------------------------------------------------------- */

test("the Event core carries no source, provider or fingerprint field", () => {
  const keys = Object.keys(event());
  for (const forbidden of [
    "source_id",
    "source_record_id",
    "platform_match_id",
    "provider_namespace",
    "provider_event_key",
    "fingerprint",
    "occurrence_fingerprint",
    "publisher_domains",
    "source_count",
  ]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} must not be an Event core field`);
  }
});

test("createEvent ignores stray evidence fields rather than storing them", () => {
  const built = createEvent({
    ...event(),
    event_id: createEventId(),
    fingerprint: "dof1-gc-football-20261104T140000Z-ead8dac1af8c337d1908812d",
    source_id: "ukmec-england-ipswich-portman-road--www-itfc-co-uk-matches",
  });
  assert.equal("fingerprint" in built, false);
  assert.equal("source_id" in built, false);
});

/* ---------------------------------------------------------------- */
/* REGISTRY                                                          */
/* ---------------------------------------------------------------- */

test("an empty registry is valid", () => {
  assert.deepEqual(validateEventRegistry([]), []);
});

test("duplicate event ids are a registry error", () => {
  const one = event();
  const errors = validateEventRegistry([one, { ...one }]);
  assert.ok(errors.some((error) => error.includes("duplicate event_id")));
});

test("a parent reference must resolve, and cycles are detected", () => {
  const parent = event({ event_type: "FESTIVAL", occurrence_shape: "RUN", start: dateOnly("2026-06-24"), end: dateOnly("2026-06-28") });
  const child = event({ parent_event_id: parent.event_id });

  assert.deepEqual(validateEventRegistry([parent, child]), []);

  const dangling = validateEventRegistry([child]);
  assert.ok(dangling.some((error) => error.includes("does not reference a known Event")));

  const a = event();
  const b = event();
  const cycle = validateEventRegistry([
    { ...a, parent_event_id: b.event_id },
    { ...b, parent_event_id: a.event_id },
  ]);
  assert.ok(cycle.some((error) => error.includes("parent cycle")));
});

test("parent and child need not share a category or a venue", () => {
  const parent = event({
    event_category: "SPORT",
    event_type: "FOOTBALL_FIXTURE",
    occurrence_shape: "RUN",
    start: dateOnly("2026-06-24"),
    end: dateOnly("2026-07-14"),
    venue_id: null,
  });
  const child = event({
    event_category: "MUSIC",
    event_type: "PERFORMANCE",
    venue_id: "venue-lisboa-meo-arena",
    parent_event_id: parent.event_id,
  });
  assert.deepEqual(validateEventRegistry([parent, child]), []);
});
