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

test("the committed Event state is exactly the pilot, and validates", async () => {
  const state = await readValidatedState();
  assert.deepEqual(validateState(state), []);
  assert.equal(state.events.length, 10);
  assert.equal(state.mappings.length, 10);
  assert.equal(state.scheduleHistory.length, 10);

  for (const event of state.events) {
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

  assert.equal(state.events.filter((e) => e.venue_id !== null).length, 5);
  assert.equal(state.events.filter((e) => e.venue_id === null).length, 5);
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
    assert.equal(id.includes(mapping.fingerprint.toLowerCase()), false);
    if (event.venue_id) assert.equal(id.includes(event.venue_id.toLowerCase()), false);
    assert.equal(id.includes(event.start.iso.replace(/\D/g, "")), false);
    for (const ref of mapping.observations) {
      assert.equal(id.includes(ref.source_record_id.toLowerCase()), false);
    }
  }
});

test("every committed Event uses the generic foundation's mapping and schedule", async () => {
  const state = await readValidatedState();
  for (const event of state.events) {
    const mappings = state.mappings.filter((m) => m.event_id === event.event_id && m.lifecycle === "ACTIVE");
    assert.equal(mappings.length, 1);
    assert.equal(mappings[0].basis_kind, "PROVIDER_FINGERPRINT");
    assert.equal(mappings[0].method, PILOT_POLICY);
    assert.ok(mappings[0].observations.length >= 2);

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

  assert.deepEqual(
    result.admitted.map((a) => a.event_id).sort(),
    state.events.map((e) => e.event_id).sort(),
    "a future report must never again be able to cite a different Event population than the committed result artifact",
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
  const published = JSON.parse(await readFile(resolve(ROOT, "data/public/lisbon-porto-map.json"), "utf8"));
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
  assert.equal(published.counts.map_marker_count, markers);
  assert.equal(published.counts.display_listing_count, listings);
});
