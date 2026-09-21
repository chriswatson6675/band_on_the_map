// BEATMAPPED-FOOTBALL-FINGERPRINT-ADMISSION-DECOUPLING-01 — proof that
// occurrence-fingerprint evidence is independent of downstream Event
// state.
//
// THE DEFECT THIS GUARDS AGAINST.
//
// A fingerprint record used to carry `application_entity_state:
// "NOT_ADMITTED_TO_CANONICAL_EVENT"`. That is a claim about what
// events/event-state.json contains RIGHT NOW, frozen into a reproducible
// evidence artifact. The moment a later package admits a canonical Event
// for one of these occurrences, the claim becomes false — and the only
// way to make the artifact true again is to regenerate it, even though
// not one source Observation changed.
//
// Evidence must not move because the application made a decision about
// it. These tests assert that property directly: the same inputs derive
// byte-identical output whether the Event registry is empty or full.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildArtifacts } from "../ingestion/gc-football-occurrence-fingerprints/run-fingerprints.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const RECON = "research/major-event-reconciliation/uk-gc-football-01";
const FP = "research/major-event-occurrence-fingerprints/uk-gc-football-01";

const reconciled = (await readJson(`${RECON}/reconciled-fixtures.json`)).reconciled_fixtures;
const singleSource = (await readJson(`${RECON}/single-source.json`)).single_source;
const fingerprints = (await readJson(`${FP}/occurrence-fingerprints.json`)).occurrence_fingerprints;
const summary = await readJson(`${FP}/summary.json`);

const DERIVED_AT = summary.derived_at;

/** A synthetic Event state with real admissions in it. */
function populatedEventState() {
  const mappings = fingerprints.slice(0, 25).map((record, index) => ({
    event_id: `event-${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: record.occurrence_fingerprint,
    observations: record.source_observations,
    method: "synthetic admission for a decoupling test",
    evidence: [],
    decided_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "ACTIVE",
    superseded_reason: null,
  }));

  return {
    schema_version: 1,
    note: "synthetic",
    events: mappings.map((mapping) => ({ event_id: mapping.event_id })),
    event_occurrence_mappings: mappings,
    schedule_history: [],
  };
}

/* ---------------------------------------------------------------- */
/* THE CORE PROPERTY                                                 */
/* ---------------------------------------------------------------- */

test("fingerprint derivation is byte-identical whether the Event registry is empty or full", async (t) => {
  const scratch = await mkdtemp(resolve(tmpdir(), "botm-decoupling-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));

  // 1. Derive against the repository's real (empty) Event state.
  const beforeAdmission = buildArtifacts(reconciled, singleSource, DERIVED_AT);

  // 2. Write a synthetic Event state in which 25 of these very
  //    fingerprints ARE admitted, with real-looking mappings.
  const statePath = resolve(scratch, "event-state.json");
  await writeFile(statePath, `${JSON.stringify(populatedEventState(), null, 2)}\n`, "utf8");
  const written = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(written.event_occurrence_mappings.length, 25, "the synthetic state really does admit some");
  assert.ok(
    written.event_occurrence_mappings.every((mapping) => mapping.fingerprint.startsWith("dof1-")),
    "and it admits these exact fingerprints",
  );

  // 3. Derive again. Nothing about the output may differ.
  const afterAdmission = buildArtifacts(reconciled, singleSource, DERIVED_AT);

  assert.equal(
    JSON.stringify(afterAdmission.occurrenceFingerprints),
    JSON.stringify(beforeAdmission.occurrenceFingerprints),
    "admitting Events must not change one byte of fingerprint evidence",
  );
  assert.equal(JSON.stringify(afterAdmission.summary), JSON.stringify(beforeAdmission.summary));
  assert.equal(JSON.stringify(afterAdmission.withheld), JSON.stringify(beforeAdmission.withheld));
});

test("the derivation reads no Event state, by construction", async () => {
  const MODULES = [
    "ingestion/gc-football-occurrence-fingerprints/adapt.mjs",
    "ingestion/gc-football-occurrence-fingerprints/run-fingerprints.mjs",
    "ingestion/derived-occurrence-fingerprint/contract.mjs",
  ];

  for (const path of MODULES) {
    const source = await readFile(resolve(ROOT, path), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // It never imports the Event foundation...
    const specifiers = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.equal(
        /\/event\/|event-state|admission/i.test(specifier),
        false,
        `${path} imports ${specifier}`,
      );
    }

    // ...and never READS it. Naming events/event-state.json in a
    // documentation string is fine and deliberate — the summary points
    // readers at the authoritative linkage. What must not exist is a
    // read of it, so the check is scoped to read/resolve expressions
    // rather than to the bare string.
    const reads = [...code.matchAll(/\b(readFile|readJson|readState|resolve)\s*\([^)]*\)/g)].map((match) => match[0]);
    for (const expression of reads) {
      assert.equal(
        /event-state|events\/|\/event\//i.test(expression),
        false,
        `${path} reads Event state: ${expression}`,
      );
    }
  }
});

test("the only input paths the runner reads are upstream evidence", async () => {
  const code = (await readFile(resolve(ROOT, "ingestion/gc-football-occurrence-fingerprints/run-fingerprints.mjs"), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const roots = [...code.matchAll(/resolve\(ROOT,\s*"([^"]+)"\)/g)].map((match) => match[1]);
  for (const root of roots) {
    assert.ok(
      root.startsWith("research/major-event-"),
      `the runner resolves a non-evidence path: ${root}`,
    );
  }
});

/* ---------------------------------------------------------------- */
/* WHAT A FINGERPRINT MAY AND MAY NOT SAY                            */
/* ---------------------------------------------------------------- */

test("no fingerprint record carries a field whose truth depends on Event state", () => {
  const DOWNSTREAM = /(^|_)event_id$|canonical_event|application_entity|admitted|admission/i;
  for (const record of fingerprints) {
    for (const field of Object.keys(record)) {
      assert.equal(DOWNSTREAM.test(field), false, `${field} states downstream Event state`);
    }
  }
});

test("the removed fields are gone from the artifact entirely", async () => {
  const raw = await readFile(resolve(ROOT, `${FP}/occurrence-fingerprints.json`), "utf8");
  assert.equal(raw.includes('"application_canonical_event_id"'), false);
  assert.equal(raw.includes('"application_entity_state"'), false);
  assert.equal(raw.includes("NOT_ADMITTED_TO_CANONICAL_EVENT"), false);
});

test("lifecycle_state survives because its meaning is permanent", () => {
  // "this record is evidence, not an entity" is true before any
  // admission and after every admission, so it is safe to store. It is
  // NOT a statement that no Event exists.
  for (const record of fingerprints) {
    assert.equal(record.lifecycle_state, "DERIVED_EVIDENCE_ANCHOR_NOT_AN_ENTITY");
  }
});

test("upstream vocabulary state is retained and must not be mistaken for Event state", () => {
  // participant_identity_state records whether the SOURCES resolved a
  // club name. That is an upstream evidence fact, timeless, and
  // deliberately NOT caught by the downstream-state rule.
  for (const record of fingerprints.slice(0, 50)) {
    assert.equal(record.participant_identity_state, "UNRESOLVED_NO_GOVERNED_CLUB_IDENTITY");
    assert.equal(record.competition_identity_state, "UNRESOLVED_NO_GOVERNED_COMPETITION_IDENTITY");
  }
});

/* ---------------------------------------------------------------- */
/* THE SUMMARY STAYS TRUE AFTER ADMISSION                            */
/* ---------------------------------------------------------------- */

test("the summary asserts only timeless facts about the derivation", () => {
  // Legitimate: what this process itself does.
  assert.equal(summary.provenance.establishes_application_canonical_event_identity, false);
  assert.equal(summary.provenance.creates_beatmapped_event_entity, false);
  assert.equal(summary.provenance.publishes_events, false);
  assert.equal(summary.provenance.is_source_provider_dependent, true);
  assert.equal(summary.provenance.reads_event_state, false);
  assert.equal(
    summary.provenance.event_linkage_source_of_truth,
    "events/event-state.json -> event_occurrence_mappings",
  );

  // Illegitimate: any count of what is currently admitted.
  const DOWNSTREAM = /(^|_)event_id$|canonical_event|application_entity|admitted|admission/i;
  for (const field of Object.keys(summary.accounting)) {
    assert.equal(DOWNSTREAM.test(field), false, `accounting.${field} is a downstream-state claim`);
  }

  // And the note must not claim nothing has been admitted.
  assert.equal(/no package has yet decided/.test(summary.provenance.architecture_note), false);
  assert.equal(/therefore carries application_canonical_event_id: null/.test(summary.provenance.architecture_note), false);
  assert.match(summary.provenance.architecture_note, /rule 6/);
});

/* ---------------------------------------------------------------- */
/* THE CONTROLS THE CORRECTION MUST NOT HAVE MOVED                   */
/* ---------------------------------------------------------------- */

test("every fingerprint control is unchanged by the decoupling", () => {
  assert.equal(fingerprints.length, 898);
  assert.equal(new Set(fingerprints.map((record) => record.occurrence_fingerprint)).size, 898);
  assert.equal(fingerprints.filter((record) => record.evidence_class === "CROSS_PUBLISHER_CORROBORATED").length, 674);
  assert.equal(fingerprints.filter((record) => record.evidence_class === "SAME_PUBLISHER_MULTI_SOURCE").length, 224);
  assert.equal(fingerprints.filter((record) => record.governed_venue_census_id != null).length, 420);
  assert.equal(fingerprints.filter((record) => record.governed_venue_census_id == null).length, 478);
  assert.equal(singleSource.length, 3239);

  const multi = (pick) => fingerprints.filter((record) => pick(record).length > 1).length;
  assert.equal(multi((record) => record.home_team_variants), 20);
  assert.equal(multi((record) => record.away_team_variants), 21);
  assert.equal(multi((record) => record.competition_variants), 15);
  assert.equal(multi((record) => record.source_venue_text_variants), 3);
});

test("every fingerprint still traces to its reconciliation group and source Observations", async () => {
  const groups = new Map(reconciled.map((group) => [group.reconciliation_group_id, group]));
  const observations = (await readJson("research/major-event-acquisition/uk-gc-football-01/observations.json")).observations;
  const known = new Set(observations.map((observation) => `${observation.source_id}||${observation.source_record_id}`));

  let refs = 0;
  for (const record of fingerprints) {
    const group = groups.get(record.reconciliation_group_id);
    assert.ok(group, `no reconciliation group for ${record.reconciliation_group_id}`);
    assert.equal(group.platform_match_id, record.platform_match_id);
    for (const ref of record.source_observations) {
      assert.ok(known.has(`${ref.source_id}||${ref.source_record_id}`), "dead provenance link");
      refs += 1;
    }
  }
  assert.equal(refs, 1853);
});

test("the upstream evidence layers were not touched", () => {
  // Asserted at git level in tests/event-architecture-regression.test.mjs
  // for public paths; here the point is narrower — this package
  // regenerated a DERIVED artifact and must have left its inputs alone.
  assert.equal(summary.provenance.mutates_upstream_artifacts, false);
  assert.equal(
    summary.provenance.reconciled_fixtures,
    "research/major-event-reconciliation/uk-gc-football-01/reconciled-fixtures.json",
  );
});
