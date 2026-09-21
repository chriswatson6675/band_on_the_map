// BEATMAPPED-FOOTBALL-FULL-FUTURE-EVENT-ADMISSION-01 — bulk admission.
//
// Classification is tested on synthetic candidates so each rule is
// isolated; the estate assertions read the real committed Event state.
// Nothing here writes the repository's own events/event-state.json.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVENT_ID_PATTERN } from "../ingestion/event/contract.mjs";
import { readValidatedState, validateState } from "../ingestion/event/registry.mjs";
import { mappingIdentityKey } from "../ingestion/event/occurrence-mapping.mjs";
import {
  BULK_POLICY,
  CENSUS_STATES,
  EVIDENCE_STRENGTHS,
  cancellationEvidence,
  classify,
  comparePlanRows,
  toBulkAdmissionRequest,
} from "../ingestion/gc-football-event-admission/bulk-policy.mjs";
import { buildCensus, buildPlan, executePlan } from "../ingestion/gc-football-event-admission/run-bulk.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const PLAN = "research/major-event-admission/uk-gc-football-full-future-01/admission-plan.json";
const RESULT = "research/major-event-admission/uk-gc-football-full-future-01/admission-result.json";

const plan = await readJson(PLAN);
const result = await readJson(RESULT);
const state = await readValidatedState();

const AS_OF = plan.bulk_as_of;

const EMPTY_KEYS = { activeFingerprints: new Set(), activeObservationKeys: new Set() };

function candidate(overrides = {}) {
  return {
    platform_match_id: "m-1",
    reconciliation_group_id: "gcf-m-1",
    kickoff_utc: "2027-05-01T14:00:00.000Z",
    observations: [{ source_id: "src-a", source_record_id: "1" }],
    occurrence_fingerprint: null,
    evidence_strength: "SINGLE_SOURCE_ASSERTION",
    publisher_domains: [],
    publisher_domain_count: 1,
    venue_evidence_state: null,
    governed_venue_census_id: null,
    factual_conflict: null,
    status_texts: [],
    source_artifact: "x",
    ...overrides,
  };
}

const multiSource = (overrides = {}) =>
  candidate({
    occurrence_fingerprint: "dof1-gc-football-20270501T140000Z-aaaaaaaaaaaaaaaaaaaaaaaa",
    evidence_strength: "CROSS_PUBLISHER_CORROBORATED",
    publisher_domains: ["a.example", "b.example"],
    publisher_domain_count: 2,
    observations: [
      { source_id: "src-a", source_record_id: "1" },
      { source_id: "src-b", source_record_id: "1" },
    ],
    ...overrides,
  });

/* ---------------------------------------------------------------- */
/* ELIGIBILITY — EXISTENCE NO LONGER REQUIRES CORROBORATION          */
/* ---------------------------------------------------------------- */

test("a future single-source fixture is eligible", () => {
  const verdict = classify(candidate(), { asOf: AS_OF, ...EMPTY_KEYS });
  assert.equal(verdict.state, "FUTURE_ELIGIBLE_SINGLE_SOURCE");
});

test("a future same-publisher multi-source fixture is eligible and not downgraded", () => {
  const record = multiSource({ evidence_strength: "SAME_PUBLISHER_MULTI_SOURCE", publisher_domains: ["a.example"], publisher_domain_count: 1 });
  const verdict = classify(record, { asOf: AS_OF, ...EMPTY_KEYS });
  assert.equal(verdict.state, "FUTURE_ELIGIBLE_MULTI_SOURCE");
  assert.equal(record.evidence_strength, "SAME_PUBLISHER_MULTI_SOURCE", "must not be recorded as single-source");
});

test("a future cross-publisher fixture is eligible", () => {
  assert.equal(classify(multiSource(), { asOf: AS_OF, ...EMPTY_KEYS }).state, "FUTURE_ELIGIBLE_MULTI_SOURCE");
});

test("existence and evidence strength are separate facts", () => {
  // All three strengths admit; none is claimed to be another.
  const strengths = new Set();
  for (const record of [
    candidate(),
    multiSource({ evidence_strength: "SAME_PUBLISHER_MULTI_SOURCE" }),
    multiSource(),
  ]) {
    assert.match(classify(record, { asOf: AS_OF, ...EMPTY_KEYS }).state, /^FUTURE_ELIGIBLE_/);
    strengths.add(record.evidence_strength);
  }
  assert.equal(strengths.size, 3);
  for (const strength of strengths) assert.ok(EVIDENCE_STRENGTHS.has(strength));
});

/* ---------------------------------------------------------------- */
/* EXCLUSIONS                                                        */
/* ---------------------------------------------------------------- */

test("a past or already-started fixture is excluded", () => {
  const past = candidate({ kickoff_utc: "2020-01-01T15:00:00.000Z" });
  assert.equal(classify(past, { asOf: AS_OF, ...EMPTY_KEYS }).state, "PAST_OR_STARTED");

  // The boundary: exactly at bulk_as_of is not future.
  const exactly = candidate({ kickoff_utc: AS_OF });
  assert.equal(classify(exactly, { asOf: AS_OF, ...EMPTY_KEYS }).state, "PAST_OR_STARTED");

  // One millisecond later is.
  const justAfter = candidate({ kickoff_utc: new Date(new Date(AS_OF).getTime() + 1).toISOString() });
  assert.match(classify(justAfter, { asOf: AS_OF, ...EMPTY_KEYS }).state, /^FUTURE_ELIGIBLE_/);
});

test("an invalid or missing kickoff is excluded", () => {
  for (const kickoff of [null, "", "not a date", "2026-13-45T99:99:99Z"]) {
    const verdict = classify(candidate({ kickoff_utc: kickoff }), { asOf: AS_OF, ...EMPTY_KEYS });
    assert.equal(verdict.state, "INVALID_KICKOFF", `${kickoff} must be excluded`);
  }
});

test("an unresolved factual conflict is excluded", () => {
  const verdict = classify(candidate({ factual_conflict: "CONFLICTING_RESOLVED_VENUES" }), { asOf: AS_OF, ...EMPTY_KEYS });
  assert.equal(verdict.state, "FACTUAL_CONFLICT");
  assert.equal(verdict.reason, "CONFLICTING_RESOLVED_VENUES");
});

test("positive cancellation evidence excludes; venue placeholders do not", () => {
  for (const token of ["Cancelled", "ABANDONED", "void", "postponed"]) {
    const verdict = classify(candidate({ status_texts: [`Fixture ${token}`] }), { asOf: AS_OF, ...EMPTY_KEYS });
    assert.equal(verdict.state, "EXPLICITLY_CANCELLED_OR_VOID", token);
  }

  // These three occur in this corpus as VENUE placeholders. "Behind
  // Closed Doors" means the fixture is on; TBC/Unavailable mean the venue
  // is unannounced. None is a cancellation.
  for (const placeholder of ["TBC", "Unavailable", "Behind Closed Doors"]) {
    assert.equal(cancellationEvidence([placeholder]).found, false, placeholder);
    assert.match(classify(candidate({ status_texts: [placeholder] }), { asOf: AS_OF, ...EMPTY_KEYS }).state, /^FUTURE_ELIGIBLE_/);
  }
});

test("a missing identity or observation is excluded, not guessed", () => {
  assert.equal(classify(candidate({ platform_match_id: "" }), { asOf: AS_OF, ...EMPTY_KEYS }).state, "UNRESOLVED_IDENTITY");
  assert.equal(classify(candidate({ observations: [] }), { asOf: AS_OF, ...EMPTY_KEYS }).state, "UNRESOLVED_IDENTITY");
});

/* ---------------------------------------------------------------- */
/* VENUE                                                             */
/* ---------------------------------------------------------------- */

test("an unresolved venue does not block admission", () => {
  const record = candidate({ governed_venue_census_id: null });
  assert.match(classify(record, { asOf: AS_OF, ...EMPTY_KEYS }).state, /^FUTURE_ELIGIBLE_/);

  const request = toBulkAdmissionRequest(
    { ...record, evidence_key: "k", observations: record.observations },
    { admittedAt: "2026-09-21T00:00:00.000Z", runId: "r", planPath: "p" },
  );
  assert.equal(request.event.venue_id, null);
});

test("a governed venue is carried, and nothing is invented around it", () => {
  const request = toBulkAdmissionRequest(
    { ...candidate({ governed_venue_census_id: "ukmec-england-luton-kenilworth-road" }), evidence_key: "k" },
    { admittedAt: "2026-09-21T00:00:00.000Z", runId: "r", planPath: "p" },
  );
  assert.equal(request.event.venue_id, "ukmec-england-luton-kenilworth-road");
  assert.equal(request.event.display_title, null);
  assert.equal(request.event.start.raw, null);
  assert.equal(request.event.end, undefined, "no match duration is invented");
  assert.equal(request.event.start.certainty, "UTC_INSTANT");
  assert.equal(request.event.start.tzid, null);
});

test("a single-source request uses SINGLE_OBSERVATION and no manufactured fingerprint", () => {
  const request = toBulkAdmissionRequest({ ...candidate(), evidence_key: "k" }, {
    admittedAt: "2026-09-21T00:00:00.000Z",
    runId: "r",
    planPath: "p",
  });
  assert.equal(request.basis.basis_kind, "SINGLE_OBSERVATION");
  assert.equal(request.basis.fingerprint, null);
  assert.equal(request.basis.observations.length, 1);
  assert.equal(request.basis.method, BULK_POLICY);
  // The provider match id is evidence, never identity.
  assert.equal(JSON.stringify(request.event).includes("m-1"), false);
});

/* ---------------------------------------------------------------- */
/* OVERLAP WITH EXISTING CANONICAL STATE                             */
/* ---------------------------------------------------------------- */

test("an occurrence already mapped by fingerprint is not re-admitted", () => {
  const record = multiSource();
  const verdict = classify(record, {
    asOf: AS_OF,
    activeFingerprints: new Set([record.occurrence_fingerprint]),
    activeObservationKeys: new Set(),
  });
  assert.equal(verdict.state, "ALREADY_ADMITTED");
  assert.equal(verdict.reason, "FINGERPRINT_ALREADY_ACTIVE");
});

test("a single-source occurrence whose Observation is already mapped does not duplicate", () => {
  const record = candidate();
  const verdict = classify(record, {
    asOf: AS_OF,
    activeFingerprints: new Set(),
    activeObservationKeys: new Set(["src-a||1"]),
  });
  assert.equal(verdict.state, "ALREADY_ADMITTED");
  assert.equal(verdict.reason, "OBSERVATION_ALREADY_MAPPED");
});

test("improved multi-source evidence attaches to the existing Event rather than minting", async () => {
  // An Event already exists from ONE observation; the same occurrence now
  // has a fingerprint covering that observation plus another.
  const existingEventId = "event-11111111-1111-4111-8111-111111111111";
  const upgraded = multiSource();

  const census = {
    candidates: [{ ...upgraded, evidence_key: upgraded.occurrence_fingerprint }],
    totals: { source_observations: 0, reconciled_multi_source: 1, single_source: 0, upstream_conflicts: 0 },
  };
  const fakeState = {
    events: [{ event_id: existingEventId }],
    mappings: [
      {
        event_id: existingEventId,
        lifecycle: "ACTIVE",
        fingerprint: null,
        observations: [{ source_id: "src-a", source_record_id: "1" }],
      },
    ],
    scheduleHistory: [],
  };

  const built = buildPlan(census, { asOf: AS_OF, state: fakeState });
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].action, "ATTACH_EVIDENCE");
  assert.equal(built.rows[0].event_id, existingEventId);
  assert.equal(built.actions.ADMIT, 0);
});

test("evidence spanning two existing Events is declined, never silently merged", () => {
  const spanning = multiSource();
  const census = {
    candidates: [{ ...spanning, evidence_key: spanning.occurrence_fingerprint }],
    totals: { source_observations: 0, reconciled_multi_source: 1, single_source: 0, upstream_conflicts: 0 },
  };
  const fakeState = {
    events: [{ event_id: "event-11111111-1111-4111-8111-111111111111" }, { event_id: "event-22222222-2222-4222-9222-222222222222" }],
    mappings: [
      { event_id: "event-11111111-1111-4111-8111-111111111111", lifecycle: "ACTIVE", fingerprint: null, observations: [{ source_id: "src-a", source_record_id: "1" }] },
      { event_id: "event-22222222-2222-4222-9222-222222222222", lifecycle: "ACTIVE", fingerprint: null, observations: [{ source_id: "src-b", source_record_id: "1" }] },
    ],
    scheduleHistory: [],
  };

  const built = buildPlan(census, { asOf: AS_OF, state: fakeState });
  assert.equal(built.rows.length, 0);
  assert.equal(built.excluded.length, 1);
  assert.match(built.excluded[0].reason, /^EVIDENCE_SPANS_MULTIPLE_EVENTS:/);
  assert.equal(built.accounting.unexplained, 0);
});

/* ---------------------------------------------------------------- */
/* ACCOUNTING AND DETERMINISM                                        */
/* ---------------------------------------------------------------- */

test("the census accounts for every distinct occurrence exactly once", () => {
  assert.equal(plan.accounting.unexplained, 0);
  const summed = Object.values(plan.accounting.by_census_state).reduce((a, b) => a + b, 0);
  assert.equal(summed, plan.accounting.total_distinct_occurrences);
  assert.equal(summed, plan.accounting.total_classified);
  for (const state of Object.keys(plan.accounting.by_census_state)) assert.ok(CENSUS_STATES.has(state));

  // Multi-source plus single-source is the whole corpus.
  assert.equal(
    plan.accounting.multi_source_occurrences + plan.accounting.single_source_occurrences,
    plan.accounting.total_distinct_occurrences,
  );
});

test("there is no event cap", () => {
  assert.equal(plan.event_cap, null);
  assert.ok(plan.actions.ADMIT > 1000, "a full corpus admission, not a sample");
});

test("the plan is deterministically ordered and reproducible", async () => {
  const census = await buildCensus();
  const a = buildPlan(census, { asOf: AS_OF, state: { events: [], mappings: [], scheduleHistory: [] } });
  const b = buildPlan(
    { ...census, candidates: [...census.candidates].reverse() },
    { asOf: AS_OF, state: { events: [], mappings: [], scheduleHistory: [] } },
  );
  assert.equal(JSON.stringify(a.rows), JSON.stringify(b.rows), "input order must not change the plan");
  assert.deepEqual(a.rows, [...a.rows].sort(comparePlanRows));
});

/* ---------------------------------------------------------------- */
/* THE COMMITTED ESTATE                                              */
/* ---------------------------------------------------------------- */

test("the committed Event state validates and every id is application-issued", () => {
  assert.deepEqual(validateState(state), []);
  const ids = state.events.map((e) => e.event_id);
  assert.equal(new Set(ids).size, ids.length, "duplicate event ids");
  for (const event of state.events) assert.match(event.event_id, EVENT_ID_PATTERN);
});

test("the ten pilot Event ids are unchanged", async () => {
  // The pilot ids are a preservation control: a bulk run must never
  // re-mint an identity that already exists.
  const pilotMappings = state.mappings.filter((m) => m.method === "FOOTBALL_CROSS_PUBLISHER_FINGERPRINT_PILOT_V1");
  assert.equal(pilotMappings.length, 10, "the ten pilot mappings must survive intact");
  for (const mapping of pilotMappings) {
    assert.ok(state.events.some((e) => e.event_id === mapping.event_id));
  }
});

test("active evidence keys are unique across the whole estate", () => {
  const keys = new Set();
  for (const mapping of state.mappings) {
    if (mapping.lifecycle !== "ACTIVE") continue;
    const key = mappingIdentityKey(mapping);
    assert.equal(keys.has(key), false, `duplicate active evidence key: ${key}`);
    keys.add(key);
  }

  // And no Observation belongs to two Events.
  const owner = new Map();
  for (const mapping of state.mappings) {
    if (mapping.lifecycle !== "ACTIVE") continue;
    for (const ref of mapping.observations) {
      const refKey = `${ref.source_id}||${ref.source_record_id}`;
      const previous = owner.get(refKey);
      assert.ok(previous === undefined || previous === mapping.event_id, `Observation ${refKey} claimed by two Events`);
      owner.set(refKey, mapping.event_id);
    }
  }
});

test("every Event has one CURRENT schedule in parity with it", () => {
  for (const event of state.events) {
    const current = state.scheduleHistory.filter((a) => a.event_id === event.event_id && a.lifecycle === "CURRENT");
    assert.equal(current.length, 1, `Event ${event.event_id} must have exactly one CURRENT schedule`);
    assert.deepEqual(current[0].start, event.start);
    assert.deepEqual(current[0].end, event.end);
    assert.equal(current[0].status, event.status);
  }
});

test("every Event traces to retained evidence with no broken links", async () => {
  const observations = (await readJson("research/major-event-acquisition/uk-gc-football-01/observations.json")).observations;
  const known = new Set(observations.map((o) => `${o.source_id}||${o.source_record_id}`));
  const fingerprints = (await readJson("research/major-event-occurrence-fingerprints/uk-gc-football-01/occurrence-fingerprints.json")).occurrence_fingerprints;
  const knownFingerprints = new Set(fingerprints.map((f) => f.occurrence_fingerprint));

  for (const event of state.events) {
    const mapping = state.mappings.find((m) => m.event_id === event.event_id && m.lifecycle === "ACTIVE");
    assert.ok(mapping, `no active mapping for ${event.event_id}`);

    if (mapping.basis_kind === "PROVIDER_FINGERPRINT") {
      assert.ok(knownFingerprints.has(mapping.fingerprint), `fingerprint not retained: ${mapping.fingerprint}`);
    } else {
      assert.equal(mapping.basis_kind, "SINGLE_OBSERVATION");
      assert.equal(mapping.fingerprint, null, "no fingerprint may be manufactured for a single observation");
    }

    for (const ref of mapping.observations) {
      assert.ok(known.has(`${ref.source_id}||${ref.source_record_id}`), "dead provenance link");
    }
  }
});

test("no Event id leaks a provider id, fingerprint, venue or timestamp", () => {
  for (const event of state.events) {
    const mapping = state.mappings.find((m) => m.event_id === event.event_id && m.lifecycle === "ACTIVE");
    const id = event.event_id.toLowerCase();
    assert.equal(id.includes("dof1"), false);
    if (mapping.fingerprint) assert.equal(id.includes(mapping.fingerprint.toLowerCase()), false);
    if (event.venue_id) assert.equal(id.includes(event.venue_id.toLowerCase()), false);
    assert.equal(id.includes(event.start.iso.replace(/\D/g, "")), false);
    for (const ref of mapping.observations) assert.equal(id.includes(ref.source_record_id.toLowerCase()), false);
  }
});

test("every admitted Event is a scheduled football fixture with honest time", () => {
  for (const event of state.events) {
    assert.equal(event.event_category, "SPORT");
    assert.equal(event.event_type, "FOOTBALL_FIXTURE");
    assert.equal(event.occurrence_shape, "POINT_IN_TIME");
    assert.equal(event.status, "SCHEDULED");
    assert.equal(event.display_title, null);
    assert.equal(event.parent_event_id, null);
    assert.equal(event.start.certainty, "UTC_INSTANT");
    assert.equal(event.end.certainty, "UNKNOWN");
  }
});

/* ---------------------------------------------------------------- */
/* REPLAY                                                            */
/* ---------------------------------------------------------------- */

test("replaying the whole plan against a scratch estate adds nothing", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "botm-bulk-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "events"), { recursive: true });
  await writeFile(
    resolve(root, "events/event-state.json"),
    `${JSON.stringify({ schema_version: 1, note: "scratch", events: [], event_occurrence_mappings: [], schedule_history: [] }, null, 2)}\n`,
    "utf8",
  );

  // A small deterministic slice keeps this test fast while exercising the
  // real admit -> replay path end to end.
  const census = await buildCensus();
  const slice = { ...census, candidates: census.candidates.slice(0, 40) };
  const small = buildPlan(slice, { asOf: AS_OF, state: { events: [], mappings: [], scheduleHistory: [] } });

  const first = await executePlan(small, { root, admittedAt: "2026-09-21T00:00:00.000Z" });
  const afterFirst = await readValidatedState({ root });
  assert.equal(first.failures.length, 0);
  assert.ok(afterFirst.events.length > 0);

  const replay = await executePlan(small, { root, admittedAt: "2026-09-21T00:00:00.000Z" });
  const afterReplay = await readValidatedState({ root });

  assert.equal(replay.outcomes.ADMITTED ?? 0, 0, "a replay must mint no Event");
  assert.equal(afterReplay.events.length, afterFirst.events.length);
  assert.equal(afterReplay.mappings.length, afterFirst.mappings.length);
  assert.equal(afterReplay.scheduleHistory.length, afterFirst.scheduleHistory.length);
  assert.deepEqual(
    afterReplay.events.map((e) => e.event_id).sort(),
    afterFirst.events.map((e) => e.event_id).sort(),
  );
});

test("the recorded result shows a replay that changed nothing", () => {
  assert.equal(result.replay.new_events, 0);
  assert.equal(result.replay.new_mappings, 0);
  assert.equal(result.replay.new_schedule_rows, 0);
  assert.equal(result.replay.state_changed, false);
  assert.equal(result.accounting.unexplained, 0);
});

/* ---------------------------------------------------------------- */
/* PUBLIC ISOLATION                                                  */
/* ---------------------------------------------------------------- */

test("the published map is untouched by thousands of canonical Events", async () => {
  const raw = await readFile(resolve(ROOT, "data/public/lisbon-porto-map.json"), "utf8");
  assert.equal(/event-[0-9a-f]{8}-[0-9a-f]{4}-4/.test(raw), false);
  assert.equal(/FOOTBALL/i.test(raw), false);
  assert.equal(raw.includes('"SPORT"'), false);

  const published = JSON.parse(raw);
  let markers = 0;
  let listings = 0;
  for (const country of Object.values(published.countries)) {
    for (const marker of country.markers ?? []) {
      markers += 1;
      listings += (marker.display_listings ?? []).length;
    }
  }
  assert.equal(markers, 132);
  assert.equal(listings, 4896);
});
