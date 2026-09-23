#!/usr/bin/env node
// Repository-level validator for the UK high-value venue estate census
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05).
//
// Builds on the pure structural/business-rule contract in ./contract.mjs
// and adds the checks that need to see the repository as a whole:
//
//   1. every published artifact exists and parses;
//   2. every artifact's own declared count matches the rows it contains
//      (the previous national package published a headline number that
//      did not match how it was computed — this makes that class of
//      error a test failure rather than a reading-comprehension problem);
//   3. every view artifact is genuinely a subset of census.json;
//   4. the census asserts no canonical venue that does not exist;
//   5. the package's quality invariants all hold;
//   6. the census contains no Event-shaped records.
//
// Read-only. Makes no network requests. Never writes, mutates or deletes
// anything — including the artifacts it reads.
//
// `npm run validate:high-value-venue-census` runs this as a CLI. Every
// export is also directly usable from tests against an arbitrary
// repoRoot, so tests never need to shell out.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HIGH_VALUE_CAPACITY_THRESHOLD, validateCensus } from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_DIR = "research/high-value-venue-estate/uk-1000plus-05";

// Every artifact this package promises to publish.
export const REQUIRED_ARTIFACTS = Object.freeze([
  "manifest.json",
  "census.json",
  "confirmed-1000-plus.json",
  "capacity-unverified-candidates.json",
  "existing-canonical.json",
  "missing-from-canonical.json",
  "possible-duplicates.json",
  "conference-venues.json",
  "sports-venues.json",
  "general-programme-sources.json",
  "conference-calendar-sources.json",
  "sports-calendar-sources.json",
  "platform-families.json",
  "operator-estates.json",
  "acquisition-readiness.json",
  "coverage-matrix.json",
  "unresolved.json",
  "research-blocked.json",
  "summary.json",
]);

// Artifacts that publish a `count` alongside a list, where the two must
// agree. [filename, countKey, listKey]
const COUNTED_LIST_ARTIFACTS = Object.freeze([
  ["census.json", "count", "venues"],
  ["confirmed-1000-plus.json", "count", "venues"],
  ["capacity-unverified-candidates.json", "count", "venues"],
  ["existing-canonical.json", "count", "venues"],
  ["missing-from-canonical.json", "count", "venues"],
  ["conference-venues.json", "count", "venues"],
  ["sports-venues.json", "count", "venues"],
  ["general-programme-sources.json", "count", "sources"],
  ["conference-calendar-sources.json", "count", "sources"],
  ["sports-calendar-sources.json", "count", "sources"],
  ["platform-families.json", "count", "families"],
  ["operator-estates.json", "count", "estates"],
  ["unresolved.json", "count", "venues"],
  ["research-blocked.json", "count", "venues"],
]);

// Keys that would indicate an Event record has leaked into the census.
// This package acquires no events; a row carrying event timing is a bug.
const EVENT_SHAPED_KEYS = Object.freeze([
  "start_date",
  "startDate",
  "end_date",
  "endDate",
  "performer",
  "artist_name",
  "event_id",
  "observation_id",
  "doors_time",
]);

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

/**
 * Validate the whole published census directory.
 * Returns an array of human-readable error strings; empty means valid.
 */
export function validateCensusDirectory(repoRoot = ROOT) {
  const errors = [];
  const dir = join(repoRoot, CENSUS_DIR);

  if (!existsSync(dir)) {
    return [`census directory ${CENSUS_DIR} does not exist`];
  }

  // 1. every promised artifact exists and parses
  const artifacts = new Map();
  for (const name of REQUIRED_ARTIFACTS) {
    const relative = `${CENSUS_DIR}/${name}`;
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
  if (rows === null) {
    return [`${CENSUS_DIR}/census.json has no venues array`];
  }

  // 2. every row satisfies the contract (includes id uniqueness)
  for (const error of validateCensus(rows)) errors.push(error);

  // 3. declared counts match actual list lengths
  for (const [name, countKey, listKey] of COUNTED_LIST_ARTIFACTS) {
    const artifact = artifacts.get(name);
    const list = artifact?.[listKey];
    const declared = artifact?.[countKey];
    if (!Array.isArray(list)) {
      errors.push(`${name} has no "${listKey}" array`);
      continue;
    }
    if (declared !== list.length) {
      errors.push(
        `${name} declares ${countKey}=${declared} but "${listKey}" holds ${list.length} entries`,
      );
    }
  }

  const byId = new Map(rows.map((row) => [row.research_id, row]));

  // 4. every view artifact is genuinely a subset of census.json, and its
  //    membership rule actually holds for every member.
  const subsetChecks = [
    {
      name: "confirmed-1000-plus.json",
      key: "venues",
      rule: (row) => row.high_value_state === "CONFIRMED_1000_PLUS",
      description: "high_value_state CONFIRMED_1000_PLUS",
    },
    {
      name: "capacity-unverified-candidates.json",
      key: "venues",
      rule: (row) => row.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
      description: "high_value_state CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    },
    {
      name: "missing-from-canonical.json",
      key: "venues",
      rule: (row) => row.canonical_match_state === "MISSING_FROM_CANON",
      description: "canonical_match_state MISSING_FROM_CANON",
    },
    {
      name: "general-programme-sources.json",
      key: "sources",
      rule: (row) => row.general_programme_url !== null,
      description: "a non-null general_programme_url",
    },
    {
      name: "conference-calendar-sources.json",
      key: "sources",
      rule: (row) => row.conference_calendar_url !== null,
      description: "a non-null conference_calendar_url",
    },
    {
      name: "sports-calendar-sources.json",
      key: "sources",
      rule: (row) => row.sports_calendar_url !== null,
      description: "a non-null sports_calendar_url",
    },
  ];

  for (const check of subsetChecks) {
    const list = artifacts.get(check.name)?.[check.key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const row = byId.get(entry.research_id);
      if (!row) {
        errors.push(
          `${check.name} lists research_id "${entry.research_id}" which is not in census.json`,
        );
        continue;
      }
      if (!check.rule(row)) {
        errors.push(
          `${check.name} lists "${entry.research_id}" but that row does not have ${check.description}`,
        );
      }
    }
  }

  // 5. the census never asserts a canonical venue that does not exist
  let canonicalIds = null;
  try {
    canonicalIds = new Set(
      readJson(repoRoot, "venues/uk.json").venues.map((v) => v.venue_id),
    );
  } catch (error) {
    errors.push(`could not read venues/uk.json for canonical cross-check: ${error.message}`);
  }
  if (canonicalIds) {
    for (const row of rows) {
      if (row.canonical_venue_id !== null && !canonicalIds.has(row.canonical_venue_id)) {
        errors.push(
          `row "${row.research_id}" claims canonical_venue_id "${row.canonical_venue_id}" which is not in venues/uk.json`,
        );
      }
    }
  }

  // 6. no Event-shaped record has leaked in
  for (const row of rows) {
    for (const key of EVENT_SHAPED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        errors.push(
          `row "${row.research_id}" carries event-shaped key "${key}" — this census acquires no events`,
        );
      }
    }
  }

  // 7. the summary's headline numbers are actually true of the rows
  const summary = artifacts.get("summary.json");
  const expected = {
    confirmed_1000_plus: rows.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified_high_value_candidates: rows.filter(
      (r) => r.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    ).length,
    below_threshold: rows.filter((r) => r.high_value_state === "BELOW_THRESHOLD").length,
    total_rows: rows.length,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (summary?.headline?.[key] !== value) {
      errors.push(
        `summary.json headline.${key} is ${summary?.headline?.[key]} but census.json actually holds ${value}`,
      );
    }
  }

  // 8. a confirmed row's capacity really does reach the threshold
  for (const row of rows) {
    if (row.high_value_state === "CONFIRMED_1000_PLUS" && row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(
        `row "${row.research_id}" is CONFIRMED_1000_PLUS with capacity_max ${row.capacity_max}`,
      );
    }
  }

  // 9. the published quality invariants must all be zero
  const invariants = summary?.quality_invariants;
  if (!invariants || typeof invariants !== "object") {
    errors.push("summary.json publishes no quality_invariants block");
  } else {
    for (const [key, value] of Object.entries(invariants)) {
      if (value !== 0) {
        errors.push(`quality invariant "${key}" is ${value}, expected 0`);
      }
    }
  }

  return errors;
}

function main() {
  const errors = validateCensusDirectory();
  if (errors.length > 0) {
    console.error(`FAIL — ${errors.length} problem(s) in ${CENSUS_DIR}:`);
    for (const error of errors.slice(0, 60)) console.error(`  - ${error}`);
    if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
    process.exitCode = 1;
    return;
  }
  const census = readJson(ROOT, `${CENSUS_DIR}/census.json`);
  console.log(`OK — ${CENSUS_DIR} validates (${census.venues.length} census rows).`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
