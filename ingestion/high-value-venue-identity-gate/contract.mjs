// UK high-value venue estate — identity gate contract
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-IDENTITY-GATE-08).
//
// Package 07 closed the COVERAGE phase: 800 confirmed permanent UK venues of
// >=1,000 capacity, of which 259 are already canonical, 524 are definitely
// missing, and 17 have ambiguous canonical identity. It also carried forward
// one known intra-corpus duplicate pair (Anglesey Showground).
//
// This package closes the IDENTITY gate and produces the admission-ready
// population. It admits nothing.
//
// WHY IDENTITY IS ITS OWN GATE
// ----------------------------
// A venue held back is safe: the next package can revisit it. A venue
// wrongly admitted creates a canonical duplicate, or a canonical record
// carrying another venue's capacity and programme source. That is
// materially harder to undo than to avoid, so every rule below fails
// towards holding rather than admitting.
//
// The concrete risk is not hypothetical. Several Package 07 rows inherited
// an earlier census's merge of two separately-researched records on a
// shared ALTERNATIVE NAME — producing rows whose own capacity source and
// programme URL point at a different venue from the one they are named
// after. Admitting those blindly would mint canonical venues with the
// wrong capacity and the wrong source.
//
// Packages 05, 06 and 07 are IMMUTABLE predecessor snapshots. This module
// and its builder read them and never write to them.
//
// Dependency-free, venue-agnostic, no I/O, no network.

export const IDENTITY_GATE_FRAMEWORK_VERSION = "BOTM-UK-HIGH-VALUE-IDENTITY-GATE-v1.0";

export const PREDECESSOR_PACKAGE = "BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07";
export const PREDECESSOR_MAIN_SHA = "bc23305b8a6b24a27d0fc84407bac1d16fde55aa";
export const PREDECESSOR_CENSUS_DIR = "research/high-value-venue-estate/uk-1000plus-07";
export const IMMUTABLE_PREDECESSOR_DIRS = Object.freeze([
  "research/high-value-venue-estate/uk-1000plus-05",
  "research/high-value-venue-estate/uk-1000plus-06",
  "research/high-value-venue-estate/uk-1000plus-07",
]);

export const HIGH_VALUE_CAPACITY_THRESHOLD = 1000;

// The predecessor population this package must account for, in full.
export const PREDECESSOR_CONFIRMED_ROWS = 800;
export const PREDECESSOR_REPRESENTED = 259;
export const PREDECESSOR_MISSING = 524;
export const PREDECESSOR_IDENTITY_REVIEW = 17;

// --- the per-row identity decision -------------------------------------
export const IDENTITY_DECISIONS = Object.freeze([
  "MATCHES_EXISTING_CANONICAL",
  "DISTINCT_AND_MISSING_FROM_CANON",
  "SAME_VENUE_AS_OTHER_RESEARCH_ROW",
  "CANONICAL_DUPLICATE_REQUIRES_GOVERNANCE",
  "AMBIGUOUS_HOLD",
  "RESEARCH_BLOCKED",
]);

// --- the estate-wide disposition every confirmed row receives -----------
export const ESTATE_DISPOSITIONS = Object.freeze([
  "REPRESENTED_IN_CANON",
  "ADMISSION_READY_MISSING",
  "DUPLICATE_OF_RESEARCH_ENTITY",
  "CANONICAL_GOVERNANCE_HOLD",
  "AMBIGUOUS_HOLD",
  "RESEARCH_BLOCKED",
]);

// Only this disposition may enter admission-ready. Everything else is a
// hold, and a hold is the safe direction.
export const ADMISSION_READY_DISPOSITION = "ADMISSION_READY_MISSING";

// Dispositions that keep a venue OUT of automatic admission.
export const HOLD_DISPOSITIONS = Object.freeze([
  "CANONICAL_GOVERNANCE_HOLD",
  "AMBIGUOUS_HOLD",
  "RESEARCH_BLOCKED",
]);

export const MATCH_CONFIDENCES = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

export const EVIDENCE_KINDS = Object.freeze([
  "FETCHED_URL",
  "SEARCH_RESULT",
  "COMMITTED_RESEARCH_ARTIFACT",
  "CANONICAL_REGISTRY",
  "DETERMINISTIC_DERIVATION",
  "PREDECESSOR_CENSUS",
]);

// A decision that a venue IS already canonical, or that two research rows
// are one venue, is the kind of claim that creates a duplicate if wrong.
// These require real-world identity evidence, not name similarity.
export const DECISIONS_REQUIRING_STRONG_EVIDENCE = Object.freeze([
  "MATCHES_EXISTING_CANONICAL",
  "SAME_VENUE_AS_OTHER_RESEARCH_ROW",
  "CANONICAL_DUPLICATE_REQUIRES_GOVERNANCE",
]);

const UNIQUE_ENTITY_ID_PATTERN = /^HVUK-[a-z0-9-]+$/;
const PREDECESSOR_ID_PATTERN = /^hv07-[a-z0-9-]+$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateEvidenceArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    const where = `${label}[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (!isValidUrl(item.url)) errors.push(`${where}.url must be an http(s) URL`);
    if (!EVIDENCE_KINDS.includes(item.kind)) {
      errors.push(`${where}.kind "${item.kind}" is not a known evidence kind`);
    }
    if (!isNonEmptyString(item.note)) {
      errors.push(`${where}.note must say what this evidence actually showed`);
    }
  });
}

/**
 * Validate one identity decision about one reviewed row.
 *
 * The asymmetry here is deliberate. A decision to HOLD needs only a stated
 * reason — holding is safe. A decision that creates or suppresses a
 * canonical identity needs cited evidence, because that is the decision
 * that can put a duplicate into the canonical estate.
 */
export function validateIdentityDecision(decision) {
  if (!isPlainObject(decision)) return ["identity decision must be an object"];
  const errors = [];

  if (!isNonEmptyString(decision.research_id)) {
    errors.push("research_id must be a non-empty string");
  } else if (!PREDECESSOR_ID_PATTERN.test(decision.research_id)) {
    errors.push(`research_id "${decision.research_id}" must be a Package 07 id`);
  }

  if (!IDENTITY_DECISIONS.includes(decision.decision)) {
    errors.push(`decision "${decision.decision}" is not a known identity decision`);
  }

  if (!isNonEmptyString(decision.reasoning)) {
    errors.push("reasoning must state why this decision and not the alternatives");
  }

  validateEvidenceArray(decision.evidence, "evidence", errors);
  if (errors.length > 0) return errors;

  const evidence = decision.evidence;

  // --- a match claim must name what it matched ------------------------
  if (decision.decision === "MATCHES_EXISTING_CANONICAL") {
    if (!isNonEmptyString(decision.canonical_venue_id)) {
      errors.push("MATCHES_EXISTING_CANONICAL requires a canonical_venue_id");
    }
    if (evidence.length === 0) {
      errors.push(
        "MATCHES_EXISTING_CANONICAL requires evidence — declaring a venue already canonical on name similarity alone is how duplicates are created",
      );
    }
    if (decision.match_confidence === "LOW") {
      errors.push(
        "MATCHES_EXISTING_CANONICAL cannot rest on LOW confidence — hold it instead",
      );
    }
  } else if (isNonEmptyString(decision.canonical_venue_id)) {
    // Only a match (or a governance hold naming the duplicate pair) may
    // carry a canonical id.
    if (decision.decision !== "CANONICAL_DUPLICATE_REQUIRES_GOVERNANCE") {
      errors.push(
        `decision ${decision.decision} cannot carry a canonical_venue_id`,
      );
    }
  }

  // --- a same-venue claim must name the other row ---------------------
  if (decision.decision === "SAME_VENUE_AS_OTHER_RESEARCH_ROW") {
    if (!isNonEmptyString(decision.other_research_id)) {
      errors.push("SAME_VENUE_AS_OTHER_RESEARCH_ROW requires other_research_id");
    } else if (decision.other_research_id === decision.research_id) {
      errors.push("SAME_VENUE_AS_OTHER_RESEARCH_ROW cannot point at itself");
    }
    if (evidence.length === 0) {
      errors.push("SAME_VENUE_AS_OTHER_RESEARCH_ROW requires evidence");
    }
  } else if (isNonEmptyString(decision.other_research_id)) {
    errors.push(`decision ${decision.decision} cannot carry an other_research_id`);
  }

  // --- strong-evidence decisions ---------------------------------------
  if (DECISIONS_REQUIRING_STRONG_EVIDENCE.includes(decision.decision)) {
    if (!MATCH_CONFIDENCES.includes(decision.match_confidence)) {
      errors.push(`decision ${decision.decision} requires a match_confidence`);
    }
    if (evidence.length === 0) {
      errors.push(`decision ${decision.decision} requires cited evidence`);
    }
  }

  // --- declaring a venue distinct and missing is also a claim ---------
  // It is the claim that puts a venue INTO admission, so it needs support
  // that somebody actually looked at the canonical estate.
  if (decision.decision === "DISTINCT_AND_MISSING_FROM_CANON" && evidence.length === 0) {
    errors.push(
      "DISTINCT_AND_MISSING_FROM_CANON requires evidence — this is the decision that admits a venue",
    );
  }

  // --- a blocked decision may not assert anything ----------------------
  if (decision.decision === "RESEARCH_BLOCKED") {
    if (isNonEmptyString(decision.canonical_venue_id) || isNonEmptyString(decision.other_research_id)) {
      errors.push("RESEARCH_BLOCKED cannot assert a canonical or same-venue relationship");
    }
  }

  return errors;
}

/**
 * Validate one unique-entity record — a distinct real-world venue, which
 * may be represented by more than one Package 07 research row.
 */
export function validateUniqueEntity(entity) {
  if (!isPlainObject(entity)) return ["unique entity must be an object"];
  const errors = [];

  if (!isNonEmptyString(entity.unique_entity_id)) {
    errors.push("unique_entity_id must be a non-empty string");
  } else if (!UNIQUE_ENTITY_ID_PATTERN.test(entity.unique_entity_id)) {
    errors.push(`unique_entity_id "${entity.unique_entity_id}" must match ${UNIQUE_ENTITY_ID_PATTERN}`);
  }

  if (!Array.isArray(entity.package07_research_ids) || entity.package07_research_ids.length === 0) {
    errors.push("package07_research_ids must be a non-empty array");
  } else {
    for (const id of entity.package07_research_ids) {
      if (!isNonEmptyString(id) || !PREDECESSOR_ID_PATTERN.test(id)) {
        errors.push(`package07_research_ids entry "${id}" is not a Package 07 id`);
      }
    }
  }

  if (!isNonEmptyString(entity.canonical_name_candidate)) {
    errors.push("canonical_name_candidate must be a non-empty string");
  }
  if (!Array.isArray(entity.aliases)) errors.push("aliases must be an array");
  if (!isNonEmptyString(entity.venue_class)) errors.push("venue_class must be a non-empty string");
  if (!ESTATE_DISPOSITIONS.includes(entity.disposition)) {
    errors.push(`disposition "${entity.disposition}" is not a known estate disposition`);
  }
  validateEvidenceArray(entity.identity_evidence, "identity_evidence", errors);
  if (errors.length > 0) return errors;

  // Every entity asserts a venue exists.
  if (entity.identity_evidence.length === 0) {
    errors.push("identity_evidence must be non-empty");
  }

  // A represented entity must name the canonical venue it is represented by.
  if (entity.disposition === "REPRESENTED_IN_CANON" && !isNonEmptyString(entity.canonical_venue_id)) {
    errors.push("REPRESENTED_IN_CANON requires a canonical_venue_id");
  }
  // An admission-ready entity must NOT already be canonical.
  if (entity.disposition === ADMISSION_READY_DISPOSITION && isNonEmptyString(entity.canonical_venue_id)) {
    errors.push("ADMISSION_READY_MISSING cannot carry a canonical_venue_id — it would already be canonical");
  }

  return errors;
}

/**
 * Validate one admission-ready row.
 *
 * This is the file the next package will act on, so the bar is the
 * highest in the corpus: enough identity evidence that a later admission
 * can be deterministic rather than a blind mint.
 */
export function validateAdmissionReadyRow(row) {
  if (!isPlainObject(row)) return ["admission-ready row must be an object"];
  const errors = [];

  const required = [
    "unique_entity_id", "package07_research_ids", "canonical_name_candidate",
    "aliases", "venue_class", "locality", "nation", "capacity_max",
    "capacity_evidence_ref", "identity_evidence", "package07_provenance",
  ];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      errors.push(`admission-ready row is missing required key "${key}"`);
    }
  }
  if (errors.length > 0) return errors;

  if (!UNIQUE_ENTITY_ID_PATTERN.test(row.unique_entity_id ?? "")) {
    errors.push(`unique_entity_id "${row.unique_entity_id}" must match ${UNIQUE_ENTITY_ID_PATTERN}`);
  }
  if (!Array.isArray(row.package07_research_ids) || row.package07_research_ids.length === 0) {
    errors.push("package07_research_ids must be a non-empty array");
  }
  if (!isNonEmptyString(row.canonical_name_candidate)) {
    errors.push("canonical_name_candidate must be a non-empty string");
  }
  if (typeof row.capacity_max !== "number" || !Number.isInteger(row.capacity_max)) {
    errors.push("capacity_max must be an integer");
  } else if (row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
    errors.push(
      `admission-ready capacity_max ${row.capacity_max} is below the ${HIGH_VALUE_CAPACITY_THRESHOLD} threshold`,
    );
  }
  if (!isNonEmptyString(row.capacity_evidence_ref)) {
    errors.push("capacity_evidence_ref must cite where the capacity was established");
  }
  validateEvidenceArray(row.identity_evidence, "identity_evidence", errors);
  if (errors.length === 0 && row.identity_evidence.length === 0) {
    errors.push(
      "admission-ready row requires identity_evidence — this file is the input to admission and must not permit a blind mint",
    );
  }
  if (isNonEmptyString(row.canonical_venue_id)) {
    errors.push("an admission-ready row cannot carry a canonical_venue_id — it would already be canonical");
  }

  return errors;
}

/**
 * Whole-corpus validation, plus the cross-row invariants a single row
 * cannot see.
 */
export function validateIdentityGate({ decisions, entities, admissionReady }) {
  const errors = [];

  const seenDecision = new Map();
  (Array.isArray(decisions) ? decisions : []).forEach((d, i) => {
    for (const e of validateIdentityDecision(d)) {
      errors.push(`decision[${i}] (${d?.research_id ?? "no id"}): ${e}`);
    }
    if (isNonEmptyString(d?.research_id)) {
      if (seenDecision.has(d.research_id)) {
        errors.push(`row "${d.research_id}" has more than one identity decision (at ${seenDecision.get(d.research_id)} and ${i})`);
      } else {
        seenDecision.set(d.research_id, i);
      }
    }
  });

  const seenEntity = new Map();
  const seenResearchId = new Map();
  (Array.isArray(entities) ? entities : []).forEach((entity, i) => {
    for (const e of validateUniqueEntity(entity)) {
      errors.push(`entity[${i}] (${entity?.unique_entity_id ?? "no id"}): ${e}`);
    }
    const id = entity?.unique_entity_id;
    if (isNonEmptyString(id)) {
      if (seenEntity.has(id)) errors.push(`duplicate unique_entity_id "${id}"`);
      else seenEntity.set(id, i);
    }
    // A Package 07 row may belong to exactly one unique entity.
    for (const rid of Array.isArray(entity?.package07_research_ids) ? entity.package07_research_ids : []) {
      if (seenResearchId.has(rid)) {
        errors.push(
          `Package 07 row "${rid}" is claimed by more than one unique entity (${seenResearchId.get(rid)} and ${id})`,
        );
      } else {
        seenResearchId.set(rid, id);
      }
    }
  });

  const seenAdmission = new Set();
  (Array.isArray(admissionReady) ? admissionReady : []).forEach((row, i) => {
    for (const e of validateAdmissionReadyRow(row)) {
      errors.push(`admission[${i}] (${row?.unique_entity_id ?? "no id"}): ${e}`);
    }
    const id = row?.unique_entity_id;
    if (isNonEmptyString(id)) {
      if (seenAdmission.has(id)) {
        errors.push(`unique_entity_id "${id}" appears more than once in admission-ready — that is a duplicate admission`);
      }
      seenAdmission.add(id);
      const entity = (Array.isArray(entities) ? entities : []).find((e) => e.unique_entity_id === id);
      if (!entity) {
        errors.push(`admission-ready row "${id}" has no matching unique entity`);
      } else if (entity.disposition !== ADMISSION_READY_DISPOSITION) {
        errors.push(
          `admission-ready row "${id}" has disposition ${entity.disposition} — only ${ADMISSION_READY_DISPOSITION} may be admitted`,
        );
      }
    }
  });

  return errors;
}

/**
 * Prove every Package 07 confirmed row has exactly one disposition here.
 */
export function reconcileConfirmedRows(predecessorConfirmedIds, entities) {
  const errors = [];
  const claimed = new Map();
  for (const entity of entities) {
    for (const id of entity.package07_research_ids ?? []) claimed.set(id, entity.unique_entity_id);
  }

  const missing = predecessorConfirmedIds.filter((id) => !claimed.has(id));
  for (const id of missing.slice(0, 25)) {
    errors.push(`Package 07 confirmed row "${id}" has no Package 08 identity disposition`);
  }
  if (missing.length > 25) {
    errors.push(`... and ${missing.length - 25} further confirmed rows with no disposition`);
  }

  const known = new Set(predecessorConfirmedIds);
  for (const id of [...claimed.keys()].filter((id) => !known.has(id)).slice(0, 25)) {
    errors.push(`Package 08 entity claims row "${id}" which is not a Package 07 confirmed row`);
  }

  return errors;
}

/**
 * The estate arithmetic must close exactly.
 */
export function assertEstateArithmetic(counts) {
  const errors = [];
  const {
    final_unique_confirmed, represented_in_canon, admission_ready,
    canonical_governance_hold, ambiguous_hold, research_blocked,
  } = counts;

  const sum = represented_in_canon + admission_ready + canonical_governance_hold +
    ambiguous_hold + research_blocked;
  if (sum !== final_unique_confirmed) {
    errors.push(
      `estate arithmetic does not close: represented ${represented_in_canon} + admission-ready ${admission_ready} + governance hold ${canonical_governance_hold} + ambiguous hold ${ambiguous_hold} + blocked ${research_blocked} = ${sum}, but the final unique estate is ${final_unique_confirmed}`,
    );
  }
  return errors;
}
