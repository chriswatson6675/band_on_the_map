import assert from "node:assert/strict";
import test from "node:test";
import {
  ACQUISITION_CLASSES,
  COLLECTOR_FAMILIES,
  DECISION_STATUSES,
  EVIDENCE_CLASSES,
  FIELD_STATES,
  NEW_FAMILY_REQUIRED,
  POLICY_VERSION,
  emptyAssessmentEntry,
  emptyCollectorAssessment,
  emptyDecision,
  emptyFieldAssessment,
  emptyIdentity,
  emptySiteClassification,
  isGovernedEvidencePath,
  validateInvestigation,
} from "../ingestion/source-investigation/contract.mjs";

// A real, committed evidence file (from the SYNTHETIC governance fixture),
// reused here so DIRECT_EVIDENCE-path checks exercise a genuine governed
// path without duplicating a second retained file just for this test.
const REAL_EVIDENCE_PATH = "research/source-investigations/example-static-html-ready-01/evidence/agenda.html";

function provenEntry(value, overrides = {}) {
  return { state: "PROVEN", value, notes: null, evidence_refs: ["ev-1"], ...overrides };
}

/**
 * A fully valid, READY_FOR_ACTIVATION-shaped investigation record. Tests
 * mutate a deep copy of this rather than rebuilding one from scratch each
 * time, mirroring the baseEntry() pattern in tests/registry-validate.test.mjs.
 */
function baseInvestigation(overrides = {}) {
  return {
    investigation_id: "test-investigation-01",
    policy_version: POLICY_VERSION,
    investigated_at: "2026-08-25T00:00:00Z",
    investigator: { type: "AI", method: "PASSIVE_PROBE against a synthetic fixture" },
    probe_history: [
      {
        level: 1,
        method: "PASSIVE_STATIC",
        outcome: "SUFFICIENT",
        reason: "the retained fixture already exposed everything needed",
        evidence_refs: ["ev-1"],
      },
    ],
    source_candidate_id: "test-candidate-01",
    source_id: null,
    venue_reference: "Test Fixture Venue",
    official_url: "https://example.org/agenda",
    identity: { status: "PROVEN", confidence: "HIGH", evidence_refs: ["ev-1"], notes: null },
    site_classification: {
      acquisition_class: "STATIC_HTML",
      platform: null,
      confidence: "HIGH",
      evidence_refs: ["ev-1"],
    },
    data_paths: [
      {
        kind: "HTML_EVENT_LIST_PAGE",
        url: "https://example.org/agenda",
        access: "PUBLIC",
        status: "CONFIRMED",
        confidence: "HIGH",
        evidence_refs: ["ev-1"],
      },
    ],
    field_assessment: {
      title: provenEntry("Synthetic Test Concert Night"),
      start_date: provenEntry("2026-09-10"),
      time: { state: "PARTIAL", value: null, notes: "floating local time only", evidence_refs: ["ev-1"] },
      end: { state: "NOT_PRESENT", value: null, notes: null, evidence_refs: [] },
      venue_location: provenEntry("Synthetic Venue Address, Lisboa"),
      source_record_id: provenEntry("evt-0001"),
      event_url: provenEntry("https://example.org/agenda/evt-0001"),
    },
    collector_assessment: {
      recommended_family: "STATIC_EVENT_LIST",
      confidence: "HIGH",
      evidence_refs: ["ev-1"],
      blockers: [],
    },
    decision: {
      status: "READY_FOR_ACTIVATION",
      reasons: ["all gates satisfied against synthetic fixture evidence"],
      evidence_refs: ["ev-1", "ev-2"],
    },
    evidence: [
      {
        evidence_id: "ev-1",
        evidence_class: "DIRECT_EVIDENCE",
        description: "synthetic retained HTML response",
        acquired_from: "https://example.org/agenda",
        acquired_at: "2026-08-25T00:00:00Z",
        method: "synthetic fixture",
        content_type: "text/html",
        byte_faithful: true,
        path: REAL_EVIDENCE_PATH,
      },
      {
        evidence_id: "ev-2",
        evidence_class: "DETERMINISTIC_DERIVATION",
        description: "offline re-parse of the retained fixture",
        acquired_from: REAL_EVIDENCE_PATH,
        acquired_at: "2026-08-25T00:00:00Z",
        method: "deterministic re-parse",
        content_type: null,
        byte_faithful: false,
        path: null,
      },
    ],
    supersedes: null,
    ...overrides,
  };
}

test("validateInvestigation accepts a fully-formed READY_FOR_ACTIVATION record", () => {
  assert.deepEqual(validateInvestigation(baseInvestigation()), []);
});

test("validateInvestigation accepts unknown facts left honestly UNKNOWN (no fabrication required)", () => {
  const record = baseInvestigation({
    identity: emptyIdentity(),
    site_classification: emptySiteClassification(),
    data_paths: [],
    field_assessment: emptyFieldAssessment(),
    collector_assessment: emptyCollectorAssessment(),
    decision: { ...emptyDecision(), status: "HUMAN_REVIEW", reasons: ["nothing resolved yet"] },
  });
  const errors = validateInvestigation(record);
  assert.deepEqual(errors, []);
});

test("validateInvestigation does not require the optional price field", () => {
  const record = baseInvestigation();
  assert.ok(!("price" in record.field_assessment));
  assert.deepEqual(validateInvestigation(record), []);
});

test("validateInvestigation accepts price when explicitly NOT_PRESENT", () => {
  const record = baseInvestigation();
  record.field_assessment.price = { state: "NOT_PRESENT", value: null, notes: null, evidence_refs: [] };
  assert.deepEqual(validateInvestigation(record), []);
});

test("READY_FOR_ACTIVATION with no retained evidence fails", () => {
  const record = baseInvestigation({ evidence: [] });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("READY_FOR_ACTIVATION requires") && e.includes("evidence")));
});

test("dangling evidence reference fails", () => {
  const record = baseInvestigation();
  record.identity.evidence_refs = ["ev-does-not-exist"];
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes('dangling evidence reference "ev-does-not-exist"')));
});

test("scratchpad/temp evidence paths fail, governed paths pass", () => {
  assert.equal(isGovernedEvidencePath(REAL_EVIDENCE_PATH), true);

  for (const badPath of [
    "scratchpad/notes.html",
    "tmp/foo.html",
    "temp/foo.html",
    "/tmp/foo.html",
    "C:/Users/chris/AppData/Local/Temp/claude/foo.html",
    "node_modules/pkg/foo.html",
    "research/source-investigations/../../../etc/passwd",
    "research/source-investigations/x/tmp/foo.html",
  ]) {
    assert.equal(isGovernedEvidencePath(badPath), false, `${badPath} should not be a governed path`);
  }

  const record = baseInvestigation();
  record.evidence[0].path = "scratchpad/notes.html";
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("not a governed evidence path")));
});

test("AI_INTERPRETATION evidence cannot claim byte_faithful: true", () => {
  const record = baseInvestigation();
  record.evidence.push({
    evidence_id: "ev-3",
    evidence_class: "AI_INTERPRETATION",
    description: "model summary of the page",
    acquired_from: "model inference over ev-1",
    acquired_at: "2026-08-25T00:00:00Z",
    method: "AI summary",
    content_type: null,
    byte_faithful: true,
    path: null,
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("cannot be true for evidence_class AI_INTERPRETATION")));
});

test("AI_INTERPRETATION evidence with byte_faithful: false is fine", () => {
  const record = baseInvestigation();
  record.evidence.push({
    evidence_id: "ev-3",
    evidence_class: "AI_INTERPRETATION",
    description: "model summary of the page, low confidence",
    acquired_from: "model inference over ev-1",
    acquired_at: "2026-08-25T00:00:00Z",
    method: "AI summary",
    content_type: null,
    byte_faithful: false,
    path: null,
  });
  record.decision.evidence_refs.push("ev-3");
  assert.deepEqual(validateInvestigation(record), []);
});

test("an ambiguous date cannot be promoted to a proven exact value", () => {
  const record = baseInvestigation();
  record.field_assessment.start_date = {
    state: "AMBIGUOUS",
    value: "2026-09-17",
    notes: "page only shows the number 17",
    evidence_refs: ["ev-1"],
  };
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.value must be null unless state is PROVEN")));
});

test("an AMBIGUOUS date with value: null validates (honest, not fabricated)", () => {
  const record = baseInvestigation({ decision: { status: "HUMAN_REVIEW", reasons: ["timing unresolved"], evidence_refs: ["ev-1"] } });
  record.field_assessment.start_date = {
    state: "AMBIGUOUS",
    value: null,
    notes: "page only shows the number 17, day/month/year unresolved",
    evidence_refs: ["ev-1"],
  };
  assert.deepEqual(validateInvestigation(record), []);
});

test("a stable ID cannot be marked PROVEN with no supporting evidence", () => {
  const record = baseInvestigation();
  record.field_assessment.source_record_id = { state: "PROVEN", value: "evt-0001", notes: null, evidence_refs: [] };
  const errors = validateInvestigation(record);
  assert.ok(
    errors.some((e) => e.includes("field_assessment.source_record_id.evidence_refs must be non-empty when state is PROVEN")),
  );
});

test("a CRITICAL blocker prevents READY_FOR_ACTIVATION", () => {
  const record = baseInvestigation();
  record.collector_assessment.blockers.push({ severity: "CRITICAL", description: "site returns 403 on every request" });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("READY_FOR_ACTIVATION requires") && e.includes("CRITICAL blocker")));
});

test("a MAJOR (non-CRITICAL) blocker does not block READY_FOR_ACTIVATION on its own", () => {
  const record = baseInvestigation();
  record.collector_assessment.blockers.push({ severity: "MAJOR", description: "rate limiting observed" });
  assert.deepEqual(validateInvestigation(record), []);
});

test("DEFER is accepted as a complete, legitimate outcome", () => {
  const record = baseInvestigation({
    decision: { status: "DEFER", reasons: ["no public acquisition path discoverable within Level 1/2"], evidence_refs: ["ev-1"] },
    collector_assessment: { recommended_family: null, confidence: "NONE", evidence_refs: [], blockers: [] },
  });
  assert.deepEqual(validateInvestigation(record), []);
  assert.ok(DECISION_STATUSES.has("DEFER"));
});

test("DEFER/HUMAN_REVIEW/REJECT require non-empty reasons", () => {
  for (const status of ["DEFER", "HUMAN_REVIEW", "REJECT"]) {
    const record = baseInvestigation({ decision: { status, reasons: [], evidence_refs: ["ev-1"] } });
    const errors = validateInvestigation(record);
    assert.ok(
      errors.some((e) => e.includes(`decision.reasons must be non-empty when decision.status is ${status}`)),
      `${status} without reasons should fail`,
    );
  }
});

test("recommended_family may be NEW_FAMILY_REQUIRED without inventing a family", () => {
  const record = baseInvestigation();
  record.collector_assessment.recommended_family = NEW_FAMILY_REQUIRED;
  assert.deepEqual(validateInvestigation(record), []);
  assert.equal(NEW_FAMILY_REQUIRED, "NEW_FAMILY_REQUIRED");
});

test("recommended_family rejects a value outside COLLECTOR_FAMILIES/NEW_FAMILY_REQUIRED", () => {
  const record = baseInvestigation();
  record.collector_assessment.recommended_family = "SCRAPER";
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("collector_assessment.recommended_family")));
});

test("READY_FOR_ACTIVATION without a resolved acquisition_class fails", () => {
  for (const acquisitionClass of ["UNKNOWN", "AMBIGUOUS", "UNSUPPORTED"]) {
    const record = baseInvestigation();
    record.site_classification.acquisition_class = acquisitionClass;
    const errors = validateInvestigation(record);
    assert.ok(
      errors.some((e) => e.includes("READY_FOR_ACTIVATION requires") && e.includes("acquisition_class")),
      `${acquisitionClass} should block activation`,
    );
  }
});

test("READY_FOR_ACTIVATION requires identity.status PROVEN, not merely PARTIAL", () => {
  const record = baseInvestigation();
  record.identity = { status: "PARTIAL", confidence: "MEDIUM", evidence_refs: ["ev-1"], notes: null };
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("identity.status to be PROVEN")));
});

test("READY_FOR_ACTIVATION requires at least one DETERMINISTIC_DERIVATION offline-proof item", () => {
  const record = baseInvestigation();
  record.evidence = record.evidence.filter((e) => e.evidence_class !== "DETERMINISTIC_DERIVATION");
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("DETERMINISTIC_DERIVATION")));
});

test("HIGH confidence requires supporting evidence_refs", () => {
  const record = baseInvestigation();
  record.site_classification.confidence = "HIGH";
  record.site_classification.evidence_refs = [];
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("site_classification.evidence_refs must be non-empty when confidence is HIGH")));
});

test("malformed official_url is rejected", () => {
  const record = baseInvestigation({ official_url: "not a url" });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("is not a well-formed URL")));
});

test("unknown vocabulary values are rejected", () => {
  assert.deepEqual(validateInvestigation(baseInvestigation({ decision: { status: "PROBABLY_FINE", reasons: [], evidence_refs: [] } })).filter((e) => e.includes("decision.status")).length > 0, true);

  const badClass = baseInvestigation();
  badClass.site_classification.acquisition_class = "SCRAPER_BASED";
  assert.ok(validateInvestigation(badClass).some((e) => e.includes("site_classification.acquisition_class")));

  const badEvidenceClass = baseInvestigation();
  badEvidenceClass.evidence[0].evidence_class = "VIBES";
  assert.ok(validateInvestigation(badEvidenceClass).some((e) => e.includes("evidence_class")));
});

test("known-vocabulary constants stay in sync with what the validator accepts", () => {
  for (const value of FIELD_STATES) {
    const entry = emptyAssessmentEntry();
    entry.state = value;
    const record = baseInvestigation();
    record.field_assessment.end = entry;
    // "end" carries no activation-gate requirement, so any FIELD_STATES
    // member should be structurally acceptable there.
    assert.ok(
      !validateInvestigation(record).some((e) => e.startsWith("field_assessment.end.state")),
      `${value} should be an accepted field_assessment state`,
    );
  }
  for (const value of ACQUISITION_CLASSES) {
    const record = baseInvestigation({ decision: { status: "HUMAN_REVIEW", reasons: ["n/a"], evidence_refs: [] } });
    record.site_classification.acquisition_class = value;
    // Only the vocabulary-membership message is relevant here — HEADLESS_REQUIRED
    // legitimately adds its own (unrelated) probe_history cross-check error,
    // which is exercised separately in tests/source-investigation-probe-history.test.mjs.
    assert.ok(
      !validateInvestigation(record).some((e) => e.startsWith("site_classification.acquisition_class must be one of")),
      `${value} should be an accepted acquisition_class`,
    );
  }
  for (const value of EVIDENCE_CLASSES) {
    const record = baseInvestigation({ decision: { status: "HUMAN_REVIEW", reasons: ["n/a"], evidence_refs: [] } });
    record.evidence[1].evidence_class = value;
    record.evidence[1].byte_faithful = false; // avoid the AI_INTERPRETATION byte-faithful trap for this pass
    assert.ok(
      !validateInvestigation(record).some((e) => e.includes("evidence[1].evidence_class")),
      `${value} should be an accepted evidence_class`,
    );
  }
  assert.ok(COLLECTOR_FAMILIES.size > 0);
});

test("no top-level investigation field silently mutates sources/*.json — this module never performs I/O", () => {
  // validateInvestigation is a pure function of its argument: calling it
  // repeatedly with the same input is deterministic and side-effect-free.
  const record = baseInvestigation();
  const first = validateInvestigation(record);
  const second = validateInvestigation(record);
  assert.deepEqual(first, second);
  assert.deepEqual(record, baseInvestigation());
});
