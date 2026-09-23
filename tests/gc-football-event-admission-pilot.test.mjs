// BEATMAPPED-FOOTBALL-EVENT-ADMISSION-PILOT-01 — pilot policy, selection,
// request conversion, execution and isolation.
//
// Execution tests run against a THROWAWAY registry root under the OS temp
// directory. The repository's own events/event-state.json is read only to
// assert what the committed pilot actually produced.

import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVENT_ID_PATTERN } from "../ingestion/event/contract.mjs";
import { readValidatedState, validateState } from "../ingestion/event/registry.mjs";
import {
  NOT_SCHEDULED_TOKENS,
  PILOT_MAX_EVENTS,
  PILOT_PER_STRATUM,
  PILOT_POLICY,
  STRATUM_WITHOUT_VENUE,
  STRATUM_WITH_VENUE,
  admissionCutoff,
  compareCandidates,
  eligibility,
  notScheduledEvidence,
  selectPilotCandidates,
  stratumOf,
  toAdmissionRequest,
} from "../ingestion/gc-football-event-admission/policy.mjs";
import {
  FINGERPRINTS_PATH,
  PLAN_PATH,
  RESULT_PATH,
  buildPlan,
  executePlan,
} from "../ingestion/gc-football-event-admission/run-pilot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const AS_OF = "2026-09-21T13:30:22.000Z";
const CUTOFF = admissionCutoff(AS_OF);

const fingerprints = (await readJson(FINGERPRINTS_PATH)).occurrence_fingerprints;
const plan = await readJson(PLAN_PATH);
const result = await readJson(RESULT_PATH);

/** A synthetic, minimally-valid cross-publisher candidate. */
function candidate(overrides = {}) {
  return {
    fingerprint_state: "OCCURRENCE_FINGERPRINT_ESTABLISHED",
    occurrence_fingerprint: "dof1-gc-football-20261201T150000Z-aaaaaaaaaaaaaaaaaaaaaaaa",
    occurrence_type: "FOOTBALL_FIXTURE",
    occurrence_instant_utc: "2026-12-01T15:00:00.000Z",
    reconciliation_state: "RECONCILED_MULTI_SOURCE",
    reconciliation_group_id: "gcf-x-20261201T150000Z",
    platform_match_id: "x",
    evidence_class: "CROSS_PUBLISHER_CORROBORATED",
    publisher_domains: ["a.example", "b.example"],
    publisher_domain_count: 2,
    source_observations: [
      { source_id: "src-a", source_record_id: "1" },
      { source_id: "src-b", source_record_id: "1" },
    ],
    venue_evidence_state: "NO_MEMBER_RESOLVED",
    governed_venue_census_id: null,
    governed_venue_name: null,
    venue_supported_by: [],
    home_team_variants: ["Home FC"],
    away_team_variants: ["Away FC"],
    competition_variants: ["League"],
    source_venue_text_variants: ["Ground"],
    member_detail: [],
    ...overrides,
  };
}

/* ---------------------------------------------------------------- */
/* POLICY — WHO IS ELIGIBLE                                          */
/* ---------------------------------------------------------------- */

test("a cross-publisher, sufficiently-future fixture is eligible", () => {
  assert.deepEqual(eligibility(candidate(), { asOf: AS_OF }), { eligible: true });
});

test("same-publisher evidence is excluded, and the pilot never substitutes it", () => {
  const verdict = eligibility(
    candidate({ evidence_class: "SAME_PUBLISHER_MULTI_SOURCE", publisher_domains: ["a.example"], publisher_domain_count: 1 }),
    { asOf: AS_OF },
  );
  assert.deepEqual(verdict, { eligible: false, reason: "NOT_CROSS_PUBLISHER_CORROBORATED" });

  // And none reached the real plan.
  for (const stratum of Object.values(plan.strata)) {
    for (const row of [...stratum.primary, ...stratum.reserves]) {
      assert.equal(row.evidence_class, "CROSS_PUBLISHER_CORROBORATED");
      assert.ok(row.publisher_domain_count > 1);
    }
  }
});

test("single-source evidence cannot reach the pilot at all", () => {
  const solo = eligibility(
    candidate({ source_observations: [{ source_id: "src-a", source_record_id: "1" }], publisher_domain_count: 1, evidence_class: "SAME_PUBLISHER_MULTI_SOURCE" }),
    { asOf: AS_OF },
  );
  assert.equal(solo.eligible, false);

  // The corpus this pilot reads contains only reconciled multi-source
  // fingerprints; the 3,239 single-source match ids are a different file.
  for (const record of fingerprints) assert.ok(record.source_observations.length >= 2);
});

test("the 7-day buffer is enforced at the boundary", () => {
  const justInside = candidate({ occurrence_instant_utc: CUTOFF });
  assert.equal(eligibility(justInside, { asOf: AS_OF }).eligible, true, "exactly at the cutoff is allowed");

  const oneMsEarly = candidate({
    occurrence_instant_utc: new Date(new Date(CUTOFF).getTime() - 1).toISOString(),
  });
  assert.deepEqual(eligibility(oneMsEarly, { asOf: AS_OF }), {
    eligible: false,
    reason: "NOT_AT_LEAST_SEVEN_DAYS_FUTURE",
  });

  assert.equal(admissionCutoff("2026-01-01T00:00:00.000Z"), "2026-01-08T00:00:00.000Z");
});

test("upstream factual doubt is declined, not resolved", () => {
  assert.equal(
    eligibility(candidate({ reconciliation_state: "CONFLICT_OTHER_FACTUAL" }), { asOf: AS_OF }).reason,
    "UPSTREAM_RECONCILIATION_NOT_CLEAN",
  );
  assert.equal(
    eligibility(candidate({ venue_evidence_state: "CONFLICTING_RESOLVED_VENUES" }), { asOf: AS_OF }).reason,
    "CONFLICTING_RESOLVED_VENUES",
  );
});

test("evidence that a fixture is not scheduled excludes it", () => {
  for (const token of ["Cancelled", "POSTPONED", "match abandoned", "called off", "Rearranged"]) {
    const record = candidate({ competition_variants: [`League ${token}`] });
    const verdict = eligibility(record, { asOf: AS_OF });
    assert.equal(verdict.eligible, false, `${token} must exclude`);
    assert.match(verdict.reason, /^EVIDENCE_SAYS_NOT_SCHEDULED:/);
  }
});

test("venue placeholders are NOT read as cancellation", () => {
  // These three really occur in this corpus as venue_text values. "Behind
  // Closed Doors" means the fixture IS on; "TBC"/"Unavailable" mean the
  // venue is unannounced. Excluding on them would be a misreading.
  for (const placeholder of ["TBC", "Unavailable", "Behind Closed Doors"]) {
    assert.equal(notScheduledEvidence(candidate({ source_venue_text_variants: [placeholder] })).found, false, placeholder);
    assert.equal(NOT_SCHEDULED_TOKENS.test(placeholder), false, placeholder);
  }
});

/* ---------------------------------------------------------------- */
/* SELECTION — DETERMINISM AND STRATA                                */
/* ---------------------------------------------------------------- */

test("candidates sort by instant then fingerprint, and nothing else", () => {
  const a = candidate({ occurrence_instant_utc: "2026-12-01T15:00:00.000Z", occurrence_fingerprint: "dof1-b" });
  const b = candidate({ occurrence_instant_utc: "2026-12-01T15:00:00.000Z", occurrence_fingerprint: "dof1-a" });
  const later = candidate({ occurrence_instant_utc: "2026-12-02T15:00:00.000Z", occurrence_fingerprint: "dof1-a" });

  assert.ok(compareCandidates(b, a) < 0, "same instant falls back to fingerprint");
  assert.ok(compareCandidates(a, later) < 0, "earlier instant wins");

  // A famous club name must not move anything.
  const famous = candidate({ ...a, home_team_variants: ["Manchester United"] });
  assert.equal(compareCandidates(famous, a), 0);
});

test("selection is stable regardless of input order", () => {
  const forwards = selectPilotCandidates(fingerprints, { asOf: AS_OF });
  const backwards = selectPilotCandidates([...fingerprints].reverse(), { asOf: AS_OF });
  for (const name of [STRATUM_WITH_VENUE, STRATUM_WITHOUT_VENUE]) {
    assert.deepEqual(
      backwards.strata[name].primary.map((r) => r.occurrence_fingerprint),
      forwards.strata[name].primary.map((r) => r.occurrence_fingerprint),
    );
    assert.deepEqual(
      backwards.strata[name].reserves.map((r) => r.occurrence_fingerprint),
      forwards.strata[name].reserves.map((r) => r.occurrence_fingerprint),
    );
  }
});

test("the two strata are split on governed venue, five each", () => {
  assert.equal(stratumOf(candidate({ governed_venue_census_id: "ukmec-x" })), STRATUM_WITH_VENUE);
  assert.equal(stratumOf(candidate({ governed_venue_census_id: null })), STRATUM_WITHOUT_VENUE);

  assert.equal(plan.strata[STRATUM_WITH_VENUE].primary.length, PILOT_PER_STRATUM);
  assert.equal(plan.strata[STRATUM_WITHOUT_VENUE].primary.length, PILOT_PER_STRATUM);
  for (const row of plan.strata[STRATUM_WITH_VENUE].primary) assert.ok(row.governed_venue_census_id);
  for (const row of plan.strata[STRATUM_WITHOUT_VENUE].primary) assert.equal(row.governed_venue_census_id, null);
});

test("reserves are the next five in the same order, not a second selection", () => {
  const selection = selectPilotCandidates(fingerprints, { asOf: AS_OF });
  for (const name of [STRATUM_WITH_VENUE, STRATUM_WITHOUT_VENUE]) {
    const { primary, reserves } = selection.strata[name];
    const combined = [...primary, ...reserves];
    assert.deepEqual(combined, [...combined].sort(compareCandidates));
    const ids = combined.map((r) => r.occurrence_fingerprint);
    assert.equal(new Set(ids).size, ids.length, "a reserve is never also a primary");
  }
});

test("the plan carries no Event identity", () => {
  assert.equal(/event-[0-9a-f]{8}-[0-9a-f]{4}-4/.test(JSON.stringify(plan)), false);
  assert.equal(plan.creates_event_identity, false);
  assert.equal(plan.policy, PILOT_POLICY);
});

/* ---------------------------------------------------------------- */
/* REQUEST CONVERSION — WHAT IS NOT INVENTED                         */
/* ---------------------------------------------------------------- */

test("a fingerprint converts to a SPORT/FOOTBALL_FIXTURE request", () => {
  const request = toAdmissionRequest(candidate(), {
    admittedAt: "2026-09-21T13:00:00.000Z",
    runId: "r",
    planPath: "p",
    fingerprintArtifactPath: "f",
  });

  assert.equal(request.event.event_category, "SPORT");
  assert.equal(request.event.event_type, "FOOTBALL_FIXTURE");
  assert.equal(request.event.occurrence_shape, "POINT_IN_TIME");
  assert.equal(request.event.status, "SCHEDULED");
  assert.equal(request.event.parent_event_id, null);
  assert.equal(request.event.event_id, undefined, "a caller must never supply an id");
  assert.equal(request.basis.basis_kind, "PROVIDER_FINGERPRINT");
  assert.equal(request.basis.method, PILOT_POLICY);
});

test("the time is a genuine UTC instant and nothing is fabricated around it", () => {
  const request = toAdmissionRequest(candidate(), {
    admittedAt: "2026-09-21T13:00:00.000Z",
    runId: "r",
    planPath: "p",
    fingerprintArtifactPath: "f",
  });

  assert.deepEqual(request.event.start, {
    raw: null, // the provider published a structured instant, not display text
    date: "2026-12-01",
    iso: "2026-12-01T15:00:00.000Z",
    is_utc: true,
    tzid: null,
    certainty: "UTC_INSTANT",
  });

  // No end is asserted: 90 minutes is a convention, not evidence.
  assert.equal(request.event.end, undefined);
});

test("no display title is composed from team names", () => {
  const request = toAdmissionRequest(
    candidate({ home_team_variants: ["Ipswich Town", "Ipswich Town FC"], away_team_variants: ["Spurs"] }),
    { admittedAt: "2026-09-21T13:00:00.000Z", runId: "r", planPath: "p", fingerprintArtifactPath: "f" },
  );
  assert.equal(request.event.display_title, null);
  assert.equal(JSON.stringify(request.event).includes("Ipswich"), false);
});

test("venue is carried when governed and null otherwise, never guessed", () => {
  const withVenue = toAdmissionRequest(
    candidate({ governed_venue_census_id: "ukmec-england-luton-kenilworth-road", venue_evidence_state: "AGREED_BY_ALL_RESOLVED_MEMBERS" }),
    { admittedAt: "2026-09-21T13:00:00.000Z", runId: "r", planPath: "p", fingerprintArtifactPath: "f" },
  );
  assert.equal(withVenue.event.venue_id, "ukmec-england-luton-kenilworth-road");

  const without = toAdmissionRequest(candidate({ source_venue_text_variants: ["Some Ground"] }), {
    admittedAt: "2026-09-21T13:00:00.000Z",
    runId: "r",
    planPath: "p",
    fingerprintArtifactPath: "f",
  });
  assert.equal(without.event.venue_id, null, "source venue text is never promoted to a venue id");
});

test("the basis carries every Observation ref and no raw source body", () => {
  const record = candidate();
  const request = toAdmissionRequest(record, {
    admittedAt: "2026-09-21T13:00:00.000Z",
    runId: "r",
    planPath: "p",
    fingerprintArtifactPath: "f",
  });
  assert.deepEqual(request.basis.observations, record.source_observations);
  assert.equal(request.basis.fingerprint, record.occurrence_fingerprint);

  const serialised = JSON.stringify(request.basis.evidence);
  for (const forbidden of ["<html", "raw_evidence", "body", "http_status"]) {
    assert.equal(serialised.includes(forbidden), false, `evidence copies ${forbidden}`);
  }
});

/* ---------------------------------------------------------------- */
/* EXECUTION — AGAINST A THROWAWAY REGISTRY                          */
/* ---------------------------------------------------------------- */

async function scratchRepo(t) {
  const root = await mkdtemp(resolve(tmpdir(), "botm-pilot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["events", "research"]) await mkdir(resolve(root, dir), { recursive: true });
  await cp(resolve(ROOT, "events/event-state.json"), resolve(root, "events/event-state.json"));
  await writeFile(
    resolve(root, "events/event-state.json"),
    `${JSON.stringify({ schema_version: 1, note: "scratch", events: [], event_occurrence_mappings: [], schedule_history: [] }, null, 2)}\n`,
    "utf8",
  );
  await cp(resolve(ROOT, "research"), resolve(root, "research"), { recursive: true });
  return root;
}

test("executing the plan admits at most ten Events, five per stratum", async (t) => {
  const root = await scratchRepo(t);
  const freshPlan = buildPlan(fingerprints, { asOf: AS_OF });

  const { admitted, skipped } = await executePlan(freshPlan, { root, admittedAt: "2026-09-21T13:00:00.000Z" });

  assert.equal(admitted.length, PILOT_MAX_EVENTS);
  assert.equal(skipped.length, 0);
  assert.equal(admitted.filter((e) => e.stratum === STRATUM_WITH_VENUE).length, PILOT_PER_STRATUM);
  assert.equal(admitted.filter((e) => e.stratum === STRATUM_WITHOUT_VENUE).length, PILOT_PER_STRATUM);
  assert.ok(admitted.every((e) => e.outcome === "ADMITTED"));

  const state = await readValidatedState({ root });
  assert.equal(state.events.length, 10);
  assert.equal(state.mappings.length, 10);
  assert.equal(state.scheduleHistory.length, 10);
  assert.deepEqual(validateState(state), []);
});

test("replaying the exact same plan mints nothing and moves no id", async (t) => {
  const root = await scratchRepo(t);
  const freshPlan = buildPlan(fingerprints, { asOf: AS_OF });

  await executePlan(freshPlan, { root, admittedAt: "2026-09-21T13:00:00.000Z" });
  const first = await readValidatedState({ root });
  const firstIds = first.events.map((e) => e.event_id).sort();

  const replay = await executePlan(freshPlan, { root, admittedAt: "2026-09-21T13:00:00.000Z" });
  const second = await readValidatedState({ root });

  assert.ok(replay.admitted.every((e) => e.outcome === "ALREADY_ADMITTED"), "every outcome must be ALREADY_ADMITTED");
  assert.equal(second.events.length, first.events.length, "a replay must mint no Event");
  assert.equal(second.mappings.length, first.mappings.length, "a replay must add no mapping");
  assert.equal(second.scheduleHistory.length, first.scheduleHistory.length, "a replay must add no schedule row");
  assert.deepEqual(second.events.map((e) => e.event_id).sort(), firstIds, "every Event id must be unchanged");

  // The specific defect this guards: a replay must NOT fall through to
  // the reserves and admit ten more Events.
  const reserveFingerprints = new Set(
    Object.values(freshPlan.strata).flatMap((s) => s.reserves.map((r) => r.occurrence_fingerprint)),
  );
  for (const mapping of second.mappings) {
    assert.equal(reserveFingerprints.has(mapping.fingerprint), false, "a reserve was admitted on replay");
  }
});

test("a third run still changes nothing", async (t) => {
  const root = await scratchRepo(t);
  const freshPlan = buildPlan(fingerprints, { asOf: AS_OF });
  await executePlan(freshPlan, { root, admittedAt: "2026-09-21T13:00:00.000Z" });
  await executePlan(freshPlan, { root, admittedAt: "2026-09-21T13:00:00.000Z" });
  const third = await executePlan(freshPlan, { root, admittedAt: "2026-09-21T13:00:00.000Z" });
  assert.ok(third.admitted.every((e) => e.outcome === "ALREADY_ADMITTED"));
  assert.equal((await readValidatedState({ root })).events.length, 10);
});

/* ---------------------------------------------------------------- */
/* THE COMMITTED PILOT STATE                                         */
/* ---------------------------------------------------------------- */

/**
 * The pilot's own ten, identified by the policy that admitted them.
 *
 * These assertions used to read the WHOLE Event state, which was the same
 * thing while the pilot was all there was. The full future admission
 * (FOOTBALL_SCHEDULED_FIXTURE_ADMISSION_V1) added thousands more, so the
 * pilot's invariants are now scoped to the pilot's own rows - every one
 * of which must still hold exactly as it did on the day it shipped.
 */
async function pilotEvents(state) {
  const pilotIds = new Set(
    state.mappings.filter((m) => m.method === PILOT_POLICY && m.lifecycle === "ACTIVE").map((m) => m.event_id),
  );
  return state.events.filter((e) => pilotIds.has(e.event_id));
}

test("the committed pilot Events are intact, and the whole state validates", async () => {
  const state = await readValidatedState();
  assert.deepEqual(validateState(state), []);

  const pilot = await pilotEvents(state);
  assert.equal(pilot.length, 10, "the pilot's ten Events must still be present");
  assert.equal(state.mappings.filter((m) => m.method === PILOT_POLICY).length, 10);

  for (const event of pilot) {
    assert.match(event.event_id, EVENT_ID_PATTERN);
    assert.equal(event.event_category, "SPORT");
    assert.equal(event.event_type, "FOOTBALL_FIXTURE");
    assert.equal(event.status, "SCHEDULED");
    assert.equal(event.occurrence_shape, "POINT_IN_TIME");
    assert.equal(event.display_title, null);
    assert.equal(event.parent_event_id, null);
    assert.equal(event.start.certainty, "UTC_INSTANT");
    assert.equal(event.start.raw, null);
    assert.equal(event.end.certainty, "UNKNOWN", "no match duration was invented");
  }

  assert.equal(pilot.filter((e) => e.venue_id !== null).length, 5);
  assert.equal(pilot.filter((e) => e.venue_id === null).length, 5);
});

test("every committed Event id is opaque and leaks no source identifier", async () => {
  const state = await readValidatedState();
  const byEvent = new Map(state.mappings.map((m) => [m.event_id, m]));

  const ids = state.events.map((e) => e.event_id);
  assert.equal(new Set(ids).size, ids.length);

  for (const event of state.events) {
    const mapping = byEvent.get(event.event_id);
    const id = event.event_id.toLowerCase();
    assert.equal(id.includes("dof1"), false);
    // A single-source mapping legitimately has no fingerprint.
    if (mapping.fingerprint) assert.equal(id.includes(mapping.fingerprint.toLowerCase()), false);
    if (event.venue_id) assert.equal(id.includes(event.venue_id.toLowerCase()), false);
    assert.equal(id.includes(event.start.iso.replace(/\D/g, "")), false);
    for (const ref of mapping.observations) {
      assert.equal(id.includes(ref.source_record_id.toLowerCase()), false);
    }
  }
});

test("every committed Event uses the generic foundation's mapping and schedule", async () => {
  const state = await readValidatedState();
  const pilot = new Set((await pilotEvents(state)).map((e) => e.event_id));

  for (const event of state.events) {
    const mappings = state.mappings.filter((m) => m.event_id === event.event_id && m.lifecycle === "ACTIVE");
    assert.equal(mappings.length, 1);

    if (pilot.has(event.event_id)) {
      // The pilot admitted only cross-publisher, fingerprint-backed
      // occurrences, and that remains true of its own ten.
      assert.equal(mappings[0].basis_kind, "PROVIDER_FINGERPRINT");
      assert.equal(mappings[0].method, PILOT_POLICY);
      assert.ok(mappings[0].observations.length >= 2);
    } else {
      assert.ok(["PROVIDER_FINGERPRINT", "SINGLE_OBSERVATION"].includes(mappings[0].basis_kind));
      assert.ok(mappings[0].observations.length >= 1);
    }

    const current = state.scheduleHistory.filter((a) => a.event_id === event.event_id && a.lifecycle === "CURRENT");
    assert.equal(current.length, 1);
    assert.deepEqual(current[0].start, event.start);
    assert.deepEqual(current[0].end, event.end);
    assert.equal(current[0].status, event.status);
  }
  assert.equal(state.scheduleHistory.filter((a) => a.lifecycle === "SUPERSEDED").length, 0);
});

test("no participant, club, competition or series identity was created", async () => {
  const state = await readValidatedState();
  const serialised = JSON.stringify(state);
  for (const forbidden of ["participant", "club_id", "competition_id", "home_team", "away_team", "series"]) {
    assert.equal(serialised.toLowerCase().includes(forbidden), false, `Event state contains ${forbidden}`);
  }
  for (const event of state.events) {
    assert.deepEqual(Object.keys(event).sort(), [
      "admission_basis",
      "admitted_at",
      "display_title",
      "end",
      "event_category",
      "event_id",
      "event_type",
      "occurrence_shape",
      "parent_event_id",
      "start",
      "status",
      "venue_id",
    ]);
  }
});

test("the result artifact records both the first execution and the replay", () => {
  assert.equal(result.policy, PILOT_POLICY);
  assert.deepEqual(result.first_execution.outcomes, { ADMITTED: 10 });
  assert.deepEqual(result.first_execution.net, {
    events: 10,
    event_occurrence_mappings: 10,
    schedule_history: 10,
  });
  assert.deepEqual(result.replay_execution.outcomes, { ALREADY_ADMITTED: 10 });
  assert.deepEqual(result.replay_execution.net, {
    events: 0,
    event_occurrence_mappings: 0,
    schedule_history: 0,
  });
  assert.equal(result.counts.with_governed_venue, 5);
  assert.equal(result.counts.without_governed_venue, 5);
});

test("the result artifact durably discloses the replay defect and names no discarded id", () => {
  assert.equal(result.aborted_attempt.occurred, true);
  assert.equal(result.aborted_attempt.foundation_fault, false);
  assert.equal(result.aborted_attempt.canonical_status, "DISCARDED_BEFORE_ACCEPTED_COMMIT");

  // A discarded, never-committed population must never be asserted as an
  // Event id here — accepted ids only, and only those ten.
  const serialised = JSON.stringify(result.aborted_attempt);
  const acceptedIds = new Set(result.admitted.map((a) => a.event_id));
  const found = serialised.match(/event-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
  for (const id of found) assert.ok(acceptedIds.has(id), `${id} is not one of the accepted ten`);
});

test("admission-result.json admitted[] is exactly events/event-state.json events[], row for row", async () => {
  const state = await readValidatedState();
  const mappingByEvent = new Map(state.mappings.map((m) => [m.event_id, m]));
  const eventById = new Map(state.events.map((e) => [e.event_id, e]));

  // The guarantee is unchanged in spirit: a report must never cite an
  // Event population the committed artifact does not contain. Its SCOPE
  // is the pilot's own result artifact, which describes the pilot's ten -
  // not the whole estate, which later packages legitimately grew.
  const pilot = await pilotEvents(state);
  assert.deepEqual(
    result.admitted.map((a) => a.event_id).sort(),
    pilot.map((e) => e.event_id).sort(),
    "the pilot result artifact must describe exactly the pilot's committed Events",
  );

  for (const row of result.admitted) {
    const event = eventById.get(row.event_id);
    const mapping = mappingByEvent.get(row.event_id);
    assert.ok(event, `${row.event_id} in admission-result.json has no committed Event`);
    assert.equal(row.occurrence_fingerprint, mapping.fingerprint);
    assert.equal(row.occurrence_instant_utc, event.start.iso);
    assert.equal(row.venue_id, event.venue_id);
    assert.equal(row.status, event.status);
  }
});

/* ---------------------------------------------------------------- */
/* PUBLIC ISOLATION                                                  */
/* ---------------------------------------------------------------- */

test("no publication or map module reads Event state", async () => {
  const MODULES = [
    "ingestion/map/projection.mjs",
    "ingestion/map/publication.mjs",
    "ingestion/map/group-associated-listings.mjs",
    "ingestion/map/date-filter.mjs",
  ];
  for (const path of MODULES) {
    const code = (await readFile(resolve(ROOT, path), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.equal(code.includes("event-state"), false, `${path} reads Event state`);
    assert.equal(/from\s+["'][^"']*\/event\//.test(code), false, `${path} imports the Event foundation`);
  }
});

test("the published map contains no football, no SPORT and no Event id", async () => {
  const raw = await readFile(resolve(ROOT, "data/public/lisbon-porto-map.json"), "utf8");
  assert.equal(/event-[0-9a-f]{8}-[0-9a-f]{4}-4/.test(raw), false);
  assert.equal(/FOOTBALL/i.test(raw), false);
  assert.equal(raw.includes('"SPORT"'), false);
  assert.equal(raw.includes("dof1-"), false);
});

test("public marker and listing counts are unchanged by the pilot", async () => {
  // BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 legitimately
  // regenerated data/public/lisbon-porto-map.json (2026-09-22T11:57:58.377Z)
  // via the normal `npm run publish:map-data` path: it publishes United
  // Kingdom venues for the first time (0 -> 103 markers, the whole point of
  // that package) and refreshed Portugal/Spain/Germany/France's live counts
  // in the same run (natural source-availability drift — see that
  // package's own report and tests/discovery-map-ux-regression.test.mjs's
  // KNOWN_GOOD_MARKER_FLOORS comment). BEATMAPPED-UK-NATIONAL-LIVE-VENUE-
  // DISCOVERY-EXPANSION-01 regenerated it again (2026-09-22T14:18:25.210Z):
  // United Kingdom 103 -> 137 markers (34 newly discovered venues —
  // OpenStreetMap Overpass sweep + evidence-verified long-tail web
  // research, see that package's own report), Portugal/Spain/Germany/
  // France again refreshed by natural source drift.
  // BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 regenerated it a
  // third time (2026-09-22T19:51:50.488Z): United Kingdom 137 -> 3,383
  // markers (a bulk Geofabrik OSM PBF sweep of the whole country, 3,246
  // newly admitted venues after the eligibility/disused-building
  // corrections — see that package's own research/venue-discovery/
  // uk-national-bulk-osm-02/run.json), Portugal/Spain/Germany/France
  // again refreshed by natural source drift.
  // BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 regenerated it a
  // fourth time (2026-09-22T23:17:04.922Z): United Kingdom marker COUNT is
  // unchanged (3,383 — this package acquires PROGRAMMES for already-
  // discovered venues, never new venues), but 86 of those markers now
  // carry real display listings for the first time (79 from this
  // package's own 89 proven national sources; the rest already came from
  // London's bespoke collectors), so the GLOBAL listing total rises
  // sharply (761 UK listings alone). Portugal/Spain/Germany/France again
  // refreshed by natural source drift. This test's own job — proving the
  // football admission PILOT itself never touches public data — is
  // unaffected by any of these later, legitimate regenerations; only the
  // pinned baseline it compares against needed updating, exactly as this
  // codebase's established convention already does whenever a real
  // publish:map-data run intentionally changes the committed artifact.
  const published = JSON.parse(await readFile(resolve(ROOT, "data/public/lisbon-porto-map.json"), "utf8"));
  let markers = 0;
  let listings = 0;
  for (const country of Object.values(published.countries)) {
    for (const marker of country.markers ?? []) {
      markers += 1;
      listings += (marker.display_listings ?? []).length;
    }
  }
  assert.equal(markers, 3507);
  assert.equal(listings, 5692);
  assert.equal(published.counts.map_marker_count, markers);
  assert.equal(published.counts.display_listing_count, listings);
});
