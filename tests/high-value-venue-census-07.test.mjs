import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIGH_VALUE_CAPACITY_THRESHOLD,
  IN_CANON_STATES,
  ORIGINAL_CENSUS_DIR,
  PERMANENT_CLASSES,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_MAIN_SHA,
  PREDECESSOR_PACKAGE,
  PREDECESSOR_STADIUM_ROWS,
  PREVIOUSLY_UNCOVERED_STADIUM_ROWS,
  REQUIRED_SOURCE_FAMILY_SWEEPS,
  assessFinalCompleteness,
  projectToPredecessorShape,
  reconcileAgainstPredecessor,
  validateCensus07,
  validateCensus07Row,
  validateStadiumAudit,
} from "../ingestion/high-value-venue-census-07/contract.mjs";
import { validateCensus06Row } from "../ingestion/high-value-venue-census-06/contract.mjs";
import {
  applyRowDisposition,
  buildCoverageMatrix07,
  buildStadiumAudit,
  computeQualityInvariants07,
  namesAnExternalSource,
} from "../ingestion/high-value-venue-census-07/build.mjs";
import {
  CENSUS_07_DIR,
  REQUIRED_ARTIFACTS_07,
  validateCensus07Directory,
} from "../ingestion/high-value-venue-census-07/validate.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function evidence(url = "https://example.org/", note = "what this showed") {
  return [{ url, kind: "FETCHED_URL", note }];
}

function baseRow(overrides = {}) {
  return {
    research_id: "hv07-p-example-venue",
    predecessor_research_id: "hv06-p-example-venue",
    canonical_venue_id: null,
    canonical_match_state: "UNASSESSED",
    name: "Example Venue",
    aliases: [],
    venue_class: "STADIUM",
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
    permanence_class: "PERMANENT_SPORTING_GROUND",
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
    discovered_by_source_family: null,
    notes: "carried",
    ...overrides,
  };
}

function confirmedRow(overrides = {}) {
  return baseRow({
    capacity_max: 9850,
    capacity_kind: "SPECTATOR",
    capacity_source_url: "https://venue.example/capacity",
    capacity_source_kind: "OFFICIAL_VENUE",
    capacity_confidence: "MEDIUM",
    capacity_state: "CONFIRMED_1000_PLUS",
    capacity_evidence: evidence("https://venue.example/capacity", "states capacity 9,850"),
    ...overrides,
  });
}

// ---------------------------------------------------------------------
// Contract basics and the delegation to Package 06
// ---------------------------------------------------------------------
test("a well-formed carried row validates", () => {
  assert.deepEqual(validateCensus07Row(baseRow()), []);
});

test("Package 07 row rules DELEGATE to Package 06's validator", () => {
  // This is the design guarantee: the shared honesty rules exist in exactly
  // one place, so the two packages cannot drift. If this ever fails, the
  // rules have been forked and a Package 07 row could be accepted that
  // Package 06 would reject.
  const row = baseRow();
  const projected = projectToPredecessorShape(row);
  assert.deepEqual(validateCensus06Row(projected), []);
  assert.equal(projected.research_id, "hv06-p-example-venue");
  assert.equal(projected.predecessor_research_id, "hv05-p-example-venue");
  assert.equal(projected.discovered_by_source_family, undefined);
});

test("the planned-capacity rule is inherited from Package 06, not re-typed", () => {
  const errors = validateCensus07Row(
    confirmedRow({
      capacity_evidence: [{
        url: "https://venue.example/capacity",
        kind: "FETCHED_URL",
        note: "the developers plan for the venue to have a capacity for 20,000",
      }],
    }),
  );
  assert.ok(errors.some((e) => e.includes("prospective capacity")));
});

test("the permanence rule is inherited from Package 06, not re-typed", () => {
  const errors = validateCensus07Row(confirmedRow({ permanence_class: "PUBLIC_SPACE_NOT_A_VENUE" }));
  assert.ok(errors.some((e) => e.includes("permanent venues")));
});

test("the capacity-evidence rule is inherited from Package 06", () => {
  assert.ok(
    validateCensus07Row(confirmedRow({ capacity_evidence: [] }))
      .some((e) => e.includes("requires non-empty capacity_evidence")),
  );
});

// ---------------------------------------------------------------------
// Package 07's own rules
// ---------------------------------------------------------------------
test("a Package 07 id namespace is required", () => {
  assert.ok(validateCensus07Row(baseRow({ research_id: "hv06-p-x" })).some((e) => e.includes("must match")));
});

test("a new venue must name the sweep that discovered it", () => {
  const errors = validateCensus07Row(
    baseRow({ provenance: "NEW_IN_PACKAGE_07", predecessor_research_id: null, discovered_by_source_family: null }),
  );
  assert.ok(errors.some((e) => e.includes("requires discovered_by_source_family")));
});

test("a new venue naming its sweep validates", () => {
  assert.deepEqual(
    validateCensus07Row(baseRow({
      research_id: "hv07-n-new-ground",
      provenance: "NEW_IN_PACKAGE_07",
      predecessor_research_id: null,
      discovered_by_source_family: "RFL League 1 club list",
    })),
    [],
  );
});

test("a new venue cannot claim a predecessor", () => {
  const errors = validateCensus07Row(baseRow({
    provenance: "NEW_IN_PACKAGE_07",
    discovered_by_source_family: "RFL League 1",
  }));
  assert.ok(errors.some((e) => e.includes("cannot carry a predecessor_research_id")));
});

test("a carried row must claim a predecessor", () => {
  const errors = validateCensus07Row(baseRow({ predecessor_research_id: null }));
  assert.ok(errors.some((e) => e.includes("requires a predecessor_research_id")));
});

test("a predecessor row claimed by two successors is rejected", () => {
  const errors = validateCensus07([baseRow({ research_id: "hv07-a" }), baseRow({ research_id: "hv07-b" })]);
  assert.ok(errors.some((e) => e.includes("is claimed by more than one Package 07 row")));
});

test("a predecessor row with no disposition is reported", () => {
  const errors = reconcileAgainstPredecessor(
    [{ research_id: "hv06-p-one" }, { research_id: "hv06-p-two" }],
    [baseRow({ predecessor_research_id: "hv06-p-one" })],
  );
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("hv06-p-two"));
});

// ---------------------------------------------------------------------
// The stadium audit — the point of the package
// ---------------------------------------------------------------------
test("the stadium audit must account for all 8 predecessor rows", () => {
  const partial = PREDECESSOR_STADIUM_ROWS.slice(0, 5).map((id) => ({
    predecessor_research_id: id, source_family: "x", covered: true, evidence: [{ url: "https://e.example/" }],
  }));
  const errors = validateStadiumAudit(partial);
  assert.equal(errors.length, 3);
  for (const error of errors) assert.ok(error.includes("is missing Package 06 STADIUM row"));
});

test("a stadium audit entry claiming coverage with no evidence is rejected", () => {
  const audit = PREDECESSOR_STADIUM_ROWS.map((id) => ({
    predecessor_research_id: id, source_family: "x", covered: true, evidence: [],
  }));
  assert.ok(validateStadiumAudit(audit).some((e) => e.includes("claims coverage with empty evidence")));
});

test("a stadium audit entry with no named source family is rejected", () => {
  const audit = PREDECESSOR_STADIUM_ROWS.map((id) => ({
    predecessor_research_id: id, covered: false,
  }));
  assert.ok(validateStadiumAudit(audit).some((e) => e.includes("does not name the source family")));
});

test("the audit covers exactly the predecessor stadium rows, no extras", () => {
  const audit = [
    ...PREDECESSOR_STADIUM_ROWS.map((id) => ({ predecessor_research_id: id, source_family: "x", covered: false })),
    { predecessor_research_id: "hv06-p-not-a-stadium", source_family: "x", covered: true, evidence: [{ url: "https://e.example/" }] },
  ];
  assert.ok(validateStadiumAudit(audit).some((e) => e.includes("is not a Package 06 STADIUM row")));
});

test("buildStadiumAudit marks the five predecessor-covered rows covered without a new sweep", () => {
  const audit = buildStadiumAudit([], []);
  assert.equal(audit.length, 8);
  assert.equal(audit.filter((e) => e.covered_by_predecessor).length, 5);
  assert.equal(audit.filter((e) => e.covered).length, 5);
  // The three this package exists for are NOT covered until a sweep says so.
  for (const id of PREVIOUSLY_UNCOVERED_STADIUM_ROWS) {
    assert.equal(audit.find((e) => e.predecessor_research_id === id).covered, false);
  }
});

test("a disposition covering a previously uncovered row marks it covered", () => {
  const audit = buildStadiumAudit([], [{
    target_row: "hv06-p-wales-wrexham-queensway-stadium",
    source_family_checked: "Welsh Athletics venue list",
    covered_now: true,
    evidence: [{ url: "https://welshathletics.example/venues", kind: "FETCHED_URL", note: "lists the stadium" }],
  }]);
  const entry = audit.find((e) => e.predecessor_research_id === "hv06-p-wales-wrexham-queensway-stadium");
  assert.equal(entry.covered, true);
  assert.equal(entry.covered_by_package_07_sweep, true);
  assert.equal(entry.evidence.length, 1);
});

// ---------------------------------------------------------------------
// The COMPLETE gate
// ---------------------------------------------------------------------
const fullyCoveredAudit = () =>
  PREDECESSOR_STADIUM_ROWS.map((id) => ({ predecessor_research_id: id, covered: true }));
const allSweeps = () => REQUIRED_SOURCE_FAMILY_SWEEPS.map((s) => s.id);

test("COMPLETE requires every class complete", () => {
  const { verdict, blocking } = assessFinalCompleteness({
    coverageMatrix: [{ venue_class: "STADIUM", final_coverage: "PARTIAL" }],
    sweepsRun: allSweeps(),
    stadiumAudit: fullyCoveredAudit(),
  });
  assert.equal(verdict, "PARTIAL");
  assert.ok(blocking[0].includes("STADIUM"));
});

test("COMPLETE requires BOTH source-family sweeps to have run", () => {
  const { verdict, blocking } = assessFinalCompleteness({
    coverageMatrix: [{ venue_class: "STADIUM", final_coverage: "MATERIAL_COMPLETE" }],
    sweepsRun: ["RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1"],
    stadiumAudit: fullyCoveredAudit(),
  });
  assert.equal(verdict, "PARTIAL");
  assert.ok(blocking.some((b) => b.includes("NATIONAL_ATHLETICS")));
});

test("COMPLETE requires all 8 stadium rows covered", () => {
  const audit = fullyCoveredAudit();
  audit[0].covered = false;
  const { verdict, blocking } = assessFinalCompleteness({
    coverageMatrix: [{ venue_class: "STADIUM", final_coverage: "MATERIAL_COMPLETE" }],
    sweepsRun: allSweeps(),
    stadiumAudit: audit,
  });
  assert.equal(verdict, "PARTIAL");
  assert.ok(blocking.some((b) => b.includes("still not covered")));
});

test("COMPLETE is reachable when all three conditions hold", () => {
  const { verdict, blocking } = assessFinalCompleteness({
    coverageMatrix: [{ venue_class: "STADIUM", final_coverage: "MATERIAL_COMPLETE" }],
    sweepsRun: allSweeps(),
    stadiumAudit: fullyCoveredAudit(),
  });
  assert.equal(verdict, "COMPLETE");
  assert.deepEqual(blocking, []);
});

// ---------------------------------------------------------------------
// Coverage: self-referential claims still cannot raise a state
// ---------------------------------------------------------------------
test("a self-referential coverage claim cannot raise a class state", () => {
  const matrix = buildCoverageMatrix07(
    [baseRow({ venue_class: "STADIUM" })],
    [{ venue_class: "STADIUM", final_coverage: "MATERIAL_COMPLETE", source_families_checked: ["EXISTING-ESTATE.txt inspection only"], researcher: "a" }],
    { classes: [{ venue_class: "STADIUM", final_coverage: "PARTIAL" }] },
  );
  const stadium = matrix.find((c) => c.venue_class === "STADIUM");
  assert.equal(stadium.final_coverage, "PARTIAL");
  assert.equal(stadium.researcher_statements[0].counted_towards_coverage, false);
});

test("an external coverage claim DOES raise a class state", () => {
  const matrix = buildCoverageMatrix07(
    [baseRow({ venue_class: "STADIUM" })],
    [{ venue_class: "STADIUM", final_coverage: "MATERIAL_COMPLETE", source_families_checked: ["RFL Championship club list"], researcher: "a" }],
    { classes: [{ venue_class: "STADIUM", final_coverage: "PARTIAL" }] },
  );
  assert.equal(matrix.find((c) => c.venue_class === "STADIUM").final_coverage, "MATERIAL_COMPLETE");
});

test("a class Package 07 did not touch keeps Package 06's coverage exactly", () => {
  // This package re-researched only STADIUM. Claiming anything else improved
  // would be false.
  const matrix = buildCoverageMatrix07(
    [baseRow({ venue_class: "THEATRE", permanence_class: "PERMANENT_PURPOSE_BUILT_VENUE" })],
    [],
    { classes: [{ venue_class: "THEATRE", final_coverage: "COMPLETE", residual_gap: "none" }] },
  );
  const theatre = matrix.find((c) => c.venue_class === "THEATRE");
  assert.equal(theatre.final_coverage, "COMPLETE");
  assert.ok(theatre.package_07_action.includes("not re-researched by Package 07"));
});

test("a coverage claim can never LOWER a Package 06 state", () => {
  const matrix = buildCoverageMatrix07(
    [baseRow({ venue_class: "THEATRE", permanence_class: "PERMANENT_PURPOSE_BUILT_VENUE" })],
    [{ venue_class: "THEATRE", final_coverage: "PARTIAL", source_families_checked: ["some external list"], researcher: "a" }],
    { classes: [{ venue_class: "THEATRE", final_coverage: "COMPLETE" }] },
  );
  assert.equal(matrix.find((c) => c.venue_class === "THEATRE").final_coverage, "COMPLETE");
});

test("external-source detection is precise in both directions", () => {
  assert.equal(namesAnExternalSource("EXISTING-ESTATE.txt inspection only"), false);
  assert.equal(namesAnExternalSource("RFL Championship 2026 club list"), true);
  assert.equal(
    namesAnExternalSource("Wikipedia league articles, cross-referenced against held estate"),
    true,
  );
});

// ---------------------------------------------------------------------
// Dispositions may only weaken a claim
// ---------------------------------------------------------------------
test("a downgrade disposition withdraws an unsupportable held capacity", () => {
  const adjustments = [];
  const next = applyRowDisposition(confirmedRow(), {
    target_row: "hv06-p-example-venue",
    capacity_finding: "SHOULD_BE_DOWNGRADED",
    evidence: [{ url: "https://league.example/", kind: "FETCHED_URL", note: "ground no longer in senior use" }],
  }, adjustments);
  assert.equal(next.capacity_state, "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  assert.equal(next.capacity_max, 0);
  assert.equal(adjustments.length, 1);
});

test("a downgrade with no evidence is refused and the row is unchanged", () => {
  const adjustments = [];
  const next = applyRowDisposition(confirmedRow(), {
    target_row: "hv06-p-example-venue", capacity_finding: "SHOULD_BE_DOWNGRADED",
  }, adjustments);
  assert.equal(next.capacity_state, "CONFIRMED_1000_PLUS");
  assert.ok(adjustments[0].reason.includes("carries no evidence"));
});

test("a disposition cannot promote a row", () => {
  // Package 07 closes a coverage gap; it is not a route to last-minute
  // promotions on thin evidence. No disposition field can raise a state.
  const adjustments = [];
  const next = applyRowDisposition(baseRow(), {
    target_row: "hv06-p-example-venue",
    capacity_finding: "CONFIRMED",
    capacity_max: 50000,
    evidence: [{ url: "https://e.example/", kind: "FETCHED_URL", note: "claims 50,000" }],
  }, adjustments);
  assert.equal(next.capacity_state, "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  assert.equal(next.capacity_max, 0);
});

// ---------------------------------------------------------------------
// Quality invariants
// ---------------------------------------------------------------------
test("quality invariants count uncovered stadium rows and unrun sweeps", () => {
  const invariants = computeQualityInvariants07([baseRow()], {
    predecessorRows: [{ research_id: "hv06-p-example-venue" }],
    stadiumAudit: buildStadiumAudit([], []),
    sweepsRun: [],
  });
  assert.equal(invariants.unresearched_known_stadium_rows, 3);
  assert.equal(invariants.required_source_family_sweeps_not_run, 2);
});

test("quality invariants report zero events and zero predecessor mutations", () => {
  const invariants = computeQualityInvariants07([], {
    predecessorRows: [], stadiumAudit: [], sweepsRun: [],
  });
  assert.equal(invariants.events_acquired, 0);
  assert.equal(invariants.canonical_venues_mutated, 0);
  assert.equal(invariants.package_05_mutations, 0);
  assert.equal(invariants.package_06_mutations, 0);
});

// ---------------------------------------------------------------------
// The published corpus
// ---------------------------------------------------------------------
test("the published Package 07 corpus validates", () => {
  const errors = validateCensus07Directory(REPO_ROOT);
  assert.deepEqual(errors, [], errors.slice(0, 10).join("\n"));
});

test("every promised artifact is published", () => {
  for (const name of REQUIRED_ARTIFACTS_07) {
    assert.ok(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, name), "utf8").length > 0, `${name} is empty`);
  }
});

test("every Package 06 row has exactly one disposition in the published corpus", () => {
  const predecessor = JSON.parse(readFileSync(join(REPO_ROOT, PREDECESSOR_CENSUS_DIR, "census.json"), "utf8")).venues;
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "census.json"), "utf8")).venues;
  assert.deepEqual(reconcileAgainstPredecessor(predecessor, rows), []);
});

test("all 8 Package 06 STADIUM rows appear in the published audit", () => {
  const audit = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "stadium-source-estate-audit.json"), "utf8"));
  assert.deepEqual(validateStadiumAudit(audit.audit), []);
  const ids = new Set(audit.audit.map((e) => e.predecessor_research_id));
  for (const id of PREDECESSOR_STADIUM_ROWS) assert.ok(ids.has(id), `${id} missing from the audit`);
});

test("both required source-family sweeps have a published artifact", () => {
  const rl = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "rugby-league-source-estate.json"), "utf8"));
  const ath = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "athletics-source-estate.json"), "utf8"));
  assert.equal(rl.sweep_id, "RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1");
  assert.equal(ath.sweep_id, "NATIONAL_ATHLETICS");
});

test("the manifest names the predecessor package and SHA and declares nothing mutated", () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.predecessor_package, PREDECESSOR_PACKAGE);
  assert.equal(manifest.predecessor_main_sha, PREDECESSOR_MAIN_SHA);
  for (const input of [...manifest.predecessor_artifacts_consumed, ...manifest.other_inputs]) {
    assert.equal(input.mutated, false, `${input.path} must be declared unmutated`);
  }
});

test("Packages 05 and 06 are still present and readable — preserved, not replaced", () => {
  for (const dir of [ORIGINAL_CENSUS_DIR, PREDECESSOR_CENSUS_DIR]) {
    const census = JSON.parse(readFileSync(join(REPO_ROOT, dir, "census.json"), "utf8"));
    assert.ok(census.venues.length > 0, `${dir} must still hold its rows`);
  }
});

test("the published corpus contains no event records", () => {
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "census.json"), "utf8")).venues;
  for (const row of rows) {
    assert.equal(row.start_date, undefined);
    assert.equal(row.performer, undefined);
    assert.equal(row.event_id, undefined);
  }
});

test("every confirmed row is a permanent venue with cited capacity evidence", () => {
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "census.json"), "utf8")).venues;
  for (const row of rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS")) {
    assert.ok(PERMANENT_CLASSES.includes(row.permanence_class), `${row.research_id} is not permanent`);
    assert.ok(row.capacity_evidence.length > 0, `${row.research_id} has no capacity evidence`);
    assert.ok(row.capacity_max >= HIGH_VALUE_CAPACITY_THRESHOLD, `${row.research_id} is under threshold`);
  }
});

test("the confirmed cohort splits exactly into in-canon, missing and review", () => {
  const summary = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "summary.json"), "utf8"));
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "census.json"), "utf8")).venues;
  const confirmed = rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  const cc = summary.canonical_coverage;
  assert.equal(
    cc.confirmed_already_in_canon + cc.confirmed_missing_from_canon + cc.confirmed_identity_review,
    confirmed.length,
    "the confirmed split must account for every confirmed row",
  );
  assert.equal(
    cc.confirmed_already_in_canon,
    confirmed.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
  );
});

test("all capacity states sum to the corpus", () => {
  const summary = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "summary.json"), "utf8"));
  const rows = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "census.json"), "utf8")).venues;
  const h = summary.headline;
  assert.equal(
    h.confirmed_1000_plus + h.capacity_unverified_high_value_candidates + h.confirmed_below_threshold +
      h.not_a_permanent_venue + h.identity_review + h.research_blocked,
    rows.length,
  );
});

test("COMPLETE cannot be published while a stadium row is unresearched", () => {
  // The guard is in the validator; this proves it actually fires rather than
  // trusting that it would.
  const coverage = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "coverage-matrix.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "summary.json"), "utf8"));
  if (coverage.completeness_assessment.verdict === "COMPLETE") {
    assert.equal(summary.quality_invariants.unresearched_known_stadium_rows, 0);
    assert.equal(summary.quality_invariants.required_source_family_sweeps_not_run, 0);
    const audit = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "stadium-source-estate-audit.json"), "utf8"));
    assert.equal(audit.still_uncovered.length, 0);
  } else {
    // PARTIAL is only legitimate if something genuinely blocks it.
    assert.ok(coverage.completeness_assessment.blocking.length > 0);
  }
});

test("the identity gate is carried forward for the next package, not resolved here", () => {
  const identity = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_07_DIR, "identity-review.json"), "utf8"));
  assert.ok(/next package/i.test(identity.description));
  assert.ok(Object.prototype.hasOwnProperty.call(identity, "known_intra_corpus_duplicate"));
});
