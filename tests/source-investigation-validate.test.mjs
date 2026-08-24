import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  discoverInvestigationFiles,
  validateAllInvestigations,
  validateEvidenceFilesExist,
  validateInvestigationFile,
} from "../ingestion/source-investigation/validate.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The two SYNTHETIC governance fixtures actually committed under
// research/source-investigations/ for this package — see each directory's
// README.md. Neither describes a real venue.
const STATIC_HTML_FIXTURE = "research/source-investigations/example-static-html-ready-01/investigation.json";
const DEFER_FIXTURE = "research/source-investigations/example-headless-defer-01/investigation.json";

test("the committed STATIC_HTML-style fixture validates end-to-end (structure + evidence files exist)", () => {
  const result = validateInvestigationFile(STATIC_HTML_FIXTURE, REPO_ROOT);
  assert.deepEqual(result.errors, []);
});

test("the committed DEFER fixture validates end-to-end, proving DEFER is a fully-legitimate outcome", () => {
  const result = validateInvestigationFile(DEFER_FIXTURE, REPO_ROOT);
  assert.deepEqual(result.errors, []);
});

test("validateAllInvestigations discovers and passes every governed fixture in this repository", () => {
  const { results, ok } = validateAllInvestigations(REPO_ROOT);
  assert.equal(ok, true);
  const paths = results.map((r) => r.path);
  assert.ok(paths.includes(STATIC_HTML_FIXTURE));
  assert.ok(paths.includes(DEFER_FIXTURE));
});

// --- fs-aware checks against an isolated, disposable fixture root ---
//
// These use a throwaway directory under the OS temp dir purely as an
// *isolated test double repository root* passed explicitly as `repoRoot` —
// never as a claim that OS-temp paths are governed evidence locations
// within the real project. The real governed-path rule is exercised
// above, against the actual repository.

async function makeFixtureRoot() {
  return mkdtemp(join(tmpdir(), "botm-source-investigation-test-"));
}

function validRecord(overrides = {}) {
  return {
    investigation_id: "fixture-01",
    policy_version: "BOTM-SOURCE-INVESTIGATION-v1.0",
    investigated_at: "2026-08-25T00:00:00Z",
    investigator: { type: "AI", method: "PASSIVE_PROBE" },
    source_candidate_id: null,
    source_id: null,
    venue_reference: "Fixture Venue",
    official_url: null,
    identity: { status: "UNKNOWN", confidence: "NONE", evidence_refs: [], notes: null },
    site_classification: { acquisition_class: "UNKNOWN", platform: null, confidence: "NONE", evidence_refs: [] },
    data_paths: [],
    field_assessment: {
      title: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
      start_date: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
      time: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
      end: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
      venue_location: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
      source_record_id: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
      event_url: { state: "UNKNOWN", value: null, notes: null, evidence_refs: [] },
    },
    collector_assessment: { recommended_family: null, confidence: "NONE", evidence_refs: [], blockers: [] },
    decision: { status: "HUMAN_REVIEW", reasons: ["not yet investigated"], evidence_refs: [] },
    evidence: [],
    supersedes: null,
    ...overrides,
  };
}

test("validateEvidenceFilesExist passes when a DIRECT_EVIDENCE path resolves to a real retained file", async () => {
  const root = await makeFixtureRoot();
  try {
    const investigationDir = "research/source-investigations/fixture-01";
    await mkdir(join(root, investigationDir, "evidence"), { recursive: true });
    await writeFile(join(root, investigationDir, "evidence", "page.html"), "<html></html>", "utf8");

    const record = validRecord({
      evidence: [
        {
          evidence_id: "ev-1",
          evidence_class: "DIRECT_EVIDENCE",
          description: "retained page",
          acquired_from: "https://example.org/",
          acquired_at: "2026-08-25T00:00:00Z",
          method: "fixture",
          content_type: "text/html",
          byte_faithful: true,
          path: `${investigationDir}/evidence/page.html`,
        },
      ],
    });

    assert.deepEqual(validateEvidenceFilesExist(record, root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateEvidenceFilesExist fails when the referenced evidence file does not exist on disk", async () => {
  const root = await makeFixtureRoot();
  try {
    const record = validRecord({
      evidence: [
        {
          evidence_id: "ev-1",
          evidence_class: "DIRECT_EVIDENCE",
          description: "retained page",
          acquired_from: "https://example.org/",
          acquired_at: "2026-08-25T00:00:00Z",
          method: "fixture",
          content_type: "text/html",
          byte_faithful: true,
          path: "research/source-investigations/fixture-01/evidence/never-written.html",
        },
      ],
    });

    const errors = validateEvidenceFilesExist(record, root);
    assert.ok(errors.some((e) => e.includes("does not resolve to a real retained file")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discoverInvestigationFiles finds every investigation.json under a fixture root, and only those", async () => {
  const root = await makeFixtureRoot();
  try {
    await mkdir(join(root, "research/source-investigations/alpha"), { recursive: true });
    await mkdir(join(root, "research/source-investigations/beta"), { recursive: true });
    await writeFile(
      join(root, "research/source-investigations/alpha/investigation.json"),
      JSON.stringify(validRecord({ investigation_id: "alpha" })),
      "utf8",
    );
    await writeFile(
      join(root, "research/source-investigations/beta/investigation.json"),
      JSON.stringify(validRecord({ investigation_id: "beta" })),
      "utf8",
    );
    // A directory with no investigation.json must not be picked up.
    await mkdir(join(root, "research/source-investigations/gamma-incomplete"), { recursive: true });

    const files = discoverInvestigationFiles(root);
    assert.deepEqual(files, [
      "research/source-investigations/alpha/investigation.json",
      "research/source-investigations/beta/investigation.json",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateAllInvestigations against an empty repository root is trivially ok", async () => {
  const root = await makeFixtureRoot();
  try {
    const { results, ok } = validateAllInvestigations(root);
    assert.deepEqual(results, []);
    assert.equal(ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateInvestigationFile reports a parse error for malformed JSON without throwing", async () => {
  const root = await makeFixtureRoot();
  try {
    await mkdir(join(root, "research/source-investigations/broken"), { recursive: true });
    await writeFile(join(root, "research/source-investigations/broken/investigation.json"), "{ not json", "utf8");

    const result = validateInvestigationFile("research/source-investigations/broken/investigation.json", root);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].includes("could not read/parse"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- investigation validation never mutates the project's canonical data ---

async function snapshot(relativePath) {
  return readFile(resolve(REPO_ROOT, relativePath), "utf8");
}

test("running the validator never mutates sources/lisbon.json or sources/porto.json", async () => {
  const before = await Promise.all(["sources/lisbon.json", "sources/porto.json"].map(snapshot));
  validateAllInvestigations(REPO_ROOT);
  const after = await Promise.all(["sources/lisbon.json", "sources/porto.json"].map(snapshot));
  assert.deepEqual(before, after);
});

test("running the validator never mutates venues/lisbon.json, venues/porto.json, or venues/manual-coordinates.json", async () => {
  const paths = ["venues/lisbon.json", "venues/porto.json", "venues/manual-coordinates.json"];
  const before = await Promise.all(paths.map(snapshot));
  validateAllInvestigations(REPO_ROOT);
  const after = await Promise.all(paths.map(snapshot));
  assert.deepEqual(before, after);
});

test("running the validator never mutates the public map data artifact", async () => {
  const before = await snapshot("data/public/lisbon-porto-map.json");
  validateAllInvestigations(REPO_ROOT);
  const after = await snapshot("data/public/lisbon-porto-map.json");
  assert.equal(before, after);
});
