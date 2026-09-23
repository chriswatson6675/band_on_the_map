#!/usr/bin/env node
// Repository-level validator for the Package 06 UK high-value venue
// completion corpus (BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06).
//
// Builds on the pure contract in ./contract.mjs and adds the checks that
// need to see the repository as a whole:
//
//   1. every promised artifact exists and parses;
//   2. every declared count matches the rows it actually contains;
//   3. every view artifact is a genuine subset of census.json whose
//      membership rule holds for every member;
//   4. every Package 05 row has exactly one disposition here;
//   5. the Package 05 directory is untouched;
//   6. no canonical venue is asserted that does not exist;
//   7. no Event-shaped record has leaked in;
//   8. the cross-tabs reconcile against the rows;
//   9. the quality invariants all hold;
//  10. a COMPLETE verdict cannot be published while a material class is
//      still unresearched.
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
  PERMANENT_CLASSES,
  PREDECESSOR_CENSUS_DIR,
  STRATEGIC_SEGMENTS,
  reconcileAgainstPredecessor,
  segmentFor,
  validateCensus06,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_06_DIR = "research/high-value-venue-estate/uk-1000plus-06";

export const REQUIRED_ARTIFACTS_06 = Object.freeze([
  "manifest.json",
  "predecessor-reconciliation.json",
  "census.json",
  "confirmed-1000-plus.json",
  "capacity-unverified-candidates.json",
  "below-threshold.json",
  "non-permanent-exclusions.json",
  "permanence-review.json",
  "existing-canonical.json",
  "missing-from-canonical.json",
  "identity-review.json",
  "conference-venues.json",
  "sports-venues.json",
  "music-general-venues.json",
  "operator-estates.json",
  "platform-families.json",
  "generic-extraction-shapes.json",
  "calendar-sources.json",
  "coverage-matrix.json",
  "coverage-evidence.json",
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
  ["conference-venues.json", "count", "venues"],
  ["sports-venues.json", "count", "venues"],
  ["music-general-venues.json", "count", "venues"],
  ["operator-estates.json", "count", "estates"],
  ["platform-families.json", "count", "families"],
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
 * Validate the whole published Package 06 directory.
 * Returns human-readable error strings; empty means valid.
 */
export function validateCensus06Directory(repoRoot = ROOT) {
  const errors = [];
  if (!existsSync(join(repoRoot, CENSUS_06_DIR))) {
    return [`census directory ${CENSUS_06_DIR} does not exist`];
  }

  // 1. artifacts exist and parse
  const artifacts = new Map();
  for (const name of REQUIRED_ARTIFACTS_06) {
    const relative = `${CENSUS_06_DIR}/${name}`;
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
  if (rows === null) return [`${CENSUS_06_DIR}/census.json has no venues array`];

  // 2. contract
  for (const error of validateCensus06(rows)) errors.push(error);

  // 3. declared counts match list lengths
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

  // 4. view artifacts are genuine subsets with their membership rule holding
  const subsetChecks = [
    { name: "confirmed-1000-plus.json", key: "venues", rule: (r) => r.capacity_state === "CONFIRMED_1000_PLUS", description: "capacity_state CONFIRMED_1000_PLUS" },
    { name: "capacity-unverified-candidates.json", key: "venues", rule: (r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE", description: "capacity_state CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE" },
    { name: "below-threshold.json", key: "venues", rule: (r) => r.capacity_state === "CONFIRMED_BELOW_THRESHOLD", description: "capacity_state CONFIRMED_BELOW_THRESHOLD" },
    { name: "non-permanent-exclusions.json", key: "venues", rule: (r) => r.capacity_state === "NOT_A_PERMANENT_VENUE", description: "capacity_state NOT_A_PERMANENT_VENUE" },
    { name: "missing-from-canonical.json", key: "venues", rule: (r) => r.canonical_match_state === "MISSING_FROM_CANON", description: "canonical_match_state MISSING_FROM_CANON" },
    { name: "existing-canonical.json", key: "venues", rule: (r) => IN_CANON_STATES.includes(r.canonical_match_state), description: "an in-canon canonical_match_state" },
  ];
  for (const check of subsetChecks) {
    const list = artifacts.get(check.name)?.[check.key];
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

  // 5. every predecessor row has a disposition
  let predecessorRows = null;
  try {
    predecessorRows = readJson(repoRoot, `${PREDECESSOR_CENSUS_DIR}/census.json`).venues;
  } catch (error) {
    errors.push(`could not read the Package 05 census for reconciliation: ${error.message}`);
  }
  if (predecessorRows) {
    for (const error of reconcileAgainstPredecessor(predecessorRows, rows)) errors.push(error);
    const declared = artifacts.get("predecessor-reconciliation.json")?.predecessor_row_count;
    if (declared !== predecessorRows.length) {
      errors.push(`predecessor-reconciliation.json declares predecessor_row_count=${declared} but Package 05 holds ${predecessorRows.length}`);
    }
  }

  // 6. no canonical venue asserted that does not exist
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

  // 7. no Event-shaped record
  for (const row of rows) {
    for (const key of EVENT_SHAPED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        errors.push(`row "${row.research_id}" carries event-shaped key "${key}" — this census acquires no events`);
      }
    }
  }

  // 8. summary headline and cross-tabs reconcile against the rows
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
  // Every row must be in exactly one capacity state, so the states must sum.
  const stateSum = Object.entries(expected)
    .filter(([k]) => k !== "total_rows")
    .reduce((s, [, v]) => s + v, 0);
  if (stateSum !== rows.length) {
    errors.push(`capacity states sum to ${stateSum} but the corpus holds ${rows.length} rows — unexplained estate arithmetic`);
  }

  const crossTabA = summary?.cross_tabs?.a_capacity_by_canonical_state;
  if (Array.isArray(crossTabA)) {
    const total = crossTabA.find((r) => r.canonical_state === "TOTAL");
    if (!total) errors.push("cross-tab A has no TOTAL row");
    else if (total.total !== rows.length) {
      errors.push(`cross-tab A TOTAL is ${total.total} but the corpus holds ${rows.length} rows`);
    }
  } else {
    errors.push("summary.json has no cross_tabs.a_capacity_by_canonical_state");
  }

  const crossTabB = summary?.cross_tabs?.b_strategic_segment;
  if (Array.isArray(crossTabB)) {
    const segTotal = crossTabB.reduce((s, r) => s + r.total_high_value, 0);
    const actualHv = rows.filter((r) => HIGH_VALUE_STATES.includes(r.capacity_state)).length;
    if (segTotal !== actualHv) {
      errors.push(`cross-tab B segments sum to ${segTotal} high-value rows but the corpus holds ${actualHv} — a venue class is outside every segment`);
    }
    for (const segment of STRATEGIC_SEGMENTS) {
      if (!crossTabB.some((r) => r.segment === segment)) errors.push(`cross-tab B is missing segment ${segment}`);
    }
  } else {
    errors.push("summary.json has no cross_tabs.b_strategic_segment");
  }

  // Every venue class present must map to a strategic segment.
  for (const venueClass of new Set(rows.map((r) => r.venue_class))) {
    if (segmentFor(venueClass) === null) {
      errors.push(`venue_class "${venueClass}" maps to no strategic segment — it would be invisible in cross-tab B`);
    }
  }

  // 9. confirmed rows really are confirmed, and really are permanent
  for (const row of rows) {
    if (row.capacity_state !== "CONFIRMED_1000_PLUS") continue;
    if (row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(`row "${row.research_id}" is CONFIRMED_1000_PLUS with capacity_max ${row.capacity_max}`);
    }
    if (!PERMANENT_CLASSES.includes(row.permanence_class)) {
      errors.push(`row "${row.research_id}" is CONFIRMED_1000_PLUS with non-permanent permanence_class "${row.permanence_class}"`);
    }
  }

  // 10. quality invariants
  const invariants = summary?.quality_invariants;
  if (!invariants || typeof invariants !== "object") {
    errors.push("summary.json publishes no quality_invariants block");
  } else {
    for (const [key, value] of Object.entries(invariants)) {
      if (value !== 0) errors.push(`quality invariant "${key}" is ${value}, expected 0`);
    }
  }

  // 11. the coverage matrix covers every class present, and a COMPLETE
  //     verdict cannot coexist with an unresearched material class.
  const coverage = artifacts.get("coverage-matrix.json");
  const coveredClasses = new Set((coverage?.classes ?? []).map((c) => c.venue_class));
  for (const venueClass of new Set(rows.map((r) => r.venue_class))) {
    if (!coveredClasses.has(venueClass)) {
      errors.push(`coverage-matrix.json has no entry for venue_class "${venueClass}"`);
    }
  }
  const assessment = coverage?.completeness_assessment;
  if (assessment?.verdict === "COMPLETE") {
    const stillOpen = (coverage?.classes ?? []).filter(
      (c) => !COMPLETE_ENOUGH_COVERAGE_STATES.includes(c.final_coverage),
    );
    if (stillOpen.length > 0) {
      errors.push(
        `coverage-matrix.json claims COMPLETE while ${stillOpen.length} class(es) are not complete: ${stillOpen.map((c) => c.venue_class).join(", ")}`,
      );
    }
  }

  return errors;
}

function main() {
  const errors = validateCensus06Directory();
  if (errors.length > 0) {
    console.error(`FAIL — ${errors.length} problem(s) in ${CENSUS_06_DIR}:`);
    for (const error of errors.slice(0, 60)) console.error(`  - ${error}`);
    if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
    process.exitCode = 1;
    return;
  }
  const census = readJson(ROOT, `${CENSUS_06_DIR}/census.json`);
  console.log(`OK — ${CENSUS_06_DIR} validates (${census.venues.length} census rows).`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
