// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — the global breadth-first
// Tier-1 controller. CITY QUEUE -> CANDIDATE -> TIER-1 GATE ->
// DETERMINISTIC PROOF -> ADMISSION -> NEXT. One awkward candidate can
// never stop the sweep: every per-candidate step is wrapped so a thrown
// error is caught, recorded, counted under failed_systemic, and the loop
// continues with the next candidate (Phase 11 of this package's brief).

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCandidatePool } from "./candidate-pool.mjs";
import { checkExistingRegistration, evaluateTier1Candidate } from "./tier1-gate.mjs";
import { admitCandidate } from "./admission.mjs";
import { recordCandidateState, loadCandidateStates, saveRunSummary, isTerminalCandidateState } from "./state-store.mjs";
import { DEFER_STATES } from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarizeCandidate(candidate) {
  return {
    canonical_name: candidate.canonical_name,
    city: candidate.city,
    website: candidate.website,
    programme_url: candidate.programme_url,
    provenance: candidate.provenance,
    existing_venue: candidate.existing_venue != null,
    existing_source: candidate.existing_source != null,
  };
}

function emptyCounters() {
  return {
    cities_encountered: 0,
    candidates_checked: 0,
    resumed_skipped: 0,
    already_live: 0,
    repair: 0,
    tier1_proven: 0,
    admitted: 0,
    deferred_by_reason: Object.fromEntries([...DEFER_STATES].map((s) => [s, 0])),
    failed_systemic: 0,
  };
}

/**
 * Run one global sweep. `runId` is required and durable — resuming the
 * SAME runId re-reads its checkpoints and skips every candidate already
 * in a terminal state (see state-store.mjs), so an interrupted run is
 * always safe to re-invoke with the same id.
 *
 * `dryRun` (default true): evaluate and prove candidates, but never call
 * admitCandidate() and never apply `maxAdmissions` — a full, unbounded
 * survey of the whole candidate estate (Phase 7).
 *
 * `maxAdmissions` (a SUCCESS cap, only meaningful when dryRun is false):
 * once this many candidates have been admitted, the sweep stops
 * immediately rather than continuing to evaluate further candidates —
 * this is a bounded pilot proving the loop, not a numbers-maximising run.
 */
export async function runHarvester({
  root = ROOT,
  runId,
  dryRun = true,
  maxAdmissions = 10,
  fetchDocument,
  detailLimit,
  cityFilter,
  // A bulk sweep hits ~500 different external hosts back-to-back with no
  // pacing between DIFFERENT candidates (each candidate's OWN fetches are
  // already retried/backed-off by acquireSource() itself — this is a
  // separate, additional pacing between candidates). A real dry run
  // against this repository's full estate showed a materially elevated
  // transient NETWORK_FAILURE rate under tight back-to-back sequential
  // load; re-testing a sample of those same URLs moments later succeeded
  // ~80% of the time. Defaults to 0 (no delay) so tests stay fast; the CLI
  // passes a small non-zero default for real runs.
  interCandidateDelayMs = 0,
} = {}) {
  if (!runId) throw new Error("runHarvester: runId is required");
  if (typeof fetchDocument !== "function") throw new Error("runHarvester: fetchDocument is required");

  const startedAt = new Date().toISOString();
  const pool = await buildCandidatePool({ root });
  const scoped = cityFilter ? pool.filter((c) => cityFilter.includes(c.city_key)) : pool;

  const byCity = new Map();
  for (const candidate of scoped) {
    if (!byCity.has(candidate.city_key)) byCity.set(candidate.city_key, []);
    byCity.get(candidate.city_key).push(candidate);
  }
  const cityKeys = [...byCity.keys()].sort();

  const checkpoints = await loadCandidateStates(runId, { root });
  const counters = emptyCounters();
  counters.cities_encountered = cityKeys.length;
  const admittedList = [];

  cityLoop: for (const cityKey of cityKeys) {
    for (const candidate of byCity.get(cityKey)) {
      if (!dryRun && counters.admitted >= maxAdmissions) break cityLoop;

      const checkpoint = checkpoints.get(candidate.venue_id);
      if (checkpoint && isTerminalCandidateState(checkpoint)) {
        counters.resumed_skipped += 1;
        continue;
      }

      counters.candidates_checked += 1;
      try {
        let acquisitionResult = checkpoint?.state === "T1_PROVEN" ? checkpoint.acquisition_result : null;

        if (!acquisitionResult) {
          if (interCandidateDelayMs > 0 && counters.candidates_checked > 1) await sleep(interCandidateDelayMs);
          const existingCheck = await checkExistingRegistration(candidate, { fetchDocument, detailLimit });
          if (existingCheck) {
            if (existingCheck.status === "SKIP_ALREADY_LIVE") counters.already_live += 1;
            else counters.repair += 1;
            await recordCandidateState(
              runId,
              candidate.venue_id,
              { state: existingCheck.status, city_key: cityKey, candidate: summarizeCandidate(candidate) },
              { root },
            );
            continue;
          }

          const verdict = await evaluateTier1Candidate(candidate, { fetchDocument, detailLimit });
          if (verdict.status !== "T1_PROVEN") {
            counters.deferred_by_reason[verdict.status] = (counters.deferred_by_reason[verdict.status] ?? 0) + 1;
            await recordCandidateState(
              runId,
              candidate.venue_id,
              {
                state: verdict.status,
                defer_reason: verdict.defer_reason,
                defer_detail: verdict.acquisition_result?.error ?? verdict.acquisition_result?.network_stage ?? null,
                city_key: cityKey,
                candidate: summarizeCandidate(candidate),
              },
              { root },
            );
            continue;
          }

          acquisitionResult = verdict.acquisition_result;
          counters.tier1_proven += 1;
          await recordCandidateState(
            runId,
            candidate.venue_id,
            { state: "T1_PROVEN", acquisition_result: acquisitionResult, city_key: cityKey, candidate: summarizeCandidate(candidate) },
            { root },
          );
        }

        if (dryRun) continue;
        if (counters.admitted >= maxAdmissions) continue; // cap hit mid-city — leave T1_PROVEN for a future run

        const admission = await admitCandidate(candidate, acquisitionResult, { root, dryRun: false });
        if (!admission.admitted) {
          await recordCandidateState(
            runId,
            candidate.venue_id,
            { state: "REJECTED", errors: admission.errors, city_key: cityKey, candidate: summarizeCandidate(candidate) },
            { root },
          );
          continue;
        }

        counters.admitted += 1;
        admittedList.push({ ...admission, canonical_name: candidate.canonical_name, city: candidate.city });
        await recordCandidateState(
          runId,
          candidate.venue_id,
          { state: "T1_ADMITTED", admission, city_key: cityKey, candidate: summarizeCandidate(candidate) },
          { root },
        );
      } catch (error) {
        counters.failed_systemic += 1;
        await recordCandidateState(
          runId,
          candidate.venue_id,
          { state: "REJECTED", errors: [String(error?.stack ?? error)], city_key: cityKey, candidate: summarizeCandidate(candidate) },
          { root },
        ).catch(() => {});
      }
    }
  }

  const summary = {
    run_id: runId,
    dry_run: dryRun,
    max_admissions: maxAdmissions,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    counters,
    admitted: admittedList,
  };
  await saveRunSummary(runId, summary, { root });
  return summary;
}

export { ROOT as CONTROLLER_ROOT };
