// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — admission, mapping
// and schedule-history tests.
//
// Every admission here runs against a THROWAWAY registry root under the
// OS temp directory. Nothing in this file touches the repository's own
// events/*.json, which must stay empty — a control asserted at the end.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVENT_ID_PATTERN } from "../ingestion/event/contract.mjs";
import {
  BASIS_KINDS,
  createOccurrenceMapping,
  mappingIdentityKey,
  observationRef,
  validateOccurrenceMapping,
  validateOccurrenceMappingRegistry,
} from "../ingestion/event/occurrence-mapping.mjs";
import {
  createScheduleAssertion,
  currentAssertionFor,
  validateScheduleHistoryRegistry,
} from "../ingestion/event/schedule-history.mjs";
import {
  EVENTS_PATH,
  MAPPINGS_PATH,
  SCHEDULE_PATH,
  readState,
  validateState,
  writeRegistries,
} from "../ingestion/event/registry.mjs";
import { EventAdmissionConflictError, admitEvent, attachOccurrenceEvidence } from "../ingestion/event/admission.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function scratchRoot() {
  return mkdtemp(resolve(tmpdir(), "botm-event-admission-"));
}

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

/** A MUSIC/GIG admission request backed by one Observation. */
const musicRequest = (overrides = {}) => ({
  event: {
    event_category: "MUSIC",
    event_type: "GIG",
    display_title: "EVANESCENCE 2026 WORLD TOUR",
    occurrence_shape: "POINT_IN_TIME",
    start: dateOnly("2026-10-04", "04 OUT 2026"),
    end: null,
    status: "SCHEDULED",
    venue_id: "venue-lisboa-meo-arena",
    parent_event_id: null,
    ...overrides.event,
  },
  basis: {
    basis_kind: "SINGLE_OBSERVATION",
    observations: [observationRef("meo-arena", "15722")],
    method: "caller's governed decision: venue's own calendar",
    evidence: [],
    ...overrides.basis,
  },
  admitted_at: "2026-09-21T00:00:00.000Z",
  ...(overrides.admitted_at ? { admitted_at: overrides.admitted_at } : {}),
});

/** A SPORT/FOOTBALL_FIXTURE admission request backed by a fingerprint. */
const footballRequest = (overrides = {}) => ({
  event: {
    event_category: "SPORT",
    event_type: "FOOTBALL_FIXTURE",
    display_title: null,
    occurrence_shape: "POINT_IN_TIME",
    start: utcInstant("2026-07-18T13:00:00.000Z"),
    end: null,
    status: "COMPLETED",
    venue_id: "ukmec-scotland-dundee-dens-park",
    parent_event_id: null,
    ...overrides.event,
  },
  basis: {
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: "dof1-gc-football-20260718T130000Z-4f08817f27d9daf89f771718",
    observations: [
      observationRef("ukmec-england-bramley-moore-dock--www-evertonfc-com-matches", "a527e730"),
      observationRef("ukmec-england-walton-liverpool-goodison-park--www-evertonfc-com-matches", "a527e730"),
    ],
    method: "caller's governed decision: reconciled multi-source fixture group",
    evidence: [],
    ...overrides.basis,
  },
  admitted_at: "2026-09-21T00:00:00.000Z",
});

/* ---------------------------------------------------------------- */
/* ADMISSION — THE HAPPY PATH, FOR BOTH DOMAINS                      */
/* ---------------------------------------------------------------- */

test("a MUSIC/GIG request is admitted through the generic foundation", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await admitEvent(musicRequest(), { root });

  assert.equal(result.outcome, "ADMITTED");
  assert.match(result.event.event_id, EVENT_ID_PATTERN);
  assert.equal(result.event.event_category, "MUSIC");
  assert.equal(result.event.event_type, "GIG");
  assert.equal(result.event.start.certainty, "DATE_ONLY", "date-only music evidence survives admission");

  assert.equal(result.mapping.event_id, result.event.event_id);
  assert.equal(result.mapping.basis_kind, "SINGLE_OBSERVATION");
  assert.equal(result.mapping.lifecycle, "ACTIVE");

  assert.equal(result.schedule_assertion.event_id, result.event.event_id);
  assert.equal(result.schedule_assertion.lifecycle, "CURRENT");

  const state = await readState({ root });
  assert.equal(state.events.length, 1);
  assert.equal(state.mappings.length, 1);
  assert.equal(state.scheduleHistory.length, 1);
  assert.deepEqual(validateState(state), []);
});

test("a SPORT/FOOTBALL_FIXTURE request is admitted through the SAME foundation", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await admitEvent(footballRequest(), { root });

  assert.equal(result.outcome, "ADMITTED");
  assert.match(result.event.event_id, EVENT_ID_PATTERN);
  assert.equal(result.event.event_category, "SPORT");
  assert.equal(result.mapping.basis_kind, "PROVIDER_FINGERPRINT");
  assert.equal(
    result.mapping.fingerprint,
    "dof1-gc-football-20260718T130000Z-4f08817f27d9daf89f771718",
    "the fingerprint is retained as evidence",
  );

  // And the fingerprint is nowhere near the identity.
  assert.equal(result.event.event_id.includes("dof1"), false);
  assert.equal(JSON.stringify(result.event).includes("dof1"), false);
});

test("both domains can be admitted into one registry and it stays valid", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const gig = await admitEvent(musicRequest(), { root });
  const fixture = await admitEvent(footballRequest(), { root });

  assert.notEqual(gig.event.event_id, fixture.event.event_id);
  const state = await readState({ root });
  assert.equal(state.events.length, 2);
  assert.deepEqual(validateState(state), []);
});

test("an Event with no resolved venue is admissible", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await admitEvent(
    footballRequest({ event: { venue_id: null }, basis: { fingerprint: "dof1-gc-football-20260725T101500Z-35d624944a2ac54319ac6fe6" } }),
    { root },
  );

  assert.equal(result.outcome, "ADMITTED");
  assert.equal(result.event.venue_id, null);
  assert.deepEqual(validateState(await readState({ root })), []);
});

/* ---------------------------------------------------------------- */
/* IDEMPOTENCY AND CONFLICT                                          */
/* ---------------------------------------------------------------- */

test("an exact replay does not mint a second Event", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await admitEvent(footballRequest(), { root });
  const replay = await admitEvent(footballRequest(), { root });

  assert.equal(first.outcome, "ADMITTED");
  assert.equal(replay.outcome, "ALREADY_ADMITTED");
  assert.equal(replay.event.event_id, first.event.event_id);

  const state = await readState({ root });
  assert.equal(state.events.length, 1, "a replay must not create a second Event");
  assert.equal(state.mappings.length, 1, "a replay must not create a second mapping");
  assert.equal(state.scheduleHistory.length, 1);
});

test("replay is idempotent for single-observation music evidence too", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await admitEvent(musicRequest(), { root });
  const replay = await admitEvent(musicRequest(), { root });

  assert.equal(replay.outcome, "ALREADY_ADMITTED");
  assert.equal(replay.event.event_id, first.event.event_id);
  assert.equal((await readState({ root })).events.length, 1);
});

test("a music association is keyed on its whole observation set, in any order", () => {
  const forwards = mappingIdentityKey({
    basis_kind: "MUSIC_ASSOCIATION",
    observations: [observationRef("hot-clube-de-portugal", "3801"), observationRef("teatro-variedades-capitolio", "2915")],
  });
  const backwards = mappingIdentityKey({
    basis_kind: "MUSIC_ASSOCIATION",
    observations: [observationRef("teatro-variedades-capitolio", "2915"), observationRef("hot-clube-de-portugal", "3801")],
  });
  assert.equal(forwards, backwards, "member order must not change the idempotency key");

  const different = mappingIdentityKey({
    basis_kind: "MUSIC_ASSOCIATION",
    observations: [observationRef("hot-clube-de-portugal", "3801"), observationRef("teatro-variedades-capitolio", "9999")],
  });
  assert.notEqual(forwards, different);
});

test("one active fingerprint cannot map to two different Events", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await admitEvent(footballRequest(), { root });

  // Attaching the same fingerprint to a DIFFERENT Event must refuse.
  const other = await admitEvent(musicRequest(), { root });
  await assert.rejects(
    () =>
      attachOccurrenceEvidence(
        {
          event_id: other.event.event_id,
          basis: footballRequest().basis,
          attached_at: "2026-09-21T01:00:00.000Z",
        },
        { root },
      ),
    (error) => {
      assert.ok(error instanceof EventAdmissionConflictError);
      assert.equal(error.details.existing_event_id, first.event.event_id);
      return true;
    },
  );

  assert.equal((await readState({ root })).mappings.length, 2, "the refused attach wrote nothing");
});

test("a registry holding one active fingerprint against two Events fails validation", () => {
  const eventA = "event-11111111-1111-4111-8111-111111111111";
  const eventB = "event-22222222-2222-4222-9222-222222222222";
  const base = {
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: "dof1-x",
    observations: [observationRef("s", "1")],
    method: "m",
    evidence: [],
    decided_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "ACTIVE",
    superseded_reason: null,
  };
  const errors = validateOccurrenceMappingRegistry([
    { ...base, event_id: eventA },
    { ...base, event_id: eventB },
  ]);
  assert.ok(errors.some((error) => error.includes("maps the same evidence to")));
});

/* ---------------------------------------------------------------- */
/* LATER EVIDENCE ATTACHMENT                                         */
/* ---------------------------------------------------------------- */

test("a second provider attaches to the existing Event without minting a new id", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const admitted = await admitEvent(footballRequest(), { root });

  const attached = await attachOccurrenceEvidence(
    {
      event_id: admitted.event.event_id,
      basis: {
        basis_kind: "PROVIDER_FINGERPRINT",
        fingerprint: "dof2-other-provider-20260718T130000Z-abcdef012345",
        observations: [observationRef("another-provider-calendar", "zz-991")],
        method: "caller's governed decision: same fixture, second provider",
        evidence: [],
      },
      attached_at: "2026-09-21T02:00:00.000Z",
    },
    { root },
  );

  assert.equal(attached.outcome, "ATTACHED");
  assert.equal(attached.event.event_id, admitted.event.event_id, "the Event id must not move");

  const state = await readState({ root });
  assert.equal(state.events.length, 1, "no second Event");
  assert.equal(state.mappings.length, 2, "two pieces of evidence, one Event");
  assert.deepEqual(new Set(state.mappings.map((m) => m.event_id)).size, 1);
  assert.deepEqual(validateState(state), []);
});

test("attaching the same evidence twice is idempotent", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const admitted = await admitEvent(musicRequest(), { root });
  const basis = {
    basis_kind: "SINGLE_OBSERVATION",
    observations: [observationRef("agendalx", "242166")],
    method: "caller's governed decision",
    evidence: [],
  };
  const request = { event_id: admitted.event.event_id, basis, attached_at: "2026-09-21T03:00:00.000Z" };

  const first = await attachOccurrenceEvidence(request, { root });
  const second = await attachOccurrenceEvidence(request, { root });

  assert.equal(first.outcome, "ATTACHED");
  assert.equal(second.outcome, "ALREADY_ATTACHED");
  assert.equal((await readState({ root })).mappings.length, 2, "one admission mapping plus one attachment");
});

test("attaching to an unknown Event refuses", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      attachOccurrenceEvidence(
        {
          event_id: "event-33333333-3333-4333-8333-333333333333",
          basis: musicRequest().basis,
          attached_at: "2026-09-21T00:00:00.000Z",
        },
        { root },
      ),
    /no Event/,
  );
});

/* ---------------------------------------------------------------- */
/* MAPPING CONTRACT                                                  */
/* ---------------------------------------------------------------- */

test("the basis kinds are exactly the three the architecture needs", () => {
  assert.deepEqual([...BASIS_KINDS].sort(), ["MUSIC_ASSOCIATION", "PROVIDER_FINGERPRINT", "SINGLE_OBSERVATION"]);
});

test("a provider id or fingerprint can never be written as an event_id", () => {
  for (const notAnEventId of [
    "dof1-gc-football-20260718T130000Z-4f08817f27d9daf89f771718",
    "a527e730-6a36-11f1-aac4-0b3e482c279d",
    "gcf-a527e730-20260718T130000Z",
    "meo-arena",
  ]) {
    const errors = validateOccurrenceMapping({
      event_id: notAnEventId,
      basis_kind: "SINGLE_OBSERVATION",
      fingerprint: null,
      observations: [observationRef("s", "1")],
      method: "m",
      evidence: [],
      decided_at: "2026-09-21T00:00:00.000Z",
      lifecycle: "ACTIVE",
      superseded_reason: null,
    });
    assert.ok(
      errors.some((error) => error.includes("event_id must be an application-issued Event id")),
      `${notAnEventId} must be rejected as an event_id`,
    );
  }
});

test("each basis kind enforces the evidence shape its name claims", () => {
  const base = {
    event_id: "event-11111111-1111-4111-8111-111111111111",
    method: "m",
    evidence: [],
    decided_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "ACTIVE",
    superseded_reason: null,
  };

  const noFingerprint = validateOccurrenceMapping({
    ...base,
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: null,
    observations: [observationRef("s", "1")],
  });
  assert.ok(noFingerprint.some((error) => error.includes("requires a non-empty fingerprint")));

  const soloAssociation = validateOccurrenceMapping({
    ...base,
    basis_kind: "MUSIC_ASSOCIATION",
    fingerprint: null,
    observations: [observationRef("s", "1")],
  });
  assert.ok(soloAssociation.some((error) => error.includes("two or more Observations")));

  // A music association legitimately has NO provider key.
  const association = validateOccurrenceMapping({
    ...base,
    basis_kind: "MUSIC_ASSOCIATION",
    fingerprint: null,
    observations: [observationRef("hot-clube-de-portugal", "3801"), observationRef("teatro-variedades-capitolio", "2915")],
  });
  assert.deepEqual(association, []);

  const twoForSingle = validateOccurrenceMapping({
    ...base,
    basis_kind: "SINGLE_OBSERVATION",
    fingerprint: null,
    observations: [observationRef("s", "1"), observationRef("s", "2")],
  });
  assert.ok(twoForSingle.some((error) => error.includes("exactly one Observation")));
});

test("observation refs must identify a source and a record", () => {
  const errors = validateOccurrenceMapping({
    event_id: "event-11111111-1111-4111-8111-111111111111",
    basis_kind: "SINGLE_OBSERVATION",
    fingerprint: null,
    observations: [{ source_id: "", source_record_id: null }],
    method: "m",
    evidence: [],
    decided_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "ACTIVE",
    superseded_reason: null,
  });
  assert.ok(errors.some((error) => error.includes("source_id is required")));
  assert.ok(errors.some((error) => error.includes("source_record_id is required")));
});

test("superseded evidence keeps its provenance and states a reason", () => {
  const superseded = createOccurrenceMapping({
    event_id: "event-11111111-1111-4111-8111-111111111111",
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: "dof1-old",
    observations: [observationRef("s", "1")],
    method: "m",
    evidence: [{ note: "original acquisition" }],
    decided_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "SUPERSEDED",
    superseded_reason: "kickoff moved; provider emitted a new fingerprint",
  });
  assert.equal(superseded.fingerprint, "dof1-old", "the old fingerprint stays traceable");
  assert.equal(superseded.evidence.length, 1);

  const noReason = validateOccurrenceMapping({ ...superseded, superseded_reason: null });
  assert.ok(noReason.some((error) => error.includes("must state superseded_reason")));
});

/* ---------------------------------------------------------------- */
/* SCHEDULE HISTORY                                                  */
/* ---------------------------------------------------------------- */

test("admission creates exactly one CURRENT schedule assertion", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const admitted = await admitEvent(footballRequest(), { root });
  const state = await readState({ root });

  assert.equal(state.scheduleHistory.length, 1);
  const current = currentAssertionFor(state.scheduleHistory, admitted.event.event_id);
  assert.ok(current);
  assert.deepEqual(current.start, admitted.event.start);
  assert.equal(current.status, admitted.event.status);
  assert.equal(current.superseded_at, null);
});

test("a later assertion can supersede the first without touching the Event id", () => {
  // The rescheduling WORKFLOW is a later package; this proves the
  // structure it will need already holds: append, supersede, same id.
  const eventId = "event-11111111-1111-4111-8111-111111111111";
  const basis = { basis_kind: "PROVIDER_FINGERPRINT", method: "m" };

  const original = createScheduleAssertion({
    event_id: eventId,
    start: utcInstant("2026-07-18T13:00:00.000Z"),
    end: null,
    status: "SCHEDULED",
    asserted_by: basis,
    asserted_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "SUPERSEDED",
    superseded_at: "2026-09-22T00:00:00.000Z",
  });

  const rescheduled = createScheduleAssertion({
    event_id: eventId,
    start: utcInstant("2026-07-19T13:00:00.000Z"),
    end: null,
    status: "SCHEDULED",
    asserted_by: basis,
    asserted_at: "2026-09-22T00:00:00.000Z",
    lifecycle: "CURRENT",
  });

  const errors = validateScheduleHistoryRegistry([original, rescheduled]);
  assert.deepEqual(errors, []);
  assert.equal(original.event_id, rescheduled.event_id, "the Event id survives the move");
  assert.equal(currentAssertionFor([original, rescheduled], eventId).start.iso, "2026-07-19T13:00:00.000Z");
  assert.equal(original.start.iso, "2026-07-18T13:00:00.000Z", "the prior schedule is retained, not overwritten");
});

test("two CURRENT assertions for one Event is a registry error", () => {
  const eventId = "event-11111111-1111-4111-8111-111111111111";
  const assertion = createScheduleAssertion({
    event_id: eventId,
    start: utcInstant("2026-07-18T13:00:00.000Z"),
    end: null,
    status: "SCHEDULED",
    asserted_by: { basis_kind: "PROVIDER_FINGERPRINT", method: "m" },
    asserted_at: "2026-09-21T00:00:00.000Z",
  });
  const errors = validateScheduleHistoryRegistry([assertion, { ...assertion }]);
  assert.ok(errors.some((error) => error.includes("already has a CURRENT assertion")));
});

/* ---------------------------------------------------------------- */
/* PERSISTENCE                                                       */
/* ---------------------------------------------------------------- */

test("an invalid prospective state is refused before anything is written", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      writeRegistries(
        {
          events: [],
          // A mapping referencing an Event that does not exist.
          mappings: [
            {
              event_id: "event-11111111-1111-4111-8111-111111111111",
              basis_kind: "SINGLE_OBSERVATION",
              fingerprint: null,
              observations: [observationRef("s", "1")],
              method: "m",
              evidence: [],
              decided_at: "2026-09-21T00:00:00.000Z",
              lifecycle: "ACTIVE",
              superseded_reason: null,
            },
          ],
          scheduleHistory: [],
        },
        { root },
      ),
    /Refusing to persist an invalid Event state/,
  );

  // Nothing at all was written — not even a partial file.
  const state = await readState({ root });
  assert.deepEqual(state, { events: [], mappings: [], scheduleHistory: [] });
});

test("an admission that fails validation leaves the prior registry intact", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const admitted = await admitEvent(musicRequest(), { root });
  const before = await readFile(resolve(root, EVENTS_PATH), "utf8");

  await assert.rejects(
    () => admitEvent(musicRequest({ event: { event_category: "BUSINESS", event_type: "CONFERENCE" }, basis: { observations: [observationRef("agendalx", "999")] } }), { root }),
    /Invalid Event/,
  );

  assert.equal(await readFile(resolve(root, EVENTS_PATH), "utf8"), before, "the registry file is byte-identical");
  const state = await readState({ root });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].event_id, admitted.event.event_id);
});

test("a corrupted registry is surfaced rather than silently overwritten", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await admitEvent(musicRequest(), { root });
  await writeFile(resolve(root, MAPPINGS_PATH), "{ not json", "utf8");

  await assert.rejects(() => readState({ root }));
});

test("a caller may not supply its own event_id", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const request = musicRequest();
  request.event.event_id = "event-11111111-1111-4111-8111-111111111111";

  await assert.rejects(() => admitEvent(request, { root }), /must not be supplied/);
  assert.equal((await readState({ root })).events.length, 0);
});

test("admission reads no clock of its own", async (t) => {
  const root = await scratchRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await admitEvent(musicRequest(), { root });
  assert.equal(result.event.admitted_at, "2026-09-21T00:00:00.000Z");
  assert.equal(result.schedule_assertion.asserted_at, "2026-09-21T00:00:00.000Z");

  await assert.rejects(
    () => admitEvent({ ...musicRequest(), admitted_at: undefined }, { root }),
    /admitted_at is required/,
  );
});

/* ---------------------------------------------------------------- */
/* THE REPOSITORY'S OWN REGISTRIES STAY EMPTY                        */
/* ---------------------------------------------------------------- */

test("the repository's production Event registries are empty and valid", async () => {
  const state = await readState({ root: REPO_ROOT });
  assert.equal(state.events.length, 0, "no Event has been admitted by this package");
  assert.equal(state.mappings.length, 0);
  assert.equal(state.scheduleHistory.length, 0);
  assert.deepEqual(validateState(state), [], "an empty state must validate");

  for (const path of [EVENTS_PATH, MAPPINGS_PATH, SCHEDULE_PATH]) {
    const raw = await readFile(resolve(REPO_ROOT, path), "utf8");
    assert.equal(raw.includes("event-"), false, `${path} must contain no Event id`);
    assert.equal(raw.includes("dof1-"), false, `${path} must contain no fingerprint`);
  }
});
