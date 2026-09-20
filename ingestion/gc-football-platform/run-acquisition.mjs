// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — Phases 14–22.
//
//   node ingestion/gc-football-platform/run-acquisition.mjs
//
// Runs the ONE generic collector across the whole gc candidate
// population and retains the result under
// research/major-event-acquisition/uk-gc-football-01/.
//
// Acquisition only: nothing is published, no registry is written, no
// canonical Event identity is created, and no fixture is deduplicated
// across sources.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectSource, TERMINAL_STATES } from "./collect.mjs";
import { loadCandidatePopulation } from "./population.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "research/major-event-acquisition/uk-gc-football-01");

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
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
};

async function run() {
  const startedAt = new Date().toISOString();
  const population = await loadCandidatePopulation();
  console.log(`candidates: ${population.counts.candidate_sources} sources / ${population.counts.distinct_domains} domains / ${population.counts.distinct_census_venues} census venues\n`);

  const results = [];
  for (const [index, source] of population.candidates.entries()) {
    const result = await collectSource(source);
    results.push(result);
    console.log(
      `[${String(index + 1).padStart(2)}/${population.candidates.length}] ${String(source.domain).padEnd(34)} ${result.terminal_state.padEnd(32)} obs=${String(result.observations.length).padStart(4)}`,
    );
  }

  const finishedAt = new Date().toISOString();
  const proven = results.filter((r) => r.terminal_state === "ACQUISITION_PROVEN");
  const observations = proven.flatMap((r) => r.observations);
  const now = new Date();

  // --- temporal honesty (Phase 16) ---
  const dated = observations.filter((o) => o.start.iso);
  const future = dated.filter((o) => new Date(o.start.iso) > now);

  // --- home/away protection (Phase 17) ---
  // NOTE ON WHAT THIS MEASURES. Comparing the record's venue text to the
  // census venue name is a STRING comparison, so a difference may mean
  // either a genuinely different ground OR the same ground written under
  // a sponsor/alias name ("Crown Ground" vs "Wham Stadium"). It is
  // therefore reported as a naming difference and nothing more. The
  // question of how many are genuinely elsewhere is answered by the
  // governed resolver, which knows the census's retained aliases — see
  // attribution-diagnostic.mjs.
  const homeRecords = observations.filter((o) => o.source_fields.home_or_away === "Home");
  const homeTextMatchesCensusName = homeRecords.filter((o) => {
    const source = population.candidates.find((c) => c.source_id === o.source_id);
    return source && o.venue_name && o.venue_name.toLowerCase() === String(source.census_venue_name).toLowerCase();
  });

  // --- geography / venue spread (Phase 22) ---
  const namedVenues = observations.filter((o) => o.venue_name);
  const distinctVenueNames = new Set(namedVenues.map((o) => o.venue_name));

  // --- domain-level duplication (multi-venue domains) ---
  const byDomainMatch = new Map();
  for (const observation of observations) {
    const source = population.candidates.find((c) => c.source_id === observation.source_id);
    const key = `${source?.domain}||${observation.source_record_id}`;
    byDomainMatch.set(key, (byDomainMatch.get(key) ?? 0) + 1);
  }
  const duplicatedWithinDomain = [...byDomainMatch.values()].filter((n) => n > 1).length;

  // --- overlap with the existing Tier-1 acquisition (Phase 18) ----------
  // Measured, never acted on: this package must not deduplicate across
  // sources or merge anything into the Tier-1 dataset.
  let tier1Overlap = { available: false };
  try {
    const tier1Path = resolve(ROOT, "research/major-event-acquisition/uk-tier1-01/observations.json");
    const tier1 = JSON.parse(await readFile(tier1Path, "utf8")).observations;
    const tier1Sources = new Set(tier1.map((o) => o.source_id));
    const tier1Refs = new Set(tier1.map((o) => `${o.source_id}||${o.source_record_id}`));
    const gcSources = new Set(observations.map((o) => o.source_id));
    tier1Overlap = {
      available: true,
      tier1_observations: tier1.length,
      tier1_sources: tier1Sources.size,
      gc_sources: gcSources.size,
      sources_in_both: [...gcSources].filter((id) => tier1Sources.has(id)).length,
      observation_refs_in_both: observations.filter((o) => tier1Refs.has(`${o.source_id}||${o.source_record_id}`)).length,
      note: "The two datasets are disjoint populations: Tier-1 covered READY_TIER1 JSON-LD/Tribe sources, this covers the EMBEDDED_NUXT_STATE football estate. Overlap is reported, not resolved — no cross-source deduplication is performed anywhere in this package.",
    };
  } catch {
    tier1Overlap = { available: false, note: "uk-tier1-01 dataset not present" };
  }

  const summary = {
    artifact_type: "UK_GC_FOOTBALL_ACQUISITION_SUMMARY",
    run_id: "uk-gc-football-01",
    started_at: startedAt,
    finished_at: finishedAt,
    population: population.counts,
    by_terminal_state: tally(results, (r) => r.terminal_state),
    by_detection: tally(results, (r) => r.detection ?? "(none)"),
    sources_proven: proven.length,
    observations_total: observations.length,
    observations_with_utc_instant: observations.filter((o) => o.start.certainty === "UTC_INSTANT").length,
    observations_with_no_date: observations.filter((o) => o.start.certainty === "UNKNOWN").length,
    observations_future: future.length,
    observations_past: dated.length - future.length,
    observations_with_named_venue: namedVenues.length,
    observations_with_non_venue_sentinel: observations.filter((o) => o.source_fields.venue_text_state === "NON_VENUE_SENTINEL").length,
    observations_with_absent_venue: observations.filter((o) => o.source_fields.venue_text_state === "ABSENT").length,
    distinct_venue_names: distinctVenueNames.size,
    home_away: {
      home: observations.filter((o) => o.source_fields.home_or_away === "Home").length,
      away: observations.filter((o) => o.source_fields.home_or_away === "Away").length,
      unstated: observations.filter((o) => !o.source_fields.home_or_away).length,
      home_records_whose_venue_text_equals_the_census_name: homeTextMatchesCensusName.length,
      home_records_whose_venue_text_differs_from_the_census_name: homeRecords.length - homeTextMatchesCensusName.length,
      measurement_caveat: "The two counts above are a STRING comparison only. A difference is NOT evidence of a different ground — most are the same ground under a sponsor or alias name. See attribution-diagnostic.json for the governed, alias-aware answer.",
      note: "A 'Home' record is NOT evidence of the club's own ground: observed live, a club's 'Home' pre-season fixtures were staged at Yankee Stadium and Helsinki Olympic Stadium, and one club's 'Home' fixtures are split across two different census venues. Venue identity comes only from the record's own venue text.",
    },
    identity: {
      distinct_platform_ids: new Set(observations.map((o) => o.source_record_id)).size,
      duplicate_rows_collapsed: results.reduce((n, r) => n + (r.diagnostics.identity?.duplicate_rows_collapsed ?? 0), 0),
      colliding_rows_dropped: results.reduce((n, r) => n + (r.diagnostics.identity?.colliding_rows_dropped ?? 0), 0),
      records_without_id: results.reduce((n, r) => n + (r.diagnostics.identity?.records_without_id ?? 0), 0),
      same_match_under_two_sources_on_one_domain: duplicatedWithinDomain,
    },
    tier1_overlap: tier1Overlap,
    by_competition: tally(observations, (o) => o.source_fields.competition_name),
    by_source_team_label: tally(observations, (o) => o.source_fields.source_team_label),
    top_venue_names: Object.fromEntries(Object.entries(tally(namedVenues, (o) => o.venue_name)).slice(0, 25)),
    by_census_venue_nation: tally(proven, (r) => population.candidates.find((c) => c.source_id === r.source_id)?.census_venue_nation),
  };

  await writeJson(resolve(OUT_DIR, "run.json"), {
    artifact_type: "UK_GC_FOOTBALL_ACQUISITION_RUN",
    run_id: "uk-gc-football-01",
    started_at: startedAt,
    finished_at: finishedAt,
    collector: "ingestion/gc-football-platform",
    population_criteria: population.counts,
    note: "One generic collector, driven entirely by each tenant's own served configuration and the platform's public API. No per-club code path exists.",
    route_provenance: {
      discovered_from: "the club page's own first-party JS bundle",
      public_client_class: "FootballWeb",
      teams_route: "https://filters.football.web.gc.<services-host>/v2/filters",
      matches_route: "https://matches.football.web.gc.<services-host>/v2/opta?clientMatches=true&teamID=..&seasonID=..&pageSize=..&pageNumber=..",
      authentication: "none — the first-party public client calls both routes with no headers; verified live (HTTP 200 unauthenticated)",
      rejected_route: "matches.football.ADMIN.gc.<services-host>/v1|v2 — the authenticated CMS client's host; returns HTTP 403 without credentials and is NOT used",
    },
    sources_attempted: results.length,
    terminal_states: summary.by_terminal_state,
  });

  await writeJson(resolve(OUT_DIR, "sources.json"), {
    artifact_type: "UK_GC_FOOTBALL_ACQUISITION_SOURCES",
    run_id: "uk-gc-football-01",
    count: results.length,
    sources: results.map((r) => ({
      source_id: r.source_id,
      source_url: r.source_url,
      census_venue_id: r.census_venue_id,
      census_venue_name: r.census_venue_name,
      terminal_state: r.terminal_state,
      detection: r.detection,
      services_host: r.services_host,
      club_id: r.club_id,
      teams: r.teams,
      observations: r.observations.length,
      diagnostics: r.diagnostics,
    })),
  });

  await writeJson(resolve(OUT_DIR, "observations.json"), {
    artifact_type: "UK_GC_FOOTBALL_ACQUISITION_OBSERVATIONS",
    run_id: "uk-gc-football-01",
    note: "Source Observations. venue_name is the SOURCE's own venue text for that fixture — it is NOT the census venue the calendar is registered under, and roughly half of every club's records are away fixtures at another ground. No canonical Event identity, no cross-source deduplication.",
    count: observations.length,
    observations,
  });

  await writeJson(resolve(OUT_DIR, "evidence-index.json"), {
    artifact_type: "UK_GC_FOOTBALL_ACQUISITION_EVIDENCE_INDEX",
    run_id: "uk-gc-football-01",
    note: "Every HTTP route this run issued, with its status. Read-only bounded GETs.",
    routes: results.flatMap((r) => r.routes.map((route) => ({ source_id: r.source_id, ...route }))),
  });

  await writeJson(resolve(OUT_DIR, "failures.json"), {
    artifact_type: "UK_GC_FOOTBALL_ACQUISITION_FAILURES",
    run_id: "uk-gc-football-01",
    note: "Every source that did not reach ACQUISITION_PROVEN, with the reason. SOURCE_FINGERPRINT_UNSUPPORTED means the census classified it into this family but the live page carries no gc platform signature at all.",
    count: results.filter((r) => r.terminal_state !== "ACQUISITION_PROVEN").length,
    failures: results
      .filter((r) => r.terminal_state !== "ACQUISITION_PROVEN")
      .map((r) => ({
        source_id: r.source_id,
        source_url: r.source_url,
        census_venue_name: r.census_venue_name,
        terminal_state: r.terminal_state,
        detection: r.detection,
        diagnostics: r.diagnostics,
      })),
  });

  await writeJson(resolve(OUT_DIR, "summary.json"), summary);

  for (const result of results) {
    if (!TERMINAL_STATES.has(result.terminal_state)) throw new Error(`non-canonical terminal state: ${result.terminal_state}`);
  }

  console.log(`\nproven ${proven.length}/${results.length} sources, ${observations.length} observations (${future.length} future)`);
  console.log(`states: ${JSON.stringify(summary.by_terminal_state)}`);
  console.log(`Retained under research/major-event-acquisition/uk-gc-football-01/`);
}

await run();
