#!/usr/bin/env node
// Deterministic builder for the Package 08 identity gate
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-IDENTITY-GATE-08).
//
// Reads, and only ever reads:
//   - research/high-value-venue-estate/uk-1000plus-07/  (IMMUTABLE)
//   - research/high-value-venue-estate/uk-1000plus-06/  (IMMUTABLE, lineage)
//   - research/high-value-venue-estate/uk-1000plus-05/  (IMMUTABLE, lineage)
//   - venues/uk.json                                    (canonical, read only)
//   - researcher JSONL gathered outside the repository
//
// Writes only research/high-value-venue-estate/uk-1000plus-08-identity/.
//
// WHAT THIS PRODUCES
// ------------------
// admission-ready.json: the venues that are confirmed >=1,000, permanent,
// a unique real-world identity, and definitely not already canonical. That
// file is the sole input to the next package, which will actually admit
// them.
//
// THE DIRECTION OF FAILURE
// ------------------------
// Every rule here fails towards HOLDING rather than admitting. A venue held
// back can be revisited; a venue wrongly admitted creates a canonical
// duplicate, or a canonical record carrying another venue's capacity and
// programme source, and that is materially harder to undo.
//
// So: an undecided review row holds. A decision whose evidence does not
// support it is refused, and the row holds. A research-row duplicate
// collapses to ONE admission, never two.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMISSION_READY_DISPOSITION,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HOLD_DISPOSITIONS,
  IDENTITY_GATE_FRAMEWORK_VERSION,
  IMMUTABLE_PREDECESSOR_DIRS,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_CONFIRMED_ROWS,
  PREDECESSOR_IDENTITY_REVIEW,
  PREDECESSOR_MAIN_SHA,
  PREDECESSOR_MISSING,
  PREDECESSOR_PACKAGE,
  PREDECESSOR_REPRESENTED,
  assertEstateArithmetic,
  reconcileConfirmedRows,
  validateIdentityDecision,
  validateIdentityGate,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const IDENTITY_GATE_OUTPUT_DIR = "research/high-value-venue-estate/uk-1000plus-08-identity";

const IN_CANON_STATES = ["EXISTING_CANONICAL", "PROBABLE_EXISTING_CANONICAL"];

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
export function normaliseName(value) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return normaliseName(value).replace(/\s+/g, "-").slice(0, 60) || "unnamed";
}

/**
 * Deterministic unique-entity id for a real-world venue.
 * Derived from the surviving Package 07 research id so the same inputs
 * always produce the same id — no random UUIDs, per the repository's
 * existing research-identifier convention.
 */
export function uniqueEntityIdFor(survivingResearchId) {
  return `HVUK-${slug(survivingResearchId.replace(/^hv07-/, ""))}`;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // A truncated final line is expected if a researcher was cut off.
    }
  }
  return rows;
}

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

function evidenceArray(value, defaultKind = "FETCHED_URL") {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e.url === "string" && /^https?:\/\//.test(e.url))
    .map((e) => ({
      url: e.url,
      kind: ["FETCHED_URL", "SEARCH_RESULT", "COMMITTED_RESEARCH_ARTIFACT", "CANONICAL_REGISTRY", "DETERMINISTIC_DERIVATION", "PREDECESSOR_CENSUS"].includes(e.kind)
        ? e.kind : defaultKind,
      note: typeof e.note === "string" && e.note.trim() ? e.note.trim() : "no note recorded by researcher",
    }));
}

// ---------------------------------------------------------------------
// Independent re-verification of high-risk decisions
// ---------------------------------------------------------------------
/**
 * The brief requires that decisions which change an identity are
 * re-verified rather than copied. This is that check, applied to every
 * researcher decision before it is allowed to affect the estate.
 *
 * A decision that fails re-verification is REFUSED and the row holds.
 * Refusals are recorded, never silently dropped.
 */
export function reverifyDecision(decision, { canonicalIds, confirmedIds, rows }) {
  const problems = [];

  // 1. structural/contract validity
  for (const error of validateIdentityDecision(decision)) problems.push(error);

  // 2. the row it decides must actually be one of the reviewed rows
  if (!confirmedIds.has(decision.research_id)) {
    problems.push(`decides row "${decision.research_id}" which is not a Package 07 confirmed row`);
  }

  // 3. a canonical match must name a canonical venue that EXISTS
  if (decision.decision === "MATCHES_EXISTING_CANONICAL") {
    if (!canonicalIds.has(decision.canonical_venue_id)) {
      problems.push(
        `claims canonical_venue_id "${decision.canonical_venue_id}" which does not exist in venues/uk.json`,
      );
    }
    // Name similarity alone is explicitly insufficient. Require at least
    // one piece of evidence that is a fetched page, not a search snippet.
    const fetched = (decision.evidence ?? []).filter((e) => e.kind === "FETCHED_URL");
    if (fetched.length === 0) {
      problems.push(
        "claims an existing canonical match with no FETCHED_URL evidence — a search snippet is not enough to merge an identity",
      );
    }
  }

  // 4. a same-venue claim must point at another real confirmed row
  if (decision.decision === "SAME_VENUE_AS_OTHER_RESEARCH_ROW") {
    if (!confirmedIds.has(decision.other_research_id)) {
      problems.push(
        `claims the same venue as "${decision.other_research_id}" which is not a Package 07 confirmed row`,
      );
    }
    const fetched = (decision.evidence ?? []).filter((e) => e.kind === "FETCHED_URL");
    if (fetched.length === 0) {
      problems.push("claims two research rows are one venue with no FETCHED_URL evidence");
    }
  }

  // 5. a distinct-and-missing claim must not contradict the canonical
  //    estate: if the row already carries a canonical id, it is not missing.
  if (decision.decision === "DISTINCT_AND_MISSING_FROM_CANON") {
    const row = rows.get(decision.research_id);
    if (row && IN_CANON_STATES.includes(row.canonical_match_state) && row.canonical_venue_id) {
      problems.push(
        `claims the venue is missing from canon, but Package 07 already matched it to "${row.canonical_venue_id}"`,
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------
// Build the unique entity layer
// ---------------------------------------------------------------------
export function buildUniqueEntities({ confirmedRows, decisionsById, canonicalIds }) {
  // 1. group research rows into real-world venues. A SAME_VENUE decision
  //    is the only thing that collapses two rows into one entity.
  const mergeInto = new Map(); // research_id -> surviving research_id
  for (const [id, decision] of decisionsById) {
    if (decision.decision !== "SAME_VENUE_AS_OTHER_RESEARCH_ROW") continue;
    const other = decision.other_research_id;
    if (!other) continue;
    // Deterministic survivor: the lexicographically smaller id, so the
    // choice does not depend on which row happened to be decided first.
    const [survivor, absorbed] = [id, other].sort();
    mergeInto.set(absorbed, survivor);
  }
  // Resolve chains (a -> b -> c).
  const resolveSurvivor = (id) => {
    let current = id;
    const seen = new Set();
    while (mergeInto.has(current) && !seen.has(current)) {
      seen.add(current);
      current = mergeInto.get(current);
    }
    return current;
  };

  const groups = new Map(); // surviving research_id -> [rows]
  for (const row of confirmedRows) {
    const survivor = resolveSurvivor(row.research_id);
    if (!groups.has(survivor)) groups.set(survivor, []);
    groups.get(survivor).push(row);
  }

  // 2. turn each group into a unique entity with a disposition
  const entities = [];
  for (const [survivorId, groupRows] of groups) {
    const primary = groupRows.find((r) => r.research_id === survivorId) ?? groupRows[0];
    const decision = decisionsById.get(primary.research_id) ?? null;

    let disposition;
    let canonicalVenueId = null;
    let dispositionBasis;

    if (decision) {
      // A reviewed row: the decision governs.
      switch (decision.decision) {
        case "MATCHES_EXISTING_CANONICAL":
          disposition = "REPRESENTED_IN_CANON";
          canonicalVenueId = decision.canonical_venue_id;
          dispositionBasis = `Package 08 identity decision: matches existing canonical venue ${canonicalVenueId}.`;
          break;
        case "DISTINCT_AND_MISSING_FROM_CANON":
          disposition = ADMISSION_READY_DISPOSITION;
          dispositionBasis = "Package 08 identity decision: a distinct real-world venue, absent from the canonical estate.";
          break;
        case "CANONICAL_DUPLICATE_REQUIRES_GOVERNANCE":
          disposition = "CANONICAL_GOVERNANCE_HOLD";
          canonicalVenueId = decision.canonical_venue_id ?? null;
          dispositionBasis = "Package 08 identity decision: the canonical estate itself holds a duplicate; held for separate governance.";
          break;
        case "RESEARCH_BLOCKED":
          disposition = "RESEARCH_BLOCKED";
          dispositionBasis = "Package 08 identity research could not complete for this row.";
          break;
        case "SAME_VENUE_AS_OTHER_RESEARCH_ROW":
          // The survivor inherits the underlying canonical position.
          disposition = IN_CANON_STATES.includes(primary.canonical_match_state) && primary.canonical_venue_id
            ? "REPRESENTED_IN_CANON" : ADMISSION_READY_DISPOSITION;
          canonicalVenueId = disposition === "REPRESENTED_IN_CANON" ? primary.canonical_venue_id : null;
          dispositionBasis = "Package 08 identity decision: two research rows proved to be one venue; collapsed to a single entity.";
          break;
        default:
          disposition = "AMBIGUOUS_HOLD";
          dispositionBasis = "Package 08 identity decision: evidence does not settle this venue's identity.";
      }
    } else if (IN_CANON_STATES.includes(primary.canonical_match_state) && primary.canonical_venue_id) {
      disposition = "REPRESENTED_IN_CANON";
      canonicalVenueId = primary.canonical_venue_id;
      dispositionBasis = `Carried from Package 07: ${primary.canonical_match_state}.`;
    } else if (primary.canonical_match_state === "MISSING_FROM_CANON") {
      disposition = ADMISSION_READY_DISPOSITION;
      dispositionBasis = "Carried from Package 07: no canonical counterpart found.";
    } else {
      // An ambiguous row with no Package 08 decision holds. This is the
      // safe default and the reason an un-researched row can never reach
      // admission by omission.
      disposition = "AMBIGUOUS_HOLD";
      dispositionBasis = `Carried from Package 07 as ${primary.canonical_match_state} with no Package 08 identity decision — held.`;
    }

    // A canonical id that does not exist cannot stand.
    if (canonicalVenueId && !canonicalIds.has(canonicalVenueId)) {
      disposition = "AMBIGUOUS_HOLD";
      canonicalVenueId = null;
      dispositionBasis += " Canonical id did not resolve; held.";
    }

    const aliases = [...new Set(groupRows.flatMap((r) => r.aliases ?? []))].sort();
    const identityEvidence = groupRows.flatMap((r) => r.identity_evidence ?? []).slice(0, 6);

    entities.push({
      unique_entity_id: uniqueEntityIdFor(survivorId),
      package07_research_ids: groupRows.map((r) => r.research_id).sort(),
      surviving_research_id: survivorId,
      canonical_name_candidate: primary.name,
      aliases,
      venue_class: primary.venue_class,
      locality: primary.locality,
      nation: primary.nation,
      postcode: primary.postcode ?? null,
      operator_name: primary.operator_name ?? null,
      official_website_url: primary.official_website_url ?? null,
      capacity_max: primary.capacity_max,
      capacity_kind: primary.capacity_kind ?? null,
      capacity_evidence_ref: primary.capacity_source_url ?? null,
      permanence_class: primary.permanence_class ?? null,
      disposition,
      disposition_basis: dispositionBasis,
      canonical_venue_id: canonicalVenueId,
      package07_canonical_match_state: primary.canonical_match_state,
      identity_evidence: identityEvidence,
      package08_decision: decision ? decision.decision : null,
      package08_reasoning: decision ? (text(decision.reasoning) ?? null) : null,
      package08_evidence: decision ? evidenceArray(decision.evidence) : [],
      merged_research_rows: groupRows.length > 1 ? groupRows.map((r) => r.research_id).sort() : [],
    });
  }

  return entities.sort((a, b) => a.unique_entity_id.localeCompare(b.unique_entity_id));
}

// ---------------------------------------------------------------------
// Admission-ready population
// ---------------------------------------------------------------------
export function buildAdmissionReady(entities) {
  return entities
    .filter((e) => e.disposition === ADMISSION_READY_DISPOSITION)
    .filter((e) => {
      // Belt and braces: the contract already forbids these, but the
      // admission file is the one that gets acted on, so it is filtered
      // independently rather than trusted.
      if (e.canonical_venue_id) return false;
      if (e.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) return false;
      if (!e.permanence_class) return false;
      if ((e.identity_evidence ?? []).length === 0) return false;
      return true;
    })
    .map((e) => ({
      unique_entity_id: e.unique_entity_id,
      package07_research_ids: e.package07_research_ids,
      canonical_name_candidate: e.canonical_name_candidate,
      aliases: e.aliases,
      venue_class: e.venue_class,
      locality: e.locality,
      nation: e.nation,
      postcode: e.postcode,
      coordinates: null,
      official_website_url: e.official_website_url,
      operator_name: e.operator_name,
      capacity_max: e.capacity_max,
      capacity_kind: e.capacity_kind,
      capacity_evidence_ref: e.capacity_evidence_ref,
      permanence_class: e.permanence_class,
      identity_evidence: e.identity_evidence,
      package07_provenance: {
        package: PREDECESSOR_PACKAGE,
        main_sha: PREDECESSOR_MAIN_SHA,
        census_dir: PREDECESSOR_CENSUS_DIR,
        canonical_match_state: e.package07_canonical_match_state,
      },
      source_provenance: e.package08_decision
        ? `Package 08 identity decision: ${e.package08_decision}`
        : "Carried from Package 07 as MISSING_FROM_CANON with no identity question raised",
    }))
    .sort((a, b) => a.unique_entity_id.localeCompare(b.unique_entity_id));
}

// ---------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------
function tally(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const SPORT = ["STADIUM", "RACECOURSE", "FOOTBALL_GROUND", "RUGBY_UNION_GROUND", "RUGBY_LEAGUE_GROUND", "CRICKET_GROUND", "ATHLETICS_STADIUM", "MOTORSPORT_VENUE", "ICE_HOCKEY_ARENA", "BASKETBALL_ARENA", "MULTI_SPORT_ARENA", "OTHER_PERMANENT_SPECTATOR_SPORT"];
const CONFERENCE = ["CONFERENCE_CENTRE", "CONVENTION_CENTRE", "EXHIBITION_CENTRE", "MAJOR_HOTEL_EVENT_VENUE", "UNIVERSITY_EVENT_VENUE"];

function segmentFor(venueClass) {
  if (SPORT.includes(venueClass)) return "SPORT";
  if (CONFERENCE.includes(venueClass)) return "CONFERENCE_EXHIBITION";
  return "ARTS_MUSIC_GENERAL";
}

export function computeQualityInvariants08({ entities, admissionReady, confirmedIds, canonicalIds }) {
  const claimed = new Set();
  for (const e of entities) for (const id of e.package07_research_ids) claimed.add(id);

  const admissionIds = admissionReady.map((r) => r.unique_entity_id);

  return {
    package_07_confirmed_rows_unaccounted: [...confirmedIds].filter((id) => !claimed.has(id)).length,
    admission_ready_rows_already_canonical: admissionReady.filter(
      (r) => entities.find((e) => e.unique_entity_id === r.unique_entity_id)?.canonical_venue_id != null,
    ).length,
    duplicate_unique_entities_in_admission_ready: admissionIds.length - new Set(admissionIds).size,
    capacity_unverified_in_admission_ready: admissionReady.filter(
      (r) => typeof r.capacity_max !== "number" || r.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD,
    ).length,
    non_permanent_in_admission_ready: admissionReady.filter((r) => !r.permanence_class).length,
    ambiguous_identity_in_admission_ready: admissionReady.filter((r) => {
      const entity = entities.find((e) => e.unique_entity_id === r.unique_entity_id);
      return entity ? HOLD_DISPOSITIONS.includes(entity.disposition) : true;
    }).length,
    admission_ready_without_identity_evidence: admissionReady.filter(
      (r) => !Array.isArray(r.identity_evidence) || r.identity_evidence.length === 0,
    ).length,
    entities_claiming_nonexistent_canonical_venue: entities.filter(
      (e) => e.canonical_venue_id != null && !canonicalIds.has(e.canonical_venue_id),
    ).length,
    research_rows_claimed_by_more_than_one_entity: (() => {
      const seen = new Set();
      let dupes = 0;
      for (const e of entities) {
        for (const id of e.package07_research_ids) {
          if (seen.has(id)) dupes += 1;
          else seen.add(id);
        }
      }
      return dupes;
    })(),
    canonical_venues_mutated: 0,
    events_acquired: 0,
    package_05_mutations: 0,
    package_06_mutations: 0,
    package_07_mutations: 0,
  };
}

// ---------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------
export function buildIdentityGate({ repoRoot = ROOT, researcherDir = null } = {}) {
  const priorDir = join(repoRoot, PREDECESSOR_CENSUS_DIR);
  const predecessorRows = JSON.parse(readFileSync(join(priorDir, "census.json"), "utf8")).venues;
  const predecessorSummary = JSON.parse(readFileSync(join(priorDir, "summary.json"), "utf8"));
  const canonical = JSON.parse(readFileSync(join(repoRoot, "venues/uk.json"), "utf8")).venues;
  const canonicalIds = new Set(canonical.map((v) => v.venue_id));

  const confirmedRows = predecessorRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  const confirmedIds = new Set(confirmedRows.map((r) => r.research_id));
  const rowsById = new Map(predecessorRows.map((r) => [r.research_id, r]));

  const reviewRows = confirmedRows.filter((r) => r.canonical_match_state === "AMBIGUOUS_IDENTITY");

  // --- researcher input -------------------------------------------------
  // Researcher decisions, then COORDINATOR decisions. The coordinator's
  // are read second so they win: they exist for the cases where a
  // researcher's substance was right but its evidence could not be
  // accepted — most often because it cited an ephemeral scratch path,
  // which this repository's own source-investigation policy prohibits as
  // durable evidence. A coordinator decision must still pass exactly the
  // same re-verification as any other; it gets no special treatment.
  const rawDecisions = researcherDir
    ? [
        ...readJsonl(join(researcherDir, "decisions.jsonl")),
        ...readJsonl(join(researcherDir, "coordinator-decisions.jsonl")),
      ]
    : [];
  const canonicalDuplicateLeads = researcherDir ? readJsonl(join(researcherDir, "canonical-duplicates.jsonl")) : [];
  const aliasEnrichment = researcherDir ? readJsonl(join(researcherDir, "alias-enrichment.jsonl")) : [];
  let angleseyDecision = null;
  if (researcherDir && existsSync(join(researcherDir, "anglesey-decision.json"))) {
    try {
      angleseyDecision = JSON.parse(readFileSync(join(researcherDir, "anglesey-decision.json"), "utf8"));
    } catch {
      angleseyDecision = null;
    }
  }

  // --- independently re-verify every decision ---------------------------
  const decisionsById = new Map();
  const refusedDecisions = [];
  const acceptedDecisions = [];
  for (const decision of rawDecisions) {
    const problems = reverifyDecision(decision, { canonicalIds, confirmedIds, rows: rowsById });
    if (problems.length > 0) {
      refusedDecisions.push({
        research_id: decision?.research_id ?? null,
        claimed_decision: decision?.decision ?? null,
        problems,
        effect: "refused — the row holds rather than taking an unverified identity change",
      });
      continue;
    }
    if (decisionsById.has(decision.research_id)) {
      // Later decisions win: a revisit is a correction.
      refusedDecisions.push({
        research_id: decision.research_id,
        claimed_decision: decision.decision,
        problems: ["an earlier decision for this row was superseded by a later one"],
        effect: "superseded — later decision applied",
      });
    }
    decisionsById.set(decision.research_id, decision);
    acceptedDecisions.push(decision);
  }

  const entities = buildUniqueEntities({ confirmedRows, decisionsById, canonicalIds });
  const admissionReady = buildAdmissionReady(entities);

  return {
    predecessorRows,
    predecessorSummary,
    confirmedRows,
    confirmedIds,
    reviewRows,
    canonicalIds,
    canonical,
    rawDecisions,
    acceptedDecisions,
    refusedDecisions,
    decisionsById,
    entities,
    admissionReady,
    angleseyDecision,
    canonicalDuplicateLeads,
    aliasEnrichment,
  };
}

// ---------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------
function writeArtifact(outDir, filename, payload) {
  writeFileSync(join(outDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function emitArtifacts08(build, { repoRoot = ROOT, generatedAt } = {}) {
  const outDir = join(repoRoot, IDENTITY_GATE_OUTPUT_DIR);
  mkdirSync(outDir, { recursive: true });

  const { entities, admissionReady, confirmedRows, reviewRows } = build;

  const represented = entities.filter((e) => e.disposition === "REPRESENTED_IN_CANON");
  const admissionEntities = entities.filter((e) => e.disposition === ADMISSION_READY_DISPOSITION);
  const governanceHold = entities.filter((e) => e.disposition === "CANONICAL_GOVERNANCE_HOLD");
  const ambiguousHold = entities.filter((e) => e.disposition === "AMBIGUOUS_HOLD");
  const blocked = entities.filter((e) => e.disposition === "RESEARCH_BLOCKED");

  const duplicatesSuppressed = confirmedRows.length - entities.length;

  const meta = {
    package: "BEATMAPPED-UK-HIGH-VALUE-VENUE-IDENTITY-GATE-08",
    framework_version: IDENTITY_GATE_FRAMEWORK_VERSION,
    census_id: "uk-1000plus-08-identity",
    generated_at: generatedAt,
    capacity_threshold: HIGH_VALUE_CAPACITY_THRESHOLD,
  };

  const invariants = computeQualityInvariants08({
    entities, admissionReady, confirmedIds: build.confirmedIds, canonicalIds: build.canonicalIds,
  });

  const arithmeticErrors = assertEstateArithmetic({
    final_unique_confirmed: entities.length,
    represented_in_canon: represented.length,
    admission_ready: admissionEntities.length,
    canonical_governance_hold: governanceHold.length,
    ambiguous_hold: ambiguousHold.length,
    research_blocked: blocked.length,
  });

  // --- manifest ---------------------------------------------------------
  writeArtifact(outDir, "manifest.json", {
    ...meta,
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
    predecessor_terminal_verdict: "UK_HIGH_VALUE_VENUE_CENSUS_COMPLETE",
    what_this_is:
      "The identity gate. Package 07 closed coverage; this resolves the remaining identity questions and " +
      "produces the admission-ready population. It admits nothing.",
    what_this_is_not: [
      "It is not an admission. venues/uk.json is NOT modified and no venue is minted.",
      "It does not merge canonical venues, even where a canonical duplicate is found.",
      "It does not reopen venue discovery or capacity research.",
      "It contains no Events and acquires none.",
    ],
    direction_of_failure:
      "Every rule fails towards HOLDING rather than admitting. A venue held back can be revisited; a venue " +
      "wrongly admitted creates a canonical duplicate, or a canonical record carrying another venue's capacity " +
      "and programme source, which is materially harder to undo.",
    predecessor_artifacts_consumed: IMMUTABLE_PREDECESSOR_DIRS.map((dir) => ({
      path: dir,
      role: dir.endsWith("07") ? "The confirmed estate this gate dispositions." : "Lineage only, read for provenance.",
      mutated: false,
    })),
    other_inputs: [
      { path: "venues/uk.json", role: "Canonical venue estate, read only, for identity verification.", records: build.canonical.length, mutated: false },
    ],
    generator: "ingestion/high-value-venue-identity-gate/build.mjs",
    validator: "ingestion/high-value-venue-identity-gate/validate.mjs",
    contract: "ingestion/high-value-venue-identity-gate/contract.mjs",
    decision_handling: {
      decisions_received: build.rawDecisions.length,
      decisions_accepted_after_reverification: build.acceptedDecisions.length,
      decisions_refused: build.refusedDecisions.length,
      note:
        "Every researcher decision is independently re-verified before it may affect the estate: a canonical " +
        "match must name a canonical venue that exists and cite a fetched page, and a same-venue claim must " +
        "point at a real confirmed row. A decision that fails re-verification is refused and the row holds.",
    },
    estate_arithmetic_errors: arithmeticErrors,
  });

  // --- predecessor reconciliation ---------------------------------------
  writeArtifact(outDir, "predecessor-reconciliation.json", {
    ...meta,
    description:
      "Proves every Package 07 confirmed row has exactly one Package 08 identity disposition. No confirmed row " +
      "may disappear.",
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
    predecessor_confirmed_rows: confirmedRows.length,
    predecessor_expected: {
      confirmed: PREDECESSOR_CONFIRMED_ROWS,
      represented: PREDECESSOR_REPRESENTED,
      missing: PREDECESSOR_MISSING,
      identity_review: PREDECESSOR_IDENTITY_REVIEW,
    },
    predecessor_observed: {
      confirmed: confirmedRows.length,
      represented: confirmedRows.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
      missing: confirmedRows.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      identity_review: reviewRows.length,
    },
    rows_without_disposition: reconcileConfirmedRows([...build.confirmedIds], entities),
    unique_entities: entities.length,
    research_rows_suppressed_as_duplicates: duplicatesSuppressed,
    estate_arithmetic: {
      final_unique_confirmed: entities.length,
      represented_in_canon: represented.length,
      admission_ready: admissionEntities.length,
      canonical_governance_hold: governanceHold.length,
      ambiguous_hold: ambiguousHold.length,
      research_blocked: blocked.length,
      sum: represented.length + admissionEntities.length + governanceHold.length + ambiguousHold.length + blocked.length,
      closes: arithmeticErrors.length === 0,
      errors: arithmeticErrors,
    },
    refused_decisions: build.refusedDecisions,
  });

  // --- identity decisions -----------------------------------------------
  writeArtifact(outDir, "identity-decisions.json", {
    ...meta,
    description:
      "Every identity decision this package made, with the evidence behind it. A decision that failed " +
      "independent re-verification appears in refused_decisions and did NOT affect the estate.",
    decisions_received: build.rawDecisions.length,
    decisions_accepted: build.acceptedDecisions.length,
    decisions_refused: build.refusedDecisions.length,
    by_decision: tally(build.acceptedDecisions, (d) => d.decision),
    accepted: build.acceptedDecisions,
    refused: build.refusedDecisions,
  });

  // --- the 17, resolved --------------------------------------------------
  const reviewTable = reviewRows.map((row) => {
    const entity = entities.find((e) => e.package07_research_ids.includes(row.research_id));
    const decision = build.decisionsById.get(row.research_id) ?? null;
    const admissionEffect = !entity ? "UNACCOUNTED"
      : entity.disposition === "REPRESENTED_IN_CANON" ? "ALREADY_REPRESENTED"
      : entity.disposition === ADMISSION_READY_DISPOSITION
        ? (entity.merged_research_rows.length > 1 ? "DUPLICATE_SUPPRESSED" : "ADD_TO_ADMISSION_READY")
      : entity.disposition === "CANONICAL_GOVERNANCE_HOLD" ? "GOVERNANCE_HOLD"
      : entity.disposition === "RESEARCH_BLOCKED" ? "BLOCKED"
      : "AMBIGUOUS_HOLD";
    const whyAmbiguous = /Prior census flagged identity_review: ([^[\]]+)/.exec(row.notes ?? "")
      ?? /official website host "[^"]+" is cited by [^.]+\./.exec(row.notes ?? "");
    return {
      research_id: row.research_id,
      name: row.name,
      locality: row.locality,
      nation: row.nation,
      venue_class: row.venue_class,
      capacity_max: row.capacity_max,
      package_07_reason: whyAmbiguous ? whyAmbiguous[0].slice(0, 240) : "(reason not recorded in notes)",
      candidate_canonical_match: decision?.canonical_venue_id ?? null,
      package_08_decision: decision?.decision ?? "NO_DECISION_RECEIVED",
      evidence_summary: decision
        ? (text(decision.reasoning) ?? "").slice(0, 300)
        : "No Package 08 decision was received for this row, so it holds.",
      admission_effect: admissionEffect,
      unique_entity_id: entity?.unique_entity_id ?? null,
    };
  });
  writeArtifact(outDir, "identity-review-resolved.json", {
    ...meta,
    description: "The 17 Package 07 rows whose canonical identity was ambiguous, and how each was resolved.",
    count: reviewTable.length,
    by_decision: tally(reviewTable, (r) => r.package_08_decision),
    by_admission_effect: tally(reviewTable, (r) => r.admission_effect),
    rows: reviewTable,
  });

  // --- holds --------------------------------------------------------------
  const holds = entities.filter((e) => HOLD_DISPOSITIONS.includes(e.disposition));
  writeArtifact(outDir, "identity-holds.json", {
    ...meta,
    description:
      "Venues deliberately held outside automatic admission. A hold is a safe, respected outcome: the next " +
      "package can revisit it. Admitting any of these on present evidence would risk a canonical duplicate.",
    count: holds.length,
    by_disposition: tally(holds, (e) => e.disposition),
    venues: holds.map((e) => ({
      unique_entity_id: e.unique_entity_id,
      package07_research_ids: e.package07_research_ids,
      name: e.canonical_name_candidate,
      locality: e.locality,
      nation: e.nation,
      venue_class: e.venue_class,
      capacity_max: e.capacity_max,
      disposition: e.disposition,
      disposition_basis: e.disposition_basis,
      package08_reasoning: e.package08_reasoning,
    })),
  });
  writeArtifact(outDir, "admission-holds.json", {
    ...meta,
    description: "Alias of identity-holds.json, named for the admission package that will consume it.",
    count: holds.length,
    note: "Everything here is OUT of admission-ready.json by design.",
    venues: holds.map((e) => ({
      unique_entity_id: e.unique_entity_id,
      name: e.canonical_name_candidate,
      disposition: e.disposition,
      reason: e.disposition_basis,
    })),
  });

  // --- canonical matches ---------------------------------------------------
  writeArtifact(outDir, "canonical-matches.json", {
    ...meta,
    description:
      "Unique entities already represented in BeatMapped's canonical estate. These are NOT admitted again.",
    count: represented.length,
    newly_matched_by_package_08: represented.filter((e) => e.package08_decision === "MATCHES_EXISTING_CANONICAL").length,
    carried_from_package_07: represented.filter((e) => e.package08_decision === null).length,
    venues: represented.map((e) => ({
      unique_entity_id: e.unique_entity_id,
      package07_research_ids: e.package07_research_ids,
      canonical_venue_id: e.canonical_venue_id,
      name: e.canonical_name_candidate,
      locality: e.locality,
      venue_class: e.venue_class,
      basis: e.disposition_basis,
    })),
  });
  writeArtifact(outDir, "represented-in-canon.json", {
    ...meta,
    description: "Alias view of canonical-matches.json.",
    count: represented.length,
    venues: represented.map((e) => ({
      unique_entity_id: e.unique_entity_id,
      canonical_venue_id: e.canonical_venue_id,
      name: e.canonical_name_candidate,
      locality: e.locality,
      nation: e.nation,
      venue_class: e.venue_class,
    })),
  });

  // --- duplicates ----------------------------------------------------------
  const researchDuplicates = entities.filter((e) => e.merged_research_rows.length > 1);
  writeArtifact(outDir, "research-row-duplicates.json", {
    ...meta,
    description:
      "Where two or more Package 07 research rows proved to be one real-world venue. Each collapses to ONE " +
      "admission entity — a duplicate research row must never produce two admissions.",
    count: researchDuplicates.length,
    research_rows_suppressed: duplicatesSuppressed,
    groups: researchDuplicates.map((e) => ({
      unique_entity_id: e.unique_entity_id,
      surviving_research_id: e.surviving_research_id,
      merged_research_rows: e.merged_research_rows,
      name: e.canonical_name_candidate,
      disposition: e.disposition,
      reasoning: e.package08_reasoning,
      evidence: e.package08_evidence,
    })),
  });

  writeArtifact(outDir, "canonical-duplicate-candidates.json", {
    ...meta,
    description:
      "Cases where the CANONICAL estate itself appears to hold two records for one real-world venue. " +
      "NOTHING IS MERGED HERE. These are recorded for separate governance, and any affected venue is held " +
      "outside automatic admission.",
    count: governanceHold.length,
    governance_holds: governanceHold.map((e) => ({
      unique_entity_id: e.unique_entity_id,
      name: e.canonical_name_candidate,
      canonical_venue_id: e.canonical_venue_id,
      reasoning: e.package08_reasoning,
      evidence: e.package08_evidence,
    })),
    researcher_reported_leads: build.canonicalDuplicateLeads,
  });

  // --- the Anglesey pair ---------------------------------------------------
  const angleseyRows = build.predecessorRows.filter((r) => /anglesey showground/i.test(r.name));
  const angleseyConfirmed = angleseyRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  writeArtifact(outDir, "anglesey-showground-decision.json", {
    ...meta,
    description:
      "The known intra-corpus duplicate pair carried forward from Package 06, resolved here with an explicit " +
      "decision.",
    records: angleseyRows.map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      postcode: r.postcode,
      operator_name: r.operator_name,
      official_website_url: r.official_website_url,
      capacity_state: r.capacity_state,
      capacity_max: r.capacity_max,
      aliases: r.aliases,
    })),
    decision: build.angleseyDecision ?? {
      same_real_world_venue: null,
      note: "No Package 08 decision was received; the pair remains unresolved and neither row is merged.",
    },
    effect_on_confirmed_estate: {
      note:
        "Only one of the two rows is CONFIRMED_1000_PLUS, so the pair does not inflate the confirmed count " +
        "regardless of the decision. The other is capacity-unverified and was never part of the 800.",
      confirmed_rows_in_pair: angleseyConfirmed.length,
      confirmed_research_ids: angleseyConfirmed.map((r) => r.research_id),
    },
  });

  // --- the estate ----------------------------------------------------------
  writeArtifact(outDir, "unique-confirmed-estate.json", {
    ...meta,
    description:
      "Every distinct real-world venue represented by Package 07's confirmed rows, with its identity " +
      "disposition. This is the authoritative unique-entity layer.",
    count: entities.length,
    package07_confirmed_rows: confirmedRows.length,
    research_rows_suppressed_as_duplicates: duplicatesSuppressed,
    by_disposition: tally(entities, (e) => e.disposition),
    by_nation: tally(entities, (e) => e.nation),
    by_venue_class: tally(entities, (e) => e.venue_class),
    entities,
  });

  // --- ADMISSION-READY: the file the next package consumes -----------------
  writeArtifact(outDir, "admission-ready.json", {
    ...meta,
    description:
      "The definitive admission-ready population. Every row here is: confirmed >=1,000, permanent, a unique " +
      "real-world identity, definitely not already canonical, not a research duplicate, not an unresolved " +
      "canonical duplicate, and not identity-ambiguous.",
    contract:
      "This file is the SOLE input to the next high-value venue admission package. No admission occurs here.",
    count: admissionReady.length,
    by_nation: tally(admissionReady, (r) => r.nation),
    by_venue_class: tally(admissionReady, (r) => r.venue_class),
    by_segment: tally(admissionReady, (r) => segmentFor(r.venue_class)),
    venues: admissionReady,
  });

  writeArtifact(outDir, "suggested-alias-enrichment.json", {
    ...meta,
    description:
      "Aliases discovered for venues ALREADY in the canonical estate. Recorded as suggestions only — this " +
      "package applies none of them, because it mutates no canonical record.",
    count: build.aliasEnrichment.length,
    suggestions: build.aliasEnrichment,
  });

  // --- summary --------------------------------------------------------------
  const summary = {
    ...meta,
    predecessor: {
      package: PREDECESSOR_PACKAGE,
      main_sha: PREDECESSOR_MAIN_SHA,
      confirmed_rows: confirmedRows.length,
      represented: PREDECESSOR_REPRESENTED,
      missing: PREDECESSOR_MISSING,
      identity_review: PREDECESSOR_IDENTITY_REVIEW,
    },
    headline: {
      package07_confirmed_rows: confirmedRows.length,
      research_rows_suppressed_as_duplicates: duplicatesSuppressed,
      final_unique_confirmed_venues: entities.length,
      represented_in_canon: represented.length,
      admission_ready: admissionReady.length,
      canonical_governance_hold: governanceHold.length,
      ambiguous_hold: ambiguousHold.length,
      research_blocked: blocked.length,
      percent_of_unique_estate_represented: entities.length === 0 ? null
        : Number(((represented.length / entities.length) * 100).toFixed(1)),
    },
    estate_arithmetic: {
      sum: represented.length + admissionEntities.length + governanceHold.length + ambiguousHold.length + blocked.length,
      final_unique_confirmed: entities.length,
      closes: arithmeticErrors.length === 0,
      errors: arithmeticErrors,
    },
    identity_review: {
      starting: reviewRows.length,
      by_decision: tally(reviewTable, (r) => r.package_08_decision),
      by_admission_effect: tally(reviewTable, (r) => r.admission_effect),
    },
    admission_ready_breakdown: {
      total: admissionReady.length,
      by_nation: tally(admissionReady, (r) => r.nation),
      by_segment: tally(admissionReady, (r) => segmentFor(r.venue_class)),
      by_venue_class: tally(admissionReady, (r) => r.venue_class),
    },
    quality_invariants: invariants,
  };
  writeArtifact(outDir, "summary.json", summary);

  return { outDir, summary, invariants, arithmeticErrors, reviewTable };
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  let researcherDir = null;
  let generatedAt = new Date().toISOString();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--researcher-dir" && args[i + 1]) {
      researcherDir = resolve(args[i + 1]);
      i += 1;
    } else if (args[i] === "--generated-at" && args[i + 1]) {
      generatedAt = args[i + 1];
      i += 1;
    }
  }
  if (researcherDir && !existsSync(researcherDir)) {
    console.warn(`[build08] researcher dir not found: ${researcherDir}`);
    researcherDir = null;
  }

  const build = buildIdentityGate({ researcherDir });

  const errors = validateIdentityGate({
    decisions: build.acceptedDecisions,
    entities: build.entities,
    admissionReady: build.admissionReady,
  });
  const reconciliation = reconcileConfirmedRows([...build.confirmedIds], build.entities);
  if (errors.length > 0 || reconciliation.length > 0) {
    console.error(`[build08] REFUSING TO WRITE — ${errors.length} contract, ${reconciliation.length} reconciliation failure(s):`);
    for (const e of [...errors, ...reconciliation].slice(0, 40)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const { summary, invariants, arithmeticErrors } = emitArtifacts08(build, { generatedAt });

  console.log(`[build08] wrote ${IDENTITY_GATE_OUTPUT_DIR}`);
  console.log(`[build08] Package 07 confirmed rows ......... ${summary.headline.package07_confirmed_rows}`);
  console.log(`[build08] duplicates suppressed ............. ${summary.headline.research_rows_suppressed_as_duplicates}`);
  console.log(`[build08] FINAL UNIQUE CONFIRMED VENUES ..... ${summary.headline.final_unique_confirmed_venues}`);
  console.log(`[build08]   represented in canon ........... ${summary.headline.represented_in_canon}`);
  console.log(`[build08]   ADMISSION-READY ................ ${summary.headline.admission_ready}`);
  console.log(`[build08]   canonical governance hold ...... ${summary.headline.canonical_governance_hold}`);
  console.log(`[build08]   ambiguous hold ................. ${summary.headline.ambiguous_hold}`);
  console.log(`[build08]   research blocked ............... ${summary.headline.research_blocked}`);
  console.log(`[build08] decisions accepted/refused ....... ${build.acceptedDecisions.length}/${build.refusedDecisions.length}`);
  console.log(`[build08] arithmetic closes ................ ${arithmeticErrors.length === 0}`);
  console.log(`[build08] invariants ....................... ${JSON.stringify(invariants)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
