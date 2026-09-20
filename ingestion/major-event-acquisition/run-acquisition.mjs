// BEATMAPPED-UK-MAJOR-EVENT-ACQUISITION-TIER1-01 — Phases 5, 8, 9.
//
//   node ingestion/major-event-acquisition/run-acquisition.mjs dry-run
//   node ingestion/major-event-acquisition/run-acquisition.mjs acquire
//
// `dry-run` proves every source live and writes NOTHING.
// `acquire` performs the same bounded run and retains the dataset under
// research/major-event-acquisition/uk-tier1-01/.
//
// Neither mode admits a venue, admits a source, writes any production
// registry, or publishes anything to the live map. The acquired events are
// retained as Observations — "what one source said at one retrieval point"
// — and go no further in this package.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTier1Population, venuesWithMultipleSources } from "./population.mjs";
import { acquirePopulation } from "./acquire.mjs";
import { validateObservation } from "../observation/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "research/major-event-acquisition/uk-tier1-01");

const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const tally = (items, keyFn) => {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key == null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
};

/** Deterministic run summary, computed purely from the results. */
export function summariseRun(results, population) {
  const proven = results.filter((r) => r.state === "ACQUISITION_PROVEN");
  const empty = results.filter((r) => r.state === "PROGRAMME_EMPTY");
  const failed = results.filter((r) => r.state !== "ACQUISITION_PROVEN" && r.state !== "PROGRAMME_EMPTY");
  const observations = results.flatMap((r) => r.observations);
  const future = observations.filter((o) => o.source_fields.temporal_class === "FUTURE_EVENT");

  const futureDates = future.map((o) => o.start?.date).filter((d) => typeof d === "string").sort();
  const venuesWithFuture = new Set(future.map((o) => o.source_fields.venue_census_id));

  // Per event domain: sources contributing, future observations, venues.
  const byDomain = {};
  for (const result of results) {
    const domain = (byDomain[result.event_domain] ??= { sources: 0, sources_proven: 0, future_observations: 0, venues: new Set() });
    domain.sources += 1;
    if (result.state === "ACQUISITION_PROVEN") domain.sources_proven += 1;
  }
  for (const observation of future) {
    const domain = (byDomain[observation.source_fields.event_domain] ??= { sources: 0, sources_proven: 0, future_observations: 0, venues: new Set() });
    domain.future_observations += 1;
    domain.venues.add(observation.source_fields.venue_census_id);
  }

  const byNation = {};
  for (const result of results) {
    const nation = (byNation[result.nation ?? "(unknown)"] ??= { sources_proven: 0, venues_with_future: new Set(), future_observations: 0 });
    if (result.state === "ACQUISITION_PROVEN") nation.sources_proven += 1;
  }
  for (const observation of future) {
    const nation = (byNation[observation.source_fields.census_nation ?? "(unknown)"] ??= { sources_proven: 0, venues_with_future: new Set(), future_observations: 0 });
    nation.future_observations += 1;
    nation.venues_with_future.add(observation.source_fields.venue_census_id);
  }

  return {
    sources_attempted: results.length,
    sources_proven: proven.length,
    sources_failed: failed.length,
    sources_empty: empty.length,
    raw_records: results.reduce((total, r) => total + r.raw_record_count, 0),
    normalized_observations: observations.length,
    proven_observations: observations.length,
    future_observations: future.length,
    past_observations: observations.filter((o) => o.source_fields.temporal_class === "PAST_EVENT").length,
    date_unknown: observations.filter((o) => o.source_fields.temporal_class === "DATE_UNKNOWN").length,
    identity_dropped: results.reduce((total, r) => total + r.identity_dropped, 0),
    distinct_venues_with_future_events: venuesWithFuture.size,
    distinct_cities_with_future_events: new Set(future.map((o) => o.source_fields.census_city)).size,
    event_horizon: {
      earliest_future: futureDates[0] ?? null,
      latest_future: futureDates[futureDates.length - 1] ?? null,
      median_future: futureDates.length ? futureDates[Math.floor(futureDates.length / 2)] : null,
    },
    by_state: tally(results, (r) => r.state),
    by_family: Object.fromEntries(["JSON_LD_EVENT", "WORDPRESS_TRIBE_API"].map((family) => {
      const subset = results.filter((r) => r.source_family === family);
      return [family, {
        attempted: subset.length,
        proven: subset.filter((r) => r.state === "ACQUISITION_PROVEN").length,
        failed: subset.filter((r) => r.state !== "ACQUISITION_PROVEN" && r.state !== "PROGRAMME_EMPTY").length,
        empty: subset.filter((r) => r.state === "PROGRAMME_EMPTY").length,
        observations: subset.reduce((total, r) => total + r.observation_count, 0),
        future_observations: subset.reduce((total, r) => total + r.temporal.FUTURE_EVENT, 0),
      }];
    })),
    by_event_domain: Object.fromEntries(Object.entries(byDomain).map(([key, value]) => [key, {
      sources: value.sources,
      sources_proven: value.sources_proven,
      future_observations: value.future_observations,
      venues_with_future: value.venues.size,
    }]).sort((a, b) => b[1].future_observations - a[1].future_observations || a[0].localeCompare(b[0]))),
    by_nation: Object.fromEntries(Object.entries(byNation).map(([key, value]) => [key, {
      sources_proven: value.sources_proven,
      venues_with_future: value.venues_with_future.size,
      future_observations: value.future_observations,
    }])),
    venues_with_multiple_sources: venuesWithMultipleSources(population).length,
  };
}

async function run({ dryRun, concurrency, maxPages }) {
  const { population, counts, unsupported } = await loadTier1Population();

  console.log(`READY_TIER1 population: ${counts.sources} sources / ${counts.venues} venues`);
  console.log(`  by family: ${JSON.stringify(counts.by_family)}`);
  if (unsupported.length) {
    console.error(`STOP: ${unsupported.length} source(s) have no existing collector; this package must not build one.`);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date().toISOString();
  console.log(`\n${dryRun ? "DRY-RUN (no writes)" : "REAL ACQUISITION"} — ${population.length} sources, concurrency ${concurrency}\n`);

  const results = await acquirePopulation(population, {
    concurrency,
    maxPages,
    retrievedAt: startedAt,
    onProgress: (done, total, result) => {
      const mark = result.state === "ACQUISITION_PROVEN" ? "OK  " : result.state === "PROGRAMME_EMPTY" ? "EMPTY" : "FAIL";
      console.log(`  ${String(done).padStart(2)}/${total} ${mark} ${String(result.observation_count).padStart(4)} obs  ${result.state.padEnd(36)} ${String(result.venue_name).slice(0, 34)}`);
    },
  });

  const finishedAt = new Date().toISOString();
  const summary = summariseRun(results, population);

  // Every Observation must satisfy the shared contract — a run that
  // produced invalid Observations is a failed run, not a partial one.
  const observations = results.flatMap((r) => r.observations);
  const invalid = [];
  for (const observation of observations) {
    const errors = validateObservation(observation);
    if (errors.length) invalid.push({ source_id: observation.source_id, source_record_id: observation.source_record_id, errors });
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`sources: attempted ${summary.sources_attempted}, proven ${summary.sources_proven}, empty ${summary.sources_empty}, failed ${summary.sources_failed}`);
  console.log(`observations: ${summary.normalized_observations} (future ${summary.future_observations}, past ${summary.past_observations}, unknown ${summary.date_unknown})`);
  console.log(`raw records: ${summary.raw_records} | identity dropped: ${summary.identity_dropped}`);
  console.log(`horizon: ${summary.event_horizon.earliest_future} -> ${summary.event_horizon.latest_future}`);
  console.log(`states: ${JSON.stringify(summary.by_state)}`);
  console.log(`invalid observations: ${invalid.length}`);

  if (dryRun) {
    console.log(`\nDRY-RUN complete — nothing written.`);
    return;
  }

  const runRecord = {
    artifact_type: "UK_MAJOR_EVENT_ACQUISITION_RUN",
    run_id: "uk-tier1-01",
    census_id: "uk-major-event-census-01",
    started_at: startedAt,
    finished_at: finishedAt,
    readiness_tier: "READY_TIER1",
    concurrency,
    max_pages_per_source: maxPages,
    collectors_used: {
      JSON_LD_EVENT: "ingestion/json-ld",
      WORDPRESS_TRIBE_API: "ingestion/events-calendar-api",
    },
    note: "Observations only. No canonical Event identity, no cross-source deduplication, no venue/source admission, no publication.",
    population: counts,
    summary,
    invalid_observations: invalid,
  };

  await writeJson(resolve(OUT_DIR, "run.json"), runRecord);
  await writeJson(resolve(OUT_DIR, "sources.json"), {
    artifact_type: "UK_MAJOR_EVENT_ACQUISITION_SOURCES",
    run_id: "uk-tier1-01",
    generated_at: finishedAt,
    records: results.map(({ observations: _obs, evidence: _ev, ...rest }) => rest).sort((a, b) => a.calendar_source_id.localeCompare(b.calendar_source_id)),
  });
  await writeJson(resolve(OUT_DIR, "observations.json"), {
    artifact_type: "UK_MAJOR_EVENT_ACQUISITION_OBSERVATIONS",
    run_id: "uk-tier1-01",
    generated_at: finishedAt,
    observation_contract: "ingestion/observation/contract.mjs",
    count: observations.length,
    observations: observations.sort((a, b) => a.source_id.localeCompare(b.source_id) || String(a.source_record_id).localeCompare(String(b.source_record_id))),
  });
  await writeJson(resolve(OUT_DIR, "evidence-index.json"), {
    artifact_type: "UK_MAJOR_EVENT_ACQUISITION_EVIDENCE_INDEX",
    run_id: "uk-tier1-01",
    generated_at: finishedAt,
    note: "One retrieval record per source: what was requested, where it landed, what came back. Retained so any Observation can be traced to the fetch that produced it.",
    retrievals: results.filter((r) => r.evidence).map((r) => ({ calendar_source_id: r.calendar_source_id, venue_census_id: r.venue_census_id, state: r.state, ...r.evidence })).sort((a, b) => a.calendar_source_id.localeCompare(b.calendar_source_id)),
  });
  await writeJson(resolve(OUT_DIR, "failures.json"), {
    artifact_type: "UK_MAJOR_EVENT_ACQUISITION_FAILURES",
    run_id: "uk-tier1-01",
    generated_at: finishedAt,
    note: "Every source that did not reach ACQUISITION_PROVEN, with its exact terminal state and reason. A source is never dropped silently.",
    failures: results.filter((r) => r.state !== "ACQUISITION_PROVEN").map((r) => ({
      venue_name: r.venue_name, city: r.city, nation: r.nation,
      calendar_source_id: r.calendar_source_id, calendar_url: r.calendar_url,
      source_family: r.source_family, event_domain: r.event_domain,
      state: r.state, reason: r.reason, raw_record_count: r.raw_record_count,
      http_status: r.evidence?.http_status ?? null,
    })).sort((a, b) => a.calendar_source_id.localeCompare(b.calendar_source_id)),
  });
  await writeJson(resolve(OUT_DIR, "summary.json"), {
    artifact_type: "UK_MAJOR_EVENT_ACQUISITION_SUMMARY",
    run_id: "uk-tier1-01",
    generated_at: finishedAt,
    ...summary,
    potential_cross_source_duplicates: venuesWithMultipleSources(population),
  });

  console.log(`\nRetained under research/major-event-acquisition/uk-tier1-01/`);
}

const [command, ...argv] = process.argv.slice(2);
const concurrency = Number(argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 4);
const maxPages = Number(argv.find((a) => a.startsWith("--max-pages="))?.split("=")[1] ?? 5);

if (command === "dry-run") await run({ dryRun: true, concurrency, maxPages });
else if (command === "acquire") await run({ dryRun: false, concurrency, maxPages });
else {
  console.error("usage: run-acquisition.mjs <dry-run|acquire> [--concurrency=N] [--max-pages=N]");
  process.exitCode = 1;
}
