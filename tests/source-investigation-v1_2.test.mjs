import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FIELD_BASIS_VALUES,
  POLICY_VERSION_V1_1,
  POLICY_VERSION_V1_2,
  emptyCollectorAssessment,
  emptyFieldAssessmentV1_2,
  emptyIdentity,
  emptySiteClassification,
  validateInvestigation,
  validateInvestigationV1_1,
  validateInvestigationV1_2,
} from "../ingestion/source-investigation/contract.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A real, committed evidence file, reused so DIRECT_EVIDENCE-path checks
// exercise a genuine governed path without duplicating a second retained
// file just for these tests.
const REAL_EVIDENCE_PATH = "research/source-investigations/example-static-html-ready-01/evidence/agenda.html";

function directEvidence(id, overrides = {}) {
  return {
    evidence_id: id,
    evidence_class: "DIRECT_EVIDENCE",
    description: "retained evidence",
    acquired_from: "https://example.org/",
    acquired_at: "2026-08-25T00:00:00Z",
    method: "synthetic fixture",
    content_type: "text/html",
    byte_faithful: true,
    path: REAL_EVIDENCE_PATH,
    ...overrides,
  };
}

function derivationEvidence(id, overrides = {}) {
  return {
    evidence_id: id,
    evidence_class: "DETERMINISTIC_DERIVATION",
    description: "offline re-parse proving the contextual combination",
    acquired_from: REAL_EVIDENCE_PATH,
    acquired_at: "2026-08-25T00:00:00Z",
    method: "deterministic re-parse, no network access",
    content_type: null,
    byte_faithful: false,
    path: null,
    ...overrides,
  };
}

function provenDirect(value, overrides = {}) {
  return { state: "PROVEN", value, basis: "DIRECT_SOURCE", derivation: null, notes: null, evidence_refs: ["ev-1"], ...overrides };
}

/**
 * A minimal, v1.2-shaped investigation record with a HUMAN_REVIEW
 * decision (so READY_FOR_ACTIVATION's extra gates never interfere unless
 * a test explicitly opts into them). Every field_assessment entry is the
 * honestly-empty v1.2 shape; tests override individual entries to
 * exercise one basis/derivation rule at a time.
 */
function minimalV1_2Record(overrides = {}) {
  return {
    investigation_id: "v1-2-test",
    policy_version: POLICY_VERSION_V1_2,
    investigated_at: "2026-08-25T00:00:00Z",
    investigator: { type: "AI", method: "v1.2 contract test fixture" },
    probe_history: [
      { level: 1, method: "PASSIVE_STATIC", outcome: "SUFFICIENT", reason: "enough was found", evidence_refs: ["ev-1"] },
    ],
    source_candidate_id: null,
    source_id: null,
    venue_reference: "v1.2 Test Fixture Venue",
    official_url: null,
    identity: emptyIdentity(),
    site_classification: emptySiteClassification(),
    data_paths: [],
    field_assessment: emptyFieldAssessmentV1_2(),
    collector_assessment: emptyCollectorAssessment(),
    decision: { status: "HUMAN_REVIEW", reasons: ["not yet decided"], evidence_refs: [] },
    evidence: [directEvidence("ev-1")],
    supersedes: null,
    ...overrides,
  };
}

function readRealInvestigation(id) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, "research/source-investigations", id, "investigation.json"), "utf8"));
}

// --- dispatcher sanity ---

test("validateInvestigation dispatches v1.1 records to validateInvestigationV1_1 and v1.2 records to validateInvestigationV1_2", () => {
  const v11 = readRealInvestigation("example-static-html-ready-01");
  const v12 = readRealInvestigation("example-deterministic-context-ready-01");
  assert.equal(v11.policy_version, POLICY_VERSION_V1_1);
  assert.equal(v12.policy_version, POLICY_VERSION_V1_2);
  assert.deepEqual(validateInvestigation(v11), validateInvestigationV1_1(v11));
  assert.deepEqual(validateInvestigation(v12), validateInvestigationV1_2(v12));
  assert.deepEqual(validateInvestigation(v11), []);
  assert.deepEqual(validateInvestigation(v12), []);
});

test("FIELD_BASIS_VALUES contains exactly DIRECT_SOURCE, DETERMINISTIC_CONTEXT, AI_INFERENCE", () => {
  assert.deepEqual([...FIELD_BASIS_VALUES].sort(), ["AI_INFERENCE", "DETERMINISTIC_CONTEXT", "DIRECT_SOURCE"].sort());
});

// --- 1. v1.1 historical record still validates ---

test("1. a v1.1 historical record (no basis/derivation fields at all) still validates under the dispatcher", () => {
  const record = readRealInvestigation("example-static-html-ready-01");
  assert.ok(!("basis" in record.field_assessment.title));
  assert.deepEqual(validateInvestigation(record), []);
});

// --- 2/3. DIRECT_SOURCE and DETERMINISTIC_CONTEXT precise values validate ---

test("2. a v1.2 DIRECT_SOURCE precise date validates", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = provenDirect("2026-09-17");
  assert.deepEqual(validateInvestigationV1_2(record), []);
});

test("3. a v1.2 DETERMINISTIC_CONTEXT precise date validates", () => {
  const record = minimalV1_2Record({ evidence: [directEvidence("ev-1"), derivationEvidence("ev-2")] });
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    notes: "heading establishes month/year, card establishes day",
    evidence_refs: ["ev-1", "ev-2"],
    derivation: {
      rule: "the nearest preceding month/year heading governs every event row beneath it until the next heading; concatenate with the row's own day",
      inputs: ["September 2026", "17"],
    },
  };
  assert.deepEqual(validateInvestigationV1_2(record), []);
});

// --- 4. heading + card deterministically yields exactly one date ---

test("4. page heading \"September 2026\" + card \"17\" deterministically yields 2026-09-17", () => {
  const record = minimalV1_2Record({ evidence: [directEvidence("ev-1"), derivationEvidence("ev-2")] });
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    notes: null,
    evidence_refs: ["ev-1", "ev-2"],
    derivation: {
      rule: "\"<Month> <Year>\" heading concatenated with the row's own day yields <Year>-<MM>-<DD>",
      inputs: ["September 2026", "17"],
    },
  };
  const errors = validateInvestigationV1_2(record);
  assert.deepEqual(errors, []);
  assert.equal(record.field_assessment.start_date.value, "2026-09-17");
});

// --- 5. DETERMINISTIC_CONTEXT without derivation metadata fails ---

test("5. DETERMINISTIC_CONTEXT without derivation metadata fails", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    derivation: null,
    notes: null,
    evidence_refs: ["ev-1"],
  };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.derivation is required")));
});

// --- 6. DETERMINISTIC_CONTEXT without evidence refs fails ---

test("6. DETERMINISTIC_CONTEXT without evidence refs fails", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    derivation: { rule: "heading + day combination", inputs: ["September 2026", "17"] },
    notes: null,
    evidence_refs: [],
  };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.evidence_refs must be non-empty when state is PROVEN")));
});

// --- 7. DETERMINISTIC_CONTEXT with ambiguous (insufficient) inputs fails ---

test("7. DETERMINISTIC_CONTEXT with fewer than 2 derivation inputs fails", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    derivation: { rule: "day only, nothing to combine it with", inputs: ["17"] },
    notes: null,
    evidence_refs: ["ev-1"],
  };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.derivation.inputs must be an array of at least 2 strings")));
});

// --- 8. AI_INFERENCE cannot carry state PROVEN ---

test("8. AI_INFERENCE cannot carry state PROVEN", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "AI_INFERENCE",
    derivation: null,
    notes: "today is August, the card says 17 September, so it's probably this September",
    evidence_refs: ["ev-1"],
  };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.basis cannot be AI_INFERENCE for a PROVEN field")));
});

// --- 9/10. non-PROVEN fields cannot carry a value or a basis ---

test("9. a non-PROVEN field cannot carry a value", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = { state: "AMBIGUOUS", value: "2026-09-17", basis: null, derivation: null, notes: null, evidence_refs: ["ev-1"] };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.value must be null unless state is PROVEN")));
});

test("10. a non-PROVEN field cannot carry a basis", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = { state: "AMBIGUOUS", value: null, basis: "DIRECT_SOURCE", derivation: null, notes: null, evidence_refs: ["ev-1"] };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.basis must be null unless state is PROVEN")));
});

// --- 11. PROVEN field without basis fails ---

test("11. a PROVEN field without a basis fails", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = { state: "PROVEN", value: "2026-09-17", basis: null, derivation: null, notes: null, evidence_refs: ["ev-1"] };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.basis is required when state is PROVEN")));
});

// --- 12. unsupported field basis fails ---

test("12. an unrecognised field basis value fails", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = { state: "PROVEN", value: "2026-09-17", basis: "VIBES", derivation: null, notes: null, evidence_refs: ["ev-1"] };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.basis must be one of")));
});

// --- 13. DIRECT_SOURCE does not require invented derivation metadata ---

test("13. a DIRECT_SOURCE fact does not require (or accept) invented derivation metadata", () => {
  const record = minimalV1_2Record();
  record.field_assessment.title = provenDirect("Synthetic Test Concert Night");
  assert.equal(record.field_assessment.title.derivation, null);
  assert.deepEqual(validateInvestigationV1_2(record), []);

  // Populating derivation on a DIRECT_SOURCE entry is rejected outright —
  // derivation is meaningful only for DETERMINISTIC_CONTEXT.
  const bad = minimalV1_2Record();
  bad.field_assessment.title = provenDirect("Synthetic Test Concert Night", {
    derivation: { rule: "unnecessary", inputs: ["a", "b"] },
  });
  const errors = validateInvestigationV1_2(bad);
  assert.ok(errors.some((e) => e.includes("field_assessment.title.derivation must be null unless basis is DETERMINISTIC_CONTEXT")));
});

// --- 14/15. activation gate behaviour ---

function activationReadyRecord(overrides = {}) {
  const record = minimalV1_2Record({
    identity: { status: "PROVEN", confidence: "HIGH", evidence_refs: ["ev-1"], notes: null },
    site_classification: { acquisition_class: "STATIC_HTML", platform: null, confidence: "HIGH", evidence_refs: ["ev-1"] },
    data_paths: [
      { kind: "HTML_EVENT_LIST_PAGE", url: "https://example.org/agenda", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: ["ev-1"] },
    ],
    collector_assessment: { recommended_family: "STATIC_EVENT_LIST", confidence: "HIGH", evidence_refs: ["ev-1"], blockers: [] },
    decision: { status: "READY_FOR_ACTIVATION", reasons: ["all gates satisfied"], evidence_refs: ["ev-1", "ev-2"] },
    evidence: [directEvidence("ev-1"), derivationEvidence("ev-2")],
    ...overrides,
  });
  record.field_assessment.title = provenDirect("Synthetic Test Concert Night");
  record.field_assessment.source_record_id = provenDirect("evt-0001");
  record.field_assessment.event_url = provenDirect("https://example.org/agenda/evt-0001");
  return record;
}

test("14. activation accepts a required precise field (start_date) proven by DETERMINISTIC_CONTEXT with a cited offline proof", () => {
  const record = activationReadyRecord();
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    notes: null,
    evidence_refs: ["ev-1", "ev-2"],
    derivation: {
      rule: "month/year heading concatenated with the row's own day yields exactly one date",
      inputs: ["September 2026", "17"],
    },
  };
  assert.deepEqual(validateInvestigationV1_2(record), []);
});

test("DETERMINISTIC_CONTEXT gated field without a cited DETERMINISTIC_DERIVATION evidence item fails activation", () => {
  const record = activationReadyRecord({ evidence: [directEvidence("ev-1")] }); // no derivation-proof evidence at all
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    notes: null,
    evidence_refs: ["ev-1"],
    derivation: { rule: "heading + day combination", inputs: ["September 2026", "17"] },
  };
  record.decision.evidence_refs = ["ev-1"];
  const errors = validateInvestigationV1_2(record);
  assert.ok(
    errors.some((e) => e.includes("READY_FOR_ACTIVATION requires field_assessment.start_date (basis DETERMINISTIC_CONTEXT) to cite at least one DETERMINISTIC_DERIVATION evidence item")),
  );
});

test("15. activation rejects a required field whose exact value relies on AI_INFERENCE", () => {
  const record = activationReadyRecord();
  record.field_assessment.title = {
    state: "PROVEN",
    value: "Synthetic Test Concert Night",
    basis: "AI_INFERENCE",
    derivation: null,
    notes: "plausible guess",
    evidence_refs: ["ev-1"],
  };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes("field_assessment.title.basis cannot be AI_INFERENCE for a PROVEN field")));
});

// --- 16. current date alone cannot supply an omitted year ---

test("16. a derivation rule that leans on today's date / plausibility is rejected outright", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-09-17",
    basis: "DETERMINISTIC_CONTEXT",
    notes: null,
    evidence_refs: ["ev-1"],
    derivation: {
      rule: "today's date is August 2026 and the card says 17 September, so it's most likely this September",
      inputs: ["today: 2026-08-25", "17 September"],
    },
  };
  const errors = validateInvestigationV1_2(record);
  assert.ok(errors.some((e) => e.includes('derivation.rule contains "today"') || e.includes('derivation.rule contains "most likely"')));
});

// --- 17/18. season context: unique mapping derives a year; multiple possibilities stay unresolved ---

test("17. season context with an explicit, unique deterministic mapping may derive a year", () => {
  const record = minimalV1_2Record({ evidence: [directEvidence("ev-1"), derivationEvidence("ev-2")] });
  record.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-10-12",
    basis: "DETERMINISTIC_CONTEXT",
    notes: "the venue's own programme page documents its season boundary explicitly (Sept-Aug), not inferred",
    evidence_refs: ["ev-1", "ev-2"],
    derivation: {
      rule: "the source's own retained season-boundary statement (season N/N+1 runs September of year N through August of year N+1) mechanically maps October within \"2026/27 Season\" to calendar year 2026; concatenated with the card's own day",
      inputs: ["2026/27 Season", "October", "12"],
    },
  };
  assert.deepEqual(validateInvestigationV1_2(record), []);
});

test("18. season context with no month/insufficient context stays unresolved, not forced to PROVEN", () => {
  const record = minimalV1_2Record();
  record.field_assessment.start_date = {
    state: "AMBIGUOUS",
    value: null,
    basis: null,
    derivation: null,
    notes: "the retained page states only \"2026/27 Season\" for this event's row, with no month — the exact date cannot be determined from retained context alone",
    evidence_refs: ["ev-1"],
  };
  assert.deepEqual(validateInvestigationV1_2(record), []);

  // Attempting to force PROVEN from the season heading alone (one input,
  // no month) fails the same structural "at least 2 inputs" rule as test 7.
  const forced = minimalV1_2Record();
  forced.field_assessment.start_date = {
    state: "PROVEN",
    value: "2026-01-01",
    basis: "DETERMINISTIC_CONTEXT",
    notes: null,
    evidence_refs: ["ev-1"],
    derivation: { rule: "season heading alone, no month given", inputs: ["2026/27 Season"] },
  };
  const errors = validateInvestigationV1_2(forced);
  assert.ok(errors.some((e) => e.includes("derivation.inputs must be an array of at least 2 strings")));
});

// --- 19. inherited venue context ---

test("19. inherited venue context works when structurally proven", () => {
  const record = minimalV1_2Record({ evidence: [directEvidence("ev-1"), derivationEvidence("ev-2")] });
  record.field_assessment.venue_location = {
    state: "PROVEN",
    value: "Sala X",
    basis: "DETERMINISTIC_CONTEXT",
    notes: "child event row is structurally nested inside the Sala X section; every row in that section inherits its venue",
    evidence_refs: ["ev-1", "ev-2"],
    derivation: {
      rule: "every event row nested inside <section data-venue-name=\"...\"> inherits that section's venue name; containment is checked structurally, not by page layout or proximity",
      inputs: ["Sala X (venue-section heading)", "event row is structurally nested inside that section"],
    },
  };
  assert.deepEqual(validateInvestigationV1_2(record), []);
});

// --- 20. inherited price/free context ---

test("20. inherited price/free context works only when structurally proven", () => {
  const record = minimalV1_2Record({ evidence: [directEvidence("ev-1"), derivationEvidence("ev-2")] });
  record.field_assessment.price = {
    state: "PROVEN",
    value: "FREE",
    basis: "DETERMINISTIC_CONTEXT",
    notes: "child event row is structurally nested inside the \"Entrada livre\" section",
    evidence_refs: ["ev-1", "ev-2"],
    derivation: {
      rule: "every event row nested inside <section data-price-label=\"Entrada livre\"> inherits FREE as its price — the source's own explicit free-admission label, not an inferred absence of a price field",
      inputs: ["Entrada livre (price-section heading)", "event row is structurally nested inside that section"],
    },
  };
  assert.deepEqual(validateInvestigationV1_2(record), []);

  // Without structural proof (only one input — the heading alone, no
  // stated containment relationship) the same insufficient-inputs rule
  // blocks it from being forced to PROVEN.
  const unproven = minimalV1_2Record();
  unproven.field_assessment.price = {
    state: "PROVEN",
    value: "FREE",
    basis: "DETERMINISTIC_CONTEXT",
    notes: null,
    evidence_refs: ["ev-1"],
    derivation: { rule: "the page mentions free entry somewhere", inputs: ["Entrada livre"] },
  };
  const errors = validateInvestigationV1_2(unproven);
  assert.ok(errors.some((e) => e.includes("derivation.inputs must be an array of at least 2 strings")));
});

// --- 21. old v1.1 records are NOT silently upgraded to v1.2 ---

test("21. the same v1.1-shaped field_assessment (no basis key) validates under v1.1 but fails under v1.2 — no silent upgrade", () => {
  const v11Entry = { state: "PROVEN", value: "2026-09-17", notes: null, evidence_refs: ["ev-1"] }; // no basis/derivation keys at all

  const v11Record = minimalV1_2Record({ policy_version: POLICY_VERSION_V1_1 });
  v11Record.field_assessment.start_date = v11Entry;
  assert.deepEqual(validateInvestigation(v11Record), []);

  const v12Record = minimalV1_2Record({ policy_version: POLICY_VERSION_V1_2 });
  v12Record.field_assessment.start_date = v11Entry; // identical shape, only the declared version differs
  const errors = validateInvestigation(v12Record);
  assert.ok(errors.length > 0, "a v1.1-shaped entry must not silently pass v1.2's stricter basis requirement");
  assert.ok(errors.some((e) => e.includes("field_assessment.start_date.basis is required")));
});

// --- 22. all existing real trial investigations continue validating unchanged ---

test("22. all three real BOTM-DIFFICULT-SOURCE-TRIAL-01 investigations continue validating unchanged (still v1.1)", () => {
  for (const id of ["hard-club-porto-01", "maus-habitos-porto-01", "gulbenkian-lisbon-01"]) {
    const record = readRealInvestigation(id);
    assert.equal(record.policy_version, POLICY_VERSION_V1_1, `${id} should remain a v1.1 record — history is never rewritten`);
    assert.deepEqual(validateInvestigation(record), [], `${id} should still validate cleanly`);
  }
});
