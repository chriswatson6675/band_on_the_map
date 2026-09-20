// BEATMAPPED-UK-GC-FOOTBALL-MULTISOURCE-FIXTURE-RECONCILIATION-01 — unit tests.
// Pure and offline.

import assert from "node:assert/strict";
import test from "node:test";

import {
  RECONCILIATION_STATES,
  normaliseKickoff,
  reconciliationGroupId,
} from "../ingestion/gc-football-reconciliation/contract.mjs";
import { reconcileAll, venueEvidence } from "../ingestion/gc-football-reconciliation/reconcile.mjs";

let seq = 0;
function obs({ source = "src-a", domain = "a.example", matchId = "m1", kickoff = "2026-10-01T14:00:00.000Z", home = "A", away = "B", comp = "League", venueText = "Ground", homeOrAway = "Home" } = {}) {
  seq += 1;
  return {
    source_id: source,
    source_record_id: `${matchId}#${seq}`,
    source_url: `https://www.${domain}/matches`,
    venue_name: venueText,
    start: { iso: kickoff, certainty: "UTC_INSTANT" },
    source_fields: {
      match_id: matchId,
      home_or_away: homeOrAway,
      competition_name: comp,
      team_names: [home, away],
    },
  };
}

function attr(observation, { resolvedId = null, resolvedName = null, state = "UNRESOLVED_NO_CENSUS_MATCH" } = {}) {
  return {
    source_id: observation.source_id,
    source_record_id: observation.source_record_id,
    resolved_venue_census_id: resolvedId,
    resolved_venue_name: resolvedName,
    resolved_venue_city: null,
    resolved_venue_nation: null,
    attribution_state: state,
    source_census_venue_id: "src-venue",
    source_census_venue_name: "Source Venue",
    is_future: true,
  };
}

const run = (pairs) => reconcileAll(pairs.map((p) => p.o), pairs.map((p) => p.a));
const only = (result) => { assert.equal(result.groups.length, 1); return result.groups[0]; };

/* ---------------------------------------------------------------- */
/* THE KEY                                                           */
/* ---------------------------------------------------------------- */

test("same match id + same kickoff across two sources RECONCILES", () => {
  const a = obs({ source: "src-a", domain: "a.example" });
  const b = obs({ source: "src-b", domain: "b.example" });
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.equal(group.member_count, 2);
  assert.equal(group.source_count, 2);
  assert.equal(group.publisher_domain_count, 2);
});

test("same match id + DIFFERENT kickoff is refused, and neither kickoff is chosen", () => {
  const a = obs({ source: "src-a", kickoff: "2026-10-01T14:00:00.000Z" });
  const b = obs({ source: "src-b", kickoff: "2026-10-01T19:45:00.000Z" });
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "CONFLICT_MATCH_ID_KICKOFF");
  assert.equal(group.kickoff_utc, null, "no kickoff may be chosen from a conflict");
  assert.equal(group.reconciliation_group_id, null, "a conflicting group gets no identity");
  assert.equal(group.kickoff_variants.length, 2);
  assert.equal(group.conflict.kind, "MATCH_ID_KICKOFF_CONFLICT");
});

test("DIFFERENT match ids never reconcile, even with identical teams, kickoff and venue", () => {
  const a = obs({ source: "src-a", matchId: "m1" });
  const b = obs({ source: "src-b", matchId: "m2" });
  const result = run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]);
  assert.equal(result.groups.length, 2, "identical facts must not fuse distinct match ids");
  for (const group of result.groups) assert.equal(group.reconciliation_state, "SINGLE_SOURCE_NOT_IN_SCOPE");
});

test("kickoff normalisation accepts equivalent instants and rejects nonsense", () => {
  assert.equal(normaliseKickoff("2026-10-01T14:00:00Z"), "2026-10-01T14:00:00.000Z");
  assert.equal(normaliseKickoff("2026-10-01T14:00:00.000Z"), "2026-10-01T14:00:00.000Z");
  assert.equal(normaliseKickoff("not a date"), null);
  assert.equal(normaliseKickoff(null), null);
});

/* ---------------------------------------------------------------- */
/* NAMES ARE NEVER KEYS                                              */
/* ---------------------------------------------------------------- */

test("home/away team spelling variants do NOT prevent reconciliation, and are retained", () => {
  const a = obs({ source: "src-a", home: "Oldham Athletic" });
  const b = obs({ source: "src-b", home: "Oldham Athletic AFC" });
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.deepEqual(group.home_team_variants, ["Oldham Athletic", "Oldham Athletic AFC"]);
});

test("competition label variants do NOT prevent reconciliation, and are retained", () => {
  const a = obs({ source: "src-a", comp: "FA WSL Cup" });
  const b = obs({ source: "src-b", comp: "English Players Cup" });
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.deepEqual(group.competition_variants, ["English Players Cup", "FA WSL Cup"]);
});

test("source venue TEXT variants do not prevent reconciliation when governed venue identity agrees", () => {
  const a = obs({ source: "src-a", venueText: "County Ground" });
  const b = obs({ source: "src-b", venueText: "The County Ground" });
  const group = only(run([
    { o: a, a: attr(a, { resolvedId: "v1", resolvedName: "County Ground", state: "SOURCE_VENUE_MATCH" }) },
    { o: b, a: attr(b, { resolvedId: "v1", resolvedName: "County Ground", state: "SOURCE_VENUE_MATCH" }) },
  ]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.equal(group.reconciled_venue_census_id, "v1");
  assert.equal(group.source_venue_text_variants.length, 2, "both spellings retained verbatim");
});

test("a differing home/away label is NOT a conflict — it is what two clubs should say", () => {
  const a = obs({ source: "src-a", homeOrAway: "Home" });
  const b = obs({ source: "src-b", homeOrAway: "Away" });
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.deepEqual(group.home_or_away_variants, ["Away", "Home"]);
});

/* ---------------------------------------------------------------- */
/* VENUE CONTRACT                                                    */
/* ---------------------------------------------------------------- */

test("two members resolving DIFFERENT governed venues is a conflict, and neither is chosen", () => {
  const a = obs({ source: "src-a" });
  const b = obs({ source: "src-b" });
  const group = only(run([
    { o: a, a: attr(a, { resolvedId: "v1", resolvedName: "One" }) },
    { o: b, a: attr(b, { resolvedId: "v2", resolvedName: "Two" }) },
  ]));
  assert.equal(group.reconciliation_state, "CONFLICT_RESOLVED_VENUE");
  assert.equal(group.reconciled_venue_census_id, null, "neither venue may be picked");
  assert.equal(group.venue_candidates.length, 2, "both candidates must be named");
  for (const candidate of group.venue_candidates) assert.ok(candidate.supported_by.length > 0);
});

test("EVIDENCE UNION: an unresolved member does not veto a venue another member established", () => {
  const a = obs({ source: "src-a" });
  const b = obs({ source: "src-b" });
  const group = only(run([
    { o: a, a: attr(a, { resolvedId: "v1", resolvedName: "One", state: "SOURCE_VENUE_MATCH" }) },
    { o: b, a: attr(b) }, // resolved nothing — absence of evidence
  ]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.equal(group.venue_evidence_state, "AGREED_BY_ALL_RESOLVED_MEMBERS");
  assert.equal(group.reconciled_venue_census_id, "v1");
  assert.equal(group.venue_supported_by.length, 1, "exactly which observation supports it must be retained");
  assert.equal(group.venue_supported_by[0].source_id, "src-a");
});

test("a group where nobody resolved a venue still reconciles, with no venue", () => {
  const a = obs({ source: "src-a" });
  const b = obs({ source: "src-b" });
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "RECONCILED_MULTI_SOURCE");
  assert.equal(group.venue_evidence_state, "NO_MEMBER_RESOLVED");
  assert.equal(group.reconciled_venue_census_id, null);
});

test("venueEvidence is a pure function of its members", () => {
  assert.equal(venueEvidence([]).venue_evidence_state, "NO_MEMBER_RESOLVED");
});

/* ---------------------------------------------------------------- */
/* SCOPE, FACTUAL CONFLICT, DETERMINISM                              */
/* ---------------------------------------------------------------- */

test("a single-source match id is OUT OF SCOPE — no group is manufactured for it", () => {
  const a = obs({ source: "src-a" });
  const group = only(run([{ o: a, a: attr(a) }]));
  assert.equal(group.reconciliation_state, "SINGLE_SOURCE_NOT_IN_SCOPE");
  assert.equal(group.reconciled_venue_census_id, null, "no venue is asserted for an out-of-scope id");
  assert.equal(group.source_count, 1);
});

test("one calendar publishing the same match id twice is a FACTUAL CONFLICT, not out-of-scope", () => {
  // Checked before the scope gate: such a group has source_count 1, so a
  // scope-first ordering would quietly file a real anomaly as "single
  // source, out of scope".
  const a = obs({ source: "src-a" });
  const b = obs({ source: "src-a" }); // same source_id
  const group = only(run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]));
  assert.equal(group.reconciliation_state, "CONFLICT_OTHER_FACTUAL");
  assert.equal(group.conflict.kind, "SAME_SOURCE_PUBLISHED_MATCH_ID_MORE_THAN_ONCE");
  assert.equal(group.reconciled_venue_census_id, null, "a conflicting group asserts no venue");
  assert.equal(group.source_count, 1);
  assert.equal(group.member_count, 2);
});

test("group ids are deterministic and derived only from the key", () => {
  assert.equal(reconciliationGroupId("g123", "2026-10-01T14:00:00.000Z"), "gcf-g123-20261001T140000Z");
  assert.equal(
    reconciliationGroupId("g123", "2026-10-01T14:00:00.000Z"),
    reconciliationGroupId("g123", normaliseKickoff("2026-10-01T14:00:00Z")),
    "equivalent instants must yield the same id",
  );
});

test("output ordering is deterministic regardless of input order", () => {
  const a = obs({ source: "src-a", matchId: "zzz" });
  const b = obs({ source: "src-b", matchId: "aaa" });
  const forwards = run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]).groups.map((g) => g.platform_match_id);
  const backwards = run([{ o: b, a: attr(b) }, { o: a, a: attr(a) }]).groups.map((g) => g.platform_match_id);
  assert.deepEqual(forwards, backwards);
  assert.deepEqual(forwards, ["aaa", "zzz"]);
});

test("reconciliation does not mutate its inputs", () => {
  const a = obs({ source: "src-a" });
  const b = obs({ source: "src-b" });
  const observations = [a, b];
  const attributions = [attr(a), attr(b)];
  const before = JSON.stringify({ observations, attributions });
  reconcileAll(observations, attributions);
  assert.equal(JSON.stringify({ observations, attributions }), before);
});

test("every group ends at exactly one canonical state, and none mints event identity", () => {
  const a = obs({ source: "src-a" });
  const b = obs({ source: "src-b" });
  for (const group of run([{ o: a, a: attr(a) }, { o: b, a: attr(b) }]).groups) {
    assert.ok(RECONCILIATION_STATES.has(group.reconciliation_state));
    assert.ok(!("event_id" in group));
    assert.ok(!("canonical_event_id" in group));
  }
});

test("a record with no usable kickoff cannot enter a group", () => {
  const a = obs({ source: "src-a" });
  a.start = { iso: null, certainty: "UNKNOWN" };
  const result = run([{ o: a, a: attr(a) }]);
  assert.equal(result.groups.length, 0);
  assert.equal(result.without_key.length, 1, "it must still be accounted for");
});
