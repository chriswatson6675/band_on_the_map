// BEATMAPPED-FOOTBALL-EVENT-ADMISSION-PILOT-01 — the pilot runner.
//
//   node ingestion/gc-football-event-admission/run-pilot.mjs plan    --as-of=<iso>
//   node ingestion/gc-football-event-admission/run-pilot.mjs execute --as-of=<iso> --admitted-at=<iso>
//   node ingestion/gc-football-event-admission/run-pilot.mjs replay  --as-of=<iso> --admitted-at=<iso>
//
// WHAT THIS OWNS, AND WHAT IT MUST NOT.
//
// It owns the football-specific parts: censusing the fingerprint corpus,
// applying pilot policy, deterministic selection and reserves, building
// the plan, converting a fingerprint into a generic admission request,
// and writing the result artifact.
//
// It owns NONE of the generic machinery. Event ids are minted only by
// ingestion/event/contract.mjs, persistence and validation only by
// ingestion/event/registry.mjs, mapping and schedule rules only by their
// own contracts. This module never opens events/event-state.json itself;
// every write goes through admitEvent().
//
// The plan is built and preflighted BEFORE any Event state is touched, so
// candidate selection can be reviewed against the artifact without a
// single id having been minted.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { admitEvent } from "../event/admission.mjs";
import { readValidatedState } from "../event/registry.mjs";
import { findActiveByIdentityKey, mappingIdentityKey } from "../event/occurrence-mapping.mjs";
import {
  PILOT_MAX_EVENTS,
  PILOT_PER_STRATUM,
  PILOT_POLICY,
  STRATUM_WITHOUT_VENUE,
  STRATUM_WITH_VENUE,
  eligibility,
  selectPilotCandidates,
  tallyExclusions,
  toAdmissionRequest,
} from "./policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const RUN_ID = "uk-gc-football-pilot-01";
export const FINGERPRINTS_PATH =
  "research/major-event-occurrence-fingerprints/uk-gc-football-01/occurrence-fingerprints.json";
export const RECONCILED_PATH =
  "research/major-event-reconciliation/uk-gc-football-01/reconciled-fixtures.json";
export const OBSERVATIONS_PATH =
  "research/major-event-acquisition/uk-gc-football-01/observations.json";
export const OUT_DIR = "research/major-event-admission/uk-gc-football-pilot-01";
export const PLAN_PATH = `${OUT_DIR}/admission-plan.json`;
export const RESULT_PATH = `${OUT_DIR}/admission-result.json`;

const readJson = async (path, { root = ROOT } = {}) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const writeJson = async (path, value, { root = ROOT } = {}) => {
  const full = resolve(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return full;
};

function flagValue(name) {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag ? flag.slice(`--${name}=`.length) : null;
}

/** The candidate row recorded in the plan. Evidence references only. */
function planRow(record) {
  return {
    occurrence_fingerprint: record.occurrence_fingerprint,
    occurrence_instant_utc: record.occurrence_instant_utc,
    reconciliation_group_id: record.reconciliation_group_id,
    platform_match_id: record.platform_match_id,
    evidence_class: record.evidence_class,
    publisher_domains: [...record.publisher_domains],
    publisher_domain_count: record.publisher_domain_count,
    source_observations: record.source_observations.map((ref) => ({ ...ref })),
    source_observation_count: record.source_observations.length,
    venue_evidence_state: record.venue_evidence_state,
    governed_venue_census_id: record.governed_venue_census_id ?? null,
    governed_venue_name: record.governed_venue_name ?? null,
    // Retained for HUMAN REVIEW of the plan only. Nothing downstream
    // reads these, no Event carries them, and no canonical spelling is
    // chosen from them.
    review_only_variants: {
      home_team_variants: [...record.home_team_variants],
      away_team_variants: [...record.away_team_variants],
      competition_variants: [...record.competition_variants],
    },
  };
}

/**
 * Build the governed plan. Pure with respect to Event state: it reads the
 * fingerprint corpus and returns the plan, minting nothing.
 *
 * No application Event id appears anywhere in a plan — the plan exists
 * precisely to be reviewable before identity is created.
 */
export function buildPlan(records, { asOf }) {
  const selection = selectPilotCandidates(records, { asOf });

  const strata = {};
  for (const name of [STRATUM_WITH_VENUE, STRATUM_WITHOUT_VENUE]) {
    const stratum = selection.strata[name];
    strata[name] = {
      eligible_count: stratum.eligible_count,
      requested: PILOT_PER_STRATUM,
      shortfall: stratum.shortfall,
      primary: stratum.primary.map(planRow),
      reserves: stratum.reserves.map(planRow),
    };
  }

  const primaryCount = strata[STRATUM_WITH_VENUE].primary.length + strata[STRATUM_WITHOUT_VENUE].primary.length;

  return {
    artifact_type: "UK_GC_FOOTBALL_EVENT_ADMISSION_PLAN",
    run_id: RUN_ID,
    policy: PILOT_POLICY,
    policy_note:
      "PILOT policy, not permanent football admission policy. The >= 7 day buffer exists so a human can review these Events before any of them occurs; it is not a generic Event rule. Whether same-publisher or single-source football may ever be admitted remains undecided.",
    pilot_as_of: asOf,
    admission_cutoff_utc: selection.cutoff,
    max_events: PILOT_MAX_EVENTS,

    inputs: {
      occurrence_fingerprints: FINGERPRINTS_PATH,
      reconciled_fixtures: RECONCILED_PATH,
      source_observations: OBSERVATIONS_PATH,
    },

    eligibility_criteria: [
      "fingerprint_state = OCCURRENCE_FINGERPRINT_ESTABLISHED",
      "evidence_class = CROSS_PUBLISHER_CORROBORATED",
      "occurrence_type = FOOTBALL_FIXTURE",
      "occurrence_fingerprint present and non-empty",
      "occurrence_instant_utc present and valid",
      "at least two retained source Observation refs",
      "publisher_domain_count > 1",
      "reconciliation_state = RECONCILED_MULTI_SOURCE (no upstream factual conflict)",
      "venue_evidence_state is not CONFLICTING_RESOLVED_VENUES",
      "no retained evidence says the fixture is cancelled, postponed or otherwise not scheduled",
      "occurrence_instant_utc >= pilot_as_of + 7 days",
    ],

    deterministic_sort: "occurrence_instant_utc ascending, then occurrence_fingerprint ascending",
    selection_note:
      "No hand-picking, no club preference, no geography balancing, and nothing derived from a team name. Reserves are the next five in the same deterministic order within the same stratum.",

    counts: {
      corpus: records.length,
      eligible: selection.eligible_count,
      excluded: selection.excluded.length,
      primary_selected: primaryCount,
      reserves_available: strata[STRATUM_WITH_VENUE].reserves.length + strata[STRATUM_WITHOUT_VENUE].reserves.length,
    },
    excluded_by_reason: tallyExclusions(selection.excluded),

    strata,

    creates_event_identity: false,
    note: "A plan proposes admissions. It mints no Event id and writes no Event state; execution does that, through ingestion/event/admission.mjs only.",
  };
}

/**
 * Preflight one candidate against the live corpus and the CURRENT Event
 * state, immediately before it would be admitted. Returns a factual
 * reason on failure rather than a boolean.
 */
export function preflight(row, { records, reconciledById, observationKeys, activeMappings, asOf }) {
  const matches = records.filter((record) => record.occurrence_fingerprint === row.occurrence_fingerprint);
  if (matches.length !== 1) return { ok: false, reason: `FINGERPRINT_NOT_UNIQUE_IN_CORPUS:${matches.length}` };
  const record = matches[0];

  const verdict = eligibility(record, { asOf });
  if (!verdict.eligible) return { ok: false, reason: `INELIGIBLE:${verdict.reason}` };

  const group = reconciledById.get(record.reconciliation_group_id);
  if (!group) return { ok: false, reason: "RECONCILIATION_GROUP_NOT_FOUND" };
  if (group.platform_match_id !== record.platform_match_id) return { ok: false, reason: "RECONCILIATION_MATCH_ID_MISMATCH" };

  const groupRefs = new Set(group.members.map((ref) => `${ref.source_id}||${ref.source_record_id}`));
  for (const ref of record.source_observations) {
    const key = `${ref.source_id}||${ref.source_record_id}`;
    if (!observationKeys.has(key)) return { ok: false, reason: `OBSERVATION_NOT_RETAINED:${key}` };
    if (!groupRefs.has(key)) return { ok: false, reason: `OBSERVATION_NOT_IN_RECONCILIATION_GROUP:${key}` };
  }

  if (record.governed_venue_census_id) {
    if (record.venue_evidence_state !== "AGREED_BY_ALL_RESOLVED_MEMBERS") {
      return { ok: false, reason: "VENUE_PRESENT_BUT_NOT_AGREED" };
    }
    if ((record.venue_supported_by ?? []).length === 0) return { ok: false, reason: "VENUE_HAS_NO_SUPPORTING_MEMBER" };
  } else if (record.venue_evidence_state !== "NO_MEMBER_RESOLVED") {
    return { ok: false, reason: `NO_VENUE_BUT_STATE_IS:${record.venue_evidence_state}` };
  }

  // A candidate already actively mapped is NOT an exclusion. It is a
  // replay, and it must be handed to admitEvent() so the generic
  // foundation can return ALREADY_ADMITTED and mint nothing.
  //
  // Treating it as a preflight failure was a real defect: the runner
  // skipped the ten admitted primaries and fell through to the reserves,
  // admitting ten MORE Events on replay. The foundation was never at
  // fault — it double-minted nothing — but the caller must not go
  // looking for substitutes for a candidate that already succeeded.
  const key = mappingIdentityKey({
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: record.occurrence_fingerprint,
    observations: record.source_observations,
  });
  const existing = findActiveByIdentityKey(activeMappings, key);

  return { ok: true, record, already_mapped: Boolean(existing) };
}

/** Load everything preflight needs, once. */
async function loadCorpus({ root = ROOT } = {}) {
  const records = (await readJson(FINGERPRINTS_PATH, { root })).occurrence_fingerprints;
  const reconciled = (await readJson(RECONCILED_PATH, { root })).reconciled_fixtures;
  const observations = (await readJson(OBSERVATIONS_PATH, { root })).observations;
  return {
    records,
    reconciledById: new Map(reconciled.map((group) => [group.reconciliation_group_id, group])),
    observationKeys: new Set(observations.map((o) => `${o.source_id}||${o.source_record_id}`)),
  };
}

/**
 * Execute the plan through the generic foundation, one candidate at a
 * time, stopping at PILOT_MAX_EVENTS successful admissions.
 *
 * A structurally failing primary is replaced only by that stratum's
 * NEXT PRE-PLANNED reserve — never by an ad-hoc candidate chosen after
 * execution began.
 */
export async function executePlan(plan, { root = ROOT, admittedAt, uuid } = {}) {
  const corpus = await loadCorpus({ root });
  const admitted = [];
  const skipped = [];

  for (const name of [STRATUM_WITH_VENUE, STRATUM_WITHOUT_VENUE]) {
    const stratum = plan.strata[name];
    const queue = [...stratum.primary, ...stratum.reserves];
    let takenFromStratum = 0;

    for (const row of queue) {
      // Both ADMITTED and ALREADY_ADMITTED count as "this stratum slot is
      // resolved". That is what makes a replay stop at the same five
      // primaries instead of reaching for reserves.
      if (takenFromStratum >= PILOT_PER_STRATUM) break;
      if (admitted.length >= PILOT_MAX_EVENTS) break;

      const state = await readValidatedState({ root });
      const check = preflight(row, { ...corpus, activeMappings: state.mappings, asOf: plan.pilot_as_of });
      if (!check.ok) {
        skipped.push({ stratum: name, occurrence_fingerprint: row.occurrence_fingerprint, reason: check.reason });
        continue;
      }

      const request = toAdmissionRequest(check.record, {
        admittedAt,
        runId: RUN_ID,
        planPath: PLAN_PATH,
        fingerprintArtifactPath: FINGERPRINTS_PATH,
      });

      const result = await admitEvent(request, { root, ...(uuid ? { uuid } : {}) });

      admitted.push({
        stratum: name,
        outcome: result.outcome,
        event_id: result.event.event_id,
        occurrence_fingerprint: result.mapping.fingerprint,
        occurrence_instant_utc: result.event.start.iso,
        venue_id: result.event.venue_id,
        source_observation_count: result.mapping.observations.length,
        publisher_domains: row.publisher_domains,
        publisher_domain_count: row.publisher_domain_count,
        status: result.event.status,
      });
      takenFromStratum += 1;
    }
  }

  return { admitted, skipped };
}

async function main() {
  const command = process.argv[2] ?? "plan";
  const asOf = flagValue("as-of");
  if (!asOf) throw new Error("--as-of=<iso> is required (the pilot reads no clock of its own)");

  const records = (await readJson(FINGERPRINTS_PATH)).occurrence_fingerprints;
  const plan = buildPlan(records, { asOf });

  if (command === "plan") {
    const path = await writeJson(PLAN_PATH, plan);
    console.log(`corpus                 : ${plan.counts.corpus}`);
    console.log(`eligible               : ${plan.counts.eligible}`);
    console.log(`  with governed venue  : ${plan.strata[STRATUM_WITH_VENUE].eligible_count}`);
    console.log(`  without venue        : ${plan.strata[STRATUM_WITHOUT_VENUE].eligible_count}`);
    console.log(`primary selected       : ${plan.counts.primary_selected}`);
    console.log(`reserves available     : ${plan.counts.reserves_available}`);
    console.log(`plan                   : ${path}`);
    return;
  }

  const admittedAt = flagValue("admitted-at");
  if (!admittedAt) throw new Error("--admitted-at=<iso> is required for execute/replay");

  const before = await readValidatedState();
  const { admitted, skipped } = await executePlan(plan, { admittedAt });
  const after = await readValidatedState();

  const counts = (state) => ({
    events: state.events.length,
    event_occurrence_mappings: state.mappings.length,
    schedule_history: state.scheduleHistory.length,
  });

  const outcomes = {};
  for (const entry of admitted) outcomes[entry.outcome] = (outcomes[entry.outcome] ?? 0) + 1;

  console.log(`${command}: ${JSON.stringify(outcomes)}`);
  console.log(`before : ${JSON.stringify(counts(before))}`);
  console.log(`after  : ${JSON.stringify(counts(after))}`);
  if (skipped.length > 0) console.log(`skipped: ${JSON.stringify(skipped)}`);

  if (command === "run") {
    // A pilot is only proven when the SECOND run changes nothing, so the
    // runner performs both phases and records both truthfully. Reporting
    // only one would let an execute-shaped result hide a replay that
    // quietly minted more Events — which is exactly the defect this
    // runner had on its first attempt.
    const replay = await executePlan(plan, { admittedAt });
    const afterReplay = await readValidatedState();

    const replayOutcomes = {};
    for (const entry of replay.admitted) replayOutcomes[entry.outcome] = (replayOutcomes[entry.outcome] ?? 0) + 1;

    console.log(`replay : ${JSON.stringify(replayOutcomes)}`);
    console.log(`after  : ${JSON.stringify(counts(afterReplay))}`);

    const path = await writeJson(
      RESULT_PATH,
      buildResult({
        plan,
        admittedAt,
        firstExecution: { outcomes, admitted, skipped, before: counts(before), after: counts(after) },
        replayExecution: {
          outcomes: replayOutcomes,
          skipped: replay.skipped,
          before: counts(after),
          after: counts(afterReplay),
        },
      }),
    );
    console.log(`result : ${path}`);
  }

  return { plan, admitted, skipped, before: counts(before), after: counts(after) };
}

/**
 * The governed record of what this pilot actually did. Evidence
 * references only — no raw source bodies are copied here, and the
 * fingerprint artifact remains the place to look for the evidence itself.
 */
export function buildResult({ plan, admittedAt, firstExecution, replayExecution }) {
  const admitted = firstExecution.admitted;
  const byStratum = (name) => admitted.filter((entry) => entry.stratum === name);

  return {
    artifact_type: "UK_GC_FOOTBALL_EVENT_ADMISSION_RESULT",
    run_id: RUN_ID,
    policy: PILOT_POLICY,
    policy_note: plan.policy_note,

    pilot_as_of: plan.pilot_as_of,
    pilot_admitted_at: admittedAt,
    admission_cutoff_utc: plan.admission_cutoff_utc,

    inputs: { ...plan.inputs, admission_plan: PLAN_PATH },

    selection: {
      eligible: plan.counts.eligible,
      primary_selected: plan.counts.primary_selected,
      reserves_available: plan.counts.reserves_available,
      with_governed_venue: {
        eligible: plan.strata[STRATUM_WITH_VENUE].eligible_count,
        shortfall: plan.strata[STRATUM_WITH_VENUE].shortfall,
      },
      without_governed_venue: {
        eligible: plan.strata[STRATUM_WITHOUT_VENUE].eligible_count,
        shortfall: plan.strata[STRATUM_WITHOUT_VENUE].shortfall,
      },
      excluded_by_reason: plan.excluded_by_reason,
    },

    admitted,

    first_execution: {
      outcomes: firstExecution.outcomes,
      skipped: firstExecution.skipped,
      before: firstExecution.before,
      after: firstExecution.after,
      net: {
        events: firstExecution.after.events - firstExecution.before.events,
        event_occurrence_mappings:
          firstExecution.after.event_occurrence_mappings - firstExecution.before.event_occurrence_mappings,
        schedule_history: firstExecution.after.schedule_history - firstExecution.before.schedule_history,
      },
    },

    replay_execution: {
      outcomes: replayExecution.outcomes,
      skipped: replayExecution.skipped,
      before: replayExecution.before,
      after: replayExecution.after,
      net: {
        events: replayExecution.after.events - replayExecution.before.events,
        event_occurrence_mappings:
          replayExecution.after.event_occurrence_mappings - replayExecution.before.event_occurrence_mappings,
        schedule_history: replayExecution.after.schedule_history - replayExecution.before.schedule_history,
      },
      note: "A replay of the exact same plan must mint nothing: every outcome ALREADY_ADMITTED and every net zero.",
    },

    counts: {
      with_governed_venue: byStratum(STRATUM_WITH_VENUE).length,
      without_governed_venue: byStratum(STRATUM_WITHOUT_VENUE).length,
    },

    public_impact: {
      public_events_published: 0,
      public_map_changed: false,
      publication_run: false,
      deployment: "NONE",
      note: "These are canonical but PRIVATE Events. The publication path reads Observations and never events/event-state.json, so nothing here can reach the map.",
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-pilot.mjs")) {
  await main();
}

export { loadCorpus, readJson, writeJson };
