import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_VERSION,
  SUPPORTED_POLICY_VERSIONS,
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

/**
 * A minimal, fully-valid-under-v1.1 investigation record (HUMAN_REVIEW
 * decision, so no unrelated activation gates interfere). Only
 * `policy_version` is expected to vary between tests here — every other
 * field is deliberately correct, so any failure a test finds can only be
 * attributed to the policy_version check itself, not some other rule.
 */
function minimalRecord(overrides = {}) {
  return {
    investigation_id: "policy-version-test",
    policy_version: POLICY_VERSION,
    investigated_at: "2026-08-25T00:00:00Z",
    investigator: { type: "AI", method: "policy-version test fixture" },
    probe_history: [
      { level: 1, method: "PASSIVE_STATIC", outcome: "SUFFICIENT", reason: "enough was found", evidence_refs: ["ev-1"] },
    ],
    source_candidate_id: null,
    source_id: null,
    venue_reference: "Policy Version Test Fixture",
    official_url: null,
    identity: emptyIdentity(),
    site_classification: emptySiteClassification(),
    data_paths: [],
    field_assessment: emptyFieldAssessment(),
    collector_assessment: emptyCollectorAssessment(),
    decision: { status: "HUMAN_REVIEW", reasons: ["not yet decided"], evidence_refs: [] },
    evidence: [
      {
        evidence_id: "ev-1",
        evidence_class: "DIRECT_EVIDENCE",
        description: "retained evidence",
        acquired_from: "https://example.org/",
        acquired_at: "2026-08-25T00:00:00Z",
        method: "synthetic fixture",
        content_type: "text/html",
        byte_faithful: true,
        path: REAL_EVIDENCE_PATH,
      },
    ],
    supersedes: null,
    ...overrides,
  };
}

test("1. a record declaring the current policy_version (v1.1) validates normally", () => {
  const record = minimalRecord({ policy_version: POLICY_VERSION });
  assert.equal(POLICY_VERSION, "BOTM-SOURCE-INVESTIGATION-v1.1");
  assert.deepEqual(validateInvestigation(record), []);
});

test("2. a v1.0 record fails explicitly as unsupported, not silently under v1.1 rules", () => {
  const record = minimalRecord({ policy_version: "BOTM-SOURCE-INVESTIGATION-v1.0" });
  const errors = validateInvestigation(record);
  assert.ok(
    errors.includes(
      'unsupported policy_version "BOTM-SOURCE-INVESTIGATION-v1.0" — current validator supports BOTM-SOURCE-INVESTIGATION-v1.1',
    ),
  );
  // It must be the *version* check that fails this record, not some
  // coincidental v1.1-only requirement (e.g. probe_history) — this record
  // is otherwise fully v1.1-valid, so the version check must be the one
  // and only reason it fails.
  assert.equal(errors.length, 1);
});

test("3. a v1.2 record fails explicitly as unsupported, not silently under v1.1 rules", () => {
  const record = minimalRecord({ policy_version: "BOTM-SOURCE-INVESTIGATION-v1.2" });
  const errors = validateInvestigation(record);
  assert.ok(
    errors.includes(
      'unsupported policy_version "BOTM-SOURCE-INVESTIGATION-v1.2" — current validator supports BOTM-SOURCE-INVESTIGATION-v1.1',
    ),
  );
  assert.equal(errors.length, 1);
});

test("an unsupported but well-formed major version (v2.0) also fails explicitly", () => {
  const record = minimalRecord({ policy_version: "BOTM-SOURCE-INVESTIGATION-v2.0" });
  const errors = validateInvestigation(record);
  assert.ok(errors.some((e) => e.includes('unsupported policy_version "BOTM-SOURCE-INVESTIGATION-v2.0"')));
});

test("4. malformed policy_version values fail with the shape error, not the unsupported-version error", () => {
  for (const badValue of [
    "v1.1",
    "BOTM-SOURCE-INVESTIGATION-v1",
    "BOTM-SOURCE-INVESTIGATION-v1.1.0",
    "botm-source-investigation-v1.1",
    "garbage",
    "",
    null,
  ]) {
    const record = minimalRecord({ policy_version: badValue });
    const errors = validateInvestigation(record);
    assert.ok(
      errors.some((e) => e.startsWith("policy_version is required and must match")),
      `${JSON.stringify(badValue)} should fail the shape check`,
    );
    assert.ok(
      !errors.some((e) => e.startsWith("unsupported policy_version")),
      `${JSON.stringify(badValue)} is malformed, not merely unsupported — it must not also report the unsupported-version message`,
    );
  }
});

test("5. no record is silently evaluated under the wrong policy semantics — the version check gates independently of everything else", () => {
  // This record is fully valid under v1.1's own rules (see test 1). Only
  // its policy_version is swapped to an unsupported value. If the
  // validator ever "fell through" to applying v1.1 semantics regardless
  // of the declared version, this record would incorrectly pass.
  for (const unsupportedVersion of ["BOTM-SOURCE-INVESTIGATION-v1.0", "BOTM-SOURCE-INVESTIGATION-v0.9", "BOTM-SOURCE-INVESTIGATION-v1.2"]) {
    const record = minimalRecord({ policy_version: unsupportedVersion });
    const errors = validateInvestigation(record);
    assert.ok(
      errors.length > 0,
      `a record declaring ${unsupportedVersion} must never validate merely because it happens to satisfy v1.1's other rules`,
    );
    assert.ok(errors.every((e) => e.includes(unsupportedVersion) || e.includes("unsupported policy_version")));
  }

  assert.deepEqual([...SUPPORTED_POLICY_VERSIONS], [POLICY_VERSION]);
});
