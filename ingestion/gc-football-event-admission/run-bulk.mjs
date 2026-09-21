// BEATMAPPED-FOOTBALL-FULL-FUTURE-EVENT-ADMISSION-01 — the bulk runner.
//
//   node ingestion/gc-football-event-admission/run-bulk.mjs plan    --as-of=<iso>
//   node ingestion/gc-football-event-admission/run-bulk.mjs execute --as-of=<iso> --admitted-at=<iso>
//   node ingestion/gc-football-event-admission/run-bulk.mjs replay  --as-of=<iso> --admitted-at=<iso>
//
// There is deliberately NO event cap. The pilot's ten was a review
// bound, not a safety bound, and re-imposing one here would quietly turn
// a full admission into another sample.
//
// It owns the football-specific work: censusing every distinct
// occurrence, classifying it, planning, and converting to a generic
// request. It owns none of the generic machinery — ids are minted only by
// ingestion/event/contract.mjs and state is written only through
// admitEvent()/attachOccurrenceEvidence().

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { admitEvent, attachOccurrenceEvidence } from "../event/admission.mjs";
import { readValidatedState } from "../event/registry.mjs";
import { BULK_POLICY, CENSUS_STATES, classify, comparePlanRows, toBulkAdmissionRequest } from "./bulk-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const RUN_ID = "uk-gc-football-full-future-01";
export const OUT_DIR = "research/major-event-admission/uk-gc-football-full-future-01";
export const PLAN_PATH = `${OUT_DIR}/admission-plan.json`;
export const RESULT_PATH = `${OUT_DIR}/admission-result.json`;

const PATHS = {
  observations: "research/major-event-acquisition/uk-gc-football-01/observations.json",
  reconciled: "research/major-event-reconciliation/uk-gc-football-01/reconciled-fixtures.json",
  singleSource: "research/major-event-reconciliation/uk-gc-football-01/single-source.json",
  conflicts: "research/major-event-reconciliation/uk-gc-football-01/conflicts.json",
  fingerprints: "research/major-event-occurrence-fingerprints/uk-gc-football-01/occurrence-fingerprints.json",
  attributions: "research/major-event-attribution/uk-gc-football-01/attributions.json",
};

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

const refKey = (ref) => `${ref.source_id}||${ref.source_record_id}`;

/**
 * Load every input once and build the DISTINCT occurrence census.
 *
 * One occurrence is one platform_match_id. Multi-source occurrences come
 * from the reconciliation layer (and carry a fingerprint); single-source
 * occurrences come from single-source.json (and carry exactly one
 * Observation ref and no fingerprint — none is manufactured).
 */
export async function buildCensus({ root = ROOT } = {}) {
  const [observations, reconciled, singleSource, conflicts, fingerprints, attributions] = await Promise.all([
    readJson(PATHS.observations, { root }).then((d) => d.observations),
    readJson(PATHS.reconciled, { root }).then((d) => d.reconciled_fixtures),
    readJson(PATHS.singleSource, { root }).then((d) => d.single_source),
    readJson(PATHS.conflicts, { root }).then((d) => d.conflicts ?? []),
    readJson(PATHS.fingerprints, { root }).then((d) => d.occurrence_fingerprints),
    readJson(PATHS.attributions, { root }).then((d) => d.attributions),
  ]);

  const observationByKey = new Map(observations.map((o) => [refKey(o), o]));
  const attributionByKey = new Map(attributions.map((a) => [refKey(a), a]));
  const fingerprintByGroup = new Map(fingerprints.map((f) => [f.reconciliation_group_id, f]));
  const conflictByMatchId = new Map(conflicts.map((c) => [c.platform_match_id, c]));

  /** Status-bearing strings retained for one Observation ref. */
  const statusTexts = (refs) => {
    const texts = [];
    for (const ref of refs) {
      const observation = observationByKey.get(refKey(ref));
      if (!observation) continue;
      texts.push(observation.title, observation.description);
      const fields = observation.source_fields ?? {};
      texts.push(fields.competition_name, fields.venue_text_raw);
      for (const name of fields.team_names ?? []) texts.push(name);
    }
    return texts;
  };

  const candidates = [];

  for (const group of reconciled) {
    const fingerprint = fingerprintByGroup.get(group.reconciliation_group_id) ?? null;
    candidates.push({
      platform_match_id: group.platform_match_id,
      reconciliation_group_id: group.reconciliation_group_id,
      kickoff_utc: group.kickoff_utc,
      observations: group.members.map((ref) => ({ ...ref })),
      occurrence_fingerprint: fingerprint?.occurrence_fingerprint ?? null,
      evidence_strength: group.publisher_domain_count > 1 ? "CROSS_PUBLISHER_CORROBORATED" : "SAME_PUBLISHER_MULTI_SOURCE",
      publisher_domains: [...(group.publisher_domains ?? [])],
      publisher_domain_count: group.publisher_domain_count ?? null,
      venue_evidence_state: group.venue_evidence_state ?? null,
      governed_venue_census_id: group.reconciled_venue_census_id ?? null,
      factual_conflict:
        group.reconciliation_state !== "RECONCILED_MULTI_SOURCE"
          ? `RECONCILIATION_STATE:${group.reconciliation_state}`
          : conflictByMatchId.has(group.platform_match_id)
            ? "UPSTREAM_CONFLICT_RECORD"
            : group.venue_evidence_state === "CONFLICTING_RESOLVED_VENUES"
              ? "CONFLICTING_RESOLVED_VENUES"
              : null,
      status_texts: statusTexts(group.members),
      source_artifact: PATHS.fingerprints,
    });
  }

  for (const entry of singleSource) {
    const ref = entry.members[0] ?? null;
    // Venue for a single-source occurrence can only come from that one
    // member's EXISTING governed attribution. Nothing is guessed, and a
    // home club's stadium is never assumed from a home-team label.
    const attribution = ref ? attributionByKey.get(refKey(ref)) : null;
    candidates.push({
      platform_match_id: entry.platform_match_id,
      reconciliation_group_id: entry.reconciliation_group_id,
      kickoff_utc: entry.kickoff_utc,
      observations: entry.members.map((member) => ({ ...member })),
      occurrence_fingerprint: null,
      evidence_strength: "SINGLE_SOURCE_ASSERTION",
      publisher_domains: [],
      publisher_domain_count: 1,
      venue_evidence_state: attribution?.attribution_state ?? null,
      governed_venue_census_id: attribution?.resolved_venue_census_id ?? null,
      factual_conflict: conflictByMatchId.has(entry.platform_match_id) ? "UPSTREAM_CONFLICT_RECORD" : null,
      status_texts: statusTexts(entry.members),
      source_artifact: PATHS.singleSource,
    });
  }

  for (const candidate of candidates) {
    candidate.evidence_key = candidate.occurrence_fingerprint ?? candidate.observations.map(refKey).sort().join("|");
  }

  return {
    candidates,
    totals: {
      source_observations: observations.length,
      reconciled_multi_source: reconciled.length,
      single_source: singleSource.length,
      upstream_conflicts: conflicts.length,
    },
  };
}

/** The Event state's currently-active evidence keys. */
function activeKeys(state) {
  const fingerprints = new Set();
  const observationKeys = new Set();
  const eventByFingerprint = new Map();
  const eventByObservation = new Map();

  for (const mapping of state.mappings) {
    if (mapping.lifecycle !== "ACTIVE") continue;
    if (mapping.fingerprint) {
      fingerprints.add(mapping.fingerprint);
      eventByFingerprint.set(mapping.fingerprint, mapping.event_id);
    }
    for (const ref of mapping.observations) {
      observationKeys.add(refKey(ref));
      eventByObservation.set(refKey(ref), mapping.event_id);
    }
  }

  return { fingerprints, observationKeys, eventByFingerprint, eventByObservation };
}

/**
 * Build the complete plan. Every distinct occurrence appears exactly
 * once, in a census state, and the accounting is asserted to sum.
 */
export function buildPlan(census, { asOf, state }) {
  const active = activeKeys(state);

  const byState = {};
  const rows = [];
  const excluded = [];

  for (const candidate of census.candidates) {
    const verdict = classify(candidate, {
      asOf,
      activeFingerprints: active.fingerprints,
      activeObservationKeys: active.observationKeys,
    });
    byState[verdict.state] = (byState[verdict.state] ?? 0) + 1;

    if (verdict.state === "FUTURE_ELIGIBLE_MULTI_SOURCE" || verdict.state === "FUTURE_ELIGIBLE_SINGLE_SOURCE") {
      rows.push({
        action: "ADMIT",
        census_state: verdict.state,
        platform_match_id: candidate.platform_match_id,
        reconciliation_group_id: candidate.reconciliation_group_id,
        kickoff_utc: candidate.kickoff_utc,
        occurrence_fingerprint: candidate.occurrence_fingerprint,
        evidence_key: candidate.evidence_key,
        evidence_strength: candidate.evidence_strength,
        publisher_domains: candidate.publisher_domains,
        publisher_domain_count: candidate.publisher_domain_count,
        venue_evidence_state: candidate.venue_evidence_state,
        governed_venue_census_id: candidate.governed_venue_census_id,
        observations: candidate.observations,
        source_artifact: candidate.source_artifact,
      });
      continue;
    }

    if (verdict.state === "ALREADY_ADMITTED") {
      // An occurrence whose fingerprint is not yet mapped, but whose
      // Observation already belongs to an Event, is an evidence UPGRADE:
      // attach it to that Event rather than minting a second one.
      const existingByFingerprint = candidate.occurrence_fingerprint
        ? active.eventByFingerprint.get(candidate.occurrence_fingerprint)
        : undefined;

      if (existingByFingerprint === undefined && candidate.occurrence_fingerprint) {
        const owners = new Set(
          candidate.observations.map((ref) => active.eventByObservation.get(refKey(ref))).filter(Boolean),
        );
        if (owners.size === 1) {
          rows.push({
            action: "ATTACH_EVIDENCE",
            census_state: verdict.state,
            event_id: [...owners][0],
            platform_match_id: candidate.platform_match_id,
            reconciliation_group_id: candidate.reconciliation_group_id,
            kickoff_utc: candidate.kickoff_utc,
            occurrence_fingerprint: candidate.occurrence_fingerprint,
            evidence_key: candidate.evidence_key,
            evidence_strength: candidate.evidence_strength,
            publisher_domains: candidate.publisher_domains,
            publisher_domain_count: candidate.publisher_domain_count,
            venue_evidence_state: candidate.venue_evidence_state,
            governed_venue_census_id: candidate.governed_venue_census_id,
            observations: candidate.observations,
            source_artifact: candidate.source_artifact,
          });
          continue;
        }
        if (owners.size > 1) {
          // Evidence implying two canonical Events are one. This package
          // does not merge Events; it reports and declines.
          excluded.push({
            platform_match_id: candidate.platform_match_id,
            state: "FACTUAL_CONFLICT",
            reason: `EVIDENCE_SPANS_MULTIPLE_EVENTS:${[...owners].join(",")}`,
          });
          byState[verdict.state] -= 1;
          byState.FACTUAL_CONFLICT = (byState.FACTUAL_CONFLICT ?? 0) + 1;
          continue;
        }
      }

      rows.push({
        action: "ALREADY_ADMITTED",
        census_state: verdict.state,
        platform_match_id: candidate.platform_match_id,
        kickoff_utc: candidate.kickoff_utc,
        occurrence_fingerprint: candidate.occurrence_fingerprint,
        evidence_key: candidate.evidence_key,
        evidence_strength: candidate.evidence_strength,
        observations: candidate.observations,
        reason: verdict.reason,
      });
      continue;
    }

    excluded.push({
      platform_match_id: candidate.platform_match_id,
      kickoff_utc: candidate.kickoff_utc,
      evidence_strength: candidate.evidence_strength,
      state: verdict.state,
      reason: verdict.reason,
    });
  }

  rows.sort(comparePlanRows);
  excluded.sort(comparePlanRows);

  const totalClassified = Object.values(byState).reduce((sum, count) => sum + count, 0);
  const totalOccurrences = census.candidates.length;
  const unexplained = totalOccurrences - totalClassified;

  for (const state of Object.keys(byState)) {
    if (!CENSUS_STATES.has(state)) throw new Error(`STOP: undeclared census state ${state}`);
  }
  if (unexplained !== 0) {
    throw new Error(`STOP: ${unexplained} occurrences are unaccounted for`);
  }

  const evidenceBreakdown = {};
  for (const row of rows.filter((r) => r.action === "ADMIT")) {
    evidenceBreakdown[row.evidence_strength] = (evidenceBreakdown[row.evidence_strength] ?? 0) + 1;
  }

  return {
    artifact_type: "UK_GC_FOOTBALL_FULL_FUTURE_ADMISSION_PLAN",
    run_id: RUN_ID,
    policy: BULK_POLICY,
    policy_note:
      "The first NORMAL football admission policy, not another pilot. A credible retained source assertion of a uniquely identifiable scheduled future fixture is sufficient for canonical Event EXISTENCE unless contradicted by stronger retained evidence. Evidence STRENGTH is recorded separately on every mapping: a single-source Event is never claimed to be cross-publisher corroborated.",
    bulk_as_of: asOf,
    event_cap: null,
    inputs: PATHS,

    eligibility_criteria: [
      "a stable provider match identity exists",
      "a scheduled kickoff exists and normalises to a valid instant",
      "kickoff > bulk_as_of (no buffer)",
      "at least one retained Observation exists and resolves",
      "no unresolved factual conflict",
      "no positive retained evidence that the fixture is cancelled, void or abandoned",
      "not already represented by an active canonical mapping",
    ],
    not_required: [
      "cross-publisher corroboration",
      "two or more sources",
      "an occurrence fingerprint",
      "a governed venue",
      "canonical club identity",
      "canonical competition identity",
      "a display title",
      "a seven-day buffer",
    ],

    deterministic_sort: "kickoff ascending, then platform_match_id, then fingerprint or observation identity",

    accounting: {
      total_source_observations: census.totals.source_observations,
      total_distinct_occurrences: totalOccurrences,
      multi_source_occurrences: census.totals.reconciled_multi_source,
      single_source_occurrences: census.totals.single_source,
      by_census_state: byState,
      total_classified: totalClassified,
      unexplained,
    },

    actions: {
      ADMIT: rows.filter((r) => r.action === "ADMIT").length,
      ATTACH_EVIDENCE: rows.filter((r) => r.action === "ATTACH_EVIDENCE").length,
      ALREADY_ADMITTED: rows.filter((r) => r.action === "ALREADY_ADMITTED").length,
    },
    admit_by_evidence_strength: evidenceBreakdown,

    rows,
    excluded,
  };
}

const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

/**
 * Retry a persistence call over a TRANSIENT Windows filesystem error.
 *
 * ingestion/event/registry.mjs commits state with tmp-file + rename,
 * which is correct and is this repository's established convention. On
 * Windows a rename over an existing file can still fail with EPERM/EBUSY
 * when an external process (Defender, the search indexer) momentarily
 * holds the destination. That is an environmental condition, not a defect
 * in the foundation, so it is handled HERE rather than by changing the
 * foundation's write path.
 *
 * Retrying is safe precisely because admission is idempotent. Either the
 * rename never landed, in which case nothing was persisted and the retry
 * admits normally; or it landed despite the error, in which case the
 * retry finds the evidence already active and returns ALREADY_ADMITTED.
 * Neither path can produce a duplicate Event.
 */
async function withTransientRetry(operation, { attempts = 6 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const transient = error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES";
      if (!transient || attempt === attempts) throw error;
      lastError = error;
      await sleep(25 * attempt);
    }
  }
  throw lastError;
}

/**
 * Execute every plan row through the generic foundation. Candidate-level
 * failures are recorded and execution continues; a state-validation
 * failure is fatal and stops the package.
 */
export async function executePlan(plan, { root = ROOT, admittedAt, uuid, onProgress } = {}) {
  const outcomes = {};
  const failures = [];
  let processed = 0;

  for (const row of plan.rows) {
    processed += 1;
    try {
      if (row.action === "ATTACH_EVIDENCE") {
        const result = await withTransientRetry(() =>
          attachOccurrenceEvidence(
            {
              event_id: row.event_id,
              basis: toBulkAdmissionRequest(row, { admittedAt, runId: RUN_ID, planPath: PLAN_PATH }).basis,
              attached_at: admittedAt,
            },
            { root },
          ),
        );
        outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
      } else {
        const request = toBulkAdmissionRequest(row, { admittedAt, runId: RUN_ID, planPath: PLAN_PATH });
        const result = await withTransientRetry(() => admitEvent(request, { root, ...(uuid ? { uuid } : {}) }));
        outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
      }
    } catch (error) {
      // A candidate's own bad data fails closed and the run continues.
      // A foundation or state-validation failure is not a candidate
      // problem and must stop the package.
      if (/Refusing to persist|state|schema/i.test(error.message) && !/Invalid Event|Invalid occurrence mapping/i.test(error.message)) {
        throw error;
      }
      failures.push({ platform_match_id: row.platform_match_id, evidence_key: row.evidence_key, error: error.message });
    }

    if (onProgress && processed % 500 === 0) onProgress(processed, plan.rows.length);
  }

  return { outcomes, failures };
}

const counts = (state) => ({
  events: state.events.length,
  event_occurrence_mappings: state.mappings.length,
  schedule_history: state.scheduleHistory.length,
});

/** A stable semantic fingerprint of Event state, for replay comparison. */
export function stateSignature(state) {
  return JSON.stringify({
    events: state.events.map((e) => e.event_id).sort(),
    mappings: state.mappings.map((m) => `${m.event_id}|${m.lifecycle}|${m.fingerprint ?? ""}`).sort(),
    schedule: state.scheduleHistory.map((a) => `${a.event_id}|${a.lifecycle}`).sort(),
  });
}

/**
 * Replay the EXACT plan that was executed, then record the governed
 * result. Replay is mandatory: a bulk admission is only proven when a
 * second full pass mints nothing.
 */
export async function finalise({ root = ROOT, asOf, admittedAt, beforeCounts }) {
  const plan = await readJson(PLAN_PATH, { root });

  const beforeReplayState = await readValidatedState({ root });
  const beforeSignature = stateSignature(beforeReplayState);
  const afterExecution = counts(beforeReplayState);

  const replay = await executePlan(plan, { root, admittedAt });

  const afterReplayState = await readValidatedState({ root });
  const afterReplay = counts(afterReplayState);
  const afterSignature = stateSignature(afterReplayState);

  const evidenceStrength = {};
  const basisKind = {};
  for (const mapping of afterReplayState.mappings) {
    if (mapping.lifecycle !== "ACTIVE") continue;
    basisKind[mapping.basis_kind] = (basisKind[mapping.basis_kind] ?? 0) + 1;
    const entry = (mapping.evidence ?? []).find((e) => e.evidence_strength);
    const strength = entry?.evidence_strength ?? (mapping.method === "FOOTBALL_CROSS_PUBLISHER_FINGERPRINT_PILOT_V1" ? "CROSS_PUBLISHER_CORROBORATED" : "UNRECORDED");
    evidenceStrength[strength] = (evidenceStrength[strength] ?? 0) + 1;
  }

  const withVenue = afterReplayState.events.filter((e) => e.venue_id !== null).length;

  const result = {
    artifact_type: "UK_GC_FOOTBALL_FULL_FUTURE_ADMISSION_RESULT",
    run_id: RUN_ID,
    policy: BULK_POLICY,
    policy_note: plan.policy_note,

    bulk_as_of: asOf,
    bulk_admitted_at: admittedAt,

    accounting: plan.accounting,
    planned_actions: plan.actions,
    admit_by_evidence_strength: plan.admit_by_evidence_strength,

    canonical_state: {
      before_bulk: beforeCounts,
      after_execution: afterExecution,
      net: {
        events: afterExecution.events - beforeCounts.events,
        event_occurrence_mappings: afterExecution.event_occurrence_mappings - beforeCounts.event_occurrence_mappings,
        schedule_history: afterExecution.schedule_history - beforeCounts.schedule_history,
      },
    },

    estate_composition: {
      by_evidence_strength: evidenceStrength,
      by_basis_kind: basisKind,
      with_governed_venue: withVenue,
      without_governed_venue: afterReplayState.events.length - withVenue,
    },

    replay: {
      outcomes: replay.outcomes,
      failed_closed: replay.failures.length,
      new_events: afterReplay.events - afterExecution.events,
      new_mappings: afterReplay.event_occurrence_mappings - afterExecution.event_occurrence_mappings,
      new_schedule_rows: afterReplay.schedule_history - afterExecution.schedule_history,
      state_changed: beforeSignature !== afterSignature,
      note: "A replay of the exact executed plan must mint nothing: every outcome ALREADY_ADMITTED/ALREADY_ATTACHED and the state semantically identical.",
    },

    public_isolation: {
      public_events_published: 0,
      public_map_changed: false,
      publication_run: false,
      deployment: "NONE",
      note: "No map or publication path reads events/event-state.json, so canonical Events cannot reach the public map.",
    },
  };

  const path = await writeJson(RESULT_PATH, result, { root });
  return { result, path };
}

async function main() {
  const command = process.argv[2] ?? "plan";
  const asOf = flagValue("as-of");
  if (!asOf) throw new Error("--as-of=<iso> is required (this runner reads no clock of its own)");

  if (command === "finalise") {
    const admittedAtArg = flagValue("admitted-at");
    if (!admittedAtArg) throw new Error("--admitted-at=<iso> is required for finalise");
    const beforeRaw = flagValue("before-counts");
    const beforeCounts = beforeRaw ? JSON.parse(beforeRaw) : { events: 10, event_occurrence_mappings: 10, schedule_history: 10 };
    const { result, path } = await finalise({ asOf, admittedAt: admittedAtArg, beforeCounts });
    console.log(`replay outcomes : ${JSON.stringify(result.replay.outcomes)}`);
    console.log(`new on replay   : events ${result.replay.new_events}, mappings ${result.replay.new_mappings}, schedule ${result.replay.new_schedule_rows}`);
    console.log(`state changed   : ${result.replay.state_changed}`);
    console.log(`estate          : ${JSON.stringify(result.canonical_state.after_execution)}`);
    console.log(`by strength     : ${JSON.stringify(result.estate_composition.by_evidence_strength)}`);
    console.log(`venue           : ${result.estate_composition.with_governed_venue} / ${result.estate_composition.without_governed_venue}`);
    console.log(`result          : ${path}`);
    return;
  }

  const census = await buildCensus();
  const state = await readValidatedState();
  const plan = buildPlan(census, { asOf, state });

  if (command === "plan") {
    const path = await writeJson(PLAN_PATH, plan);
    console.log(`distinct occurrences : ${plan.accounting.total_distinct_occurrences}`);
    console.log(`by census state      : ${JSON.stringify(plan.accounting.by_census_state)}`);
    console.log(`unexplained          : ${plan.accounting.unexplained}`);
    console.log(`actions              : ${JSON.stringify(plan.actions)}`);
    console.log(`admit by strength    : ${JSON.stringify(plan.admit_by_evidence_strength)}`);
    console.log(`plan                 : ${path}`);
    return;
  }

  const admittedAt = flagValue("admitted-at");
  if (!admittedAt) throw new Error("--admitted-at=<iso> is required for execute/replay");

  const before = counts(state);
  const { outcomes, failures } = await executePlan(plan, {
    admittedAt,
    onProgress: (done, total) => console.log(`  ... ${done}/${total}`),
  });
  const after = counts(await readValidatedState());

  console.log(`${command} outcomes : ${JSON.stringify(outcomes)}`);
  console.log(`before           : ${JSON.stringify(before)}`);
  console.log(`after            : ${JSON.stringify(after)}`);
  console.log(`failed closed    : ${failures.length}`);
  if (failures.length > 0) console.log(JSON.stringify(failures.slice(0, 5), null, 2));

  return { plan, outcomes, failures, before, after };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-bulk.mjs")) {
  await main();
}

export { PATHS, activeKeys, counts, readJson, writeJson };
