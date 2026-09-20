// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — Phase 19.
//
//   node ingestion/gc-football-platform/attribution-diagnostic.mjs
//
// A READ-ONLY diagnostic. It runs the EXISTING generic venue-attribution
// resolver over the acquired gc Observations purely to measure how
// attributable this platform's venue text is. It deliberately does NOT
// write into research/major-event-attribution/ — this package acquires,
// it does not attribute. Nothing it produces is canonical.
//
// It exists to answer one question honestly: of the fixtures this
// platform publishes as "Home", how many are genuinely staged somewhere
// other than the club's own census venue — as opposed to merely being
// written under a sponsor or alias name for the SAME ground?
//
// A raw string comparison cannot tell those apart ("Crown Ground" vs
// "Wham Stadium" is one venue under two names). The governed resolver,
// which knows the census's retained aliases, can.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCensusIndex } from "../major-event-attribution/census-index.mjs";
import { resolveAll } from "../major-event-attribution/resolve.mjs";
import { loadCandidatePopulation } from "./population.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(ROOT, "research/major-event-acquisition/uk-gc-football-01");

const tally = (items, keyFn) => {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key == null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
};

async function run() {
  const index = await buildCensusIndex();
  const population = await loadCandidatePopulation();
  const bySourceId = new Map(population.candidates.map((entry) => [entry.source_id, entry]));

  const doc = JSON.parse(await readFile(resolve(DIR, "observations.json"), "utf8"));
  const observations = doc.observations;

  // The resolver reads the source's census provenance from source_fields.
  // The retained Observations are NOT modified — this augments copies only.
  const forResolution = observations.map((observation) => {
    const source = bySourceId.get(observation.source_id);
    return {
      ...observation,
      source_fields: {
        ...observation.source_fields,
        venue_census_id: source?.census_venue_id ?? null,
        census_venue_name: source?.census_venue_name ?? null,
        calendar_source_id: observation.source_id,
        event_domain: source?.event_domain ?? "SPORT_FIXTURES",
      },
    };
  });

  const derivedAt = new Date().toISOString();
  const records = resolveAll(forResolution, index, { derivedAt });

  const resolved = records.filter((record) => record.resolved_venue_census_id);
  const home = records.filter((_, i) => observations[i].source_fields.home_or_away === "Home");
  const away = records.filter((_, i) => observations[i].source_fields.home_or_away === "Away");

  const homeResolved = home.filter((record) => record.resolved_venue_census_id);
  const homeAtOwn = homeResolved.filter((record) => record.resolved_venue_census_id === record.source_census_venue_id);
  const homeElsewhere = homeResolved.filter((record) => record.resolved_venue_census_id !== record.source_census_venue_id);

  const awayResolved = away.filter((record) => record.resolved_venue_census_id);
  const awayAtOwn = awayResolved.filter((record) => record.resolved_venue_census_id === record.source_census_venue_id);

  const diagnostic = {
    artifact_type: "UK_GC_FOOTBALL_ATTRIBUTION_DIAGNOSTIC",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    status: "DIAGNOSTIC_ONLY — not a canonical attribution dataset; nothing is written to research/major-event-attribution/",
    census_index: index.counts,
    total_observations: records.length,
    resolved: resolved.length,
    unresolved: records.length - resolved.length,
    by_attribution_state: tally(records, (record) => record.attribution_state),
    by_confidence: tally(records, (record) => record.confidence),
    distinct_resolved_census_venues: new Set(resolved.map((record) => record.resolved_venue_census_id)).size,

    home_away_protection: {
      question: "Does homeOrAway=='Home' mean the fixture is at the club's own census venue?",
      home_records: home.length,
      home_resolved_to_a_census_venue: homeResolved.length,
      home_resolved_to_the_SOURCE_census_venue: homeAtOwn.length,
      home_resolved_to_a_DIFFERENT_census_venue: homeElsewhere.length,
      home_unresolved: home.length - homeResolved.length,
      away_records: away.length,
      away_resolved_to_a_census_venue: awayResolved.length,
      away_resolved_to_the_SOURCE_census_venue: awayAtOwn.length,
      finding: "Measured with the governed resolver, which knows the census's retained aliases, so a ground written under a sponsor name is NOT counted as a different venue.",
      examples_home_elsewhere: homeElsewhere.slice(0, 12).map((record) => ({
        source_census_venue_name: record.source_census_venue_name,
        source_reported_venue_name: record.source_reported_venue_name,
        resolved_venue_name: record.resolved_venue_name,
      })),
    },

    // How much of the platform's venue text the census can even see. Most
    // opponents are lower-division grounds that are correctly NOT census
    // venues, so a low resolution rate here is expected and is not a defect.
    venue_text_coverage: {
      observations_with_named_venue: observations.filter((o) => o.venue_name).length,
      distinct_venue_names: new Set(observations.map((o) => o.venue_name).filter(Boolean)).size,
      resolved_to_census: resolved.length,
      note: "The census holds major UK event venues only. A fixture at a small lower-division ground is legitimately unresolvable, and is left unresolved rather than guessed.",
    },

    top_resolved_venues: Object.fromEntries(Object.entries(tally(resolved, (record) => record.resolved_venue_name)).slice(0, 25)),
  };

  await writeFile(resolve(DIR, "attribution-diagnostic.json"), `${JSON.stringify(diagnostic, null, 2)}\n`, "utf8");

  console.log(`observations      : ${records.length}`);
  console.log(`resolved to census: ${resolved.length} (${diagnostic.distinct_resolved_census_venues} distinct venues)`);
  console.log(`states            : ${JSON.stringify(diagnostic.by_attribution_state)}`);
  console.log(`\nHOME/AWAY PROTECTION`);
  console.log(`  home records                          : ${home.length}`);
  console.log(`  home resolved to the source's venue   : ${homeAtOwn.length}`);
  console.log(`  home resolved to a DIFFERENT venue    : ${homeElsewhere.length}`);
  console.log(`  home unresolved                       : ${home.length - homeResolved.length}`);
  console.log(`  away resolved to the source's venue   : ${awayAtOwn.length}`);
}

await run();
