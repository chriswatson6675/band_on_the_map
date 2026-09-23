// UK high-value venue census — final closure corpus contract
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07).
//
// Package 06 produced the working national estate (803 confirmed permanent
// venues of >=1,000) and reached COMPLETE or MATERIAL_COMPLETE on 22 of 23
// venue classes. One class, STADIUM, stayed PARTIAL: of its 8 rows, 5 were
// covered by league estates already audited and 3 were not, because two
// source-family sweeps were never run — RFL Championship/League 1, and
// national athletics.
//
// This package exists only to close those two sweeps and freeze the census.
// It is surgical. Packages 05 and 06 are IMMUTABLE predecessor snapshots;
// this module and its builder read them and never write to them.
//
// WHY THIS MODULE DELEGATES ITS ROW RULES
// ---------------------------------------
// Every honesty rule that governs a census row — a confirmed capacity needs
// a citable source, a negative claim needs evidence that somebody looked, a
// blocked row may carry no negative claim, a third party is never official,
// a confirmed venue must be a permanent venue, a planned capacity is not a
// capacity — was written and tested in Package 06's contract, which is on
// main and unchanged.
//
// Re-typing those rules here would let the two copies drift, and a drifted
// copy is worse than no copy: it would silently accept a row Package 06
// would have rejected. So validateCensus07Row() projects a Package 07 row
// into the Package 06 shape and delegates to Package 06's own validator for
// all shared rules, adding only the checks that are genuinely new here.
// A test asserts the delegation actually happens.
//
// Dependency-free beyond that import, venue-agnostic, no I/O, no network.

import {
  ACQUISITION_SHAPES,
  CALENDAR_SCOPES,
  CALENDAR_SOURCE_KINDS,
  CALENDAR_STATES,
  CANONICAL_MATCH_STATES,
  CAPACITY_CONFIDENCES,
  CAPACITY_KINDS,
  CAPACITY_SOURCE_KINDS,
  CAPACITY_STATES,
  CONFERENCE_VENUE_CLASSES,
  EVIDENCE_KINDS,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HIGH_VALUE_STATES,
  IN_CANON_STATES,
  NATIONS,
  NON_PERMANENT_CLASSES,
  PERMANENCE_CLASSES,
  PERMANENT_CLASSES,
  SPORTS_VENUE_CLASSES,
  STRATEGIC_SEGMENTS,
  VENUE_CLASSES,
  segmentFor,
  validateCensus06Row,
} from "../high-value-venue-census-06/contract.mjs";

// Re-exported so Package 07 consumers need only one import. These are the
// same objects Package 06 defines — not copies — so they cannot drift.
export {
  ACQUISITION_SHAPES,
  CALENDAR_SCOPES,
  CALENDAR_SOURCE_KINDS,
  CALENDAR_STATES,
  CANONICAL_MATCH_STATES,
  CAPACITY_CONFIDENCES,
  CAPACITY_KINDS,
  CAPACITY_SOURCE_KINDS,
  CAPACITY_STATES,
  CONFERENCE_VENUE_CLASSES,
  EVIDENCE_KINDS,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HIGH_VALUE_STATES,
  IN_CANON_STATES,
  NATIONS,
  NON_PERMANENT_CLASSES,
  PERMANENCE_CLASSES,
  PERMANENT_CLASSES,
  SPORTS_VENUE_CLASSES,
  STRATEGIC_SEGMENTS,
  VENUE_CLASSES,
  segmentFor,
};

export const CENSUS_07_FRAMEWORK_VERSION = "BOTM-UK-HIGH-VALUE-VENUE-CENSUS-v3.0";

export const PREDECESSOR_PACKAGE = "BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06";
export const PREDECESSOR_MAIN_SHA = "ed9cc199c538d1e3bd2f3270d8532a34c3d90e0c";
export const PREDECESSOR_CENSUS_DIR = "research/high-value-venue-estate/uk-1000plus-06";
export const ORIGINAL_CENSUS_DIR = "research/high-value-venue-estate/uk-1000plus-05";

// --- provenance --------------------------------------------------------
export const PROVENANCE_VALUES = Object.freeze([
  "PREDECESSOR_CARRIED_UNCHANGED",
  "PREDECESSOR_RESOLVED_BY_07",
  "NEW_IN_PACKAGE_07",
]);

// --- the two sweeps this package exists to run --------------------------
// Named here, not in prose, so the completeness rule can check them
// mechanically rather than trusting a report.
export const REQUIRED_SOURCE_FAMILY_SWEEPS = Object.freeze([
  {
    id: "RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1",
    description:
      "RFL Championship and League 1 club/ground completeness audit — never run by Package 06, and the reason two of the three uncovered STADIUM rows were uncovered.",
  },
  {
    id: "NATIONAL_ATHLETICS",
    description:
      "Nationally material athletics stadium completeness audit across the four nations — never run by Package 06, and the reason the other uncovered STADIUM rows were uncovered.",
  },
]);

// The exact Package 06 STADIUM rows this package must account for. Frozen
// here so the audit cannot quietly shrink its own scope: the builder proves
// all 8 appear in the audit, and that the 3 known-uncovered ones are now
// covered.
export const PREDECESSOR_STADIUM_ROWS = Object.freeze([
  "hv06-p-england-exeter-sandy-park-stadium",
  "hv06-p-england-featherstone-post-office-road",
  "hv06-p-england-gloucester-kingsholm-stadium",
  "hv06-p-england-london-white-hart-lane-community-sports-centre",
  "hv06-p-england-wigan-brick-community-stadium",
  "hv06-p-england-worcester-sixways-stadium",
  "hv06-p-wales-swansea-swansea-com-stadium",
  "hv06-p-wales-wrexham-queensway-stadium",
]);

export const PREVIOUSLY_UNCOVERED_STADIUM_ROWS = Object.freeze([
  "hv06-p-england-featherstone-post-office-road",
  "hv06-p-england-london-white-hart-lane-community-sports-centre",
  "hv06-p-wales-wrexham-queensway-stadium",
]);

export const FINAL_COVERAGE_STATES = Object.freeze([
  "COMPLETE",
  "MATERIAL_COMPLETE",
  "PARTIAL",
  "BLOCKED",
]);

export const COMPLETE_ENOUGH_COVERAGE_STATES = Object.freeze([
  "COMPLETE",
  "MATERIAL_COMPLETE",
]);

const RESEARCH_ID_PATTERN = /^hv07-[a-z0-9-]+$/;
const PREDECESSOR_ID_PATTERN = /^hv06-[a-z0-9-]+$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Project a Package 07 row into the Package 06 row shape, so Package 06's
 * own validator can check every rule the two packages share.
 *
 * Only the fields that genuinely differ are rewritten: the id namespaces
 * and the provenance vocabulary. Nothing else is touched, so a real defect
 * cannot be masked by the projection — a row that passes here would have
 * passed Package 06 unchanged.
 */
export function projectToPredecessorShape(row) {
  const projected = { ...row };
  if (isNonEmptyString(row.research_id)) {
    projected.research_id = row.research_id.replace(/^hv07-/, "hv06-");
  }
  if (isNonEmptyString(row.predecessor_research_id)) {
    projected.predecessor_research_id = row.predecessor_research_id.replace(/^hv06-/, "hv05-");
  }
  projected.provenance =
    row.provenance === "NEW_IN_PACKAGE_07"
      ? "PACKAGE_06_NEW_RESEARCH"
      : row.provenance === "PREDECESSOR_RESOLVED_BY_07"
        ? "PREDECESSOR_RESOLVED_BY_06"
        : "PREDECESSOR_CARRIED_UNCHANGED";
  // Package 07 adds this field; Package 06 does not know it and does not
  // need to, so it is dropped from the projection rather than tripping an
  // unknown-key check.
  delete projected.discovered_by_source_family;
  return projected;
}

/**
 * Validate one Package 07 census row.
 * Returns human-readable error strings; empty means valid.
 */
export function validateCensus07Row(row) {
  if (!isPlainObject(row)) return ["census row must be an object"];

  const errors = [];

  // --- Package 07's own fields -----------------------------------------
  if (!isNonEmptyString(row.research_id)) {
    errors.push("research_id must be a non-empty string");
  } else if (!RESEARCH_ID_PATTERN.test(row.research_id)) {
    errors.push(`research_id "${row.research_id}" must match ${RESEARCH_ID_PATTERN}`);
  }

  if (row.predecessor_research_id !== null && row.predecessor_research_id !== undefined) {
    if (!isNonEmptyString(row.predecessor_research_id)) {
      errors.push("predecessor_research_id must be a non-empty string or null");
    } else if (!PREDECESSOR_ID_PATTERN.test(row.predecessor_research_id)) {
      errors.push(
        `predecessor_research_id "${row.predecessor_research_id}" must match ${PREDECESSOR_ID_PATTERN}`,
      );
    }
  }

  if (!PROVENANCE_VALUES.includes(row.provenance)) {
    errors.push(`provenance "${row.provenance}" is not a known Package 07 provenance value`);
  }

  // A venue newly discovered here must say which sweep found it. Without
  // that, the audit cannot show the sweep did any work, and a row could be
  // smuggled in under the cover of a sweep that never surfaced it.
  if (row.provenance === "NEW_IN_PACKAGE_07") {
    if (!isNonEmptyString(row.discovered_by_source_family)) {
      errors.push(
        "provenance NEW_IN_PACKAGE_07 requires discovered_by_source_family naming the sweep that found it",
      );
    }
    if (row.predecessor_research_id != null) {
      errors.push("provenance NEW_IN_PACKAGE_07 cannot carry a predecessor_research_id");
    }
  } else if (row.predecessor_research_id == null) {
    errors.push(`provenance ${row.provenance} requires a predecessor_research_id`);
  }

  // --- every shared rule, checked by Package 06's own validator ---------
  for (const error of validateCensus06Row(projectToPredecessorShape(row))) {
    // The projection normalises the id namespaces, so an id-pattern error
    // from the predecessor validator would be an artifact of projecting,
    // not a real defect. Package 07's own id checks above cover that
    // ground, so those two messages are the only ones filtered.
    if (error.includes("research_id") && error.includes("must match")) continue;
    errors.push(error);
  }

  return errors;
}

/**
 * Validate a whole Package 07 corpus, plus the cross-row invariants a
 * single row cannot see: research_id uniqueness, and predecessor
 * uniqueness — a predecessor row must map to exactly one successor.
 */
export function validateCensus07(rows) {
  if (!Array.isArray(rows)) return ["census must be an array of rows"];

  const errors = [];
  const seen = new Map();
  const seenPredecessor = new Map();

  rows.forEach((row, index) => {
    for (const error of validateCensus07Row(row)) {
      errors.push(`row[${index}] (${row?.research_id ?? "no id"}): ${error}`);
    }
    const id = row?.research_id;
    if (isNonEmptyString(id)) {
      if (seen.has(id)) errors.push(`duplicate research_id "${id}" at rows ${seen.get(id)} and ${index}`);
      else seen.set(id, index);
    }
    const pid = row?.predecessor_research_id;
    if (isNonEmptyString(pid)) {
      if (seenPredecessor.has(pid)) {
        errors.push(
          `predecessor_research_id "${pid}" is claimed by more than one Package 07 row (rows ${seenPredecessor.get(pid)} and ${index})`,
        );
      } else {
        seenPredecessor.set(pid, index);
      }
    }
  });

  return errors;
}

/**
 * Prove every Package 06 row has exactly one disposition here.
 */
export function reconcileAgainstPredecessor(predecessorRows, rows) {
  const errors = [];
  const claimed = new Set(
    rows.map((r) => r.predecessor_research_id).filter((v) => isNonEmptyString(v)),
  );
  const predecessorIds = new Set(predecessorRows.map((r) => r.research_id));

  const missing = [...predecessorIds].filter((id) => !claimed.has(id));
  for (const id of missing.slice(0, 25)) {
    errors.push(`predecessor row "${id}" has no disposition in the Package 07 corpus`);
  }
  if (missing.length > 25) {
    errors.push(`... and ${missing.length - 25} further predecessor rows with no disposition`);
  }
  for (const id of [...claimed].filter((id) => !predecessorIds.has(id)).slice(0, 25)) {
    errors.push(`Package 07 row claims predecessor "${id}" which does not exist in Package 06`);
  }

  return errors;
}

/**
 * Validate the STADIUM source-estate audit.
 *
 * This is the whole point of the package, so it is checked mechanically
 * rather than trusted: all 8 predecessor STADIUM rows must appear, each
 * must name the source family that covers it, and the three formerly
 * uncovered rows must now genuinely be covered.
 */
export function validateStadiumAudit(audit) {
  const errors = [];
  if (!Array.isArray(audit)) return ["stadium audit must be an array"];

  const byRow = new Map();
  for (const entry of audit) {
    if (!isPlainObject(entry)) {
      errors.push("stadium audit entry must be an object");
      continue;
    }
    if (!isNonEmptyString(entry.predecessor_research_id)) {
      errors.push("stadium audit entry must name the predecessor_research_id it covers");
      continue;
    }
    byRow.set(entry.predecessor_research_id, entry);
  }

  for (const id of PREDECESSOR_STADIUM_ROWS) {
    const entry = byRow.get(id);
    if (!entry) {
      errors.push(`stadium audit is missing Package 06 STADIUM row "${id}"`);
      continue;
    }
    if (!isNonEmptyString(entry.source_family)) {
      errors.push(`stadium audit entry "${id}" does not name the source family that covers it`);
    }
    if (typeof entry.covered !== "boolean") {
      errors.push(`stadium audit entry "${id}" must state covered: true|false`);
    }
    if (entry.covered === true && !Array.isArray(entry.evidence)) {
      errors.push(`stadium audit entry "${id}" claims coverage with no evidence array`);
    }
    if (entry.covered === true && Array.isArray(entry.evidence) && entry.evidence.length === 0) {
      errors.push(`stadium audit entry "${id}" claims coverage with empty evidence`);
    }
  }

  const extra = [...byRow.keys()].filter((id) => !PREDECESSOR_STADIUM_ROWS.includes(id));
  for (const id of extra) {
    errors.push(`stadium audit covers "${id}" which is not a Package 06 STADIUM row`);
  }

  return errors;
}

/**
 * Decide whether the census may claim COMPLETE.
 *
 * Deliberately harder to satisfy than "every class has a state". Three
 * things must all hold, and each is checked against machine-readable
 * evidence rather than a report:
 *
 *   1. every venue class is COMPLETE or MATERIAL_COMPLETE;
 *   2. both required source-family sweeps were actually run;
 *   3. all 8 predecessor STADIUM rows are covered, including the 3 that
 *      were the reason this package exists.
 */
export function assessFinalCompleteness({ coverageMatrix, sweepsRun, stadiumAudit }) {
  const blocking = [];

  if (!Array.isArray(coverageMatrix) || coverageMatrix.length === 0) {
    blocking.push("no coverage matrix");
  } else {
    for (const entry of coverageMatrix) {
      if (!COMPLETE_ENOUGH_COVERAGE_STATES.includes(entry?.final_coverage)) {
        blocking.push(
          `venue class ${entry?.venue_class ?? "(unnamed)"} is ${entry?.final_coverage ?? "unrecorded"}`,
        );
      }
    }
  }

  const ranSweeps = new Set(Array.isArray(sweepsRun) ? sweepsRun : []);
  for (const sweep of REQUIRED_SOURCE_FAMILY_SWEEPS) {
    if (!ranSweeps.has(sweep.id)) {
      blocking.push(`required source-family sweep ${sweep.id} was not run`);
    }
  }

  const covered = new Set(
    (Array.isArray(stadiumAudit) ? stadiumAudit : [])
      .filter((e) => e?.covered === true)
      .map((e) => e.predecessor_research_id),
  );
  for (const id of PREDECESSOR_STADIUM_ROWS) {
    if (!covered.has(id)) {
      blocking.push(`Package 06 STADIUM row ${id} is still not covered by a source-family audit`);
    }
  }

  return { verdict: blocking.length === 0 ? "COMPLETE" : "PARTIAL", blocking };
}
