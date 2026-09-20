// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — operator-facing
// summary and per-city table. Read-only formatting only.

export function formatCounters(summary) {
  const c = summary.counters;
  const deferLines = Object.entries(c.deferred_by_reason)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `    ${reason}: ${count}`);

  return [
    `WAVE: ${summary.wave_id} RUN: ${summary.run_id}`,
    `CITIES TOTAL: ${c.cities_total}`,
    `CITIES COMPLETE: ${c.cities_complete}`,
    `GEOCODE FAILED: ${c.geocode_failed}`,
    `DISCOVERY FAILED: ${c.discovery_failed}`,
    `CANDIDATES CHECKED: ${c.candidates_checked} (resumed/skipped: ${c.resumed_skipped})`,
    `TIER1 PROVEN: ${c.tier1_proven}`,
    `FUTURE EVENTS PROVEN: ${c.future_events_proven}`,
    `SYSTEMIC FAILURES: ${c.failed_systemic}`,
    "DEFERRED BY REASON:",
    ...(deferLines.length > 0 ? deferLines : ["    (none)"]),
  ].join("\n");
}

export function formatCityTable(summary) {
  const header = "Country | City | Candidates checked | Tier-1 proven | Future events observed | Deferred | Status";
  const rows = summary.city_results.map(
    (r) => `${r.city.country} | ${r.city.name} | ${r.checked} | ${r.proven} | ${r.future_events} | ${r.deferred} | ${r.status}`,
  );
  return [header, ...rows].join("\n");
}

export function computeYieldRate(summary) {
  const { candidates_checked, tier1_proven } = summary.counters;
  if (candidates_checked === 0) return 0;
  return tier1_proven / candidates_checked;
}
