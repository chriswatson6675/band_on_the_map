// Governed AI Source Investigation contract (BOTM-SOURCE-INVESTIGATION-
// GOVERNANCE-01, extended by -01A/-01B/BOTM-GIG-FACT-DERIVATION-
// GOVERNANCE-02). Defines the durable shape of one source-investigation
// record and its self-contained structural/business-rule validation.
//
// See docs/SOURCE_INVESTIGATION_POLICY.md for the human-readable policy
// this contract implements — this module is the machine-checkable
// expression of that policy, not the policy itself.
//
// Deliberately dependency-free and venue/source-agnostic, matching
// ingestion/observation/contract.mjs and sources/registry/validate.mjs.
// This module performs no I/O, makes no network requests, and never
// references a specific venue or source by name. The fs-aware layer (does
// a referenced evidence file actually exist on disk?) lives in
// ./validate.mjs, not here.
//
// An investigation record is a DECISION about how a candidate source may
// be acquired, not the acquisition itself. Reaching decision.status ===
// "READY_FOR_ACTIVATION" here never enables a collector or updates
// sources/*.json — see "Investigation vs activation" in the policy doc.
//
// --- Policy versions this module validates ---
//
// BOTM-SOURCE-INVESTIGATION-v1.1 (validateInvestigationV1_1): the original
// rule set from GOVERNANCE-01/-01A/-01B. field_assessment entries are
// {state, value, notes, evidence_refs} — a PROVEN value needs no separate
// provenance field. Kept intact, byte-for-byte in spirit, so historical
// v1.1 records (including the three real BOTM-DIFFICULT-SOURCE-TRIAL-01
// investigations) are NEVER reinterpreted under newer rules.
//
// BOTM-SOURCE-INVESTIGATION-v1.2 (validateInvestigationV1_2): adds a
// controlled basis/derivation model to field_assessment entries — see
// "Field-value basis (v1.2)" below and docs/SOURCE_INVESTIGATION_POLICY.md.
// Everything else (probe_history, evidence, identity, site_classification,
// data_paths, collector_assessment, decision) is unchanged from v1.1.
//
// validateInvestigation(record) is the public entry point: it dispatches
// on record.policy_version to the correct version-specific function. It
// NEVER falls through to reinterpreting one version's record under
// another version's rules.

export const POLICY_VERSION_V1_1 = "BOTM-SOURCE-INVESTIGATION-v1.1";
export const POLICY_VERSION_V1_2 = "BOTM-SOURCE-INVESTIGATION-v1.2";

// Historical alias: this has pointed at v1.1 since GOVERNANCE-01, and
// existing tests/fixtures already assert that literal value — it is NOT
// repointed at v1.2 by introducing v1.2 (that would itself be exactly the
// kind of silent reinterpretation this policy prohibits). New v1.2 code
// should reference POLICY_VERSION_V1_2 explicitly rather than assume this
// constant means "the latest version".
export const POLICY_VERSION = POLICY_VERSION_V1_1;

// The shape a policy_version string must have to even be considered —
// used only to distinguish a malformed value from a well-formed-but-
// unsupported one in the error message below. Matching this shape does
// NOT mean the version is accepted; see SUPPORTED_POLICY_VERSIONS.
const POLICY_VERSION_PATTERN = /^BOTM-SOURCE-INVESTIGATION-v\d+\.\d+$/;

// The policy version(s) THIS validator implementation actually knows how
// to validate. Historical policy versions are intended to remain durable
// (an old investigation.json is never rewritten just because the policy
// moved on — see docs/SOURCE_INVESTIGATION_POLICY.md's "Policy
// versioning" and "History and supersession" sections), but durability of
// the *record* is not the same thing as this module being able to
// re-validate it under its own original rules. A record declaring any
// other policy_version — including a well-formed one this module simply
// doesn't implement yet — fails closed: it is NEVER silently reinterpreted
// under a different version's semantics.
//
// Introducing support for a new version beyond v1.2 requires deliberate,
// explicit work here: a new version-specific validation function, added to
// this Set, and covered by its own tests — never just widening
// POLICY_VERSION_PATTERN or this Set without that work.
export const SUPPORTED_POLICY_VERSIONS = new Set([POLICY_VERSION_V1_1, POLICY_VERSION_V1_2]);

export const INVESTIGATOR_TYPES = new Set(["AI", "HUMAN", "AI_WITH_HUMAN_REVIEW"]);

export const CONFIDENCE_LEVELS = new Set(["HIGH", "MEDIUM", "LOW", "NONE"]);

// Shared across identity.status and every field_assessment.* entry.
// UNKNOWN is a legitimate, first-class outcome — never collapsed into
// NOT_PRESENT (the source genuinely lacks the fact) or treated as failure.
export const FIELD_STATES = new Set(["PROVEN", "PARTIAL", "AMBIGUOUS", "NOT_PRESENT", "UNKNOWN"]);

// Site/acquisition classification vocabulary. This is investigation
// classification, not a list of implemented collectors — see
// COLLECTOR_FAMILIES below for that separate concept.
export const ACQUISITION_CLASSES = new Set([
  "ICS",
  "RSS",
  "JSON_LD_EVENT",
  "STATIC_HTML",
  "EMBEDDED_JSON",
  "PUBLIC_JSON_API",
  "WORDPRESS",
  "KNOWN_CALENDAR_PLUGIN",
  "CLIENT_RENDERED",
  "SPA_API_DISCOVERABLE",
  "HEADLESS_REQUIRED",
  "SOCIAL_ONLY",
  "TICKETING_ONLY",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "UNKNOWN",
]);

// Acquisition classes that, by definition, cannot support
// READY_FOR_ACTIVATION: no usable public acquisition path has actually
// been established yet.
const ACQUISITION_CLASSES_BLOCKING_ACTIVATION = new Set(["UNKNOWN", "AMBIGUOUS", "UNSUPPORTED"]);

export const DATA_PATH_ACCESS = new Set(["PUBLIC", "PRIVATE", "UNKNOWN"]);

export const DATA_PATH_STATUSES = new Set(["CANDIDATE", "CONFIRMED", "REJECTED", "UNKNOWN"]);

// Minimum field-assessment keys every investigation must address (each may
// honestly resolve to NOT_PRESENT or UNKNOWN — the key must still be
// present so the assessment is seen to have been considered).
export const FIELD_ASSESSMENT_KEYS = Object.freeze([
  "title",
  "start_date",
  "time",
  "end",
  "venue_location",
  "source_record_id",
  "event_url",
]);

// Optional field-assessment keys: present only when the source genuinely
// exposes the concept. Absence must never block validation.
export const OPTIONAL_FIELD_ASSESSMENT_KEYS = Object.freeze(["price"]);

export const ALL_FIELD_ASSESSMENT_KEYS = Object.freeze([
  ...FIELD_ASSESSMENT_KEYS,
  ...OPTIONAL_FIELD_ASSESSMENT_KEYS,
]);

// Reusable collector families a future implementation may recognise. This
// package documents the concept and lets an investigation cite one (or
// say a new family is required) — it implements none of them.
export const COLLECTOR_FAMILIES = new Set([
  "ICS_CALENDAR",
  "JSON_LD",
  "JSON_API",
  "STATIC_EVENT_LIST",
  "STABLE_EVENT_PAGE",
  "WORDPRESS_CALENDAR",
  "EVENTON",
  "SQUARESPACE_ICS",
  "BROWSER_RENDERED",
]);

// Sentinel recommended_family value meaning "no existing family fits" —
// an honest outcome, not a failure to classify.
export const NEW_FAMILY_REQUIRED = "NEW_FAMILY_REQUIRED";

export const BLOCKER_SEVERITIES = new Set(["CRITICAL", "MAJOR", "MINOR"]);

// Tightly-controlled decision vocabulary. DEFER is a legitimate, complete
// investigation outcome — never a failure state to be avoided.
export const DECISION_STATUSES = new Set([
  "READY_FOR_OFFLINE_PROOF",
  "READY_FOR_ACTIVATION",
  "DEFER",
  "HUMAN_REVIEW",
  "REJECT",
]);

const DECISIONS_REQUIRING_REASONS = new Set(["DEFER", "HUMAN_REVIEW", "REJECT"]);

// The escalation ladder (docs/SOURCE_INVESTIGATION_POLICY.md's "Escalation
// ladder" section), machine-recorded via probe_history[]. Level -> the one
// method name that level must carry; strictly sequential, never skippable.
// DEFER is deliberately not represented here — it is a decision.status
// outcome, not a probe level (see "DEFER behaviour" below). Unchanged by
// v1.2 — the escalation ladder is not part of what this task revises.
export const PROBE_LEVEL_METHODS = new Map([
  [1, "PASSIVE_STATIC"],
  [2, "STRUCTURAL"],
  [3, "BROWSER_OBSERVATION"],
  [4, "BROWSER_COLLECTOR_CANDIDATE"],
]);

export const PROBE_METHODS = new Set(PROBE_LEVEL_METHODS.values());

// SUFFICIENT/BLOCKED both terminate escalation — no probe_history entry may
// follow one. Only INSUFFICIENT justifies moving to the next level.
export const PROBE_OUTCOMES = new Set(["SUFFICIENT", "INSUFFICIENT", "BLOCKED"]);
const PROBE_OUTCOMES_TERMINATING_ESCALATION = new Set(["SUFFICIENT", "BLOCKED"]);

// Evidence provenance classes. AI_INTERPRETATION must never be usable as
// (or claim to be) DIRECT_EVIDENCE — enforced below, not just by naming.
// Unchanged by v1.2 — do not confuse this (how a piece of *evidence* was
// obtained) with FIELD_BASIS_VALUES below (how a field's *precise value*
// was established from that evidence). See docs/SOURCE_INVESTIGATION_POLICY.md's
// "Evidence class vs. field-value basis" section.
export const EVIDENCE_CLASSES = new Set([
  "DIRECT_EVIDENCE",
  "DETERMINISTIC_DERIVATION",
  "AI_INTERPRETATION",
  "OPERATOR_DECISION",
]);

// --- Field-value basis (v1.2 only — BOTM-GIG-FACT-DERIVATION-GOVERNANCE-02) ---
//
// How a PROVEN field's precise value was established. Required whenever
// state is PROVEN under v1.2; must be null otherwise (see
// validateAssessmentEntryV1_2 below).
//
//   DIRECT_SOURCE         the exact value is directly expressed by one
//                         piece of retained first-party evidence (e.g. a
//                         JSON-LD startDate already carrying the full date).
//
//   DETERMINISTIC_CONTEXT the value is not fully repeated in the field's
//                         own immediate location, but is mechanically,
//                         reproducibly combined from >=2 retained pieces
//                         of first-party context (e.g. a page heading
//                         stating "September 2026" plus a card stating
//                         "17"). Requires a `derivation` object — see
//                         below. Never AI plausibility dressed up as
//                         mechanical combination.
//
//   AI_INFERENCE          the value depends on plausibility, common sense,
//                         prediction, or model judgement (e.g. "today is
//                         August, the card says 17 September, so it's
//                         probably this September"). A member of this Set
//                         purely so the validator can name it in a
//                         specific rejection message — AI_INFERENCE can
//                         never legally appear as the basis of a PROVEN
//                         field (see PROVEN_ALLOWED_BASES). A fact that
//                         only has this basis stays PARTIAL, AMBIGUOUS, or
//                         UNKNOWN.
export const FIELD_BASIS_VALUES = new Set(["DIRECT_SOURCE", "DETERMINISTIC_CONTEXT", "AI_INFERENCE"]);

// Bases that may legitimately support a PROVEN field. AI_INFERENCE is
// deliberately excluded — see FIELD_BASIS_VALUES above.
const PROVEN_ALLOWED_BASES = new Set(["DIRECT_SOURCE", "DETERMINISTIC_CONTEXT"]);

// Best-effort, mechanical safety net (NOT a substitute for genuine
// investigator discipline — see docs/SOURCE_INVESTIGATION_POLICY.md's
// "The anti-guessing rule is mechanically limited" section). A
// DETERMINISTIC_CONTEXT derivation.rule containing one of these
// case-insensitive substrings reads as plausibility/prediction rather
// than a mechanical combination rule, and is rejected outright. A rule
// text that smuggles in hidden inference while avoiding all of these
// words is a policy violation this module cannot detect — the same
// honest limitation this framework already has for, e.g., verifying that
// a site genuinely is a candidate's first-party official presence.
const FORBIDDEN_DERIVATION_PHRASES = [
  "today",
  "current date",
  "right now",
  "as of now",
  "presently",
  "probably",
  "most likely",
  "likely",
  "presumably",
  "assume",
  "assuming",
  "guess",
  "guessing",
  "usually",
  "typically",
  "obvious",
  "obviously",
  "common sense",
  "seems",
  "appears to be",
  "probable",
  "predict",
];

// The only repository location authoritative investigation evidence may
// live under. Anything else — a scratchpad, an OS temp directory, a build
// output, an untracked local file — fails isGovernedEvidencePath() below,
// regardless of how it is spelled.
export const GOVERNED_EVIDENCE_ROOT = "research/source-investigations/";

const FORBIDDEN_PATH_SEGMENTS = [
  "scratchpad/",
  "scratch/",
  "tmp/",
  "temp/",
  "node_modules/",
  ".next/",
  "build/",
  "out/",
  "dist/",
  ".git/",
  "appdata/local/temp",
  "var/folders/",
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isParseableTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isValidUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * True only for a safe, governed, repo-relative evidence path: it must
 * live under GOVERNED_EVIDENCE_ROOT, contain no ".." traversal, not be
 * absolute (no leading slash, no drive letter), and not match any known
 * scratch/temp/build-output/OS-temp segment. This is a naming-convention
 * check — it says nothing about whether the file actually exists; see
 * validateEvidenceFilesExist() in ./validate.mjs for that.
 */
export function isGovernedEvidencePath(path) {
  if (typeof path !== "string" || path.trim() === "") return false;
  const normalised = path.trim().replace(/\\/g, "/").toLowerCase();

  if (normalised.startsWith("/") || /^[a-z]:\//.test(normalised)) return false;
  if (normalised.includes("..")) return false;
  if (!normalised.startsWith(GOVERNED_EVIDENCE_ROOT)) return false;
  if (FORBIDDEN_PATH_SEGMENTS.some((segment) => normalised.includes(segment))) return false;

  return true;
}

/** An empty, honestly-unresolved field-assessment entry (v1.1 shape). */
export function emptyAssessmentEntry() {
  return { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] };
}

/** An empty, honestly-unresolved field-assessment entry (v1.2 shape). */
export function emptyAssessmentEntryV1_2() {
  return { state: "UNKNOWN", value: null, basis: null, derivation: null, notes: null, evidence_refs: [] };
}

/** An empty, honestly-unresolved identity block. */
export function emptyIdentity() {
  return { status: "UNKNOWN", confidence: "NONE", evidence_refs: [], notes: null };
}

/** An empty, honestly-unresolved site classification block. */
export function emptySiteClassification() {
  return { acquisition_class: "UNKNOWN", platform: null, confidence: "NONE", evidence_refs: [] };
}

/** A field_assessment object (v1.1 shape) covering every mandatory key, all UNKNOWN. */
export function emptyFieldAssessment() {
  const assessment = {};
  for (const key of FIELD_ASSESSMENT_KEYS) {
    assessment[key] = emptyAssessmentEntry();
  }
  return assessment;
}

/** A field_assessment object (v1.2 shape) covering every mandatory key, all UNKNOWN. */
export function emptyFieldAssessmentV1_2() {
  const assessment = {};
  for (const key of FIELD_ASSESSMENT_KEYS) {
    assessment[key] = emptyAssessmentEntryV1_2();
  }
  return assessment;
}

/** An empty, honestly-unresolved collector assessment block. */
export function emptyCollectorAssessment() {
  return { recommended_family: null, confidence: "NONE", evidence_refs: [], blockers: [] };
}

// Deliberately conservative default: never HUMAN_REVIEW is not a failure,
// it just means nothing has decided this investigation is safe to
// activate. A caller must explicitly set decision.status; this default
// exists only so partially-built records fail loudly rather than
// silently defaulting toward activation.
export function emptyDecision() {
  return { status: "HUMAN_REVIEW", reasons: [], evidence_refs: [] };
}

// --- v1.1 field-assessment entry validation (UNCHANGED since GOVERNANCE-01A) ---

function validateAssessmentEntry(entry, label, errors) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!FIELD_STATES.has(entry.state)) {
    errors.push(`${label}.state must be one of ${[...FIELD_STATES].join(", ")}`);
  }
  if (!("value" in entry)) {
    errors.push(`${label}.value is required (use null when genuinely unknown)`);
  } else if (entry.state !== "PROVEN" && entry.value !== null) {
    errors.push(
      `${label}.value must be null unless state is PROVEN — an ${entry.state} assessment must never be promoted to a precise claimed value`,
    );
  }
  if (!isNullableString(entry.notes)) {
    errors.push(`${label}.notes must be a string or null`);
  }
  if (!isStringArray(entry.evidence_refs)) {
    errors.push(`${label}.evidence_refs must be an array of strings`);
  } else if (entry.state === "PROVEN" && entry.evidence_refs.length === 0) {
    errors.push(`${label}.evidence_refs must be non-empty when state is PROVEN — a proven claim needs cited evidence`);
  }
}

// --- v1.2 field-assessment entry validation (BOTM-GIG-FACT-DERIVATION-GOVERNANCE-02) ---
//
// Adds `basis` (required, non-null only when PROVEN) and `derivation`
// (required, non-null only when basis is DETERMINISTIC_CONTEXT) on top of
// v1.1's state/value/notes/evidence_refs shape. See "Field-value basis
// (v1.2 only)" above for the vocabulary this enforces.

function validateAssessmentEntryV1_2(entry, label, errors) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push(`${label} must be an object`);
    return;
  }

  if (!FIELD_STATES.has(entry.state)) {
    errors.push(`${label}.state must be one of ${[...FIELD_STATES].join(", ")}`);
  }
  const isProven = entry.state === "PROVEN";

  if (!("value" in entry)) {
    errors.push(`${label}.value is required (use null when genuinely unknown)`);
  } else if (!isProven && entry.value !== null) {
    errors.push(
      `${label}.value must be null unless state is PROVEN — a ${entry.state} assessment must never be promoted to a precise claimed value`,
    );
  } else if (isProven && entry.value === null) {
    errors.push(`${label}.value must be non-null when state is PROVEN — a proven claim needs an actual claimed value`);
  }

  if (!("basis" in entry)) {
    errors.push(`${label}.basis is required (null unless state is PROVEN)`);
  } else if (!isProven && entry.basis !== null) {
    errors.push(`${label}.basis must be null unless state is PROVEN`);
  } else if (isProven) {
    if (entry.basis == null) {
      errors.push(
        `${label}.basis is required when state is PROVEN — must be DIRECT_SOURCE or DETERMINISTIC_CONTEXT (see docs/SOURCE_INVESTIGATION_POLICY.md)`,
      );
    } else if (!FIELD_BASIS_VALUES.has(entry.basis)) {
      errors.push(`${label}.basis must be one of ${[...FIELD_BASIS_VALUES].join(", ")}`);
    } else if (!PROVEN_ALLOWED_BASES.has(entry.basis)) {
      // entry.basis is a recognised FIELD_BASIS_VALUES member but not one
      // PROVEN_ALLOWED_BASES permits for a PROVEN field — today that gap
      // is exactly AI_INFERENCE, hence the specific message below.
      errors.push(
        `${label}.basis cannot be AI_INFERENCE for a PROVEN field — a plausible/inferred fact must remain PARTIAL, AMBIGUOUS, or UNKNOWN, never promoted to PROVEN`,
      );
    }
  }

  const basisIsContext = isProven && entry.basis === "DETERMINISTIC_CONTEXT";
  if (basisIsContext) {
    const derivation = entry.derivation;
    if (derivation === null || typeof derivation !== "object" || Array.isArray(derivation)) {
      errors.push(`${label}.derivation is required and must be an object when basis is DETERMINISTIC_CONTEXT`);
    } else {
      if (!isNonEmptyString(derivation.rule)) {
        errors.push(
          `${label}.derivation.rule is required — the mechanical rule that combines the cited inputs into exactly one result`,
        );
      } else {
        const lowerRule = derivation.rule.toLowerCase();
        const hit = FORBIDDEN_DERIVATION_PHRASES.find((phrase) => lowerRule.includes(phrase));
        if (hit) {
          errors.push(
            `${label}.derivation.rule contains "${hit}", which reads as plausibility/inference rather than a mechanical combination rule — DETERMINISTIC_CONTEXT must never rely on today's date, agent knowledge, venue habit, or an unstated assumption; represent this as AI_INFERENCE (and keep the field non-PROVEN) instead`,
          );
        }
      }
      if (!isStringArray(derivation.inputs) || derivation.inputs.length < 2) {
        errors.push(
          `${label}.derivation.inputs must be an array of at least 2 strings — DETERMINISTIC_CONTEXT means mechanically combining more than one retained piece of first-party context, not reading a single ambiguous source`,
        );
      }
    }
  } else if ("derivation" in entry && entry.derivation !== null) {
    errors.push(`${label}.derivation must be null unless basis is DETERMINISTIC_CONTEXT`);
  }

  if (!isNullableString(entry.notes)) {
    errors.push(`${label}.notes must be a string or null`);
  }
  if (!isStringArray(entry.evidence_refs)) {
    errors.push(`${label}.evidence_refs must be an array of strings`);
  } else if (isProven && entry.evidence_refs.length === 0) {
    errors.push(`${label}.evidence_refs must be non-empty when state is PROVEN — a proven claim needs cited evidence`);
  }
}

/**
 * Shared field_assessment block validator: identical structural shape for
 * v1.1 and v1.2 (required keys, optional `price`, the event_url well-
 * formed-URL check) — only which per-entry validator function runs
 * differs, passed in as `entryValidator`.
 */
function validateFieldAssessmentBlock(fieldAssessment, errors, entryValidator) {
  if (fieldAssessment === null || typeof fieldAssessment !== "object" || Array.isArray(fieldAssessment)) {
    errors.push("field_assessment is required and must be an object");
    return;
  }
  for (const key of FIELD_ASSESSMENT_KEYS) {
    if (!(key in fieldAssessment)) {
      errors.push(`field_assessment.${key} is required (use state: "UNKNOWN" when genuinely unresolved)`);
      continue;
    }
    entryValidator(fieldAssessment[key], `field_assessment.${key}`, errors);
  }
  for (const key of OPTIONAL_FIELD_ASSESSMENT_KEYS) {
    if (key in fieldAssessment) {
      entryValidator(fieldAssessment[key], `field_assessment.${key}`, errors);
    }
  }
  const eventUrlEntry = fieldAssessment.event_url;
  if (
    eventUrlEntry &&
    eventUrlEntry.state === "PROVEN" &&
    eventUrlEntry.value != null &&
    !isValidUrl(eventUrlEntry.value)
  ) {
    errors.push(`field_assessment.event_url.value "${eventUrlEntry.value}" is not a well-formed URL`);
  }
}

function collectEvidenceRefs(record, allRefs) {
  const push = (refs) => {
    if (Array.isArray(refs)) allRefs.push(...refs.filter((r) => typeof r === "string"));
  };

  push(record?.identity?.evidence_refs);
  for (const probe of record?.probe_history ?? []) {
    push(probe?.evidence_refs);
  }
  push(record?.site_classification?.evidence_refs);
  for (const dataPath of record?.data_paths ?? []) {
    push(dataPath?.evidence_refs);
  }
  for (const key of ALL_FIELD_ASSESSMENT_KEYS) {
    const entry = record?.field_assessment?.[key];
    if (entry) push(entry.evidence_refs);
  }
  push(record?.collector_assessment?.evidence_refs);
  push(record?.decision?.evidence_refs);
}

/**
 * Validate one BOTM-SOURCE-INVESTIGATION-v1.1 investigation record. This
 * function's rules are UNCHANGED since GOVERNANCE-01A/-01B — introducing
 * v1.2 must never alter what a v1.1 record is held to. Pure/offline.
 * Returns an array of human-readable error strings; empty means valid.
 */
export function validateInvestigationV1_1(record) {
  const errors = [];

  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return ["investigation record must be an object"];
  }

  if (!isNonEmptyString(record.investigation_id)) {
    errors.push("investigation_id is required");
  }

  if (!isNonEmptyString(record.policy_version) || !POLICY_VERSION_PATTERN.test(record.policy_version)) {
    errors.push(`policy_version is required and must match ${POLICY_VERSION_PATTERN}`);
  } else if (!SUPPORTED_POLICY_VERSIONS.has(record.policy_version)) {
    // Well-formed, but not a version this validator implementation
    // actually knows how to check — fail closed rather than silently
    // applying today's rules to a different version's record. See
    // SUPPORTED_POLICY_VERSIONS above for what introducing real support
    // for another version requires.
    errors.push(
      `unsupported policy_version "${record.policy_version}" — current validator supports ${[...SUPPORTED_POLICY_VERSIONS].join(", ")}`,
    );
  }

  if (!isParseableTimestamp(record.investigated_at)) {
    errors.push("investigated_at is required and must be a parseable timestamp");
  }

  const investigator = record.investigator;
  if (investigator === null || typeof investigator !== "object" || Array.isArray(investigator)) {
    errors.push("investigator is required and must be an object");
  } else {
    if (!INVESTIGATOR_TYPES.has(investigator.type)) {
      errors.push(`investigator.type must be one of ${[...INVESTIGATOR_TYPES].join(", ")}`);
    }
    if (!isNonEmptyString(investigator.method)) {
      errors.push("investigator.method is required");
    }
  }

  if (!("source_candidate_id" in record) || !isNullableString(record.source_candidate_id)) {
    errors.push("source_candidate_id must be a string or null");
  }
  if (!("source_id" in record) || !isNullableString(record.source_id)) {
    errors.push("source_id must be a string or null");
  }

  if (!isNonEmptyString(record.venue_reference)) {
    errors.push("venue_reference is required (the venue/source identity this investigation targets)");
  }

  if (!("official_url" in record) || !isNullableString(record.official_url)) {
    errors.push("official_url must be a string or null");
  } else if (record.official_url !== null && !isValidUrl(record.official_url)) {
    errors.push(`official_url "${record.official_url}" is not a well-formed URL`);
  }

  // --- identity ---
  const identity = record.identity;
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    errors.push("identity is required and must be an object");
  } else {
    if (!FIELD_STATES.has(identity.status)) {
      errors.push(`identity.status must be one of ${[...FIELD_STATES].join(", ")}`);
    }
    if (!CONFIDENCE_LEVELS.has(identity.confidence)) {
      errors.push(`identity.confidence must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
    }
    if (!isStringArray(identity.evidence_refs)) {
      errors.push("identity.evidence_refs must be an array of strings");
    } else {
      if (identity.status === "PROVEN" && identity.evidence_refs.length === 0) {
        errors.push("identity.evidence_refs must be non-empty when identity.status is PROVEN");
      }
      if (identity.confidence === "HIGH" && identity.evidence_refs.length === 0) {
        errors.push("identity.evidence_refs must be non-empty when identity.confidence is HIGH");
      }
    }
  }

  // --- probe_history (escalation ladder) ---
  // Structural/sequential validation only here; the acquisition_class and
  // recommended_family cross-checks that need probeHistory happen after
  // those blocks are parsed, below.
  const probeHistory = record.probe_history;
  if (!Array.isArray(probeHistory) || probeHistory.length === 0) {
    errors.push(
      "probe_history is required and must contain at least one entry, starting at level 1 (PASSIVE_STATIC) — an investigation can never validate having jumped straight to a higher escalation level without a retained lower-level attempt",
    );
  } else {
    let previous = null;
    probeHistory.forEach((entry, index) => {
      const at = (field) => `probe_history[${index}].${field}`;

      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`probe_history[${index}] must be an object`);
        previous = null;
        return;
      }

      const level = entry.level;
      const levelValid = PROBE_LEVEL_METHODS.has(level);
      if (!levelValid) {
        errors.push(`${at("level")} must be one of ${[...PROBE_LEVEL_METHODS.keys()].join(", ")}`);
      }

      if (index === 0 && level !== 1) {
        errors.push("probe_history[0] must be level 1 — escalation cannot begin at a higher level");
      }

      if (levelValid && entry.method !== PROBE_LEVEL_METHODS.get(level)) {
        errors.push(`${at("method")} must be "${PROBE_LEVEL_METHODS.get(level)}" for level ${level}`);
      } else if (!levelValid && !PROBE_METHODS.has(entry.method)) {
        errors.push(`${at("method")} must be one of ${[...PROBE_METHODS].join(", ")}`);
      }

      if (!PROBE_OUTCOMES.has(entry.outcome)) {
        errors.push(`${at("outcome")} must be one of ${[...PROBE_OUTCOMES].join(", ")}`);
      }

      if (!isNonEmptyString(entry.reason)) {
        errors.push(`${at("reason")} is required — why this level was attempted, and (if escalating) why the prior level was insufficient`);
      }

      if (!isStringArray(entry.evidence_refs) || entry.evidence_refs.length === 0) {
        errors.push(`${at("evidence_refs")} must be a non-empty array of strings — every probe attempt needs cited retained evidence`);
      }

      if (previous) {
        if (typeof level === "number" && typeof previous.level === "number" && level !== previous.level + 1) {
          errors.push(
            `${at("level")} must be exactly one more than the previous entry's level (${previous.level}) — escalation levels cannot be skipped`,
          );
        }
        if (PROBE_OUTCOMES_TERMINATING_ESCALATION.has(previous.outcome)) {
          errors.push(
            `${at("level")} cannot follow probe_history[${index - 1}], whose outcome was ${previous.outcome} — escalation is only justified when the preceding level's outcome is INSUFFICIENT`,
          );
        }
      }

      previous = entry;
    });
  }

  // --- site_classification ---
  const siteClassification = record.site_classification;
  if (siteClassification === null || typeof siteClassification !== "object" || Array.isArray(siteClassification)) {
    errors.push("site_classification is required and must be an object");
  } else {
    if (!ACQUISITION_CLASSES.has(siteClassification.acquisition_class)) {
      errors.push(`site_classification.acquisition_class must be one of ${[...ACQUISITION_CLASSES].join(", ")}`);
    }
    if (!isNullableString(siteClassification.platform)) {
      errors.push("site_classification.platform must be a string or null");
    }
    if (!CONFIDENCE_LEVELS.has(siteClassification.confidence)) {
      errors.push(`site_classification.confidence must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
    }
    if (!isStringArray(siteClassification.evidence_refs)) {
      errors.push("site_classification.evidence_refs must be an array of strings");
    } else if (siteClassification.confidence === "HIGH" && siteClassification.evidence_refs.length === 0) {
      errors.push("site_classification.evidence_refs must be non-empty when confidence is HIGH");
    }
  }

  // --- data_paths ---
  if (!Array.isArray(record.data_paths)) {
    errors.push("data_paths must be an array (empty is fine when nothing was discovered)");
  } else {
    record.data_paths.forEach((dataPath, index) => {
      const at = (field) => `data_paths[${index}].${field}`;
      if (dataPath === null || typeof dataPath !== "object" || Array.isArray(dataPath)) {
        errors.push(`data_paths[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(dataPath.kind)) {
        errors.push(`${at("kind")} is required`);
      }
      if (!isNonEmptyString(dataPath.url)) {
        errors.push(`${at("url")} is required`);
      } else if (/^https?:\/\//i.test(dataPath.url) && !isValidUrl(dataPath.url)) {
        errors.push(`${at("url")} "${dataPath.url}" is not a well-formed URL`);
      }
      if (!DATA_PATH_ACCESS.has(dataPath.access)) {
        errors.push(`${at("access")} must be one of ${[...DATA_PATH_ACCESS].join(", ")}`);
      }
      if (!DATA_PATH_STATUSES.has(dataPath.status)) {
        errors.push(`${at("status")} must be one of ${[...DATA_PATH_STATUSES].join(", ")}`);
      }
      if (!CONFIDENCE_LEVELS.has(dataPath.confidence)) {
        errors.push(`${at("confidence")} must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
      }
      if (!isStringArray(dataPath.evidence_refs)) {
        errors.push(`${at("evidence_refs")} must be an array of strings`);
      } else {
        if (dataPath.status === "CONFIRMED" && dataPath.evidence_refs.length === 0) {
          errors.push(`${at("evidence_refs")} must be non-empty when status is CONFIRMED`);
        }
        if (dataPath.confidence === "HIGH" && dataPath.evidence_refs.length === 0) {
          errors.push(`${at("evidence_refs")} must be non-empty when confidence is HIGH`);
        }
      }
    });
  }

  // --- field_assessment ---
  const fieldAssessment = record.field_assessment;
  validateFieldAssessmentBlock(fieldAssessment, errors, validateAssessmentEntry);

  // --- collector_assessment ---
  const collectorAssessment = record.collector_assessment;
  if (collectorAssessment === null || typeof collectorAssessment !== "object" || Array.isArray(collectorAssessment)) {
    errors.push("collector_assessment is required and must be an object");
  } else {
    const family = collectorAssessment.recommended_family;
    if (family !== null && family !== NEW_FAMILY_REQUIRED && !COLLECTOR_FAMILIES.has(family)) {
      errors.push(
        `collector_assessment.recommended_family must be null, "${NEW_FAMILY_REQUIRED}", or one of ${[...COLLECTOR_FAMILIES].join(", ")}`,
      );
    }
    if (!CONFIDENCE_LEVELS.has(collectorAssessment.confidence)) {
      errors.push(`collector_assessment.confidence must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
    }
    if (!isStringArray(collectorAssessment.evidence_refs)) {
      errors.push("collector_assessment.evidence_refs must be an array of strings");
    }
    if (!Array.isArray(collectorAssessment.blockers)) {
      errors.push("collector_assessment.blockers must be an array (empty when there are none)");
    } else {
      collectorAssessment.blockers.forEach((blocker, index) => {
        if (blocker === null || typeof blocker !== "object" || Array.isArray(blocker)) {
          errors.push(`collector_assessment.blockers[${index}] must be an object`);
          return;
        }
        if (!BLOCKER_SEVERITIES.has(blocker.severity)) {
          errors.push(`collector_assessment.blockers[${index}].severity must be one of ${[...BLOCKER_SEVERITIES].join(", ")}`);
        }
        if (!isNonEmptyString(blocker.description)) {
          errors.push(`collector_assessment.blockers[${index}].description is required`);
        }
      });
    }
  }

  // --- classification cross-checks against probe_history ---
  // These only make an assertion when probe_history is itself an array;
  // its own required/shape errors are already reported above.
  if (Array.isArray(probeHistory)) {
    const reachedLevel = (min) => probeHistory.some((p) => typeof p?.level === "number" && p.level >= min);

    if (siteClassification?.acquisition_class === "HEADLESS_REQUIRED" && !reachedLevel(3)) {
      errors.push(
        "site_classification.acquisition_class is HEADLESS_REQUIRED but probe_history contains no level 3 (BROWSER_OBSERVATION) entry — this classification must be demonstrated by a retained browser-observation probe, not merely asserted",
      );
    }

    if (collectorAssessment?.recommended_family === "BROWSER_RENDERED" && !reachedLevel(3)) {
      errors.push(
        "collector_assessment.recommended_family is BROWSER_RENDERED but probe_history contains no level 3 (BROWSER_OBSERVATION) entry",
      );
    }
  }

  // --- decision ---
  const decision = record.decision;
  if (decision === null || typeof decision !== "object" || Array.isArray(decision)) {
    errors.push("decision is required and must be an object");
  } else {
    if (!DECISION_STATUSES.has(decision.status)) {
      errors.push(`decision.status must be one of ${[...DECISION_STATUSES].join(", ")}`);
    }
    if (!isStringArray(decision.reasons)) {
      errors.push("decision.reasons must be an array of strings");
    } else if (DECISIONS_REQUIRING_REASONS.has(decision.status) && decision.reasons.length === 0) {
      errors.push(`decision.reasons must be non-empty when decision.status is ${decision.status}`);
    }
    if (!isStringArray(decision.evidence_refs)) {
      errors.push("decision.evidence_refs must be an array of strings");
    }
  }

  if (!("supersedes" in record) || !isNullableString(record.supersedes)) {
    errors.push("supersedes must be a string (a prior investigation_id) or null");
  }

  // --- evidence ---
  const evidenceIds = new Set();
  if (!Array.isArray(record.evidence)) {
    errors.push("evidence must be an array (empty is structurally valid but blocks READY_FOR_ACTIVATION)");
  } else {
    record.evidence.forEach((item, index) => {
      const at = (field) => `evidence[${index}].${field}`;
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`evidence[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(item.evidence_id)) {
        errors.push(`${at("evidence_id")} is required`);
      } else if (evidenceIds.has(item.evidence_id)) {
        errors.push(`duplicate evidence_id "${item.evidence_id}" at evidence[${index}]`);
      } else {
        evidenceIds.add(item.evidence_id);
      }
      if (!EVIDENCE_CLASSES.has(item.evidence_class)) {
        errors.push(`${at("evidence_class")} must be one of ${[...EVIDENCE_CLASSES].join(", ")}`);
      }
      if (!isNonEmptyString(item.description)) {
        errors.push(`${at("description")} is required`);
      }
      if (!isNonEmptyString(item.acquired_from)) {
        errors.push(`${at("acquired_from")} is required`);
      }
      if (!isParseableTimestamp(item.acquired_at)) {
        errors.push(`${at("acquired_at")} is required and must be a parseable timestamp`);
      }
      if (!isNonEmptyString(item.method)) {
        errors.push(`${at("method")} is required`);
      }
      if (!isNullableString(item.content_type)) {
        errors.push(`${at("content_type")} must be a string or null`);
      }
      if (typeof item.byte_faithful !== "boolean") {
        errors.push(`${at("byte_faithful")} must be a boolean (true or false), never null/unknown`);
      }
      if (item.evidence_class === "AI_INTERPRETATION" && item.byte_faithful === true) {
        errors.push(`${at("byte_faithful")} cannot be true for evidence_class AI_INTERPRETATION — an AI-generated interpretation is never raw/byte-faithful source evidence`);
      }
      if (!isNullableString(item.path)) {
        errors.push(`${at("path")} must be a string or null`);
      } else if (item.path != null && !isGovernedEvidencePath(item.path)) {
        errors.push(
          `${at("path")} "${item.path}" is not a governed evidence path — retained evidence must live under ${GOVERNED_EVIDENCE_ROOT} and never in a scratchpad, temp directory, build output, or other untracked/ephemeral location`,
        );
      }
      if (item.evidence_class === "DIRECT_EVIDENCE" && item.path == null) {
        errors.push(`${at("path")} is required for evidence_class DIRECT_EVIDENCE — retained material must resolve to a real file, not a prose claim`);
      }
    });
  }

  // --- dangling evidence_refs (structural — pure, no fs) ---
  const allRefs = [];
  collectEvidenceRefs(record, allRefs);
  for (const ref of new Set(allRefs)) {
    if (!evidenceIds.has(ref)) {
      errors.push(`dangling evidence reference "${ref}" does not match any evidence[].evidence_id`);
    }
  }

  // --- READY_FOR_ACTIVATION gates ---
  if (decision && DECISION_STATUSES.has(decision.status) && decision.status === "READY_FOR_ACTIVATION") {
    const gate = (condition, message) => {
      if (!condition) errors.push(`READY_FOR_ACTIVATION requires ${message}`);
    };

    gate(Array.isArray(record.evidence) && record.evidence.length > 0, "at least one retained evidence item");
    gate(
      !(collectorAssessment?.blockers ?? []).some((b) => b?.severity === "CRITICAL"),
      "no unresolved CRITICAL blocker in collector_assessment.blockers",
    );
    gate(identity?.status === "PROVEN", "identity.status to be PROVEN (official source identity sufficiently established)");
    gate(
      siteClassification &&
        ACQUISITION_CLASSES.has(siteClassification.acquisition_class) &&
        !ACQUISITION_CLASSES_BLOCKING_ACTIVATION.has(siteClassification.acquisition_class),
      "site_classification.acquisition_class to be a resolved, supported class (not UNKNOWN/AMBIGUOUS/UNSUPPORTED)",
    );
    gate(
      Array.isArray(record.data_paths) &&
        record.data_paths.some((p) => p?.access === "PUBLIC" && p?.status === "CONFIRMED"),
      "at least one data_paths entry with access: PUBLIC and status: CONFIRMED",
    );
    gate(fieldAssessment?.title?.state === "PROVEN", "field_assessment.title.state to be PROVEN");
    gate(
      fieldAssessment?.start_date && !["UNKNOWN", "NOT_PRESENT"].includes(fieldAssessment.start_date.state),
      "field_assessment.start_date.state to honestly reflect what was found (not UNKNOWN/NOT_PRESENT)",
    );
    gate(
      fieldAssessment?.source_record_id?.state === "PROVEN" ||
        isNonEmptyString(fieldAssessment?.source_record_id?.notes),
      "field_assessment.source_record_id.state to be PROVEN, or an explicit alternative identity strategy documented in its notes",
    );
    gate(
      collectorAssessment?.recommended_family === NEW_FAMILY_REQUIRED ||
        COLLECTOR_FAMILIES.has(collectorAssessment?.recommended_family),
      `collector_assessment.recommended_family to be a known family or "${NEW_FAMILY_REQUIRED}"`,
    );
    gate(
      Array.isArray(record.evidence) && record.evidence.some((e) => e?.evidence_class === "DETERMINISTIC_DERIVATION"),
      "at least one DETERMINISTIC_DERIVATION evidence item (proof the sample/parser was exercised offline against retained fixtures)",
    );
    gate(Array.isArray(decision.evidence_refs) && decision.evidence_refs.length > 0, "decision.evidence_refs to cite supporting evidence");
  }

  return errors;
}

/**
 * Validate one BOTM-SOURCE-INVESTIGATION-v1.2 investigation record.
 * Identical to v1.1 (validateInvestigationV1_1) EXCEPT: field_assessment
 * entries additionally carry `basis`/`derivation` (see
 * validateAssessmentEntryV1_2), and READY_FOR_ACTIVATION additionally
 * requires an offline DETERMINISTIC_DERIVATION proof for any gated field
 * whose basis is DETERMINISTIC_CONTEXT. Pure/offline. Returns an array of
 * human-readable error strings; empty means valid.
 */
export function validateInvestigationV1_2(record) {
  const errors = [];

  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return ["investigation record must be an object"];
  }

  if (!isNonEmptyString(record.investigation_id)) {
    errors.push("investigation_id is required");
  }

  if (!isNonEmptyString(record.policy_version) || !POLICY_VERSION_PATTERN.test(record.policy_version)) {
    errors.push(`policy_version is required and must match ${POLICY_VERSION_PATTERN}`);
  } else if (!SUPPORTED_POLICY_VERSIONS.has(record.policy_version)) {
    errors.push(
      `unsupported policy_version "${record.policy_version}" — current validator supports ${[...SUPPORTED_POLICY_VERSIONS].join(", ")}`,
    );
  }

  if (!isParseableTimestamp(record.investigated_at)) {
    errors.push("investigated_at is required and must be a parseable timestamp");
  }

  const investigator = record.investigator;
  if (investigator === null || typeof investigator !== "object" || Array.isArray(investigator)) {
    errors.push("investigator is required and must be an object");
  } else {
    if (!INVESTIGATOR_TYPES.has(investigator.type)) {
      errors.push(`investigator.type must be one of ${[...INVESTIGATOR_TYPES].join(", ")}`);
    }
    if (!isNonEmptyString(investigator.method)) {
      errors.push("investigator.method is required");
    }
  }

  if (!("source_candidate_id" in record) || !isNullableString(record.source_candidate_id)) {
    errors.push("source_candidate_id must be a string or null");
  }
  if (!("source_id" in record) || !isNullableString(record.source_id)) {
    errors.push("source_id must be a string or null");
  }

  if (!isNonEmptyString(record.venue_reference)) {
    errors.push("venue_reference is required (the venue/source identity this investigation targets)");
  }

  if (!("official_url" in record) || !isNullableString(record.official_url)) {
    errors.push("official_url must be a string or null");
  } else if (record.official_url !== null && !isValidUrl(record.official_url)) {
    errors.push(`official_url "${record.official_url}" is not a well-formed URL`);
  }

  // --- identity ---
  const identity = record.identity;
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    errors.push("identity is required and must be an object");
  } else {
    if (!FIELD_STATES.has(identity.status)) {
      errors.push(`identity.status must be one of ${[...FIELD_STATES].join(", ")}`);
    }
    if (!CONFIDENCE_LEVELS.has(identity.confidence)) {
      errors.push(`identity.confidence must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
    }
    if (!isStringArray(identity.evidence_refs)) {
      errors.push("identity.evidence_refs must be an array of strings");
    } else {
      if (identity.status === "PROVEN" && identity.evidence_refs.length === 0) {
        errors.push("identity.evidence_refs must be non-empty when identity.status is PROVEN");
      }
      if (identity.confidence === "HIGH" && identity.evidence_refs.length === 0) {
        errors.push("identity.evidence_refs must be non-empty when identity.confidence is HIGH");
      }
    }
  }

  // --- probe_history (escalation ladder) — unchanged from v1.1 ---
  const probeHistory = record.probe_history;
  if (!Array.isArray(probeHistory) || probeHistory.length === 0) {
    errors.push(
      "probe_history is required and must contain at least one entry, starting at level 1 (PASSIVE_STATIC) — an investigation can never validate having jumped straight to a higher escalation level without a retained lower-level attempt",
    );
  } else {
    let previous = null;
    probeHistory.forEach((entry, index) => {
      const at = (field) => `probe_history[${index}].${field}`;

      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`probe_history[${index}] must be an object`);
        previous = null;
        return;
      }

      const level = entry.level;
      const levelValid = PROBE_LEVEL_METHODS.has(level);
      if (!levelValid) {
        errors.push(`${at("level")} must be one of ${[...PROBE_LEVEL_METHODS.keys()].join(", ")}`);
      }

      if (index === 0 && level !== 1) {
        errors.push("probe_history[0] must be level 1 — escalation cannot begin at a higher level");
      }

      if (levelValid && entry.method !== PROBE_LEVEL_METHODS.get(level)) {
        errors.push(`${at("method")} must be "${PROBE_LEVEL_METHODS.get(level)}" for level ${level}`);
      } else if (!levelValid && !PROBE_METHODS.has(entry.method)) {
        errors.push(`${at("method")} must be one of ${[...PROBE_METHODS].join(", ")}`);
      }

      if (!PROBE_OUTCOMES.has(entry.outcome)) {
        errors.push(`${at("outcome")} must be one of ${[...PROBE_OUTCOMES].join(", ")}`);
      }

      if (!isNonEmptyString(entry.reason)) {
        errors.push(`${at("reason")} is required — why this level was attempted, and (if escalating) why the prior level was insufficient`);
      }

      if (!isStringArray(entry.evidence_refs) || entry.evidence_refs.length === 0) {
        errors.push(`${at("evidence_refs")} must be a non-empty array of strings — every probe attempt needs cited retained evidence`);
      }

      if (previous) {
        if (typeof level === "number" && typeof previous.level === "number" && level !== previous.level + 1) {
          errors.push(
            `${at("level")} must be exactly one more than the previous entry's level (${previous.level}) — escalation levels cannot be skipped`,
          );
        }
        if (PROBE_OUTCOMES_TERMINATING_ESCALATION.has(previous.outcome)) {
          errors.push(
            `${at("level")} cannot follow probe_history[${index - 1}], whose outcome was ${previous.outcome} — escalation is only justified when the preceding level's outcome is INSUFFICIENT`,
          );
        }
      }

      previous = entry;
    });
  }

  // --- site_classification — unchanged from v1.1 ---
  const siteClassification = record.site_classification;
  if (siteClassification === null || typeof siteClassification !== "object" || Array.isArray(siteClassification)) {
    errors.push("site_classification is required and must be an object");
  } else {
    if (!ACQUISITION_CLASSES.has(siteClassification.acquisition_class)) {
      errors.push(`site_classification.acquisition_class must be one of ${[...ACQUISITION_CLASSES].join(", ")}`);
    }
    if (!isNullableString(siteClassification.platform)) {
      errors.push("site_classification.platform must be a string or null");
    }
    if (!CONFIDENCE_LEVELS.has(siteClassification.confidence)) {
      errors.push(`site_classification.confidence must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
    }
    if (!isStringArray(siteClassification.evidence_refs)) {
      errors.push("site_classification.evidence_refs must be an array of strings");
    } else if (siteClassification.confidence === "HIGH" && siteClassification.evidence_refs.length === 0) {
      errors.push("site_classification.evidence_refs must be non-empty when confidence is HIGH");
    }
  }

  // --- data_paths — unchanged from v1.1 ---
  if (!Array.isArray(record.data_paths)) {
    errors.push("data_paths must be an array (empty is fine when nothing was discovered)");
  } else {
    record.data_paths.forEach((dataPath, index) => {
      const at = (field) => `data_paths[${index}].${field}`;
      if (dataPath === null || typeof dataPath !== "object" || Array.isArray(dataPath)) {
        errors.push(`data_paths[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(dataPath.kind)) {
        errors.push(`${at("kind")} is required`);
      }
      if (!isNonEmptyString(dataPath.url)) {
        errors.push(`${at("url")} is required`);
      } else if (/^https?:\/\//i.test(dataPath.url) && !isValidUrl(dataPath.url)) {
        errors.push(`${at("url")} "${dataPath.url}" is not a well-formed URL`);
      }
      if (!DATA_PATH_ACCESS.has(dataPath.access)) {
        errors.push(`${at("access")} must be one of ${[...DATA_PATH_ACCESS].join(", ")}`);
      }
      if (!DATA_PATH_STATUSES.has(dataPath.status)) {
        errors.push(`${at("status")} must be one of ${[...DATA_PATH_STATUSES].join(", ")}`);
      }
      if (!CONFIDENCE_LEVELS.has(dataPath.confidence)) {
        errors.push(`${at("confidence")} must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
      }
      if (!isStringArray(dataPath.evidence_refs)) {
        errors.push(`${at("evidence_refs")} must be an array of strings`);
      } else {
        if (dataPath.status === "CONFIRMED" && dataPath.evidence_refs.length === 0) {
          errors.push(`${at("evidence_refs")} must be non-empty when status is CONFIRMED`);
        }
        if (dataPath.confidence === "HIGH" && dataPath.evidence_refs.length === 0) {
          errors.push(`${at("evidence_refs")} must be non-empty when confidence is HIGH`);
        }
      }
    });
  }

  // --- field_assessment (v1.2 shape: state/value/basis/derivation/notes/evidence_refs) ---
  const fieldAssessment = record.field_assessment;
  validateFieldAssessmentBlock(fieldAssessment, errors, validateAssessmentEntryV1_2);

  // --- collector_assessment — unchanged from v1.1 ---
  const collectorAssessment = record.collector_assessment;
  if (collectorAssessment === null || typeof collectorAssessment !== "object" || Array.isArray(collectorAssessment)) {
    errors.push("collector_assessment is required and must be an object");
  } else {
    const family = collectorAssessment.recommended_family;
    if (family !== null && family !== NEW_FAMILY_REQUIRED && !COLLECTOR_FAMILIES.has(family)) {
      errors.push(
        `collector_assessment.recommended_family must be null, "${NEW_FAMILY_REQUIRED}", or one of ${[...COLLECTOR_FAMILIES].join(", ")}`,
      );
    }
    if (!CONFIDENCE_LEVELS.has(collectorAssessment.confidence)) {
      errors.push(`collector_assessment.confidence must be one of ${[...CONFIDENCE_LEVELS].join(", ")}`);
    }
    if (!isStringArray(collectorAssessment.evidence_refs)) {
      errors.push("collector_assessment.evidence_refs must be an array of strings");
    }
    if (!Array.isArray(collectorAssessment.blockers)) {
      errors.push("collector_assessment.blockers must be an array (empty when there are none)");
    } else {
      collectorAssessment.blockers.forEach((blocker, index) => {
        if (blocker === null || typeof blocker !== "object" || Array.isArray(blocker)) {
          errors.push(`collector_assessment.blockers[${index}] must be an object`);
          return;
        }
        if (!BLOCKER_SEVERITIES.has(blocker.severity)) {
          errors.push(`collector_assessment.blockers[${index}].severity must be one of ${[...BLOCKER_SEVERITIES].join(", ")}`);
        }
        if (!isNonEmptyString(blocker.description)) {
          errors.push(`collector_assessment.blockers[${index}].description is required`);
        }
      });
    }
  }

  // --- classification cross-checks against probe_history — unchanged from v1.1 ---
  if (Array.isArray(probeHistory)) {
    const reachedLevel = (min) => probeHistory.some((p) => typeof p?.level === "number" && p.level >= min);

    if (siteClassification?.acquisition_class === "HEADLESS_REQUIRED" && !reachedLevel(3)) {
      errors.push(
        "site_classification.acquisition_class is HEADLESS_REQUIRED but probe_history contains no level 3 (BROWSER_OBSERVATION) entry — this classification must be demonstrated by a retained browser-observation probe, not merely asserted",
      );
    }

    if (collectorAssessment?.recommended_family === "BROWSER_RENDERED" && !reachedLevel(3)) {
      errors.push(
        "collector_assessment.recommended_family is BROWSER_RENDERED but probe_history contains no level 3 (BROWSER_OBSERVATION) entry",
      );
    }
  }

  // --- decision — unchanged from v1.1 ---
  const decision = record.decision;
  if (decision === null || typeof decision !== "object" || Array.isArray(decision)) {
    errors.push("decision is required and must be an object");
  } else {
    if (!DECISION_STATUSES.has(decision.status)) {
      errors.push(`decision.status must be one of ${[...DECISION_STATUSES].join(", ")}`);
    }
    if (!isStringArray(decision.reasons)) {
      errors.push("decision.reasons must be an array of strings");
    } else if (DECISIONS_REQUIRING_REASONS.has(decision.status) && decision.reasons.length === 0) {
      errors.push(`decision.reasons must be non-empty when decision.status is ${decision.status}`);
    }
    if (!isStringArray(decision.evidence_refs)) {
      errors.push("decision.evidence_refs must be an array of strings");
    }
  }

  if (!("supersedes" in record) || !isNullableString(record.supersedes)) {
    errors.push("supersedes must be a string (a prior investigation_id) or null");
  }

  // --- evidence — unchanged from v1.1 ---
  const evidenceList = Array.isArray(record.evidence) ? record.evidence : null;
  const evidenceIds = new Set();
  if (!Array.isArray(record.evidence)) {
    errors.push("evidence must be an array (empty is structurally valid but blocks READY_FOR_ACTIVATION)");
  } else {
    record.evidence.forEach((item, index) => {
      const at = (field) => `evidence[${index}].${field}`;
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`evidence[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(item.evidence_id)) {
        errors.push(`${at("evidence_id")} is required`);
      } else if (evidenceIds.has(item.evidence_id)) {
        errors.push(`duplicate evidence_id "${item.evidence_id}" at evidence[${index}]`);
      } else {
        evidenceIds.add(item.evidence_id);
      }
      if (!EVIDENCE_CLASSES.has(item.evidence_class)) {
        errors.push(`${at("evidence_class")} must be one of ${[...EVIDENCE_CLASSES].join(", ")}`);
      }
      if (!isNonEmptyString(item.description)) {
        errors.push(`${at("description")} is required`);
      }
      if (!isNonEmptyString(item.acquired_from)) {
        errors.push(`${at("acquired_from")} is required`);
      }
      if (!isParseableTimestamp(item.acquired_at)) {
        errors.push(`${at("acquired_at")} is required and must be a parseable timestamp`);
      }
      if (!isNonEmptyString(item.method)) {
        errors.push(`${at("method")} is required`);
      }
      if (!isNullableString(item.content_type)) {
        errors.push(`${at("content_type")} must be a string or null`);
      }
      if (typeof item.byte_faithful !== "boolean") {
        errors.push(`${at("byte_faithful")} must be a boolean (true or false), never null/unknown`);
      }
      if (item.evidence_class === "AI_INTERPRETATION" && item.byte_faithful === true) {
        errors.push(`${at("byte_faithful")} cannot be true for evidence_class AI_INTERPRETATION — an AI-generated interpretation is never raw/byte-faithful source evidence`);
      }
      if (!isNullableString(item.path)) {
        errors.push(`${at("path")} must be a string or null`);
      } else if (item.path != null && !isGovernedEvidencePath(item.path)) {
        errors.push(
          `${at("path")} "${item.path}" is not a governed evidence path — retained evidence must live under ${GOVERNED_EVIDENCE_ROOT} and never in a scratchpad, temp directory, build output, or other untracked/ephemeral location`,
        );
      }
      if (item.evidence_class === "DIRECT_EVIDENCE" && item.path == null) {
        errors.push(`${at("path")} is required for evidence_class DIRECT_EVIDENCE — retained material must resolve to a real file, not a prose claim`);
      }
    });
  }

  // --- dangling evidence_refs (structural — pure, no fs) — unchanged from v1.1 ---
  const allRefs = [];
  collectEvidenceRefs(record, allRefs);
  for (const ref of new Set(allRefs)) {
    if (!evidenceIds.has(ref)) {
      errors.push(`dangling evidence reference "${ref}" does not match any evidence[].evidence_id`);
    }
  }

  // --- READY_FOR_ACTIVATION gates (v1.1 gates, plus v1.2's offline-proof requirement) ---
  if (decision && DECISION_STATUSES.has(decision.status) && decision.status === "READY_FOR_ACTIVATION") {
    const gate = (condition, message) => {
      if (!condition) errors.push(`READY_FOR_ACTIVATION requires ${message}`);
    };

    gate(Array.isArray(record.evidence) && record.evidence.length > 0, "at least one retained evidence item");
    gate(
      !(collectorAssessment?.blockers ?? []).some((b) => b?.severity === "CRITICAL"),
      "no unresolved CRITICAL blocker in collector_assessment.blockers",
    );
    gate(identity?.status === "PROVEN", "identity.status to be PROVEN (official source identity sufficiently established)");
    gate(
      siteClassification &&
        ACQUISITION_CLASSES.has(siteClassification.acquisition_class) &&
        !ACQUISITION_CLASSES_BLOCKING_ACTIVATION.has(siteClassification.acquisition_class),
      "site_classification.acquisition_class to be a resolved, supported class (not UNKNOWN/AMBIGUOUS/UNSUPPORTED)",
    );
    gate(
      Array.isArray(record.data_paths) &&
        record.data_paths.some((p) => p?.access === "PUBLIC" && p?.status === "CONFIRMED"),
      "at least one data_paths entry with access: PUBLIC and status: CONFIRMED",
    );
    gate(fieldAssessment?.title?.state === "PROVEN", "field_assessment.title.state to be PROVEN");
    gate(
      fieldAssessment?.start_date && !["UNKNOWN", "NOT_PRESENT"].includes(fieldAssessment.start_date.state),
      "field_assessment.start_date.state to honestly reflect what was found (not UNKNOWN/NOT_PRESENT)",
    );
    gate(
      fieldAssessment?.source_record_id?.state === "PROVEN" ||
        isNonEmptyString(fieldAssessment?.source_record_id?.notes),
      "field_assessment.source_record_id.state to be PROVEN, or an explicit alternative identity strategy documented in its notes",
    );
    gate(
      collectorAssessment?.recommended_family === NEW_FAMILY_REQUIRED ||
        COLLECTOR_FAMILIES.has(collectorAssessment?.recommended_family),
      `collector_assessment.recommended_family to be a known family or "${NEW_FAMILY_REQUIRED}"`,
    );
    gate(
      Array.isArray(record.evidence) && record.evidence.some((e) => e?.evidence_class === "DETERMINISTIC_DERIVATION"),
      "at least one DETERMINISTIC_DERIVATION evidence item (proof the sample/parser was exercised offline against retained fixtures)",
    );
    gate(Array.isArray(decision.evidence_refs) && decision.evidence_refs.length > 0, "decision.evidence_refs to cite supporting evidence");

    // v1.2-only: a PROVEN gated field whose basis is DETERMINISTIC_CONTEXT
    // must itself cite an offline DETERMINISTIC_DERIVATION evidence item —
    // proof the contextual combination was actually reproduced, not merely
    // asserted. DIRECT_SOURCE fields need no such proof (the value already
    // came straight from one retained piece of evidence).
    const fieldCitesOfflineProof = (fieldEntry) => {
      if (!fieldEntry || !Array.isArray(fieldEntry.evidence_refs) || !evidenceList) return false;
      return fieldEntry.evidence_refs.some((ref) =>
        evidenceList.some((item) => item?.evidence_id === ref && item?.evidence_class === "DETERMINISTIC_DERIVATION"),
      );
    };
    for (const key of ["title", "start_date"]) {
      const fieldEntry = fieldAssessment?.[key];
      if (fieldEntry?.state === "PROVEN" && fieldEntry?.basis === "DETERMINISTIC_CONTEXT") {
        gate(
          fieldCitesOfflineProof(fieldEntry),
          `field_assessment.${key} (basis DETERMINISTIC_CONTEXT) to cite at least one DETERMINISTIC_DERIVATION evidence item proving the contextual combination was reproduced offline`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate one investigation record, dispatching on its declared
 * policy_version to the correct version-specific rule set. This is the
 * public entry point — never reinterprets a v1.1 record under v1.2 rules
 * (or vice versa). An unrecognised/malformed/unsupported policy_version
 * is validated (and rejected) via validateInvestigationV1_1, whose own
 * internal policy_version check reports the shape/support error — the
 * same behaviour this module has always had for an unsupported version.
 * Pure/offline. Returns an array of human-readable error strings; empty
 * means valid.
 */
export function validateInvestigation(record) {
  if (record?.policy_version === POLICY_VERSION_V1_2) {
    return validateInvestigationV1_2(record);
  }
  return validateInvestigationV1_1(record);
}
