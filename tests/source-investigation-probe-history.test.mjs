import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_VERSION,
  emptyCollectorAssessment,
  emptyFieldAssessment,
  emptyIdentity,
  emptySiteClassification,
  validateInvestigation,
} from "../ingestion/source-investigation/contract.mjs";

// A real, committed evidence file (from the SYNTHETIC governance fixture),
// reused so DIRECT_EVIDENCE-path checks exercise a genuine governed path
// without duplicating a second retained file just for these tests.
const REAL_EVIDENCE_PATH = "research/source-investigations/example-static-html-ready-01/evidence/agenda.html";

function evidenceItem(id) {
  return {
    evidence_id: id,
    evidence_class: "DIRECT_EVIDENCE",
    description: `retained evidence for ${id}`,
    acquired_from: "https://example.org/",
    acquired_at: "2026-08-25T00:00:00Z",
    method: "synthetic fixture",
    content_type: "text/html",
    byte_faithful: true,
    path: REAL_EVIDENCE_PATH,
  };
}

function probeEntry(level, method, outcome, overrides = {}) {
  return { level, method, outcome, reason: `level ${level} attempted`, evidence_refs: ["ev-1"], ...overrides };
}

/**
 * A minimal, structurally-valid investigation record with a HUMAN_REVIEW
 * decision, so READY_FOR_ACTIVATION's unrelated gates never interfere with
 * a probe_history-focused assertion. Everything not explicitly overridden
 * is honestly empty/UNKNOWN. `evidence` defaults to a single item ("ev-1")
 * — override it explicitly whenever a test's probe_history cites different
 * or additional evidence ids (or deliberately references one that does not
 * exist, to test dangling-ref detection).
 */
function minimalRecord(overrides = {}) {
  return {
    investigation_id: "probe-history-test",
    policy_version: POLICY_VERSION,
    investigated_at: "2026-08-25T00:00:00Z",
    investigator: { type: "AI", method: "escalation-ladder test fixture" },
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT")],
    source_candidate_id: null,
    source_id: null,
    venue_reference: "Probe History Test Fixture",
    official_url: null,
    identity: emptyIdentity(),
    site_classification: emptySiteClassification(),
    data_paths: [],
    field_assessment: emptyFieldAssessment(),
    collector_assessment: emptyCollectorAssessment(),
    decision: { status: "HUMAN_REVIEW", reasons: ["not yet decided"], evidence_refs: [] },
    evidence: [evidenceItem("ev-1")],
    supersedes: null,
    ...overrides,
  };
}

test("1. Level 1-only SUFFICIENT validates", () => {
  const record = minimalRecord({ probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT")] });
  assert.deepEqual(validateInvestigation(record), []);
});

test("2. Level 1 INSUFFICIENT -> Level 2 SUFFICIENT validates", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"), probeEntry(2, "STRUCTURAL", "SUFFICIENT")],
  });
  assert.deepEqual(validateInvestigation(record), []);
});

test("3. Level 1 -> 2 -> 3 sequential escalation validates", () => {
  const record = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "SUFFICIENT"),
    ],
  });
  assert.deepEqual(validateInvestigation(record), []);
});

test("full 1 -> 2 -> 3 -> 4 sequential escalation validates", () => {
  const record = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "INSUFFICIENT"),
      probeEntry(4, "BROWSER_COLLECTOR_CANDIDATE", "SUFFICIENT"),
    ],
  });
  assert.deepEqual(validateInvestigation(record), []);
});

test("probe_history is required and cannot be empty", () => {
  const record = minimalRecord({ probe_history: [] });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("probe_history is required")));
});

test("4. investigation starting at Level 2 fails", () => {
  const record = minimalRecord({ probe_history: [probeEntry(2, "STRUCTURAL", "SUFFICIENT")] });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("probe_history[0] must be level 1")));
});

test("5. Level 1 -> 3 (skipping Level 2) fails", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"), probeEntry(3, "BROWSER_OBSERVATION", "SUFFICIENT")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("must be exactly one more than the previous entry's level")));
});

test("6. Level 1 -> 2 -> 4 (skipping Level 3) fails", () => {
  const record = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(4, "BROWSER_COLLECTOR_CANDIDATE", "SUFFICIENT"),
    ],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("must be exactly one more than the previous entry's level")));
});

test("7. Level 2 immediately after Level 1 SUFFICIENT fails (SUFFICIENT terminates escalation)", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT"), probeEntry(2, "STRUCTURAL", "INSUFFICIENT")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("escalation is only justified when the preceding level's outcome is INSUFFICIENT")));
});

test("8. Level 3 after Level 2 BLOCKED fails (BLOCKED terminates escalation)", () => {
  const record = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "BLOCKED"),
      probeEntry(3, "BROWSER_OBSERVATION", "INSUFFICIENT"),
    ],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("escalation is only justified when the preceding level's outcome is INSUFFICIENT")));
});

test("a BLOCKED level with nothing following it validates (BLOCKED is a legitimate terminal outcome)", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"), probeEntry(2, "STRUCTURAL", "BLOCKED")],
    decision: { status: "DEFER", reasons: ["blocked at level 2"], evidence_refs: ["ev-1"] },
  });
  assert.deepEqual(validateInvestigation(record), []);
});

test("9. Level 3 requires Levels 1 and 2 both retained as INSUFFICIENT", () => {
  // Positive control: both insufficient, level 3 present -> valid.
  const good = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "SUFFICIENT"),
    ],
  });
  assert.deepEqual(validateInvestigation(good), []);

  // Level 2 present but SUFFICIENT (not INSUFFICIENT) -> level 3 invalid.
  const bad = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "SUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "INSUFFICIENT"),
    ],
  });
  assert.ok(validateInvestigation(bad).length > 0);
});

test("10. Level 4 requires Levels 1, 2, and 3 all retained as INSUFFICIENT", () => {
  // Positive control: 1/2/3 all insufficient, level 4 present -> valid.
  const good = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "INSUFFICIENT"),
      probeEntry(4, "BROWSER_COLLECTOR_CANDIDATE", "SUFFICIENT"),
    ],
  });
  assert.deepEqual(validateInvestigation(good), []);

  // Level 3 SUFFICIENT (not INSUFFICIENT) -> level 4 invalid.
  const bad = minimalRecord({
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "SUFFICIENT"),
      probeEntry(4, "BROWSER_COLLECTOR_CANDIDATE", "INSUFFICIENT"),
    ],
  });
  assert.ok(validateInvestigation(bad).length > 0);
});

test("11. unknown probe method fails", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "GOOGLE_IT", "SUFFICIENT")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes('probe_history[0].method must be "PASSIVE_STATIC" for level 1')));
});

test("a method that does not match its level fails, even if the method name is otherwise valid", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "STRUCTURAL", "SUFFICIENT")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes('probe_history[0].method must be "PASSIVE_STATIC" for level 1')));
});

test("12. unknown probe outcome fails", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "MAYBE")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("probe_history[0].outcome must be one of")));
});

test("13. probe entry with no evidence refs fails", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT", { evidence_refs: [] })],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("probe_history[0].evidence_refs must be a non-empty array")));
});

test("probe entry with an empty reason fails", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT", { reason: "" })],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("probe_history[0].reason is required")));
});

test("14. dangling probe evidence ref fails", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT", { evidence_refs: ["ev-ghost"] })],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes('dangling evidence reference "ev-ghost"')));
});

test("15. HEADLESS_REQUIRED without a retained Level 3 browser observation fails", () => {
  const record = minimalRecord({
    site_classification: { acquisition_class: "HEADLESS_REQUIRED", platform: null, confidence: "NONE", evidence_refs: [] },
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("HEADLESS_REQUIRED but probe_history contains no level 3")));
});

test("HEADLESS_REQUIRED with a retained Level 3 browser observation passes the cross-check", () => {
  const record = minimalRecord({
    site_classification: { acquisition_class: "HEADLESS_REQUIRED", platform: null, confidence: "NONE", evidence_refs: [] },
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "SUFFICIENT"),
    ],
  });
  const errors = validateInvestigation(record);
  assert.ok(!errors.some((e) => e.includes("HEADLESS_REQUIRED")));
});

test("16. a BROWSER_RENDERED collector recommendation without a retained Level 3 fails", () => {
  const record = minimalRecord({
    collector_assessment: { recommended_family: "BROWSER_RENDERED", confidence: "NONE", evidence_refs: [], blockers: [] },
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT")],
  });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes("BROWSER_RENDERED but probe_history contains no level 3")));
});

test("BROWSER_RENDERED collector recommendation with a retained Level 3 passes the cross-check", () => {
  const record = minimalRecord({
    collector_assessment: { recommended_family: "BROWSER_RENDERED", confidence: "NONE", evidence_refs: [], blockers: [] },
    probe_history: [
      probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"),
      probeEntry(2, "STRUCTURAL", "INSUFFICIENT"),
      probeEntry(3, "BROWSER_OBSERVATION", "SUFFICIENT"),
    ],
  });
  const errors = validateInvestigation(record);
  assert.ok(!errors.some((e) => e.includes("BROWSER_RENDERED")));
});

test("ordinary STATIC_HTML classification never requires browser probing", () => {
  const record = minimalRecord({
    site_classification: { acquisition_class: "STATIC_HTML", platform: null, confidence: "NONE", evidence_refs: [] },
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "SUFFICIENT")],
  });
  assert.deepEqual(validateInvestigation(record), []);
});

test("17. DEFER after an earlier level is valid and does not require exhausting Levels 1-4", () => {
  const record = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "BLOCKED")],
    decision: { status: "DEFER", reasons: ["explicit access control encountered at Level 1"], evidence_refs: ["ev-1"] },
  });
  assert.deepEqual(validateInvestigation(record), []);

  const recordTwo = minimalRecord({
    probe_history: [probeEntry(1, "PASSIVE_STATIC", "INSUFFICIENT"), probeEntry(2, "STRUCTURAL", "INSUFFICIENT")],
    decision: { status: "DEFER", reasons: ["no reliable public data path found by Level 2"], evidence_refs: ["ev-1"] },
  });
  assert.deepEqual(validateInvestigation(recordTwo), []);
});

test("18. a scratchpad-style prose explanation cannot substitute for a real probe_history", () => {
  const record = minimalRecord({
    investigator: {
      type: "AI",
      method:
        "I tried static acquisition and it didn't work, then tried structural inspection and that didn't work either, then used a browser and confirmed the classification.",
    },
    decision: {
      status: "DEFER",
      reasons: ["Passive and structural probing were both attempted and insufficient (see investigator.method)."],
      evidence_refs: ["ev-1"],
    },
  });
  delete record.probe_history;

  const errors = validateInvestigation(record);
  assert.ok(
    errors.some((e) => e.includes("probe_history is required")),
    "a prose narrative in investigator.method/decision.reasons must never substitute for retained probe_history entries",
  );
});
