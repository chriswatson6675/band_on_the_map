import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ADMISSION_READY_DISPOSITION,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HOLD_DISPOSITIONS,
  IMMUTABLE_PREDECESSOR_DIRS,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_CONFIRMED_ROWS,
  PREDECESSOR_IDENTITY_REVIEW,
  PREDECESSOR_MAIN_SHA,
  PREDECESSOR_PACKAGE,
  assertEstateArithmetic,
  reconcileConfirmedRows,
  validateAdmissionReadyRow,
  validateIdentityDecision,
  validateIdentityGate,
  validateUniqueEntity,
} from "../ingestion/high-value-venue-identity-gate/contract.mjs";
import {
  buildUniqueEntities,
  buildAdmissionReady,
  computeQualityInvariants08,
  reverifyDecision,
  uniqueEntityIdFor,
} from "../ingestion/high-value-venue-identity-gate/build.mjs";
import {
  IDENTITY_GATE_DIR,
  REQUIRED_ARTIFACTS_08,
  validateIdentityGateDirectory,
} from "../ingestion/high-value-venue-identity-gate/validate.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ev = (url = "https://example.org/", note = "what this showed", kind = "FETCHED_URL") => [{ url, kind, note }];

function confirmedRow(overrides = {}) {
  return {
    research_id: "hv07-p-example-venue",
    name: "Example Venue",
    aliases: [],
    venue_class: "ARENA",
    locality: "Example Town",
    nation: "England",
    postcode: null,
    operator_name: null,
    official_website_url: null,
    capacity_max: 5000,
    capacity_kind: "SPECTATOR",
    capacity_source_url: "https://venue.example/capacity",
    capacity_state: "CONFIRMED_1000_PLUS",
    permanence_class: "PERMANENT_PURPOSE_BUILT_VENUE",
    canonical_match_state: "MISSING_FROM_CANON",
    canonical_venue_id: null,
    identity_evidence: ev(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// The asymmetry: holds are cheap, identity changes are expensive
// ---------------------------------------------------------------------
test("a hold needs only a stated reason — holding is the safe direction", () => {
  assert.deepEqual(
    validateIdentityDecision({
      research_id: "hv07-p-x", decision: "AMBIGUOUS_HOLD",
      reasoning: "the evidence does not settle which venue this row describes", evidence: [],
    }),
    [],
  );
});

test("a canonical match must name the canonical venue it matched", () => {
  const errors = validateIdentityDecision({
    research_id: "hv07-p-x", decision: "MATCHES_EXISTING_CANONICAL",
    reasoning: "r", evidence: ev(), match_confidence: "HIGH",
  });
  assert.ok(errors.some((e) => e.includes("requires a canonical_venue_id")));
});

test("a canonical match with no evidence is rejected — that is how duplicates are created", () => {
  const errors = validateIdentityDecision({
    research_id: "hv07-p-x", decision: "MATCHES_EXISTING_CANONICAL",
    canonical_venue_id: "venue-x", reasoning: "r", evidence: [], match_confidence: "HIGH",
  });
  assert.ok(errors.some((e) => e.includes("how duplicates are created")));
});

test("a canonical match cannot rest on LOW confidence", () => {
  const errors = validateIdentityDecision({
    research_id: "hv07-p-x", decision: "MATCHES_EXISTING_CANONICAL",
    canonical_venue_id: "venue-x", reasoning: "r", evidence: ev(), match_confidence: "LOW",
  });
  assert.ok(errors.some((e) => e.includes("hold it instead")));
});

test("a same-venue claim must name the other row and cannot point at itself", () => {
  assert.ok(
    validateIdentityDecision({
      research_id: "hv07-p-x", decision: "SAME_VENUE_AS_OTHER_RESEARCH_ROW",
      reasoning: "r", evidence: ev(), match_confidence: "HIGH",
    }).some((e) => e.includes("requires other_research_id")),
  );
  assert.ok(
    validateIdentityDecision({
      research_id: "hv07-p-x", decision: "SAME_VENUE_AS_OTHER_RESEARCH_ROW",
      other_research_id: "hv07-p-x", reasoning: "r", evidence: ev(), match_confidence: "HIGH",
    }).some((e) => e.includes("cannot point at itself")),
  );
});

test("declaring a venue distinct and missing also needs evidence — it is what admits a venue", () => {
  const errors = validateIdentityDecision({
    research_id: "hv07-p-x", decision: "DISTINCT_AND_MISSING_FROM_CANON", reasoning: "r", evidence: [],
  });
  assert.ok(errors.some((e) => e.includes("this is the decision that admits a venue")));
});

test("a blocked decision may not assert a relationship", () => {
  const errors = validateIdentityDecision({
    research_id: "hv07-p-x", decision: "RESEARCH_BLOCKED",
    canonical_venue_id: "venue-x", reasoning: "r", evidence: [],
  });
  assert.ok(errors.some((e) => e.includes("cannot assert a canonical or same-venue relationship")));
});

// ---------------------------------------------------------------------
// Independent re-verification of researcher decisions
// ---------------------------------------------------------------------
const verifyCtx = (overrides = {}) => ({
  canonicalIds: new Set(["venue-real"]),
  confirmedIds: new Set(["hv07-p-a", "hv07-p-b"]),
  rows: new Map([["hv07-p-a", confirmedRow({ research_id: "hv07-p-a" })]]),
  ...overrides,
});

test("a match claiming a canonical venue that does not exist is refused", () => {
  const problems = reverifyDecision({
    research_id: "hv07-p-a", decision: "MATCHES_EXISTING_CANONICAL",
    canonical_venue_id: "venue-imaginary", reasoning: "r", evidence: ev(), match_confidence: "HIGH",
  }, verifyCtx());
  assert.ok(problems.some((p) => p.includes("does not exist in venues/uk.json")));
});

test("a match resting only on a search snippet is refused", () => {
  const problems = reverifyDecision({
    research_id: "hv07-p-a", decision: "MATCHES_EXISTING_CANONICAL",
    canonical_venue_id: "venue-real", reasoning: "r",
    evidence: ev("https://e.example/", "snippet", "SEARCH_RESULT"), match_confidence: "HIGH",
  }, verifyCtx());
  assert.ok(problems.some((p) => p.includes("a search snippet is not enough to merge an identity")));
});

test("a verified match passes re-verification", () => {
  assert.deepEqual(
    reverifyDecision({
      research_id: "hv07-p-a", decision: "MATCHES_EXISTING_CANONICAL",
      canonical_venue_id: "venue-real", reasoning: "same address and postcode",
      evidence: ev(), match_confidence: "HIGH",
    }, verifyCtx()),
    [],
  );
});

test("a same-venue claim pointing at a non-confirmed row is refused", () => {
  const problems = reverifyDecision({
    research_id: "hv07-p-a", decision: "SAME_VENUE_AS_OTHER_RESEARCH_ROW",
    other_research_id: "hv07-p-ghost", reasoning: "r", evidence: ev(), match_confidence: "HIGH",
  }, verifyCtx());
  assert.ok(problems.some((p) => p.includes("is not a Package 07 confirmed row")));
});

test("a distinct-and-missing claim contradicting Package 07's own match is refused", () => {
  const ctx = verifyCtx({
    rows: new Map([["hv07-p-a", confirmedRow({
      research_id: "hv07-p-a", canonical_match_state: "EXISTING_CANONICAL", canonical_venue_id: "venue-real",
    })]]),
  });
  const problems = reverifyDecision({
    research_id: "hv07-p-a", decision: "DISTINCT_AND_MISSING_FROM_CANON", reasoning: "r", evidence: ev(),
  }, ctx);
  assert.ok(problems.some((p) => p.includes("Package 07 already matched it")));
});

test("a decision about a row that is not confirmed is refused", () => {
  const problems = reverifyDecision({
    research_id: "hv07-p-unknown", decision: "AMBIGUOUS_HOLD", reasoning: "r", evidence: [],
  }, verifyCtx());
  assert.ok(problems.some((p) => p.includes("is not a Package 07 confirmed row")));
});

// ---------------------------------------------------------------------
// Unique entity layer
// ---------------------------------------------------------------------
test("unique entity ids are deterministic, not random", () => {
  assert.equal(uniqueEntityIdFor("hv07-p-england-leeds-example"), uniqueEntityIdFor("hv07-p-england-leeds-example"));
  assert.ok(uniqueEntityIdFor("hv07-p-england-leeds-example").startsWith("HVUK-"));
});

test("an undecided ambiguous row HOLDS rather than leaking into admission", () => {
  // The safe default. A row nobody researched must never reach admission
  // by omission.
  const entities = buildUniqueEntities({
    confirmedRows: [confirmedRow({ canonical_match_state: "AMBIGUOUS_IDENTITY" })],
    decisionsById: new Map(),
    canonicalIds: new Set(),
  });
  assert.equal(entities[0].disposition, "AMBIGUOUS_HOLD");
  assert.deepEqual(buildAdmissionReady(entities), []);
});

test("two research rows proved to be one venue collapse to ONE admission entity", () => {
  const rows = [
    confirmedRow({ research_id: "hv07-p-a", name: "Venue A" }),
    confirmedRow({ research_id: "hv07-p-b", name: "Venue B" }),
  ];
  const decisions = new Map([["hv07-p-b", {
    research_id: "hv07-p-b", decision: "SAME_VENUE_AS_OTHER_RESEARCH_ROW",
    other_research_id: "hv07-p-a", reasoning: "same postcode and operator",
    evidence: ev(), match_confidence: "HIGH",
  }]]);
  const entities = buildUniqueEntities({ confirmedRows: rows, decisionsById: decisions, canonicalIds: new Set() });
  assert.equal(entities.length, 1, "two rows must collapse to one entity");
  assert.deepEqual(entities[0].package07_research_ids, ["hv07-p-a", "hv07-p-b"]);
  assert.equal(buildAdmissionReady(entities).length, 1, "a duplicate must never produce two admissions");
});

test("the surviving row of a duplicate pair is deterministic", () => {
  const rows = [confirmedRow({ research_id: "hv07-p-a" }), confirmedRow({ research_id: "hv07-p-b" })];
  const mk = (from, to) => new Map([[from, {
    research_id: from, decision: "SAME_VENUE_AS_OTHER_RESEARCH_ROW", other_research_id: to,
    reasoning: "r", evidence: ev(), match_confidence: "HIGH",
  }]]);
  const a = buildUniqueEntities({ confirmedRows: rows, decisionsById: mk("hv07-p-b", "hv07-p-a"), canonicalIds: new Set() });
  const b = buildUniqueEntities({ confirmedRows: rows, decisionsById: mk("hv07-p-a", "hv07-p-b"), canonicalIds: new Set() });
  assert.equal(a[0].unique_entity_id, b[0].unique_entity_id, "survivor must not depend on decision order");
});

test("an entity claiming a canonical venue that does not exist is held", () => {
  const entities = buildUniqueEntities({
    confirmedRows: [confirmedRow({ canonical_match_state: "EXISTING_CANONICAL", canonical_venue_id: "venue-imaginary" })],
    decisionsById: new Map(),
    canonicalIds: new Set(["venue-real"]),
  });
  assert.equal(entities[0].disposition, "AMBIGUOUS_HOLD");
  assert.equal(entities[0].canonical_venue_id, null);
});

test("a Package 07 row may belong to exactly one unique entity", () => {
  const errors = validateIdentityGate({
    decisions: [],
    entities: [
      { unique_entity_id: "HVUK-a", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "A", aliases: [], venue_class: "ARENA", disposition: ADMISSION_READY_DISPOSITION, identity_evidence: ev() },
      { unique_entity_id: "HVUK-b", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "B", aliases: [], venue_class: "ARENA", disposition: ADMISSION_READY_DISPOSITION, identity_evidence: ev() },
    ],
    admissionReady: [],
  });
  assert.ok(errors.some((e) => e.includes("is claimed by more than one unique entity")));
});

// ---------------------------------------------------------------------
// Admission-ready safety
// ---------------------------------------------------------------------
test("an admission-ready row below the threshold is rejected", () => {
  const errors = validateAdmissionReadyRow({
    unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X",
    aliases: [], venue_class: "ARENA", locality: "L", nation: "England", capacity_max: 400,
    capacity_evidence_ref: "https://e.example/", identity_evidence: ev(), package07_provenance: {},
  });
  assert.ok(errors.some((e) => e.includes("below the 1000 threshold")));
});

test("an admission-ready row with no identity evidence is rejected", () => {
  const errors = validateAdmissionReadyRow({
    unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X",
    aliases: [], venue_class: "ARENA", locality: "L", nation: "England", capacity_max: 5000,
    capacity_evidence_ref: "https://e.example/", identity_evidence: [], package07_provenance: {},
  });
  assert.ok(errors.some((e) => e.includes("must not permit a blind mint")));
});

test("an admission-ready row that is already canonical is rejected", () => {
  const errors = validateAdmissionReadyRow({
    unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X",
    aliases: [], venue_class: "ARENA", locality: "L", nation: "England", capacity_max: 5000,
    capacity_evidence_ref: "https://e.example/", identity_evidence: ev(),
    package07_provenance: {}, canonical_venue_id: "venue-real",
  });
  assert.ok(errors.some((e) => e.includes("would already be canonical")));
});

test("a held entity cannot appear in admission-ready", () => {
  const errors = validateIdentityGate({
    decisions: [],
    entities: [{ unique_entity_id: "HVUK-h", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "H", aliases: [], venue_class: "ARENA", disposition: "AMBIGUOUS_HOLD", identity_evidence: ev() }],
    admissionReady: [{
      unique_entity_id: "HVUK-h", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "H",
      aliases: [], venue_class: "ARENA", locality: "L", nation: "England", capacity_max: 5000,
      capacity_evidence_ref: "https://e.example/", identity_evidence: ev(), package07_provenance: {},
    }],
  });
  assert.ok(errors.some((e) => e.includes("only ADMISSION_READY_MISSING may be admitted")));
});

test("the same unique entity twice in admission-ready is rejected", () => {
  const row = {
    unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X",
    aliases: [], venue_class: "ARENA", locality: "L", nation: "England", capacity_max: 5000,
    capacity_evidence_ref: "https://e.example/", identity_evidence: ev(), package07_provenance: {},
  };
  const errors = validateIdentityGate({
    decisions: [],
    entities: [{ unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X", aliases: [], venue_class: "ARENA", disposition: ADMISSION_READY_DISPOSITION, identity_evidence: ev() }],
    admissionReady: [row, { ...row }],
  });
  assert.ok(errors.some((e) => e.includes("that is a duplicate admission")));
});

test("an admission-ready entity cannot carry a canonical venue id", () => {
  const errors = validateUniqueEntity({
    unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X",
    aliases: [], venue_class: "ARENA", disposition: ADMISSION_READY_DISPOSITION,
    identity_evidence: ev(), canonical_venue_id: "venue-real",
  });
  assert.ok(errors.some((e) => e.includes("it would already be canonical")));
});

test("a represented entity must name the canonical venue representing it", () => {
  const errors = validateUniqueEntity({
    unique_entity_id: "HVUK-x", package07_research_ids: ["hv07-p-a"], canonical_name_candidate: "X",
    aliases: [], venue_class: "ARENA", disposition: "REPRESENTED_IN_CANON", identity_evidence: ev(),
  });
  assert.ok(errors.some((e) => e.includes("requires a canonical_venue_id")));
});

// ---------------------------------------------------------------------
// Arithmetic and reconciliation
// ---------------------------------------------------------------------
test("estate arithmetic must close with no remainder", () => {
  assert.deepEqual(
    assertEstateArithmetic({
      final_unique_confirmed: 100, represented_in_canon: 40, admission_ready: 50,
      canonical_governance_hold: 3, ambiguous_hold: 5, research_blocked: 2,
    }),
    [],
  );
  assert.ok(
    assertEstateArithmetic({
      final_unique_confirmed: 100, represented_in_canon: 40, admission_ready: 50,
      canonical_governance_hold: 0, ambiguous_hold: 0, research_blocked: 0,
    }).some((e) => e.includes("does not close")),
  );
});

test("a confirmed row with no disposition is reported", () => {
  const errors = reconcileConfirmedRows(["hv07-p-a", "hv07-p-b"], [
    { unique_entity_id: "HVUK-a", package07_research_ids: ["hv07-p-a"] },
  ]);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("hv07-p-b"));
});

test("quality invariants detect an unaccounted confirmed row", () => {
  const invariants = computeQualityInvariants08({
    entities: [{ unique_entity_id: "HVUK-a", package07_research_ids: ["hv07-p-a"], disposition: ADMISSION_READY_DISPOSITION }],
    admissionReady: [],
    confirmedIds: new Set(["hv07-p-a", "hv07-p-orphan"]),
    canonicalIds: new Set(),
  });
  assert.equal(invariants.package_07_confirmed_rows_unaccounted, 1);
});

test("quality invariants report zero mutations across all three predecessors", () => {
  const invariants = computeQualityInvariants08({
    entities: [], admissionReady: [], confirmedIds: new Set(), canonicalIds: new Set(),
  });
  assert.equal(invariants.canonical_venues_mutated, 0);
  assert.equal(invariants.events_acquired, 0);
  assert.equal(invariants.package_05_mutations, 0);
  assert.equal(invariants.package_06_mutations, 0);
  assert.equal(invariants.package_07_mutations, 0);
});

// ---------------------------------------------------------------------
// The published corpus
// ---------------------------------------------------------------------
test("the published identity gate validates", () => {
  const errors = validateIdentityGateDirectory(REPO_ROOT);
  assert.deepEqual(errors, [], errors.slice(0, 10).join("\n"));
});

test("every promised artifact is published", () => {
  for (const name of REQUIRED_ARTIFACTS_08) {
    assert.ok(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, name), "utf8").length > 0, `${name} is empty`);
  }
});

test("all 800 Package 07 confirmed rows map into Package 08", () => {
  const predecessor = JSON.parse(readFileSync(join(REPO_ROOT, PREDECESSOR_CENSUS_DIR, "census.json"), "utf8")).venues;
  const confirmed = predecessor.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  assert.equal(confirmed.length, PREDECESSOR_CONFIRMED_ROWS);
  const estate = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "unique-confirmed-estate.json"), "utf8"));
  assert.deepEqual(reconcileConfirmedRows(confirmed.map((r) => r.research_id), estate.entities), []);
});

test("every admission-ready venue is confirmed >=1,000, permanent and evidenced", () => {
  const admission = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "admission-ready.json"), "utf8"));
  for (const row of admission.venues) {
    assert.ok(row.capacity_max >= HIGH_VALUE_CAPACITY_THRESHOLD, `${row.unique_entity_id} is under threshold`);
    assert.ok(row.permanence_class, `${row.unique_entity_id} has no permanence class`);
    assert.ok(row.identity_evidence.length > 0, `${row.unique_entity_id} has no identity evidence`);
    assert.equal(row.canonical_venue_id, undefined);
  }
});

test("every admission-ready venue is absent from the canonical estate", () => {
  const admission = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "admission-ready.json"), "utf8"));
  const estate = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "unique-confirmed-estate.json"), "utf8"));
  const byId = new Map(estate.entities.map((e) => [e.unique_entity_id, e]));
  for (const row of admission.venues) {
    const entity = byId.get(row.unique_entity_id);
    assert.ok(entity, `${row.unique_entity_id} has no entity`);
    assert.equal(entity.canonical_venue_id, null, `${row.unique_entity_id} is already canonical`);
    assert.equal(entity.disposition, ADMISSION_READY_DISPOSITION);
  }
});

test("no held, blocked or governance-held venue enters admission-ready", () => {
  const admission = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "admission-ready.json"), "utf8"));
  const estate = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "unique-confirmed-estate.json"), "utf8"));
  const admitted = new Set(admission.venues.map((r) => r.unique_entity_id));
  for (const entity of estate.entities) {
    if (HOLD_DISPOSITIONS.includes(entity.disposition)) {
      assert.ok(!admitted.has(entity.unique_entity_id), `held venue ${entity.unique_entity_id} reached admission`);
    }
  }
});

test("no two admission-ready rows represent the same unique entity", () => {
  const admission = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "admission-ready.json"), "utf8"));
  const ids = admission.venues.map((r) => r.unique_entity_id);
  assert.equal(ids.length, new Set(ids).size);
});

test("every research-row duplicate maps to exactly one surviving entity", () => {
  const dupes = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "research-row-duplicates.json"), "utf8"));
  const admission = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "admission-ready.json"), "utf8"));
  const admitted = new Set(admission.venues.map((r) => r.unique_entity_id));
  for (const group of dupes.groups) {
    assert.ok(group.merged_research_rows.length > 1, "a duplicate group must hold more than one row");
    // Whether or not it is admitted, it can only ever appear ONCE.
    const appearances = [...admitted].filter((id) => id === group.unique_entity_id).length;
    assert.ok(appearances <= 1, `${group.unique_entity_id} appears ${appearances} times in admission`);
  }
});

test("represented-in-canon rows name canonical venues that exist", () => {
  const rep = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "represented-in-canon.json"), "utf8"));
  const ids = new Set(JSON.parse(readFileSync(join(REPO_ROOT, "venues/uk.json"), "utf8")).venues.map((v) => v.venue_id));
  for (const row of rep.venues) {
    assert.ok(row.canonical_venue_id, `${row.unique_entity_id} has no canonical_venue_id`);
    assert.ok(ids.has(row.canonical_venue_id), `${row.unique_entity_id} cites a canonical venue that does not exist`);
  }
});

test("Anglesey Showground has exactly one explicit identity decision", () => {
  const anglesey = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "anglesey-showground-decision.json"), "utf8"));
  assert.equal(anglesey.records.length, 2, "the known pair is two records");
  assert.ok(anglesey.decision, "there must be exactly one decision block");
  assert.ok(Object.prototype.hasOwnProperty.call(anglesey.decision, "same_real_world_venue"));
});

test("the 17 identity-review rows are all accounted for", () => {
  const predecessor = JSON.parse(readFileSync(join(REPO_ROOT, PREDECESSOR_CENSUS_DIR, "census.json"), "utf8")).venues;
  const review = predecessor.filter(
    (r) => r.capacity_state === "CONFIRMED_1000_PLUS" && r.canonical_match_state === "AMBIGUOUS_IDENTITY",
  );
  assert.equal(review.length, PREDECESSOR_IDENTITY_REVIEW);
  const resolved = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "identity-review-resolved.json"), "utf8"));
  assert.equal(resolved.count, PREDECESSOR_IDENTITY_REVIEW);
  const resolvedIds = new Set(resolved.rows.map((r) => r.research_id));
  for (const row of review) assert.ok(resolvedIds.has(row.research_id), `${row.research_id} is not in the review table`);
  for (const row of resolved.rows) assert.notEqual(row.admission_effect, "UNACCOUNTED");
});

test("the estate arithmetic closes in the published summary", () => {
  const summary = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "summary.json"), "utf8"));
  const h = summary.headline;
  assert.equal(
    h.represented_in_canon + h.admission_ready + h.canonical_governance_hold + h.ambiguous_hold + h.research_blocked,
    h.final_unique_confirmed_venues,
  );
  assert.equal(
    h.package07_confirmed_rows - h.research_rows_suppressed_as_duplicates,
    h.final_unique_confirmed_venues,
  );
  assert.equal(summary.estate_arithmetic.closes, true);
});

test("the manifest names the predecessor and declares nothing mutated", () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.predecessor_package, PREDECESSOR_PACKAGE);
  assert.equal(manifest.predecessor_main_sha, PREDECESSOR_MAIN_SHA);
  for (const input of [...manifest.predecessor_artifacts_consumed, ...manifest.other_inputs]) {
    assert.equal(input.mutated, false, `${input.path} must be declared unmutated`);
  }
});

test("Packages 05, 06 and 07 are all still present — preserved, not replaced", () => {
  for (const dir of IMMUTABLE_PREDECESSOR_DIRS) {
    const census = JSON.parse(readFileSync(join(REPO_ROOT, dir, "census.json"), "utf8"));
    assert.ok(census.venues.length > 0, `${dir} must still hold its rows`);
  }
});

test("no Events were added", () => {
  const admission = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "admission-ready.json"), "utf8"));
  for (const row of admission.venues) {
    assert.equal(row.start_date, undefined);
    assert.equal(row.performer, undefined);
    assert.equal(row.event_id, undefined);
  }
});

test("suggested alias enrichment is recorded but never applied", () => {
  const suggestions = JSON.parse(readFileSync(join(REPO_ROOT, IDENTITY_GATE_DIR, "suggested-alias-enrichment.json"), "utf8"));
  assert.ok(suggestions.description.includes("suggestions only"));
  assert.ok(Array.isArray(suggestions.suggestions));
});
