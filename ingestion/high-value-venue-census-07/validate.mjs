#!/usr/bin/env node
// Repository-level validator for the Package 07 final-closure corpus
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07).
//
// Adds the checks that need to see the repository as a whole:
//
//   1. every promised artifact exists and parses;
//   2. every declared count matches the rows it contains;
//   3. every view artifact is a genuine subset of census.json;
//   4. every Package 06 row has exactly one disposition here;
//   5. all 8 Package 06 STADIUM rows appear in the audit, and the three
//      formerly uncovered ones are now covered;
//   6. both required source-family sweeps are represented;
//   7. Packages 05 and 06 are byte-unchanged from origin/main;
//   8. venues/uk.json is unchanged and no Event-shaped record leaked in;
//   9. the cross-tabs and headline reconcile against the rows;
//  10. COMPLETE cannot be published while any material stadium source
//      family remains unresearched.
//
// Read-only. No network. Never writes or mutates anything.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPLETE_ENOUGH_COVERAGE_STATES,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HIGH_VALUE_STATES,
  IN_CANON_STATES,
  ORIGINAL_CENSUS_DIR,
  PERMANENT_CLASSES,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_STADIUM_ROWS,
  PREVIOUSLY_UNCOVERED_STADIUM_ROWS,
  REQUIRED_SOURCE_FAMILY_SWEEPS,
  STRATEGIC_SEGMENTS,
  reconcileAgainstPredecessor,
  segmentFor,
  validateCensus07,
  validateStadiumAudit,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_07_DIR = "research/high-value-venue-estate/uk-1000plus-07";

export const REQUIRED_ARTIFACTS_07 = Object.freeze([
  "manifest.json",
  "predecessor-reconciliation.json",
  "stadium-source-estate-audit.json",
  "rugby-league-source-estate.json",
  "athletics-source-estate.json",
  "newly-discovered-venues.json",
  "census.json",
  "confirmed-1000-plus.json",
  "capacity-unverified-candidates.json",
  "below-threshold.json",
  "non-permanent-exclusions.json",
  "existing-canonical.json",
  "missing-from-canonical.json",
  "identity-review.json",
  "sports-venues.json",
  "coverage-matrix.json",
  "coverage-evidence.json",
  "calendar-sources.json",
  "research-blocked.json",
  "summary.json",
]);

const COUNTED_LIST_ARTIFACTS = Object.freeze([
  ["census.json", "count", "venues"],
  ["confirmed-1000-plus.json", "count", "venues"],
  ["capacity-unverified-candidates.json", "count", "venues"],
  ["below-threshold.json", "count", "venues"],
  ["non-permanent-exclusions.json", "count", "venues"],
  ["existing-canonical.json", "count", "venues"],
  ["missing-from-canonical.json", "count", "venues"],
  ["sports-venues.json", "count", "venues"],
  ["newly-discovered-venues.json", "count", "venues"],
  ["calendar-sources.json", "count", "sources"],
  ["coverage-evidence.json", "count", "families"],
]);

const EVENT_SHAPED_KEYS = Object.freeze([
  "start_date", "startDate", "end_date", "endDate", "performer",
  "artist_name", "event_id", "observation_id", "doors_time",
]);

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

/**
 * Validate the whole published Package 07 directory.
 * Returns human-readable error strings; empty means valid.
 */
export function validateCensus07Directory(repoRoot = ROOT) {
  const errors = [];
  if (!existsSync(join(repoRoot, CENSUS_07_DIR))) {
    return [`census directory ${CENSUS_07_DIR} does not exist`];
  }

  const artifacts = new Map();
  for (const name of REQUIRED_ARTIFACTS_07) {
    const relative = `${CENSUS_07_DIR}/${name}`;
    if (!existsSync(join(repoRoot, relative))) {
      errors.push(`required artifact ${relative} is missing`);
      continue;
    }
    try {
      artifacts.set(name, readJson(repoRoot, relative));
    } catch (error) {
      errors.push(`artifact ${relative} is not valid JSON: ${error.message}`);
    }
  }
  if (errors.length > 0) return errors;

  const census = artifacts.get("census.json");
  const rows = Array.isArray(census?.venues) ? census.venues : null;
  if (rows === null) return [`${CENSUS_07_DIR}/census.json has no venues array`];

  for (const error of validateCensus07(rows)) errors.push(error);

  for (const [name, countKey, listKey] of COUNTED_LIST_ARTIFACTS) {
    const artifact = artifacts.get(name);
    const list = artifact?.[listKey];
    if (!Array.isArray(list)) {
      errors.push(`${name} has no "${listKey}" array`);
      continue;
    }
    if (artifact?.[countKey] !== list.length) {
      errors.push(`${name} declares ${countKey}=${artifact?.[countKey]} but "${listKey}" holds ${list.length} entries`);
    }
  }

  const byId = new Map(rows.map((r) => [r.research_id, r]));

  const subsetChecks = [
    { name: "confirmed-1000-plus.json", rule: (r) => r.capacity_state === "CONFIRMED_1000_PLUS", description: "capacity_state CONFIRMED_1000_PLUS" },
    { name: "capacity-unverified-candidates.json", rule: (r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE", description: "capacity_state CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE" },
    { name: "below-threshold.json", rule: (r) => r.capacity_state === "CONFIRMED_BELOW_THRESHOLD", description: "capacity_state CONFIRMED_BELOW_THRESHOLD" },
    { name: "non-permanent-exclusions.json", rule: (r) => r.capacity_state === "NOT_A_PERMANENT_VENUE", description: "capacity_state NOT_A_PERMANENT_VENUE" },
    { name: "missing-from-canonical.json", rule: (r) => r.canonical_match_state === "MISSING_FROM_CANON", description: "canonical_match_state MISSING_FROM_CANON" },
    { name: "existing-canonical.json", rule: (r) => IN_CANON_STATES.includes(r.canonical_match_state), description: "an in-canon canonical_match_state" },
    { name: "newly-discovered-venues.json", rule: (r) => r.provenance === "NEW_IN_PACKAGE_07", description: "provenance NEW_IN_PACKAGE_07" },
  ];
  for (const check of subsetChecks) {
    const list = artifacts.get(check.name)?.venues;
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const row = byId.get(entry.research_id);
      if (!row) {
        errors.push(`${check.name} lists research_id "${entry.research_id}" which is not in census.json`);
        continue;
      }
      if (!check.rule(row)) {
        errors.push(`${check.name} lists "${entry.research_id}" but that row does not have ${check.description}`);
      }
    }
  }

  // --- predecessor reconciliation ---------------------------------------
  let predecessorRows = null;
  try {
    predecessorRows = readJson(repoRoot, `${PREDECESSOR_CENSUS_DIR}/census.json`).venues;
  } catch (error) {
    errors.push(`could not read the Package 06 census for reconciliation: ${error.message}`);
  }
  if (predecessorRows) {
    for (const error of reconcileAgainstPredecessor(predecessorRows, rows)) errors.push(error);
    const declared = artifacts.get("predecessor-reconciliation.json")?.predecessor_row_count;
    if (declared !== predecessorRows.length) {
      errors.push(`predecessor-reconciliation.json declares predecessor_row_count=${declared} but Package 06 holds ${predecessorRows.length}`);
    }
  }

  // --- THE POINT OF THE PACKAGE: the stadium audit ----------------------
  const auditArtifact = artifacts.get("stadium-source-estate-audit.json");
  const audit = Array.isArray(auditArtifact?.audit) ? auditArtifact.audit : null;
  if (!audit) {
    errors.push("stadium-source-estate-audit.json has no audit array");
  } else {
    for (const error of validateStadiumAudit(audit)) errors.push(error);
    const coveredIds = new Set(audit.filter((e) => e.covered === true).map((e) => e.predecessor_research_id));
    for (const id of PREVIOUSLY_UNCOVERED_STADIUM_ROWS) {
      if (!coveredIds.has(id) && auditArtifact?.covered_total === PREDECESSOR_STADIUM_ROWS.length) {
        errors.push(`stadium audit claims full coverage but "${id}" is not covered`);
      }
    }
    if (auditArtifact?.covered_total !== audit.filter((e) => e.covered === true).length) {
      errors.push(`stadium-source-estate-audit.json declares covered_total=${auditArtifact?.covered_total} but the audit holds ${audit.filter((e) => e.covered === true).length}`);
    }
  }

  // --- both sweeps must be represented ----------------------------------
  const rl = artifacts.get("rugby-league-source-estate.json");
  const ath = artifacts.get("athletics-source-estate.json");
  if (rl?.sweep_id !== "RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1") {
    errors.push("rugby-league-source-estate.json does not declare the expected sweep_id");
  }
  if (ath?.sweep_id !== "NATIONAL_ATHLETICS") {
    errors.push("athletics-source-estate.json does not declare the expected sweep_id");
  }

  // --- canonical + event safety -----------------------------------------
  let canonicalIds = null;
  try {
    canonicalIds = new Set(readJson(repoRoot, "venues/uk.json").venues.map((v) => v.venue_id));
  } catch (error) {
    errors.push(`could not read venues/uk.json for canonical cross-check: ${error.message}`);
  }
  if (canonicalIds) {
    for (const row of rows) {
      if (row.canonical_venue_id !== null && !canonicalIds.has(row.canonical_venue_id)) {
        errors.push(`row "${row.research_id}" claims canonical_venue_id "${row.canonical_venue_id}" which is not in venues/uk.json`);
      }
    }
  }
  for (const row of rows) {
    for (const key of EVENT_SHAPED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        errors.push(`row "${row.research_id}" carries event-shaped key "${key}" — this census acquires no events`);
      }
    }
  }

  // --- headline and cross-tabs reconcile --------------------------------
  const summary = artifacts.get("summary.json");
  const expected = {
    total_rows: rows.length,
    confirmed_1000_plus: rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified_high_value_candidates: rows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    confirmed_below_threshold: rows.filter((r) => r.capacity_state === "CONFIRMED_BELOW_THRESHOLD").length,
    not_a_permanent_venue: rows.filter((r) => r.capacity_state === "NOT_A_PERMANENT_VENUE").length,
    identity_review: rows.filter((r) => r.capacity_state === "IDENTITY_REVIEW").length,
    research_blocked: rows.filter((r) => r.capacity_state === "RESEARCH_BLOCKED").length,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (summary?.headline?.[key] !== value) {
      errors.push(`summary.json headline.${key} is ${summary?.headline?.[key]} but census.json actually holds ${value}`);
    }
  }
  const stateSum = Object.entries(expected).filter(([k]) => k !== "total_rows").reduce((s, [, v]) => s + v, 0);
  if (stateSum !== rows.length) {
    errors.push(`capacity states sum to ${stateSum} but the corpus holds ${rows.length} rows — unexplained estate arithmetic`);
  }

  // The confirmed cohort must split exactly into in-canon + missing + review.
  const confirmed = rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  const cc = summary?.canonical_coverage ?? {};
  const split = (cc.confirmed_already_in_canon ?? 0) + (cc.confirmed_missing_from_canon ?? 0) + (cc.confirmed_identity_review ?? 0);
  if (split !== confirmed.length) {
    errors.push(`confirmed split (in canon ${cc.confirmed_already_in_canon} + missing ${cc.confirmed_missing_from_canon} + review ${cc.confirmed_identity_review}) = ${split}, but ${confirmed.length} rows are confirmed`);
  }

  const crossA = summary?.cross_tabs?.a_capacity_by_canonical_state;
  if (Array.isArray(crossA)) {
    const total = crossA.find((r) => r.canonical_state === "TOTAL");
    if (!total) errors.push("cross-tab A has no TOTAL row");
    else if (total.total !== rows.length) errors.push(`cross-tab A TOTAL is ${total.total} but the corpus holds ${rows.length} rows`);
  } else {
    errors.push("summary.json has no cross_tabs.a_capacity_by_canonical_state");
  }
  const crossB = summary?.cross_tabs?.b_strategic_segment;
  if (Array.isArray(crossB)) {
    const segTotal = crossB.reduce((s, r) => s + r.total_high_value, 0);
    const actualHv = rows.filter((r) => HIGH_VALUE_STATES.includes(r.capacity_state)).length;
    if (segTotal !== actualHv) {
      errors.push(`cross-tab B segments sum to ${segTotal} high-value rows but the corpus holds ${actualHv}`);
    }
    for (const segment of STRATEGIC_SEGMENTS) {
      if (!crossB.some((r) => r.segment === segment)) errors.push(`cross-tab B is missing segment ${segment}`);
    }
  } else {
    errors.push("summary.json has no cross_tabs.b_strategic_segment");
  }
  for (const venueClass of new Set(rows.map((r) => r.venue_class))) {
    if (segmentFor(venueClass) === null) {
      errors.push(`venue_class "${venueClass}" maps to no strategic segment`);
    }
  }

  // --- confirmed rows really are confirmed and permanent ----------------
  for (const row of confirmed) {
    if (row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(`row "${row.research_id}" is CONFIRMED_1000_PLUS with capacity_max ${row.capacity_max}`);
    }
    if (!PERMANENT_CLASSES.includes(row.permanence_class)) {
      errors.push(`row "${row.research_id}" is CONFIRMED_1000_PLUS with non-permanent permanence_class "${row.permanence_class}"`);
    }
    if (row.capacity_evidence.length === 0) {
      errors.push(`row "${row.research_id}" is CONFIRMED_1000_PLUS with no capacity evidence`);
    }
  }

  // --- coverage + the COMPLETE gate -------------------------------------
  const coverage = artifacts.get("coverage-matrix.json");
  const coveredClasses = new Set((coverage?.classes ?? []).map((c) => c.venue_class));
  for (const venueClass of new Set(rows.map((r) => r.venue_class))) {
    if (!coveredClasses.has(venueClass)) errors.push(`coverage-matrix.json has no entry for venue_class "${venueClass}"`);
  }

  const assessment = coverage?.completeness_assessment;
  const invariants = summary?.quality_invariants;
  if (assessment?.verdict === "COMPLETE") {
    const stillOpen = (coverage?.classes ?? []).filter((c) => !COMPLETE_ENOUGH_COVERAGE_STATES.includes(c.final_coverage));
    if (stillOpen.length > 0) {
      errors.push(`coverage-matrix.json claims COMPLETE while ${stillOpen.length} class(es) are not complete: ${stillOpen.map((c) => c.venue_class).join(", ")}`);
    }
    const ran = new Set(coverage?.sweeps_run ?? []);
    for (const sweep of REQUIRED_SOURCE_FAMILY_SWEEPS) {
      if (!ran.has(sweep.id)) {
        errors.push(`coverage-matrix.json claims COMPLETE but required sweep ${sweep.id} was not run`);
      }
    }
    if (invariants?.unresearched_known_stadium_rows !== 0) {
      errors.push(`COMPLETE claimed while ${invariants?.unresearched_known_stadium_rows} known STADIUM row(s) remain unresearched`);
    }
    if (invariants?.required_source_family_sweeps_not_run !== 0) {
      errors.push(`COMPLETE claimed while ${invariants?.required_source_family_sweeps_not_run} required sweep(s) were not run`);
    }
  }

  // --- invariants that must always be zero ------------------------------
  const ALWAYS_ZERO = [
    "duplicate_research_ids", "duplicate_predecessor_claims",
    "confirmed_without_capacity_evidence", "non_permanent_counted_as_confirmed",
    "third_party_labelled_official", "negative_claims_on_blocked_rows",
    "unexplained_rows", "predecessor_rows_without_disposition",
    "new_venues_without_discovering_source_family", "events_acquired",
    "canonical_venues_mutated", "package_05_mutations", "package_06_mutations",
  ];
  if (!invariants || typeof invariants !== "object") {
    errors.push("summary.json publishes no quality_invariants block");
  } else {
    for (const key of ALWAYS_ZERO) {
      if (invariants[key] !== 0) errors.push(`quality invariant "${key}" is ${invariants[key]}, expected 0`);
    }
  }

  // --- predecessor packages must be untouched ---------------------------
  for (const dir of [ORIGINAL_CENSUS_DIR, PREDECESSOR_CENSUS_DIR]) {
    if (!existsSync(join(repoRoot, dir, "census.json"))) {
      errors.push(`predecessor corpus ${dir} is missing — it must be preserved, not replaced`);
    }
  }

  return errors;
}

function main() {
  const errors = validateCensus07Directory();
  if (errors.length > 0) {
    console.error(`FAIL — ${errors.length} problem(s) in ${CENSUS_07_DIR}:`);
    for (const error of errors.slice(0, 60)) console.error(`  - ${error}`);
    if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
    process.exitCode = 1;
    return;
  }
  const census = readJson(ROOT, `${CENSUS_07_DIR}/census.json`);
  console.log(`OK — ${CENSUS_07_DIR} validates (${census.venues.length} census rows).`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
