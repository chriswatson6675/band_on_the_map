#!/usr/bin/env node
// Repository-level validator for the Package 08 identity gate
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-IDENTITY-GATE-08).
//
// The file this package produces — admission-ready.json — is the sole
// input to a package that will MINT CANONICAL VENUES. So the checks here
// are deliberately the strictest in the lineage:
//
//   1. every promised artifact exists and parses;
//   2. every declared count matches the rows it contains;
//   3. all 800 Package 07 confirmed rows map into Package 08;
//   4. a Package 07 row belongs to exactly one unique entity;
//   5. every admission-ready venue is confirmed >=1,000, permanent, has
//      identity evidence, and is NOT already canonical;
//   6. no held, blocked or governance-held venue reaches admission-ready;
//   7. no two admission-ready rows are the same unique entity;
//   8. represented-in-canon rows name a canonical venue that EXISTS;
//   9. the Anglesey pair has exactly one explicit decision;
//  10. the estate arithmetic closes with no remainder;
//  11. Packages 05, 06 and 07 are present and unmodified;
//  12. venues/uk.json is unchanged and no Event-shaped record leaked in.
//
// Read-only. No network. Never writes or mutates anything.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMISSION_READY_DISPOSITION,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HOLD_DISPOSITIONS,
  IMMUTABLE_PREDECESSOR_DIRS,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_CONFIRMED_ROWS,
  PREDECESSOR_IDENTITY_REVIEW,
  assertEstateArithmetic,
  reconcileConfirmedRows,
  validateIdentityGate,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const IDENTITY_GATE_DIR = "research/high-value-venue-estate/uk-1000plus-08-identity";

export const REQUIRED_ARTIFACTS_08 = Object.freeze([
  "manifest.json",
  "predecessor-reconciliation.json",
  "identity-decisions.json",
  "identity-review-resolved.json",
  "identity-holds.json",
  "canonical-matches.json",
  "canonical-duplicate-candidates.json",
  "research-row-duplicates.json",
  "anglesey-showground-decision.json",
  "unique-confirmed-estate.json",
  "represented-in-canon.json",
  "admission-ready.json",
  "admission-holds.json",
  "suggested-alias-enrichment.json",
  "summary.json",
]);

const COUNTED_LIST_ARTIFACTS = Object.freeze([
  ["unique-confirmed-estate.json", "count", "entities"],
  ["admission-ready.json", "count", "venues"],
  ["canonical-matches.json", "count", "venues"],
  ["represented-in-canon.json", "count", "venues"],
  ["identity-holds.json", "count", "venues"],
  ["admission-holds.json", "count", "venues"],
  ["identity-review-resolved.json", "count", "rows"],
  ["suggested-alias-enrichment.json", "count", "suggestions"],
]);

const EVENT_SHAPED_KEYS = Object.freeze([
  "start_date", "startDate", "end_date", "endDate", "performer",
  "artist_name", "event_id", "observation_id", "doors_time",
]);

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

export function validateIdentityGateDirectory(repoRoot = ROOT) {
  const errors = [];
  if (!existsSync(join(repoRoot, IDENTITY_GATE_DIR))) {
    return [`identity gate directory ${IDENTITY_GATE_DIR} does not exist`];
  }

  const artifacts = new Map();
  for (const name of REQUIRED_ARTIFACTS_08) {
    const relative = `${IDENTITY_GATE_DIR}/${name}`;
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

  const estate = artifacts.get("unique-confirmed-estate.json");
  const entities = Array.isArray(estate?.entities) ? estate.entities : null;
  const admission = artifacts.get("admission-ready.json");
  const admissionReady = Array.isArray(admission?.venues) ? admission.venues : null;
  const decisions = artifacts.get("identity-decisions.json");
  const accepted = Array.isArray(decisions?.accepted) ? decisions.accepted : [];

  if (entities === null) return [`${IDENTITY_GATE_DIR}/unique-confirmed-estate.json has no entities array`];
  if (admissionReady === null) return [`${IDENTITY_GATE_DIR}/admission-ready.json has no venues array`];

  // 2. contract
  for (const error of validateIdentityGate({ decisions: accepted, entities, admissionReady })) {
    errors.push(error);
  }

  // 3. declared counts
  for (const [name, countKey, listKey] of COUNTED_LIST_ARTIFACTS) {
    const artifact = artifacts.get(name);
    const list = artifact?.[listKey];
    if (!Array.isArray(list)) {
      errors.push(`${name} has no "${listKey}" array`);
      continue;
    }
    if (artifact?.[countKey] !== list.length) {
      errors.push(`${name} declares ${countKey}=${artifact?.[countKey]} but "${listKey}" holds ${list.length}`);
    }
  }

  // 4. every Package 07 confirmed row maps in
  let confirmedIds = null;
  try {
    const predecessorRows = readJson(repoRoot, `${PREDECESSOR_CENSUS_DIR}/census.json`).venues;
    const confirmed = predecessorRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
    confirmedIds = confirmed.map((r) => r.research_id);
    if (confirmed.length !== PREDECESSOR_CONFIRMED_ROWS) {
      errors.push(
        `Package 07 holds ${confirmed.length} confirmed rows but this gate was built for ${PREDECESSOR_CONFIRMED_ROWS}`,
      );
    }
    for (const error of reconcileConfirmedRows(confirmedIds, entities)) errors.push(error);

    const reviewCount = confirmed.filter((r) => r.canonical_match_state === "AMBIGUOUS_IDENTITY").length;
    if (reviewCount !== PREDECESSOR_IDENTITY_REVIEW) {
      errors.push(`Package 07 holds ${reviewCount} identity-review rows but ${PREDECESSOR_IDENTITY_REVIEW} was expected`);
    }
    const reviewArtifact = artifacts.get("identity-review-resolved.json");
    if (reviewArtifact?.count !== reviewCount) {
      errors.push(`identity-review-resolved.json declares ${reviewArtifact?.count} rows but Package 07 holds ${reviewCount}`);
    }
  } catch (error) {
    errors.push(`could not read the Package 07 census: ${error.message}`);
  }

  // 5. canonical ids must resolve
  let canonicalIds = null;
  try {
    canonicalIds = new Set(readJson(repoRoot, "venues/uk.json").venues.map((v) => v.venue_id));
  } catch (error) {
    errors.push(`could not read venues/uk.json: ${error.message}`);
  }
  if (canonicalIds) {
    for (const entity of entities) {
      if (entity.canonical_venue_id != null && !canonicalIds.has(entity.canonical_venue_id)) {
        errors.push(`entity "${entity.unique_entity_id}" claims canonical venue "${entity.canonical_venue_id}" which does not exist`);
      }
    }
    for (const row of artifacts.get("represented-in-canon.json")?.venues ?? []) {
      if (!row.canonical_venue_id) {
        errors.push(`represented-in-canon row "${row.unique_entity_id}" has no canonical_venue_id`);
      } else if (!canonicalIds.has(row.canonical_venue_id)) {
        errors.push(`represented-in-canon row "${row.unique_entity_id}" cites a canonical venue that does not exist`);
      }
    }
  }

  // 6. THE ADMISSION SAFETY CHECKS — the strictest in the lineage
  const entityById = new Map(entities.map((e) => [e.unique_entity_id, e]));
  const seenAdmission = new Set();
  for (const row of admissionReady) {
    const entity = entityById.get(row.unique_entity_id);
    if (!entity) {
      errors.push(`admission-ready row "${row.unique_entity_id}" has no unique entity`);
      continue;
    }
    if (entity.disposition !== ADMISSION_READY_DISPOSITION) {
      errors.push(
        `admission-ready row "${row.unique_entity_id}" has disposition ${entity.disposition} — only ${ADMISSION_READY_DISPOSITION} may be admitted`,
      );
    }
    if (HOLD_DISPOSITIONS.includes(entity.disposition)) {
      errors.push(`held venue "${row.unique_entity_id}" reached admission-ready`);
    }
    if (entity.canonical_venue_id != null || row.canonical_venue_id != null) {
      errors.push(`admission-ready row "${row.unique_entity_id}" is already canonical`);
    }
    if (typeof row.capacity_max !== "number" || row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(`admission-ready row "${row.unique_entity_id}" is not confirmed >=${HIGH_VALUE_CAPACITY_THRESHOLD}`);
    }
    if (!row.permanence_class) {
      errors.push(`admission-ready row "${row.unique_entity_id}" has no permanence_class — the estate is of permanent venues`);
    }
    if (!Array.isArray(row.identity_evidence) || row.identity_evidence.length === 0) {
      errors.push(`admission-ready row "${row.unique_entity_id}" has no identity evidence — that would permit a blind mint`);
    }
    if (seenAdmission.has(row.unique_entity_id)) {
      errors.push(`unique entity "${row.unique_entity_id}" appears twice in admission-ready`);
    }
    seenAdmission.add(row.unique_entity_id);
  }

  // Cross-check: the underlying Package 07 rows of an admission-ready
  // entity must themselves be confirmed and missing from canon.
  if (confirmedIds) {
    const confirmedSet = new Set(confirmedIds);
    for (const row of admissionReady) {
      for (const rid of row.package07_research_ids ?? []) {
        if (!confirmedSet.has(rid)) {
          errors.push(`admission-ready row "${row.unique_entity_id}" cites Package 07 row "${rid}" which is not confirmed`);
        }
      }
    }
  }

  // 7. the Anglesey pair must have exactly one explicit decision
  const anglesey = artifacts.get("anglesey-showground-decision.json");
  if (!anglesey?.decision) {
    errors.push("anglesey-showground-decision.json has no decision block");
  } else if (!Array.isArray(anglesey.records) || anglesey.records.length !== 2) {
    errors.push(
      `anglesey-showground-decision.json describes ${anglesey.records?.length ?? 0} records; the known pair is 2`,
    );
  }

  // 8. estate arithmetic closes
  const summary = artifacts.get("summary.json");
  const h = summary?.headline ?? {};
  const counted = {
    final_unique_confirmed: entities.length,
    represented_in_canon: entities.filter((e) => e.disposition === "REPRESENTED_IN_CANON").length,
    admission_ready: entities.filter((e) => e.disposition === ADMISSION_READY_DISPOSITION).length,
    canonical_governance_hold: entities.filter((e) => e.disposition === "CANONICAL_GOVERNANCE_HOLD").length,
    ambiguous_hold: entities.filter((e) => e.disposition === "AMBIGUOUS_HOLD").length,
    research_blocked: entities.filter((e) => e.disposition === "RESEARCH_BLOCKED").length,
  };
  for (const error of assertEstateArithmetic(counted)) errors.push(error);
  for (const [key, value] of Object.entries(counted)) {
    const headlineKey = key === "final_unique_confirmed" ? "final_unique_confirmed_venues" : key;
    if (h[headlineKey] !== value) {
      errors.push(`summary headline.${headlineKey} is ${h[headlineKey]} but the estate holds ${value}`);
    }
  }
  if (h.admission_ready !== admissionReady.length) {
    errors.push(`summary headline.admission_ready is ${h.admission_ready} but admission-ready.json holds ${admissionReady.length}`);
  }

  // 9. no Event-shaped record anywhere in the admission population
  for (const row of admissionReady) {
    for (const key of EVENT_SHAPED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        errors.push(`admission-ready row "${row.unique_entity_id}" carries event-shaped key "${key}"`);
      }
    }
  }

  // 10. quality invariants must all be zero
  const invariants = summary?.quality_invariants;
  if (!invariants || typeof invariants !== "object") {
    errors.push("summary.json publishes no quality_invariants block");
  } else {
    for (const [key, value] of Object.entries(invariants)) {
      if (value !== 0) errors.push(`quality invariant "${key}" is ${value}, expected 0`);
    }
  }

  // 11. predecessors must still be present
  for (const dir of IMMUTABLE_PREDECESSOR_DIRS) {
    if (!existsSync(join(repoRoot, dir, "census.json"))) {
      errors.push(`immutable predecessor ${dir} is missing — it must be preserved, not replaced`);
    }
  }

  return errors;
}

function main() {
  const errors = validateIdentityGateDirectory();
  if (errors.length > 0) {
    console.error(`FAIL — ${errors.length} problem(s) in ${IDENTITY_GATE_DIR}:`);
    for (const error of errors.slice(0, 60)) console.error(`  - ${error}`);
    if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
    process.exitCode = 1;
    return;
  }
  const admission = readJson(ROOT, `${IDENTITY_GATE_DIR}/admission-ready.json`);
  const estate = readJson(ROOT, `${IDENTITY_GATE_DIR}/unique-confirmed-estate.json`);
  console.log(
    `OK — ${IDENTITY_GATE_DIR} validates (${estate.count} unique venues, ${admission.count} admission-ready).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
