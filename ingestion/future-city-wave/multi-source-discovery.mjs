// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — bounded
// multi-source venue discovery. Reuses the EXISTING generic multi-source
// venue-discovery framework (BEATMAPPED-GENERIC-MULTISOURCE-VENUE-
// DISCOVERY-01, already merged to main) completely unchanged:
// runProviderAdapter() for bounded, validated per-provider execution
// (overpassAdapter.discover() already calls parseOverpassCandidates()
// internally — no separate parsing step needed here),
// createCuratedDirectoryAdapter() for the second provider this package
// wires in, and reconcileCandidates() for cross-provider deduplication,
// provenance retention, and conflict-preserving reconciliation (see
// ingestion/venue-discovery/reconcile.mjs's own
// strongMatch()/possibleMatch()/buildGroup() — none of that logic is
// duplicated here).
//
// The ONLY new code is the orchestration: run every configured provider
// with per-provider failure isolation (Phase 5 requirement #9 — one
// provider's failure must never lose another provider's real results),
// then reconcile.

import { runProviderAdapter } from "../venue-discovery/adapters.mjs";
import { reconcileCandidates } from "../venue-discovery/reconcile.mjs";
import { overpassAdapter } from "../venue-discovery/providers/overpass.mjs";
import { createCuratedDirectoryAdapter } from "../venue-discovery/providers/curated-directory.mjs";

/**
 * Run every configured provider adapter, isolating one provider's failure
 * from the others. Each entry is `{ adapter, input, context }`. A provider whose
 * `discover()` throws (network failure, malformed input, a validation
 * error from runProviderAdapter itself) contributes zero candidates and a
 * recorded error — it never aborts the other providers' real results.
 */
export async function runDiscoveryProviders(providerConfigs) {
  const results = [];
  for (const { adapter, input, context } of providerConfigs) {
    try {
      const candidates = await runProviderAdapter(adapter, input, context);
      results.push({ provider_id: adapter.providerId, candidates, error: null });
    } catch (error) {
      results.push({ provider_id: adapter.providerId, candidates: [], error: String(error?.message ?? error) });
    }
  }
  return results;
}

/**
 * Discover one city's venues from multiple providers and reconcile them
 * into deduplicated groups. `rawOverpass` (already-fetched Overpass JSON)
 * and `curatedDirectory` (`{provider_id, records}`, matching
 * ingestion/venue-discovery/providers/curated-directory.mjs's own input
 * shape) are both optional — a provider is simply omitted (not failed)
 * when its input is not supplied, so this function works for a city with
 * only OSM data, only a curated directory, both, or (in the future)
 * additional providers, without any code change here. Never Manchester-
 * specific: nothing in this module references a city name or venue.
 */
export async function discoverCityCandidatesMultiSource(city, { rawOverpass, curatedDirectory, retrievedAt = new Date().toISOString() } = {}) {
  const context = Object.freeze({ city: city.name, country_code: city.country_code, retrieved_at: retrievedAt });
  const providerConfigs = [];

  if (rawOverpass) providerConfigs.push({ adapter: overpassAdapter, input: rawOverpass, context });
  if (curatedDirectory) {
    providerConfigs.push({
      adapter: createCuratedDirectoryAdapter(curatedDirectory.provider_id),
      input: curatedDirectory.records,
      // Each curated record may carry its own `url`; provider_url here is
      // only the fallback createCuratedDirectoryAdapter() uses when a
      // record doesn't — matching ingestion/venue-discovery/run.mjs's own
      // buildDiscoveryCensus() convention exactly.
      context: { ...context, provider_url: curatedDirectory.provider_url ?? null },
    });
  }

  const providerResults = await runDiscoveryProviders(providerConfigs);
  const allCandidates = providerResults.flatMap((r) => r.candidates);
  const groups = reconcileCandidates(allCandidates);

  return {
    groups,
    provider_results: providerResults.map((r) => ({ provider_id: r.provider_id, candidate_count: r.candidates.length, error: r.error })),
  };
}
