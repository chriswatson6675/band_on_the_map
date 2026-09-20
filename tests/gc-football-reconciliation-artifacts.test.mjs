// BEATMAPPED-UK-GC-FOOTBALL-MULTISOURCE-FIXTURE-RECONCILIATION-01 —
// validation of the REAL derived reconciliation layer.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RECONCILIATION_STATES, reconciliationGroupId } from "../ingestion/gc-football-reconciliation/contract.mjs";
import { reconcileAll } from "../ingestion/gc-football-reconciliation/reconcile.mjs";
import { buildArtifacts } from "../ingestion/gc-football-reconciliation/run-reconciliation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const RECON = "research/major-event-reconciliation/uk-gc-football-01";
const reconciled = (await readJson(`${RECON}/reconciled-fixtures.json`)).reconciled_fixtures;
const conflicts = (await readJson(`${RECON}/conflicts.json`)).conflicts;
const singleSource = (await readJson(`${RECON}/single-source.json`)).single_source;
const summary = await readJson(`${RECON}/summary.json`);
const evidence = await readJson(`${RECON}/evidence.json`);

const observations = (await readJson("research/major-event-acquisition/uk-gc-football-01/observations.json")).observations;
const attributions = (await readJson("research/major-event-attribution/uk-gc-football-01/attributions.json")).attributions;

/* ---------------------------------------------------------------- */
/* ACCOUNTING — every Observation stays accountable                  */
/* ---------------------------------------------------------------- */

test("all 5,092 source observations are accounted for exactly once", () => {
  assert.equal(observations.length, 5092);
  assert.equal(summary.accounting.source_observations, observations.length);
  assert.equal(summary.accounting.observations_accounted_for, observations.length);
  assert.equal(summary.accounting.observations_without_reconciliation_key, 0);

  // Multi-source + single-source observation counts must sum to the input.
  const { observations_in_multi_source_ids: multi, observations_in_single_source_ids: single } = summary.accounting;
  assert.equal(multi + single, observations.length, "the partition must be exhaustive");
});

test("every member reference resolves to a real Observation, and none appears twice", () => {
  const known = new Set(observations.map((o) => `${o.source_id}||${o.source_record_id}`));
  const seen = new Set();
  const groups = [...reconciled, ...conflicts];
  for (const group of groups) {
    for (const ref of group.members) {
      const key = `${ref.source_id}||${ref.source_record_id}`;
      assert.ok(known.has(key), `member references an unknown Observation: ${key}`);
      assert.ok(!seen.has(key), `Observation appears in more than one group: ${key}`);
      seen.add(key);
    }
  }
  for (const entry of singleSource) {
    for (const ref of entry.members) {
      const key = `${ref.source_id}||${ref.source_record_id}`;
      assert.ok(known.has(key));
      assert.ok(!seen.has(key), `Observation appears in more than one group: ${key}`);
      seen.add(key);
    }
  }
  assert.equal(seen.size, observations.length, "every Observation must belong to exactly one group");
});

test("group state totals reconcile with no remainder", () => {
  const total = Object.values(summary.by_reconciliation_state).reduce((a, b) => a + b, 0);
  assert.equal(total, summary.accounting.distinct_platform_match_ids);
  assert.equal(reconciled.length, summary.reconciliation.reconciled_multi_source_groups);
  assert.equal(singleSource.length, summary.reconciliation.single_source_groups_left_untouched);
  assert.equal(conflicts.length, summary.reconciliation.conflict_groups);
  for (const group of [...reconciled, ...conflicts]) {
    assert.ok(RECONCILIATION_STATES.has(group.reconciliation_state));
  }
});

/* ---------------------------------------------------------------- */
/* PREDECESSOR CONTROLS                                              */
/* ---------------------------------------------------------------- */

test("the predecessor's measured controls reproduce exactly", () => {
  const audit = summary.collision_audit;
  assert.equal(audit.distinct_platform_match_ids, 4137);
  assert.equal(audit.match_ids_with_multiple_observations, 898);
  assert.equal(summary.accounting.single_source_match_ids, 3239);
  assert.equal(summary.max_source_multiplicity, 4);
  // The two controls that would invalidate the reconciliation key.
  assert.equal(audit.match_id_kickoff_collisions, 0);
  assert.equal(audit.match_id_resolved_venue_collisions, 0);
  // Naming variation, measured and NOT treated as a collision.
  assert.equal(audit.multi_observation_ids_with_home_team_variants, 20);
  assert.equal(audit.multi_observation_ids_with_away_team_variants, 21);
  assert.equal(audit.multi_observation_ids_with_competition_variants, 15);
  assert.equal(audit.multi_observation_ids_with_venue_text_variants, 3);
});

test("duplicate reduction is a DERIVED count, arithmetically exact", () => {
  const represented = reconciled.reduce((n, g) => n + g.member_count, 0);
  assert.equal(summary.reconciliation.source_observations_represented, represented);
  assert.equal(summary.reconciliation.analytical_duplicate_reduction, represented - reconciled.length);
  assert.equal(observations.length, summary.accounting.source_observations, "no Observation was deleted");
});

/* ---------------------------------------------------------------- */
/* THE KEY AND ITS CONSEQUENCES                                      */
/* ---------------------------------------------------------------- */

test("every reconciled group is genuinely multi-source, with one kickoff", () => {
  for (const group of reconciled) {
    assert.ok(group.source_count >= 2, "a reconciled group needs at least two distinct sources");
    assert.equal(group.kickoff_variants.length, 1, "a reconciled group has exactly one kickoff");
    assert.ok(group.kickoff_utc, "kickoff must be present");
    assert.equal(group.reconciliation_group_id, reconciliationGroupId(group.platform_match_id, group.kickoff_utc));
  }
});

test("single-source match ids are left untouched and assert nothing", () => {
  assert.ok(singleSource.length > 3000, "the out-of-scope population must be reported, not hidden");
  for (const entry of singleSource) {
    assert.equal(entry.reconciliation_state, "SINGLE_SOURCE_NOT_IN_SCOPE");
    assert.equal(entry.members.length, 1);
  }
});

test("no group mints canonical Event identity", () => {
  for (const group of [...reconciled, ...conflicts]) {
    assert.ok(!("event_id" in group));
    assert.ok(!("canonical_event_id" in group));
    assert.ok(!("merged_with" in group));
    // The group id is a deterministic function of the evidence, not an
    // authority-bearing identifier.
    if (group.reconciliation_group_id) assert.match(group.reconciliation_group_id, /^gcf-/);
  }
  assert.equal(summary.provenance.creates_canonical_event_identity, false);
});

/* ---------------------------------------------------------------- */
/* VENUE                                                             */
/* ---------------------------------------------------------------- */

test("a reconciled venue is supported by named member observations, and conflicts pick nobody", () => {
  for (const group of reconciled) {
    if (group.reconciled_venue_census_id) {
      assert.equal(group.venue_evidence_state, "AGREED_BY_ALL_RESOLVED_MEMBERS");
      assert.ok(group.venue_supported_by.length > 0, "a reconciled venue must name which observations support it");
      assert.ok(group.venue_supported_by.length <= group.member_count);
    } else {
      assert.equal(group.venue_evidence_state, "NO_MEMBER_RESOLVED");
      assert.equal(group.venue_supported_by.length, 0);
    }
  }
  for (const group of conflicts.filter((g) => g.reconciliation_state === "CONFLICT_RESOLVED_VENUE")) {
    assert.equal(group.reconciled_venue_census_id, null, "a venue conflict must never choose a winner");
  }
});

test("a reconciled venue never contradicts its members' attributions", () => {
  const byRef = new Map(attributions.map((a) => [`${a.source_id}||${a.source_record_id}`, a]));
  for (const group of reconciled) {
    if (!group.reconciled_venue_census_id) continue;
    for (const ref of group.members) {
      const attribution = byRef.get(`${ref.source_id}||${ref.source_record_id}`);
      if (!attribution.resolved_venue_census_id) continue;
      assert.equal(
        attribution.resolved_venue_census_id,
        group.reconciled_venue_census_id,
        "a member that resolved a venue must agree with the group's venue",
      );
    }
  }
});

/* ---------------------------------------------------------------- */
/* NAMING VARIANTS RETAINED                                          */
/* ---------------------------------------------------------------- */

test("naming variants are retained verbatim and never used as keys", () => {
  const byRef = new Map(observations.map((o) => [`${o.source_id}||${o.source_record_id}`, o]));
  let withVariants = 0;
  for (const group of reconciled) {
    if (group.home_team_variants.length > 1 || group.competition_variants.length > 1) withVariants += 1;
    // Every retained variant must be a value some member genuinely published.
    for (const detail of group.member_detail) {
      const observation = byRef.get(`${detail.source_id}||${detail.source_record_id}`);
      assert.equal(detail.home_team_raw, observation.source_fields.team_names?.[0] ?? null);
      assert.equal(detail.competition_raw, observation.source_fields.competition_name ?? null);
      assert.equal(detail.source_venue_text_raw, observation.venue_name ?? null);
    }
  }
  assert.ok(withVariants > 0, "the corpus must actually contain reconciled groups with naming variants");
});

/* ---------------------------------------------------------------- */
/* DETERMINISM                                                       */
/* ---------------------------------------------------------------- */

test("DETERMINISM: reconciling twice yields identical output", () => {
  const first = reconcileAll(observations, attributions);
  const second = reconcileAll(observations, attributions);
  assert.deepEqual(first, second);
});

test("DETERMINISM: a rerun reproduces the retained artifacts byte-for-byte", () => {
  const rebuilt = buildArtifacts(observations, attributions, summary.derived_at);
  assert.deepEqual(rebuilt.summary, summary, "summary.json must be reproducible from its inputs");
  assert.deepEqual(rebuilt.reconciled, reconciled, "reconciled-fixtures.json must be reproducible");
  assert.deepEqual(rebuilt.audit.per_match_id, evidence.collision_audit, "the audit must be reproducible");
});

test("DETERMINISM: output ordering is stable and input-order independent", () => {
  const ids = reconciled.map((g) => g.platform_match_id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)), "groups must be emitted in a stable order");
  const shuffled = [...observations].reverse();
  const reversed = reconcileAll(shuffled, attributions).groups.map((g) => g.platform_match_id);
  assert.deepEqual(reversed, reconcileAll(observations, attributions).groups.map((g) => g.platform_match_id));
});

/* ---------------------------------------------------------------- */
/* IMMUTABILITY AND SAFETY                                           */
/* ---------------------------------------------------------------- */

test("IMMUTABILITY: source observations and the attribution layer are untouched on disk", async () => {
  const { execSync } = await import("node:child_process");
  for (const path of [
    "research/major-event-acquisition/uk-gc-football-01",
    "research/major-event-attribution/uk-gc-football-01",
    "research/major-event-attribution/uk-tier1-01",
    "ingestion/major-event-attribution",
    "ingestion/gc-football-attribution",
  ]) {
    const status = execSync(`git status --porcelain ${path}`, { cwd: ROOT, encoding: "utf8" });
    assert.equal(status.trim(), "", `${path} must not be modified by reconciliation:\n${status}`);
  }
});

test("SAFETY: no production registry, census, public map data or deployment path was touched", async () => {
  const { execSync } = await import("node:child_process");
  for (const path of ["venues", "sources", "data", "public", ".github", "research/major-event-venues", "ingestion/major-event-census"]) {
    const status = execSync(`git status --porcelain ${path}`, { cwd: ROOT, encoding: "utf8" });
    assert.equal(status.trim(), "", `${path} must not be modified:\n${status}`);
  }
});
