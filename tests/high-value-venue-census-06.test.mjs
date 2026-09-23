import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIGH_VALUE_CAPACITY_THRESHOLD,
  IN_CANON_STATES,
  PERMANENT_CLASSES,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_MAIN_SHA,
  PREDECESSOR_PACKAGE,
  STRATEGIC_SEGMENTS,
  VENUE_CLASSES,
  assessCompleteness,
  reconcileAgainstPredecessor,
  segmentFor,
  validateCensus06,
  validateCensus06Row,
} from "../ingestion/high-value-venue-census-06/contract.mjs";
import {
  applyUpdate,
  buildCoverageMatrix,
  buildCrossTabs,
  computeQualityInvariants06,
  defaultPermanenceFor,
  findCorpusDuplicates,
  namesAnExternalSource,
} from "../ingestion/high-value-venue-census-06/build.mjs";
import {
  CENSUS_06_DIR,
  REQUIRED_ARTIFACTS_06,
  validateCensus06Directory,
} from "../ingestion/high-value-venue-census-06/validate.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function evidence(url = "https://example.org/", note = "what this showed") {
  return [{ url, kind: "FETCHED_URL", note }];
}

function baseRow(overrides = {}) {
  return {
    research_id: "hv06-p-example-venue",
    predecessor_research_id: "hv05-p-example-venue",
    canonical_venue_id: null,
    canonical_match_state: "UNASSESSED",
    name: "Example Venue",
    aliases: [],
    venue_class: "ARENA",
    locality: "Example Town",
    nation: "England",
    postcode: null,
    operator_name: null,
    capacity_max: 0,
    capacity_kind: null,
    capacity_context: null,
    capacity_source_url: null,
    capacity_source_kind: null,
    capacity_confidence: "UNKNOWN",
    capacity_state: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    permanence_class: "PERMANENT_PURPOSE_BUILT_VENUE",
    official_website_url: null,
    general_programme_url: null,
    conference_calendar_url: null,
    sports_calendar_url: null,
    ticketing_url: null,
    calendar_scope: "UNKNOWN",
    calendar_source_kind: "UNKNOWN",
    calendar_state: "UNKNOWN",
    platform_family: null,
    platform_evidence: null,
    acquisition_shape: null,
    identity_evidence: evidence(),
    capacity_evidence: [],
    calendar_evidence: [],
    permanence_evidence: [],
    provenance: "PREDECESSOR_CARRIED_UNCHANGED",
    notes: "carried",
    ...overrides,
  };
}

function confirmedRow(overrides = {}) {
  return baseRow({
    capacity_max: 2500,
    capacity_kind: "STANDING",
    capacity_source_url: "https://venue.example/capacity",
    capacity_source_kind: "OFFICIAL_VENUE",
    capacity_confidence: "HIGH",
    capacity_state: "CONFIRMED_1000_PLUS",
    capacity_evidence: evidence("https://venue.example/capacity", "states capacity 2,500"),
    ...overrides,
  });
}

// ---------------------------------------------------------------------
// Contract basics
// ---------------------------------------------------------------------
test("a well-formed carried row validates", () => {
  assert.deepEqual(validateCensus06Row(baseRow()), []);
});

test("a missing required key is reported by name", () => {
  const row = baseRow();
  delete row.permanence_class;
  assert.ok(validateCensus06Row(row).some((e) => e.includes('missing required key "permanence_class"')));
});

test("an unknown capacity_state is rejected", () => {
  assert.ok(validateCensus06Row(baseRow({ capacity_state: "MAYBE" })).some((e) => e.includes("not a known state")));
});

test("duplicate research_ids are reported", () => {
  const errors = validateCensus06([baseRow(), baseRow({ predecessor_research_id: "hv05-p-other" })]);
  assert.ok(errors.some((e) => e.includes("duplicate research_id")));
});

// ---------------------------------------------------------------------
// A predecessor row must map to exactly one successor
// ---------------------------------------------------------------------
test("a predecessor row claimed by two successors is rejected", () => {
  const errors = validateCensus06([
    baseRow({ research_id: "hv06-a" }),
    baseRow({ research_id: "hv06-b" }),
  ]);
  assert.ok(errors.some((e) => e.includes("is claimed by more than one Package 06 row")));
});

test("a predecessor row with no disposition is reported", () => {
  const predecessor = [{ research_id: "hv05-p-one" }, { research_id: "hv05-p-two" }];
  const errors = reconcileAgainstPredecessor(predecessor, [baseRow({ predecessor_research_id: "hv05-p-one" })]);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("hv05-p-two"));
  assert.ok(errors[0].includes("no disposition"));
});

test("claiming a predecessor that does not exist is reported", () => {
  const errors = reconcileAgainstPredecessor([{ research_id: "hv05-p-one" }], [
    baseRow({ predecessor_research_id: "hv05-p-one" }),
    baseRow({ research_id: "hv06-x", predecessor_research_id: "hv05-p-ghost" }),
  ]);
  assert.ok(errors.some((e) => e.includes("hv05-p-ghost") && e.includes("does not exist")));
});

test("a new Package 06 venue must not claim a predecessor", () => {
  const errors = validateCensus06Row(baseRow({ provenance: "PACKAGE_06_NEW_RESEARCH" }));
  assert.ok(errors.some((e) => e.includes("cannot carry a predecessor_research_id")));
});

// ---------------------------------------------------------------------
// Permanence — the estate is of PERMANENT venues
// ---------------------------------------------------------------------
test("a confirmed venue with no permanence class is rejected", () => {
  const errors = validateCensus06Row(confirmedRow({ permanence_class: null }));
  assert.ok(errors.some((e) => e.includes("requires a permanence_class")));
});

test("a confirmed venue that is a public space is rejected", () => {
  const errors = validateCensus06Row(confirmedRow({ permanence_class: "PUBLIC_SPACE_NOT_A_VENUE" }));
  assert.ok(errors.some((e) => e.includes("the estate is of permanent venues")));
});

test("a temporary event site cannot hold a high-value capacity state", () => {
  const errors = validateCensus06Row(
    baseRow({ permanence_class: "TEMPORARY_EVENT_SITE", capacity_state: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE" }),
  );
  assert.ok(errors.some((e) => e.includes("cannot carry high-value capacity_state")));
});

test("an open-air site with a stable venue identity IS permanent and may be confirmed", () => {
  // A bandstand or a dedicated events arena is a real permanent venue even
  // though it is outdoors. The rule excludes public spaces, not open air.
  assert.deepEqual(
    validateCensus06Row(confirmedRow({ permanence_class: "OPEN_AIR_SITE_WITH_STABLE_VENUE_IDENTITY" })),
    [],
  );
});

test("excluding a venue for permanence is a negative claim needing evidence", () => {
  const errors = validateCensus06Row(
    baseRow({ capacity_state: "NOT_A_PERMANENT_VENUE", permanence_class: "PUBLIC_SPACE_NOT_A_VENUE" }),
  );
  assert.ok(errors.some((e) => e.includes("requires non-empty permanence_evidence")));
});

test("NOT_A_PERMANENT_VENUE requires a non-permanent permanence class", () => {
  const errors = validateCensus06Row(
    baseRow({
      capacity_state: "NOT_A_PERMANENT_VENUE",
      permanence_class: "PERMANENT_PURPOSE_BUILT_VENUE",
      permanence_evidence: evidence(),
    }),
  );
  assert.ok(errors.some((e) => e.includes("requires a non-permanent permanence_class")));
});

test("sports classes default to a sporting-ground permanence, others to purpose-built", () => {
  assert.equal(defaultPermanenceFor("FOOTBALL_GROUND"), "PERMANENT_SPORTING_GROUND");
  assert.equal(defaultPermanenceFor("RACECOURSE"), "PERMANENT_SPORTING_GROUND");
  assert.equal(defaultPermanenceFor("THEATRE"), "PERMANENT_PURPOSE_BUILT_VENUE");
  assert.equal(defaultPermanenceFor("CONFERENCE_CENTRE"), "PERMANENT_PURPOSE_BUILT_VENUE");
});

// ---------------------------------------------------------------------
// Capacity honesty
// ---------------------------------------------------------------------
test("CONFIRMED_1000_PLUS below the threshold is rejected", () => {
  const errors = validateCensus06Row(confirmedRow({ capacity_max: 400, capacity_evidence: evidence("https://venue.example/capacity", "states 400") }));
  assert.ok(errors.some((e) => e.includes(`capacity_max >= ${HIGH_VALUE_CAPACITY_THRESHOLD}`)));
});

test("CONFIRMED_1000_PLUS without capacity evidence is rejected", () => {
  assert.ok(validateCensus06Row(confirmedRow({ capacity_evidence: [] })).some((e) => e.includes("requires non-empty capacity_evidence")));
});

test("CONFIRMED_BELOW_THRESHOLD is a negative claim needing evidence", () => {
  const errors = validateCensus06Row(baseRow({ capacity_state: "CONFIRMED_BELOW_THRESHOLD" }));
  assert.ok(errors.some((e) => e.includes("is a negative claim and requires non-empty capacity_evidence")));
});

test("a capacity figure with no source is rejected", () => {
  const errors = validateCensus06Row(baseRow({ capacity_max: 5000, capacity_source_url: "https://v.example/c", capacity_confidence: "LOW" }));
  assert.ok(errors.some((e) => e.includes("claimed with no capacity_evidence")));
});

test("an official capacity authority with no evidence is rejected", () => {
  const errors = validateCensus06Row(baseRow({ capacity_source_kind: "OFFICIAL_GOVERNING_BODY" }));
  assert.ok(errors.some((e) => e.includes("claims official authority with no capacity_evidence")));
});

// ---------------------------------------------------------------------
// Absence of research is never evidence of absence
// ---------------------------------------------------------------------
test("a blocked row cannot claim no public calendar", () => {
  const errors = validateCensus06Row(
    baseRow({ capacity_state: "RESEARCH_BLOCKED", calendar_state: "NO_PUBLIC_CALENDAR_FOUND", calendar_evidence: evidence() }),
  );
  assert.ok(errors.some((e) => e.includes("absence of research is not evidence of absence")));
});

test("a blocked row cannot assert MISSING_FROM_CANON", () => {
  const errors = validateCensus06Row(baseRow({ capacity_state: "RESEARCH_BLOCKED", canonical_match_state: "MISSING_FROM_CANON" }));
  assert.ok(errors.some((e) => e.includes("identity was never established")));
});

// ---------------------------------------------------------------------
// applyUpdate — promotions must be earned
// ---------------------------------------------------------------------
test("a promotion to confirmed without evidence is refused and the row is unchanged", () => {
  const rejections = [];
  const row = baseRow();
  const next = applyUpdate(row, { update_for: "hv05-p-example-venue", resolved_state: "CONFIRMED_1000_PLUS", capacity_max: 5000 }, rejections);
  assert.equal(next.capacity_state, "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  assert.equal(rejections.length, 1);
  assert.ok(rejections[0].reason.includes("refused"));
});

test("a promotion to confirmed WITH evidence is applied", () => {
  const rejections = [];
  const next = applyUpdate(baseRow(), {
    update_for: "hv05-p-example-venue",
    resolved_state: "CONFIRMED_1000_PLUS",
    capacity_max: 5000,
    capacity_kind: "SPECTATOR",
    capacity_source_url: "https://course.example/facts",
    capacity_source_kind: "OFFICIAL_VENUE",
    capacity_confidence: "HIGH",
    capacity_evidence: [{ url: "https://course.example/facts", kind: "FETCHED_URL", note: "official page states 5,000" }],
  }, rejections);
  assert.deepEqual(rejections, []);
  assert.equal(next.capacity_state, "CONFIRMED_1000_PLUS");
  assert.equal(next.capacity_max, 5000);
  assert.equal(next.provenance, "PREDECESSOR_RESOLVED_BY_06");
});

test("a below-threshold claim without evidence is refused as an unsupported negative", () => {
  const rejections = [];
  const next = applyUpdate(baseRow(), { update_for: "hv05-p-example-venue", resolved_state: "CONFIRMED_BELOW_1000", capacity_max: 400 }, rejections);
  assert.notEqual(next.capacity_state, "CONFIRMED_BELOW_THRESHOLD");
  assert.ok(rejections[0].reason.includes("unsupported negative claim"));
});

test("a not-a-permanent-venue exclusion without evidence is refused", () => {
  const rejections = [];
  const next = applyUpdate(baseRow(), { update_for: "hv05-p-example-venue", resolved_state: "NOT_A_PERMANENT_VENUE" }, rejections);
  assert.notEqual(next.capacity_state, "NOT_A_PERMANENT_VENUE");
  assert.ok(rejections[0].reason.includes("no permanence_evidence"));
});

test("a still-unverified resolution is accepted as an honest outcome", () => {
  const rejections = [];
  const next = applyUpdate(baseRow(), { update_for: "hv05-p-example-venue", resolved_state: "CAPACITY_STILL_UNVERIFIED_HIGH_VALUE_CANDIDATE", notes: "operator publishes no capacity" }, rejections);
  assert.deepEqual(rejections, []);
  assert.equal(next.capacity_state, "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  assert.ok(next.notes.includes("operator publishes no capacity"));
});

// ---------------------------------------------------------------------
// Cross-tabs and segments
// ---------------------------------------------------------------------
test("every venue class maps to exactly one strategic segment", () => {
  for (const venueClass of VENUE_CLASSES) {
    assert.ok(segmentFor(venueClass) !== null, `${venueClass} maps to no segment`);
    assert.ok(STRATEGIC_SEGMENTS.includes(segmentFor(venueClass)));
  }
});

test("cross-tab A totals reconcile against the rows", () => {
  const rows = [confirmedRow({ canonical_match_state: "MISSING_FROM_CANON" }), baseRow({ research_id: "hv06-x", predecessor_research_id: "hv05-x" })];
  const { a_capacity_by_canonical_state: a } = buildCrossTabs(rows);
  const total = a.find((r) => r.canonical_state === "TOTAL");
  assert.equal(total.total, rows.length);
  assert.equal(total.confirmed_1000_plus, 1);
});

test("cross-tab B high-value totals reconcile against the rows", () => {
  const rows = [
    confirmedRow({ venue_class: "THEATRE" }),
    confirmedRow({ research_id: "hv06-s", predecessor_research_id: "hv05-s", venue_class: "FOOTBALL_GROUND", permanence_class: "PERMANENT_SPORTING_GROUND" }),
    confirmedRow({ research_id: "hv06-c", predecessor_research_id: "hv05-c", venue_class: "CONFERENCE_CENTRE" }),
  ];
  const { b_strategic_segment: b } = buildCrossTabs(rows);
  assert.equal(b.reduce((s, r) => s + r.total_high_value, 0), 3);
  assert.equal(b.find((r) => r.segment === "SPORT").confirmed_1000_plus, 1);
});

// ---------------------------------------------------------------------
// Coverage and the COMPLETE verdict
// ---------------------------------------------------------------------
test("a COMPLETE verdict is refused while a class is unresearched", () => {
  const { verdict, blocking } = assessCompleteness([
    { venue_class: "ARENA", final_coverage: "MATERIAL_COMPLETE" },
    { venue_class: "RACECOURSE", final_coverage: "PARTIAL" },
  ]);
  assert.equal(verdict, "PARTIAL");
  assert.equal(blocking.length, 1);
  assert.ok(blocking[0].includes("RACECOURSE"));
});

test("a COMPLETE verdict is allowed when every class is complete or materially complete", () => {
  const { verdict, blocking } = assessCompleteness([
    { venue_class: "ARENA", final_coverage: "COMPLETE" },
    { venue_class: "RACECOURSE", final_coverage: "MATERIAL_COMPLETE" },
  ]);
  assert.equal(verdict, "COMPLETE");
  assert.deepEqual(blocking, []);
});

test("a blocked class blocks the COMPLETE verdict", () => {
  const { verdict } = assessCompleteness([{ venue_class: "CONFERENCE_CENTRE", final_coverage: "BLOCKED" }]);
  assert.equal(verdict, "PARTIAL");
});

test("a class with no researcher statement never inherits a complete coverage state", () => {
  const rows = [baseRow({ venue_class: "RACECOURSE", permanence_class: "PERMANENT_SPORTING_GROUND" })];
  const matrix = buildCoverageMatrix(rows, []);
  const racecourse = matrix.find((c) => c.venue_class === "RACECOURSE");
  assert.equal(racecourse.final_coverage, "PARTIAL");
  assert.ok(racecourse.package_06_action.includes("no Package 06 research statement"));
});

// ---------------------------------------------------------------------
// Quality invariants
// ---------------------------------------------------------------------
test("quality invariants detect a non-permanent row counted as confirmed", () => {
  // Constructed directly to prove the invariant fires; the contract would
  // reject this row, which is the point of having both layers.
  const rows = [{ ...confirmedRow(), permanence_class: "PUBLIC_SPACE_NOT_A_VENUE" }];
  const invariants = computeQualityInvariants06(rows, { predecessorRows: [{ research_id: "hv05-p-example-venue" }] });
  assert.equal(invariants.non_permanent_counted_as_confirmed, 1);
});

test("quality invariants detect a third-party source labelled official", () => {
  const rows = [confirmedRow({
    capacity_source_url: "https://en.wikipedia.org/wiki/Example",
    capacity_source_kind: "OFFICIAL_VENUE",
    capacity_evidence: evidence("https://en.wikipedia.org/wiki/Example", "infobox capacity"),
  })];
  const invariants = computeQualityInvariants06(rows, { predecessorRows: [{ research_id: "hv05-p-example-venue" }] });
  assert.equal(invariants.third_party_labelled_official, 1);
});

test("quality invariants detect a predecessor row left without a disposition", () => {
  const invariants = computeQualityInvariants06([baseRow()], {
    predecessorRows: [{ research_id: "hv05-p-example-venue" }, { research_id: "hv05-p-orphan" }],
  });
  assert.equal(invariants.predecessor_rows_without_disposition, 1);
});

test("quality invariants report zero events acquired and zero canonical mutations", () => {
  const invariants = computeQualityInvariants06([], { predecessorRows: [] });
  assert.equal(invariants.events_acquired, 0);
  assert.equal(invariants.canonical_venues_mutated, 0);
  assert.equal(invariants.predecessor_artifacts_mutated, 0);
});

// ---------------------------------------------------------------------
// The published corpus
// ---------------------------------------------------------------------
test("the published Package 06 corpus validates", () => {
  const errors = validateCensus06Directory(REPO_ROOT);
  assert.deepEqual(errors, [], errors.slice(0, 10).join("\n"));
});

test("every promised artifact is published", () => {
  for (const name of REQUIRED_ARTIFACTS_06) {
    assert.ok(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, name), "utf8").length > 0, `${name} is empty`);
  }
});

test("every Package 05 row has exactly one disposition in the published corpus", () => {
  const predecessor = JSON.parse(readFileSync(join(REPO_ROOT, PREDECESSOR_CENSUS_DIR, "census.json"), "utf8")).venues;
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  assert.deepEqual(reconcileAgainstPredecessor(predecessor, rows), []);
});

test("the manifest names the predecessor package and SHA", () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.predecessor_package, PREDECESSOR_PACKAGE);
  assert.equal(manifest.predecessor_main_sha, PREDECESSOR_MAIN_SHA);
  for (const input of [...manifest.predecessor_artifacts_consumed, ...manifest.other_inputs]) {
    assert.equal(input.mutated, false, `${input.path} must be declared unmutated`);
  }
});

test("the published corpus contains no event records", () => {
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  for (const row of rows) {
    assert.equal(row.start_date, undefined);
    assert.equal(row.performer, undefined);
    assert.equal(row.event_id, undefined);
  }
});

test("the published corpus cites no canonical venue that does not exist", () => {
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  const ids = new Set(JSON.parse(readFileSync(join(REPO_ROOT, "venues/uk.json"), "utf8")).venues.map((v) => v.venue_id));
  for (const row of rows) {
    if (row.canonical_venue_id === null) continue;
    assert.ok(ids.has(row.canonical_venue_id), `${row.research_id} cites unknown ${row.canonical_venue_id}`);
  }
});

test("every confirmed row in the published corpus is a permanent venue with evidence", () => {
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  for (const row of rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS")) {
    assert.ok(PERMANENT_CLASSES.includes(row.permanence_class), `${row.research_id} is not permanent`);
    assert.ok(row.capacity_evidence.length > 0, `${row.research_id} has no capacity evidence`);
    assert.ok(row.capacity_max >= HIGH_VALUE_CAPACITY_THRESHOLD, `${row.research_id} is under threshold`);
  }
});

test("capacity-unverified rows are held outside the confirmed count", () => {
  const confirmed = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "confirmed-1000-plus.json"), "utf8"));
  const unverified = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "capacity-unverified-candidates.json"), "utf8"));
  const confirmedIds = new Set(confirmed.venues.map((v) => v.research_id));
  for (const row of unverified.venues) {
    assert.ok(!confirmedIds.has(row.research_id), `${row.research_id} appears in both populations`);
  }
});

test("non-permanent exclusions are not counted in the confirmed estate", () => {
  const confirmed = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "confirmed-1000-plus.json"), "utf8"));
  const excluded = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "non-permanent-exclusions.json"), "utf8"));
  const confirmedIds = new Set(confirmed.venues.map((v) => v.research_id));
  for (const row of excluded.venues) {
    assert.ok(!confirmedIds.has(row.research_id), `${row.research_id} is excluded yet counted`);
  }
});

test("canonical match states are mutually exclusive across the populations", () => {
  const existing = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "existing-canonical.json"), "utf8"));
  const missing = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "missing-from-canonical.json"), "utf8"));
  const existingIds = new Set(existing.venues.map((v) => v.research_id));
  for (const row of missing.venues) {
    assert.ok(!existingIds.has(row.research_id), `${row.research_id} is both in canon and missing`);
  }
  for (const row of existing.venues) assert.ok(IN_CANON_STATES.includes(row.canonical_match_state));
});

test("all headline totals derive from the rows", () => {
  const summary = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "summary.json"), "utf8"));
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  assert.equal(summary.headline.total_rows, rows.length);
  assert.equal(summary.headline.confirmed_1000_plus, rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length);
  const states = ["confirmed_1000_plus", "capacity_unverified_high_value_candidates", "confirmed_below_threshold", "not_a_permanent_venue", "identity_review", "research_blocked"];
  assert.equal(states.reduce((s, k) => s + summary.headline[k], 0), rows.length, "capacity states must sum to the corpus");
});

test("the coverage matrix contains every venue class present in the corpus", () => {
  const coverage = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "coverage-matrix.json"), "utf8"));
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  const covered = new Set(coverage.classes.map((c) => c.venue_class));
  for (const venueClass of new Set(rows.map((r) => r.venue_class))) {
    assert.ok(covered.has(venueClass), `coverage matrix missing ${venueClass}`);
  }
});

test("the predecessor arithmetic is explained with no unexplained remainder", () => {
  const rec = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "predecessor-reconciliation.json"), "utf8"));
  const a = rec.predecessor_arithmetic_explained;
  assert.equal(a.total_rows_911.confirmed_1000_plus + a.total_rows_911.capacity_unverified + a.total_rows_911.below_threshold_audit_rows, 911);
  assert.equal(a.sports_547_vs_displayed_534.stadium_class_omitted_from_by_type_list + a.sports_547_vs_displayed_534.below_threshold_sports_rows, 13);
  const c = a.high_value_906_canonical_states;
  assert.equal(c.existing_canonical + c.probable_existing_canonical + c.missing_from_canon + c.ambiguous_identity, 906);
  const d = a.confirmed_743_canonical_states;
  assert.equal(d.existing_canonical + d.probable_existing_canonical + d.missing_from_canon + d.ambiguous_identity, 743);
});

// ---------------------------------------------------------------------
// A planned capacity is not a capacity
// ---------------------------------------------------------------------
test("a confirmed capacity whose EVIDENCE describes a planned figure is rejected", () => {
  // A figure someone intended the venue to have is not evidence of what it
  // actually holds. Best-effort mechanical backstop, in the same spirit as
  // the plausibility-language check in the source-investigation contract.
  const errors = validateCensus06Row(
    confirmedRow({
      capacity_evidence: [{
        url: "https://venue.example/capacity",
        kind: "FETCHED_URL",
        note: "the developers plan for the venue to have a capacity for 20,000 people",
      }],
    }),
  );
  assert.ok(errors.some((e) => e.includes("prospective capacity")));
});

test("a current figure with a passing mention of a future extension is NOT caught", () => {
  // The guard targets the evidence note, not the free-text context, so a
  // valid current capacity is not demoted because its context happens to
  // mention a planned extension alongside it.
  assert.deepEqual(
    validateCensus06Row(
      confirmedRow({
        capacity_context: "CONCERT — article notes planned extension to 3,600 in 2026",
        capacity_evidence: [{
          url: "https://venue.example/capacity",
          kind: "FETCHED_URL",
          note: "prior governed census recorded capacity 3100 (CONCERT, authority GRADE_B)",
        }],
      }),
    ),
    [],
  );
});

test("a confirmed capacity resting on a RECORD ATTENDANCE is accepted", () => {
  // A record attendance is genuine evidence the venue held that many at
  // least once, which is a legitimate floor. A plan is not.
  assert.deepEqual(
    validateCensus06Row(
      confirmedRow({
        capacity_evidence: [{
          url: "https://venue.example/capacity",
          kind: "FETCHED_URL",
          note: "record attendance of 20,000 recorded in 1949",
        }],
      }),
    ),
    [],
  );
});

test("the prospective guard catches proposed and upon-completion phrasing too", () => {
  for (const note of ["proposed capacity of 20,000", "the stand will seat 20,000 upon completion", "due to have 20,000"]) {
    const errors = validateCensus06Row(
      confirmedRow({ capacity_evidence: [{ url: "https://venue.example/capacity", kind: "FETCHED_URL", note }] }),
    );
    assert.ok(errors.some((e) => e.includes("prospective capacity")), `not caught: ${note}`);
  }
});

// ---------------------------------------------------------------------
// Intra-corpus duplicates are surfaced, never silently merged
// ---------------------------------------------------------------------
test("a venue recorded twice under a leading article is detected", () => {
  const groups = findCorpusDuplicates([
    confirmedRow({ research_id: "hv06-a", predecessor_research_id: "hv05-a", name: "Anglesey Showground", locality: "Gwalchmai, Anglesey" }),
    confirmedRow({ research_id: "hv06-b", predecessor_research_id: "hv05-b", name: "The Anglesey Showground", locality: "Gwalchmai" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].confirmed_members, 2);
  assert.ok(groups[0].note.includes("merges nothing"));
});

test("two distinct venues sharing a name core are NOT reported as duplicates", () => {
  // Barbican Hall and Barbican Theatre are different venues in one complex.
  const groups = findCorpusDuplicates([
    confirmedRow({ research_id: "hv06-a", predecessor_research_id: "hv05-a", name: "Barbican Hall", locality: "London" }),
    confirmedRow({ research_id: "hv06-b", predecessor_research_id: "hv05-b", name: "Barbican Theatre", locality: "London" }),
  ]);
  assert.deepEqual(groups, []);
});

test("duplicate detection tolerates locality recorded at different precision", () => {
  const groups = findCorpusDuplicates([
    confirmedRow({ research_id: "hv06-a", predecessor_research_id: "hv05-a", name: "Example Showground", locality: "Gwalchmai, Anglesey" }),
    confirmedRow({ research_id: "hv06-b", predecessor_research_id: "hv05-b", name: "Example Showground", locality: "Gwalchmai" }),
  ]);
  assert.equal(groups.length, 1);
});

test("the published corpus reports a distinct-venue count alongside the raw count", () => {
  const summary = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "summary.json"), "utf8"));
  const identity = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "identity-review.json"), "utf8"));
  const overCount = identity.corpus_duplicates.groups.reduce(
    (s, g) => s + Math.max(0, g.confirmed_members - 1),
    0,
  );
  assert.equal(
    summary.headline.confirmed_1000_plus_distinct,
    summary.headline.confirmed_1000_plus - overCount,
    "the distinct count must subtract exactly the duplicate over-count",
  );
  assert.ok(summary.headline.confirmed_1000_plus_distinct <= summary.headline.confirmed_1000_plus);
});

// ---------------------------------------------------------------------
// A later update is a correction and must win
// ---------------------------------------------------------------------
test("a researcher revisiting a row supersedes the earlier verdict", () => {
  // Keeping the FIRST update would silently discard a review correction and
  // preserve the flawed classification — the opposite of what review is for.
  const carried = baseRow({
    predecessor_research_id: "hv05-p-site",
    capacity_state: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    permanence_class: null,
  });
  const rejections = [];

  const first = applyUpdate(carried, {
    update_for: "hv05-p-site",
    permanence_class: "OPEN_AIR_SITE_WITH_STABLE_VENUE_IDENTITY",
    permanence_evidence: [{ url: "https://e.example/a", kind: "FETCHED_URL", note: "initial read" }],
  }, rejections);
  assert.equal(first.permanence_class, "OPEN_AIR_SITE_WITH_STABLE_VENUE_IDENTITY");

  // The correction is applied to the ORIGINAL carried row, so it replaces
  // the earlier verdict rather than layering on top of it.
  const corrected = applyUpdate(carried, {
    update_for: "hv05-p-site",
    permanence_class: "AMBIGUOUS",
    permanence_evidence: [{ url: "https://e.example/b", kind: "FETCHED_URL", note: "on review, too few editions to call established" }],
  }, rejections);
  assert.equal(corrected.permanence_class, "AMBIGUOUS");
  assert.equal(corrected.permanence_evidence.length, 1);
  assert.equal(corrected.permanence_evidence[0].note, "on review, too few editions to call established");
});

test("a row whose permanence is downgraded to AMBIGUOUS leaves the confirmed estate", () => {
  const adjustments = [];
  const confirmed = confirmedRow({ permanence_class: "AMBIGUOUS" });
  // The contract rejects it outright...
  assert.ok(
    validateCensus06Row(confirmed).some((e) => e.includes("the estate is of permanent venues")),
  );
  // ...and the published corpus must therefore never contain one.
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "census.json"), "utf8")).venues;
  for (const row of rows.filter((r) => r.permanence_class === "AMBIGUOUS")) {
    assert.notEqual(row.capacity_state, "CONFIRMED_1000_PLUS", `${row.research_id} is AMBIGUOUS yet confirmed`);
  }
  void adjustments;
});

test("superseded updates are recorded, not silently dropped", () => {
  const rec = JSON.parse(
    readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "predecessor-reconciliation.json"), "utf8"),
  );
  assert.ok(Array.isArray(rec.updates_superseded_by_a_later_correction));
  for (const entry of rec.updates_superseded_by_a_later_correction) {
    assert.ok(entry.update_for, "a superseded update must name the row it applied to");
    assert.ok(entry.reason.includes("later wins"));
  }
});

// ---------------------------------------------------------------------
// Self-referential coverage cannot evidence completeness
// ---------------------------------------------------------------------
test("a coverage claim citing only our own estate names no external source", () => {
  assert.equal(namesAnExternalSource("EXISTING-ESTATE.txt inspection only"), false);
  assert.equal(namesAnExternalSource("held estate inspection only"), false);
  assert.equal(namesAnExternalSource("already-covered.md review"), false);
});

test("a real source is recognised even when it also names the estate as a diff target", () => {
  // The false-negative direction matters just as much: discarding this
  // would push an honestly-researched class back to PARTIAL.
  assert.equal(
    namesAnExternalSource(
      "Wikipedia (2026-27 season league/club articles, cross-referenced against held estate by exact and sponsor-name-aware ground-name matching)",
    ),
    true,
  );
  assert.equal(namesAnExternalSource("The Jockey Club"), true);
  assert.equal(namesAnExternalSource("Academic Venue Solutions"), true);
  assert.equal(namesAnExternalSource("British Speedway governing body"), true);
});

test("a class cannot be upgraded by a self-referential coverage statement", () => {
  const rows = [baseRow({ venue_class: "STADIUM", permanence_class: "PERMANENT_SPORTING_GROUND" })];
  const matrix = buildCoverageMatrix(rows, [
    {
      venue_class: "STADIUM",
      final_coverage: "MATERIAL_COMPLETE",
      source_families_checked: ["EXISTING-ESTATE.txt inspection only"],
      residual_gap: "none within scope",
      researcher: "b",
    },
  ]);
  const stadium = matrix.find((c) => c.venue_class === "STADIUM");
  assert.notEqual(stadium.final_coverage, "MATERIAL_COMPLETE");
  assert.equal(stadium.researcher_statements[0].counted_towards_coverage, false);
  assert.ok(stadium.researcher_statements[0].disregarded_reason.includes("self-referential"));
});

test("a class IS upgraded by a statement naming a genuine external estate", () => {
  const rows = [baseRow({ venue_class: "RACECOURSE", permanence_class: "PERMANENT_SPORTING_GROUND" })];
  const matrix = buildCoverageMatrix(rows, [
    {
      venue_class: "RACECOURSE",
      final_coverage: "MATERIAL_COMPLETE",
      source_families_checked: ["The Jockey Club", "Arena Racing Company"],
      residual_gap: "two operator sites unreachable this session",
      researcher: "b",
    },
  ]);
  const racecourse = matrix.find((c) => c.venue_class === "RACECOURSE");
  assert.equal(racecourse.final_coverage, "MATERIAL_COMPLETE");
  assert.equal(racecourse.researcher_statements[0].counted_towards_coverage, true);
});

test("the published coverage matrix records every disregarded statement", () => {
  const coverage = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_06_DIR, "coverage-matrix.json"), "utf8"));
  for (const entry of coverage.classes) {
    for (const statement of entry.researcher_statements) {
      assert.equal(typeof statement.counted_towards_coverage, "boolean");
      if (!statement.counted_towards_coverage) {
        assert.ok(statement.disregarded_reason, `${entry.venue_class} disregard must state a reason`);
      }
    }
  }
});
