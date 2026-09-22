// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — the Wave-1 Tier-1
// sweep. CITY WAVE -> CITY -> VENUE CANDIDATE -> TIER-1 GATE ->
// DETERMINISTIC PROOF -> PROVEN/DEFER -> NEXT VENUE -> NEXT CITY.
//
// The Tier-1 gate itself (evaluateTier1Candidate) is imported UNCHANGED
// from ingestion/global-easy-harvester/tier1-gate.mjs — this module adds
// no new acquisition/proof logic, only city-wave discovery and sweep
// orchestration around that existing gate. This module NEVER imports
// ingestion/global-easy-harvester/admission.mjs — there is no code path
// here that can write to any production registry (Phase 11 of this
// package's brief).
//
// One candidate's failure never stops its city; one city's failure
// (geocode/discovery/a thrown exception) never stops the wave — every
// per-city and per-candidate step is individually caught and recorded.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateTier1Candidate } from "../global-easy-harvester/tier1-gate.mjs";
import { DEFER_STATES } from "../global-easy-harvester/contract.mjs";
import { geocodeCity } from "./city-geocode.mjs";
import { discoverCityCandidates } from "./overpass-discovery.mjs";
import { toWaveCandidate } from "./candidate.mjs";
import { WAVE_1_ID, WAVE_1_CITIES } from "./wave-config.mjs";
import {
  recordCandidateState,
  loadCandidateStates,
  resolveCandidateCheckpoint,
  recordCityState,
  loadCityStates,
  saveRunSummary,
  isTerminalCandidateState,
} from "./state-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarizeCandidate(candidate) {
  return {
    canonical_name: candidate.canonical_name,
    city: candidate.city,
    website: candidate.website,
    has_admissible_location: candidate.has_admissible_location,
    provenance: candidate.provenance,
  };
}

function emptyCounters(cityCount) {
  return {
    cities_total: cityCount,
    cities_complete: 0,
    geocode_failed: 0,
    discovery_failed: 0,
    candidates_checked: 0,
    resumed_skipped: 0,
    tier1_proven: 0,
    future_events_proven: 0,
    deferred_by_reason: Object.fromEntries([...DEFER_STATES].map((s) => [s, 0])),
    failed_systemic: 0,
  };
}

/**
 * Run (or resume) one Wave-1 Tier-1 sweep. `runId` is required and
 * durable. This function ONLY proves — it never admits, never writes to
 * any production registry, and never publishes (see the header comment).
 */
export async function runFutureCityWave({
  root = ROOT,
  runId,
  cities = WAVE_1_CITIES,
  fetchDocument,
  detailLimit,
  geocode = geocodeCity,
  discover = discoverCityCandidates,
  // BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — an OPTIONAL
  // multi-source discovery override: `async (city, centre) => { candidates:
  // [waveCandidate...], error }`, already producing wave-candidate shapes
  // (via candidate.mjs's toWaveCandidateFromGroup) rather than raw
  // single-provider ones. When supplied, it REPLACES `discover` +
  // toWaveCandidate() entirely for that run — every other city-wave
  // mechanism (checkpointing, resume, per-candidate/per-city isolation,
  // the Tier-1 gate itself) is completely unchanged. When omitted (the
  // default, used by every other Wave-1 city today), behaviour is
  // byte-for-byte identical to before this package.
  discoverMultiSource = null,
  candidateLimit = 15,
  cityFilter,
  interCandidateDelayMs = 0,
  interCityDelayMs = 0,
} = {}) {
  if (!runId) throw new Error("runFutureCityWave: runId is required");
  if (typeof fetchDocument !== "function") throw new Error("runFutureCityWave: fetchDocument is required");

  const startedAt = new Date().toISOString();
  const scoped = (cityFilter ? cities.filter((c) => cityFilter.includes(c.city_id)) : cities).filter((c) => c.enabled);

  const cityStates = await loadCityStates(runId, { root });
  const candidateCheckpoints = await loadCandidateStates(runId, { root });
  const counters = emptyCounters(scoped.length);
  const cityResults = [];

  for (const city of scoped) {
    try {
      const existingCityState = cityStates.get(city.city_id);
      let candidates;

      if (existingCityState?.status === "DISCOVERED" && Array.isArray(existingCityState.candidates)) {
        candidates = existingCityState.candidates; // resume: never re-geocode/re-query a city already discovered this run
      } else {
        if (interCityDelayMs > 0 && counters.cities_complete > 0) await sleep(interCityDelayMs);

        const centre = await geocode(city);
        if (!centre) {
          counters.geocode_failed += 1;
          await recordCityState(runId, city.city_id, { status: "GEOCODE_FAILED" }, { root });
          cityResults.push({ city, checked: 0, proven: 0, deferred: 0, future_events: 0, status: "GEOCODE_FAILED" });
          continue;
        }

        const discovery = discoverMultiSource
          ? await discoverMultiSource(city, centre)
          : await discover(city, centre, { limit: candidateLimit });
        if (discovery.error) {
          counters.discovery_failed += 1;
          await recordCityState(runId, city.city_id, { status: "DISCOVERY_FAILED", error: discovery.error, centre }, { root });
          cityResults.push({ city, checked: 0, proven: 0, deferred: 0, future_events: 0, status: "DISCOVERY_FAILED" });
          continue;
        }

        candidates = discoverMultiSource ? discovery.candidates : discovery.candidates.map((c) => toWaveCandidate(c, city));
        await recordCityState(runId, city.city_id, { status: "DISCOVERED", centre, candidates, candidate_count: candidates.length }, { root });
      }

      let cityChecked = 0;
      let cityProven = 0;
      let cityDeferred = 0;
      let cityFutureEvents = 0;

      for (const candidate of candidates) {
        const checkpoint = resolveCandidateCheckpoint(candidateCheckpoints, candidate, candidates);
        if (checkpoint && isTerminalCandidateState(checkpoint)) {
          counters.resumed_skipped += 1;
          continue;
        }

        counters.candidates_checked += 1;
        cityChecked += 1;
        try {
          if (interCandidateDelayMs > 0 && counters.candidates_checked > 1) await sleep(interCandidateDelayMs);

          const verdict = await evaluateTier1Candidate(candidate, { fetchDocument, detailLimit });
          if (verdict.status === "T1_PROVEN") {
            const eventCount = verdict.acquisition_result?.proven_event_count ?? 0;
            counters.tier1_proven += 1;
            counters.future_events_proven += eventCount;
            cityProven += 1;
            cityFutureEvents += eventCount;
            await recordCandidateState(
              runId,
              candidate,
              { state: "T1_PROVEN", acquisition_result: verdict.acquisition_result, city_id: city.city_id, candidate: summarizeCandidate(candidate) },
              { root },
            );
          } else {
            counters.deferred_by_reason[verdict.status] = (counters.deferred_by_reason[verdict.status] ?? 0) + 1;
            cityDeferred += 1;
            await recordCandidateState(
              runId,
              candidate,
              { state: verdict.status, defer_reason: verdict.defer_reason, city_id: city.city_id, candidate: summarizeCandidate(candidate) },
              { root },
            );
          }
        } catch (error) {
          counters.failed_systemic += 1;
          await recordCandidateState(
            runId,
            candidate,
            { state: "REJECTED", errors: [String(error?.stack ?? error)], city_id: city.city_id, candidate: summarizeCandidate(candidate) },
            { root },
          ).catch(() => {});
        }
      }

      counters.cities_complete += 1;
      cityResults.push({ city, checked: cityChecked, proven: cityProven, deferred: cityDeferred, future_events: cityFutureEvents, status: "COMPLETE" });
    } catch (error) {
      counters.failed_systemic += 1;
      cityResults.push({ city, checked: 0, proven: 0, deferred: 0, future_events: 0, status: "CITY_SYSTEMIC_FAILURE", error: String(error?.message ?? error) });
    }
  }

  const summary = {
    run_id: runId,
    wave_id: WAVE_1_ID,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    counters,
    city_results: cityResults.map((r) => ({ ...r, city: { city_id: r.city.city_id, name: r.city.name, country: r.city.country, country_code: r.city.country_code } })),
  };
  await saveRunSummary(runId, summary, { root });
  return summary;
}

export { ROOT as CONTROLLER_ROOT };
