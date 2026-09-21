// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-IDENTITY-ARCHITECTURE-CONFORMANCE-01
// — unit tests for the football adapter. Pure and offline.
//
// The theme of this file is ONE property: the occurrence fingerprint is a
// function of the occurrence anchor alone. Every other fact a reconciled
// group carries — team spellings, competition labels, venue text, the
// governed venue, the publishers, the member list and its order — is
// varied here and must move nothing.

import assert from "node:assert/strict";
import test from "node:test";

import {
  FINGERPRINT_STATES,
  OCCURRENCE_TYPE,
  EVIDENCE_CLASSES,
  LIFECYCLE_STATE,
  PROVIDER_NAMESPACE,
  WITHHELD_REASONS,
  fingerprintAll,
  fingerprintGroup,
  eligibility,
  evidenceClass,
} from "../ingestion/gc-football-occurrence-fingerprints/adapt.mjs";

const MATCH_ID = "013f5700-aaca-11f1-b783-1d1d94fe4064";
const KICKOFF = "2026-11-04T14:00:00.000Z";

function member(sourceId, overrides = {}) {
  return {
    source_id: sourceId,
    source_record_id: MATCH_ID,
    source_census_venue_id: "ukmec-england-ipswich-portman-road",
    source_census_venue_name: "Portman Road",
    home_or_away: "Home",
    home_team_raw: "Ipswich Town",
    away_team_raw: "Tottenham Hotspur",
    competition_raw: "Premier League",
    source_venue_text_raw: "Portman Road",
    attribution_state: "UNRESOLVED_NO_CENSUS_MATCH",
    resolved_venue_census_id: null,
    resolved_venue_name: null,
    ...overrides,
  };
}

/** A reconciled group in exactly the shape the predecessor emits. */
function group(overrides = {}) {
  const detail = overrides.member_detail ?? [member("src-a"), member("src-b")];
  return {
    platform_match_id: MATCH_ID,
    member_count: detail.length,
    source_count: new Set(detail.map((d) => d.source_id)).size,
    source_ids: [...new Set(detail.map((d) => d.source_id))],
    publisher_domains: ["itfc.co.uk", "tottenhamhotspur.com"],
    publisher_domain_count: 2,
    members: detail.map((d) => ({ source_id: d.source_id, source_record_id: d.source_record_id })),
    home_team_variants: ["Ipswich Town"],
    away_team_variants: ["Tottenham Hotspur"],
    competition_variants: ["Premier League"],
    source_venue_text_variants: ["Portman Road"],
    home_or_away_variants: ["Home"],
    reconciliation_group_id: `gcf-${MATCH_ID}-20261104T140000Z`,
    kickoff_utc: KICKOFF,
    kickoff_variants: [KICKOFF],
    is_future: true,
    venue_evidence_state: "NO_MEMBER_RESOLVED",
    reconciled_venue_census_id: null,
    reconciled_venue_name: null,
    reconciled_venue_city: null,
    reconciled_venue_nation: null,
    venue_supported_by: [],
    venue_candidates: [],
    reconciliation_state: "RECONCILED_MULTI_SOURCE",
    conflict: null,
    ...overrides,
    member_detail: detail,
  };
}

const idOf = (overrides) => {
  const result = fingerprintGroup(group(overrides));
  assert.equal(result.fingerprint_state, "OCCURRENCE_FINGERPRINT_ESTABLISHED", result.withheld_reason);
  return result.occurrence_fingerprint;
};

const BASELINE = idOf({});

/* ---------------------------------------------------------------- */
/* THE HAPPY PATH                                                    */
/* ---------------------------------------------------------------- */

test("a valid reconciled group derives an occurrence fingerprint", () => {
  const event = fingerprintGroup(group());

  assert.equal(event.fingerprint_state, "OCCURRENCE_FINGERPRINT_ESTABLISHED");
  assert.ok(FINGERPRINT_STATES.has(event.fingerprint_state));
  assert.equal(event.occurrence_type, OCCURRENCE_TYPE);
  assert.equal(event.provider_namespace, PROVIDER_NAMESPACE);
  assert.equal(event.platform_match_id, MATCH_ID);
  assert.equal(event.occurrence_instant_utc, KICKOFF);
  assert.equal(event.reconciliation_group_id, `gcf-${MATCH_ID}-20261104T140000Z`);
  assert.match(event.occurrence_fingerprint, /^dof1-gc-football-20261104T140000Z-[0-9a-f]{24}$/);

  // It is a derived evidence anchor, and says so.
  assert.equal(event.lifecycle_state, LIFECYCLE_STATE);
  assert.equal(event.lifecycle_state, "DERIVED_EVIDENCE_ANCHOR_NOT_AN_ENTITY");

  // And it claims no application entity identity of any kind.
  assert.equal(event.application_canonical_event_id, null);
  assert.equal(event.application_entity_state, "NOT_ADMITTED_TO_CANONICAL_EVENT");
  assert.equal("canonical_event_id" in event, false);
});

test("the anchor on the record contains only the identity inputs", () => {
  const event = fingerprintGroup(group());
  assert.deepEqual(Object.keys(event.fingerprint_anchor).sort(), [
    "fingerprint_version",
    "occurrence_instant_utc",
    "provider_event_key",
    "provider_namespace",
  ]);
  assert.equal(event.fingerprint_anchor.provider_event_key, MATCH_ID);
});

/* ---------------------------------------------------------------- */
/* IDENTITY STABILITY — the heart of this package                    */
/* ---------------------------------------------------------------- */

test("the same match id and kickoff always mints the same id", () => {
  assert.equal(idOf({}), BASELINE);
  assert.equal(idOf({ reconciliation_group_id: "a-different-group-id" }), BASELINE);
});

test("a conflicting kickoff for one match id refuses rather than aliasing", () => {
  const result = fingerprintGroup(group({ kickoff_variants: [KICKOFF, "2026-11-04T16:00:00.000Z"] }));

  assert.equal(result.fingerprint_state, "OCCURRENCE_FINGERPRINT_WITHHELD");
  assert.equal(result.withheld_reason, "FINGERPRINT_CONFLICT_MATCH_ID_KICKOFF");
  assert.ok(WITHHELD_REASONS.has(result.withheld_reason));
  assert.deepEqual(result.detail.conflicting_instants, [KICKOFF, "2026-11-04T16:00:00.000Z"]);
  assert.equal(result.occurrence_fingerprint, undefined, "no id may be minted over a conflict");
});

test("different match ids at the same kickoff stay different events", () => {
  const first = idOf({ platform_match_id: "match-a" });
  const second = idOf({ platform_match_id: "match-b" });
  assert.notEqual(first, second);
});

test("home-team spelling variants do not alter identity", () => {
  assert.equal(idOf({ home_team_variants: ["Ipswich Town", "Ipswich Town FC"] }), BASELINE);
  assert.equal(idOf({ home_team_variants: ["Something Else Entirely"] }), BASELINE);
});

test("away-team spelling variants do not alter identity", () => {
  assert.equal(idOf({ away_team_variants: ["Tottenham Hotspur", "Spurs"] }), BASELINE);
});

test("competition label variants do not alter identity", () => {
  assert.equal(idOf({ competition_variants: ["Premier League", "Premier League 2026/27"] }), BASELINE);
});

test("source venue text variants do not alter identity", () => {
  assert.equal(idOf({ source_venue_text_variants: ["Portman Road", "Portman Rd"] }), BASELINE);
});

test("adding or removing a governed venue does not alter identity", () => {
  const resolved = idOf({
    venue_evidence_state: "AGREED_BY_ALL_RESOLVED_MEMBERS",
    reconciled_venue_census_id: "ukmec-england-ipswich-portman-road",
    reconciled_venue_name: "Portman Road",
    reconciled_venue_city: "Ipswich",
    reconciled_venue_nation: "England",
    venue_supported_by: [{ source_id: "src-a", source_record_id: MATCH_ID }],
  });
  assert.equal(resolved, BASELINE, "resolving the venue must move no id");

  const movedVenue = idOf({
    venue_evidence_state: "AGREED_BY_ALL_RESOLVED_MEMBERS",
    reconciled_venue_census_id: "ukmec-england-some-other-ground",
    reconciled_venue_name: "Some Other Ground",
  });
  assert.equal(movedVenue, BASELINE, "correcting the venue must move no id");
});

test("an extra corroborating source member does not alter identity", () => {
  const three = idOf({ member_detail: [member("src-a"), member("src-b"), member("src-c")] });
  assert.equal(three, BASELINE);
});

test("member ordering does not alter identity", () => {
  const forwards = idOf({ member_detail: [member("src-a"), member("src-b"), member("src-c")] });
  const backwards = idOf({ member_detail: [member("src-c"), member("src-b"), member("src-a")] });
  assert.equal(forwards, backwards);
  assert.equal(forwards, BASELINE);
});

test("publisher evidence does not alter identity", () => {
  const cross = idOf({ publisher_domains: ["itfc.co.uk", "tottenhamhotspur.com"], publisher_domain_count: 2 });
  const same = idOf({ publisher_domains: ["itfc.co.uk"], publisher_domain_count: 1 });
  assert.equal(cross, same);
  assert.equal(cross, BASELINE);
});

test("a kickoff written with an equivalent offset mints the same id", () => {
  assert.equal(idOf({ kickoff_variants: ["2026-11-04T15:00:00+01:00"] }), BASELINE);
  assert.equal(idOf({ kickoff_variants: [KICKOFF, "2026-11-04T15:00:00+01:00"] }), BASELINE);
});

/* ---------------------------------------------------------------- */
/* EVIDENCE CLASS — a fact, retained, and never part of identity     */
/* ---------------------------------------------------------------- */

test("cross-publisher corroboration is classified and retained", () => {
  const event = fingerprintGroup(group({ publisher_domains: ["itfc.co.uk", "tottenhamhotspur.com"], publisher_domain_count: 2 }));
  assert.equal(event.evidence_class, "CROSS_PUBLISHER_CORROBORATED");
  assert.ok(EVIDENCE_CLASSES.has(event.evidence_class));
  assert.deepEqual(event.publisher_domains, ["itfc.co.uk", "tottenhamhotspur.com"]);
  assert.equal(event.publisher_domain_count, 2);
});

test("same-publisher multi-calendar reconciliation is classified and retained", () => {
  const event = fingerprintGroup(group({ publisher_domains: ["itfc.co.uk"], publisher_domain_count: 1 }));
  assert.equal(event.evidence_class, "SAME_PUBLISHER_MULTI_SOURCE");
  assert.notEqual(event.evidence_class, "CROSS_PUBLISHER_CORROBORATED");
  assert.deepEqual(event.publisher_domains, ["itfc.co.uk"]);
});

test("the evidence class is a class, not a score", () => {
  const event = fingerprintGroup(group());
  assert.equal(typeof event.evidence_class, "string");
  for (const field of Object.keys(event)) {
    assert.ok(!/confidence|score|probability|likelihood/i.test(field), `${field} looks like a score`);
  }
  assert.equal(evidenceClass({ publisher_domain_count: 3 }), "CROSS_PUBLISHER_CORROBORATED");
  assert.equal(evidenceClass({ publisher_domain_count: 1 }), "SAME_PUBLISHER_MULTI_SOURCE");
});

/* ---------------------------------------------------------------- */
/* VENUE — enrichment, never identity                                */
/* ---------------------------------------------------------------- */

test("an unresolved venue does not block an otherwise valid identity", () => {
  const event = fingerprintGroup(group({ venue_evidence_state: "NO_MEMBER_RESOLVED" }));
  assert.equal(event.fingerprint_state, "OCCURRENCE_FINGERPRINT_ESTABLISHED");
  assert.equal(event.governed_venue_census_id, null);
  assert.equal(event.venue_evidence_state, "NO_MEMBER_RESOLVED");
});

test("an unresolved venue is reported as unresolved, never manufactured", () => {
  const event = fingerprintGroup(group({
    venue_evidence_state: "NO_MEMBER_RESOLVED",
    source_venue_text_variants: ["Playford Road"],
  }));
  // The source's own venue text is retained, but it is NOT promoted into
  // a governed venue just because a string exists.
  assert.deepEqual(event.source_venue_text_variants, ["Playford Road"]);
  assert.equal(event.governed_venue_census_id, null);
  assert.equal(event.governed_venue_name, null);
});

test("a governed venue is carried with the members that support it", () => {
  const supported = [{ source_id: "src-a", source_record_id: MATCH_ID }];
  const event = fingerprintGroup(group({
    venue_evidence_state: "AGREED_BY_ALL_RESOLVED_MEMBERS",
    reconciled_venue_census_id: "ukmec-england-ipswich-portman-road",
    reconciled_venue_name: "Portman Road",
    reconciled_venue_city: "Ipswich",
    reconciled_venue_nation: "England",
    venue_supported_by: supported,
  }));
  assert.equal(event.governed_venue_census_id, "ukmec-england-ipswich-portman-road");
  assert.equal(event.governed_venue_name, "Portman Road");
  assert.deepEqual(event.venue_supported_by, supported);
});

test("a venue disagreement withholds identity rather than picking a winner", () => {
  const result = fingerprintGroup(group({ venue_evidence_state: "CONFLICTING_RESOLVED_VENUES" }));
  assert.equal(result.fingerprint_state, "OCCURRENCE_FINGERPRINT_WITHHELD");
  assert.equal(result.withheld_reason, "FINGERPRINT_CONFLICT_RESOLVED_VENUE");
});

/* ---------------------------------------------------------------- */
/* ELIGIBILITY — single-source stays out                             */
/* ---------------------------------------------------------------- */

test("a single-source record cannot enter this canonicalisation path", () => {
  const single = fingerprintGroup(group({
    reconciliation_state: "SINGLE_SOURCE_NOT_IN_SCOPE",
    member_detail: [member("src-a")],
  }));
  assert.equal(single.fingerprint_state, "OCCURRENCE_FINGERPRINT_WITHHELD");
  assert.equal(single.withheld_reason, "NOT_RECONCILED_MULTI_SOURCE");
  assert.equal(single.occurrence_fingerprint, undefined);
});

test("a group claiming reconciliation with only one source is still refused", () => {
  const result = fingerprintGroup(group({ member_detail: [member("src-a")] }));
  assert.equal(result.fingerprint_state, "OCCURRENCE_FINGERPRINT_WITHHELD");
  assert.equal(result.withheld_reason, "INSUFFICIENT_SOURCE_MULTIPLICITY");
});

test("an upstream factual conflict withholds identity", () => {
  const result = fingerprintGroup(group({ conflict: { kind: "CONFLICT_OTHER_FACTUAL" } }));
  assert.equal(result.fingerprint_state, "OCCURRENCE_FINGERPRINT_WITHHELD");
  assert.equal(result.withheld_reason, "UPSTREAM_FACTUAL_CONFLICT");
});

test("a missing match id or kickoff withholds identity", () => {
  assert.equal(fingerprintGroup(group({ platform_match_id: "" })).withheld_reason, "MISSING_PLATFORM_MATCH_ID");
  assert.equal(fingerprintGroup(group({ kickoff_variants: [], kickoff_utc: null })).withheld_reason, "MISSING_OR_INVALID_KICKOFF");
  assert.equal(fingerprintGroup(group({ kickoff_variants: ["nonsense"] })).withheld_reason, "MISSING_OR_INVALID_KICKOFF");
});

test("every withheld reason is one the contract declares", () => {
  const refusals = [
    group({ reconciliation_state: "SINGLE_SOURCE_NOT_IN_SCOPE" }),
    group({ member_detail: [member("src-a")] }),
    group({ platform_match_id: "" }),
    group({ kickoff_variants: ["nonsense"] }),
    group({ kickoff_variants: [KICKOFF, "2026-11-04T16:00:00.000Z"] }),
    group({ venue_evidence_state: "CONFLICTING_RESOLVED_VENUES" }),
    group({ conflict: { kind: "CONFLICT_OTHER_FACTUAL" } }),
  ];
  for (const candidate of refusals) {
    const result = fingerprintGroup(candidate);
    assert.equal(result.fingerprint_state, "OCCURRENCE_FINGERPRINT_WITHHELD");
    assert.ok(WITHHELD_REASONS.has(result.withheld_reason), result.withheld_reason);
  }
  assert.equal(eligibility(group()).eligible, true);
});

/* ---------------------------------------------------------------- */
/* PARTICIPANTS AND COMPETITION — retained, never canonicalised      */
/* ---------------------------------------------------------------- */

test("no canonical club or competition identity is invented", () => {
  const event = fingerprintGroup(group({
    home_team_variants: ["Ipswich Town", "Ipswich Town FC", "Ipswich Town FC "],
    competition_variants: ["Premier League", "Premier League 2026/27"],
  }));

  // Every spelling survives, verbatim and unranked.
  assert.deepEqual(event.home_team_variants, ["Ipswich Town", "Ipswich Town FC", "Ipswich Town FC "]);
  assert.deepEqual(event.competition_variants, ["Premier League", "Premier League 2026/27"]);

  // And none is elected canonical.
  assert.equal(event.canonical_home_club_id, null);
  assert.equal(event.canonical_away_club_id, null);
  assert.equal(event.canonical_competition_id, null);
  assert.equal(event.participant_identity_state, "UNRESOLVED_NO_GOVERNED_CLUB_IDENTITY");
  assert.equal(event.competition_identity_state, "UNRESOLVED_NO_GOVERNED_COMPETITION_IDENTITY");
});

test("per-member provenance is retained so no variant is unattributable", () => {
  const event = fingerprintGroup(group({
    member_detail: [
      member("src-a", { home_team_raw: "Ipswich Town" }),
      member("src-b", { home_team_raw: "Ipswich Town FC" }),
    ],
  }));
  assert.equal(event.member_detail.length, 2);
  const byHomeTeam = Object.fromEntries(event.member_detail.map((d) => [d.source_id, d.home_team_raw]));
  assert.deepEqual(byHomeTeam, { "src-a": "Ipswich Town", "src-b": "Ipswich Town FC" });
});

/* ---------------------------------------------------------------- */
/* PURITY AND BATCH BEHAVIOUR                                        */
/* ---------------------------------------------------------------- */

test("canonicalisation never mutates its input group", () => {
  const input = group();
  const before = JSON.stringify(input);
  fingerprintGroup(input);
  assert.equal(JSON.stringify(input), before);
});

test("every input group ends at exactly one outcome", () => {
  const groups = [
    group({ platform_match_id: "match-a" }),
    group({ platform_match_id: "match-b" }),
    group({ platform_match_id: "match-c", kickoff_variants: [KICKOFF, "2026-11-04T16:00:00.000Z"] }),
    group({ platform_match_id: "match-d", reconciliation_state: "SINGLE_SOURCE_NOT_IN_SCOPE" }),
  ];
  const { established, withheld } = fingerprintAll(groups);
  assert.equal(established.length, 2);
  assert.equal(withheld.length, 2);
  assert.equal(established.length + withheld.length, groups.length);
});

test("output ordering is stable regardless of input ordering", () => {
  const groups = ["match-a", "match-b", "match-c"].map((id) => group({ platform_match_id: id }));
  const forwards = fingerprintAll(groups).established.map((e) => e.occurrence_fingerprint);
  const backwards = fingerprintAll([...groups].reverse()).established.map((e) => e.occurrence_fingerprint);
  assert.deepEqual(forwards, backwards);
  assert.deepEqual(forwards, [...forwards].sort());
});
