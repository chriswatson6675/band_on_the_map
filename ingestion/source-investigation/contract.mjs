// Governed AI Source Investigation contract (BOTM-SOURCE-INVESTIGATION-
// GOVERNANCE-01). Defines the durable shape of one source-investigation
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

export const POLICY_VERSION = "BOTM-SOURCE-INVESTIGATION-v1.0";

// Any policy_version matching this shape is accepted structurally, not
// just the current POLICY_VERSION constant — future policy versions must
// be able to coexist with records written under earlier ones (see the
// policy doc's "Policy versioning" section). A version-specific rule
// change belongs in a new version of this contract, not a tightened regex.
const POLICY_VERSION_PATTERN = /^BOTM-SOURCE-INVESTIGATION-v\d+\.\d+$/;

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

// Evidence provenance classes. AI_INTERPRETATION must never be usable as
// (or claim to be) DIRECT_EVIDENCE — enforced below, not just by naming.
export const EVIDENCE_CLASSES = new Set([
  "DIRECT_EVIDENCE",
  "DETERMINISTIC_DERIVATION",
  "AI_INTERPRETATION",
  "OPERATOR_DECISION",
]);

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

/** An empty, honestly-unresolved field-assessment entry. */
export function emptyAssessmentEntry() {
  return { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] };
}

/** An empty, honestly-unresolved identity block. */
export function emptyIdentity() {
  return { status: "UNKNOWN", confidence: "NONE", evidence_refs: [], notes: null };
}

/** An empty, honestly-unresolved site classification block. */
export function emptySiteClassification() {
  return { acquisition_class: "UNKNOWN", platform: null, confidence: "NONE", evidence_refs: [] };
}

/** A field_assessment object covering every mandatory key, all UNKNOWN. */
export function emptyFieldAssessment() {
  const assessment = {};
  for (const key of FIELD_ASSESSMENT_KEYS) {
    assessment[key] = emptyAssessmentEntry();
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

function collectEvidenceRefs(record, allRefs) {
  const push = (refs) => {
    if (Array.isArray(refs)) allRefs.push(...refs.filter((r) => typeof r === "string"));
  };

  push(record?.identity?.evidence_refs);
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
 * Validate one investigation record's structure, vocabulary, and
 * cross-field business rules. Pure/offline — makes no fs or network
 * calls, so it never knows whether a cited evidence.path genuinely exists
 * (see validateEvidenceFilesExist() in ./validate.mjs for that layer).
 * Returns an array of human-readable error strings; empty means valid.
 */
export function validateInvestigation(record) {
  const errors = [];

  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return ["investigation record must be an object"];
  }

  if (!isNonEmptyString(record.investigation_id)) {
    errors.push("investigation_id is required");
  }

  if (!isNonEmptyString(record.policy_version) || !POLICY_VERSION_PATTERN.test(record.policy_version)) {
    errors.push(`policy_version is required and must match ${POLICY_VERSION_PATTERN}`);
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
  if (fieldAssessment === null || typeof fieldAssessment !== "object" || Array.isArray(fieldAssessment)) {
    errors.push("field_assessment is required and must be an object");
  } else {
    for (const key of FIELD_ASSESSMENT_KEYS) {
      if (!(key in fieldAssessment)) {
        errors.push(`field_assessment.${key} is required (use state: "UNKNOWN" when genuinely unresolved)`);
        continue;
      }
      validateAssessmentEntry(fieldAssessment[key], `field_assessment.${key}`, errors);
    }
    for (const key of OPTIONAL_FIELD_ASSESSMENT_KEYS) {
      if (key in fieldAssessment) {
        validateAssessmentEntry(fieldAssessment[key], `field_assessment.${key}`, errors);
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
