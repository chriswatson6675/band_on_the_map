// BEATMAPPED-UK-GC-FOOTBALL-VENUE-ATTRIBUTION-01 — Phases 12–18.
//
//   node ingestion/gc-football-attribution/run-attribution.mjs
//
// Applies the EXISTING generic governed venue-attribution resolver to the
// retained gc football Observations and writes a SEPARATE derived layer
// under research/major-event-attribution/uk-gc-football-01/.
//
// Pure and offline. It fetches nothing, and it writes nothing outside its
// own output directory.
//
// It creates no canonical Event identity and merges nothing across
// sources: where two clubs both publish the same match, both Observations
// keep their own attribution record. Duplication is MEASURED here, for a
// later reconciliation package to act on.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCensusIndex } from "../major-event-attribution/census-index.mjs";
import { resolveAll } from "../major-event-attribution/resolve.mjs";
import { adaptAll } from "./adapt.mjs";
import { competitionContext, noVenueKind, unresolvedReason } from "./reason-codes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ACQ = resolve(ROOT, "research/major-event-acquisition/uk-gc-football-01");
const OUT = resolve(ROOT, "research/major-event-attribution/uk-gc-football-01");

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

/** HOME / AWAY / UNKNOWN, from the source's own label. Evidence, not identity. */
const homeAwayClass = (observation) => {
  const value = observation.source_fields?.home_or_away;
  if (value === "Home") return "HOME";
  if (value === "Away") return "AWAY";
  return "NEUTRAL_OR_UNKNOWN";
};

/** The attribution outcome collapsed into the four buckets Phase 15 wants. */
function effectBucket(record) {
  if (record.attribution_state === "SOURCE_VENUE_MATCH") return "SOURCE_CENSUS_VENUE";
  if (record.attribution_state === "RESOLVED_TO_DIFFERENT_CENSUS_VENUE") return "DIFFERENT_CENSUS_VENUE";
  if (record.unresolved_reason === "NO_VENUE_EVIDENCE" || record.unresolved_reason === "VENUE_NAME_TOO_WEAK") return "NO_VENUE_EVIDENCE";
  if (record.unresolved_reason === "NOT_IN_CENSUS") return "OUT_OF_CENSUS";
  return "REVIEW";
}

function stateTable(records) {
  const base = {
    SOURCE_VENUE_MATCH: 0,
    RESOLVED_TO_DIFFERENT_CENSUS_VENUE: 0,
    UNRESOLVED_NO_CENSUS_MATCH: 0,
    UNRESOLVED_NO_VENUE_EVIDENCE: 0,
    CONFLICTING_LOCATION_EVIDENCE: 0,
    AMBIGUOUS_MULTIPLE_CENSUS_MATCHES: 0,
  };
  for (const record of records) base[record.attribution_state] = (base[record.attribution_state] ?? 0) + 1;
  return { ...base, TOTAL: records.length };
}

async function run() {
  const index = await buildCensusIndex();
  const acquisition = JSON.parse(await readFile(resolve(ACQ, "observations.json"), "utf8"));
  const sourcesDoc = JSON.parse(await readFile(resolve(ACQ, "sources.json"), "utf8"));
  const observations = acquisition.observations;
  const sourcesById = new Map(sourcesDoc.sources.map((source) => [source.source_id, source]));

  // Prove the input is not mutated by anything this run does.
  const inputSnapshot = JSON.stringify(observations);

  const derivedAt = new Date().toISOString();
  const adapted = adaptAll(observations, sourcesById);
  const resolved = resolveAll(adapted, index, { derivedAt });

  if (resolved.length !== observations.length) {
    throw new Error(`STOP: ${observations.length} observations produced ${resolved.length} attribution records`);
  }

  // --- enrich: resolved geography, home/away evidence, reason codes -----
  const records = resolved.map((record, i) => {
    const observation = observations[i];
    const venue = record.resolved_venue_census_id ? index.byId.get(record.resolved_venue_census_id) : null;
    const reason = record.resolved_venue_census_id ? null : unresolvedReason(record, observation);
    const enriched = {
      ...record,
      resolved_venue_city: venue?.city ?? null,
      resolved_venue_nation: venue?.nation ?? null,
      resolved_venue_postcode: venue?.postcode ?? null,
      // Source evidence about the fixture, retained beside the decision.
      // NEVER used to resolve — the resolver never sees these.
      home_or_away: observation.source_fields?.home_or_away ?? null,
      home_away_class: homeAwayClass(observation),
      competition_name: competitionContext(observation),
      kickoff_utc: observation.start?.iso ?? null,
      is_future: observation.start?.iso ? new Date(observation.start.iso) > new Date(derivedAt) : null,
      platform_match_id: observation.source_fields?.match_id ?? null,
      source_venue_text_state: observation.source_fields?.venue_text_state ?? null,
      unresolved_reason: reason,
      no_venue_kind: reason === "NO_VENUE_EVIDENCE" ? noVenueKind(observation) : null,
    };
    return { ...enriched, source_vs_physical: effectBucket(enriched) };
  });

  if (JSON.stringify(observations) !== inputSnapshot) {
    throw new Error("STOP: the source Observations were mutated");
  }

  const future = records.filter((record) => record.is_future === true);
  const past = records.filter((record) => record.is_future === false);
  const unresolvedRecords = records.filter((record) => !record.resolved_venue_census_id);

  // --- Phase 15: source-venue vs physical-venue effect, by home/away ----
  const effectByClass = {};
  for (const cls of ["HOME", "AWAY", "NEUTRAL_OR_UNKNOWN"]) {
    const slice = records.filter((record) => record.home_away_class === cls);
    effectByClass[cls] = {
      total: slice.length,
      source_census_venue: slice.filter((r) => r.source_vs_physical === "SOURCE_CENSUS_VENUE").length,
      different_census_venue: slice.filter((r) => r.source_vs_physical === "DIFFERENT_CENSUS_VENUE").length,
      out_of_census: slice.filter((r) => r.source_vs_physical === "OUT_OF_CENSUS").length,
      no_venue_evidence: slice.filter((r) => r.source_vs_physical === "NO_VENUE_EVIDENCE").length,
      review: slice.filter((r) => r.source_vs_physical === "REVIEW").length,
    };
  }

  // --- Phase 17/18: duplicate platform match id analysis ----------------
  const byMatchId = new Map();
  for (const record of records) {
    if (!record.platform_match_id) continue;
    if (!byMatchId.has(record.platform_match_id)) byMatchId.set(record.platform_match_id, []);
    byMatchId.get(record.platform_match_id).push(record);
  }
  const duplicateGroups = [...byMatchId.entries()].filter(([, group]) => group.length > 1);

  const obsByRef = new Map(observations.map((o) => [`${o.source_id}||${o.source_record_id}`, o]));
  const field = (record, name) => {
    const o = obsByRef.get(`${record.source_id}||${record.source_record_id}`);
    if (name === "kickoff") return o?.start?.iso ?? null;
    if (name === "competition") return o?.source_fields?.competition_name ?? null;
    if (name === "venue") return o?.venue_name ?? null;
    if (name === "home_team") return o?.source_fields?.team_names?.[0] ?? null;
    if (name === "away_team") return o?.source_fields?.team_names?.[1] ?? null;
    return null;
  };

  const disagreement = { kickoff: 0, home_team: 0, away_team: 0, competition: 0, source_venue: 0, resolved_venue: 0 };
  const conflictingVenueExamples = [];
  let bothResolvedSame = 0;
  let bothResolvedConflict = 0;

  for (const [matchId, group] of duplicateGroups) {
    const distinct = (name) => new Set(group.map((r) => field(r, name))).size;
    if (distinct("kickoff") > 1) disagreement.kickoff += 1;
    if (distinct("home_team") > 1) disagreement.home_team += 1;
    if (distinct("away_team") > 1) disagreement.away_team += 1;
    if (distinct("competition") > 1) disagreement.competition += 1;
    if (distinct("venue") > 1) disagreement.source_venue += 1;

    const resolvedIds = new Set(group.map((r) => r.resolved_venue_census_id));
    if (resolvedIds.size > 1) {
      disagreement.resolved_venue += 1;
      const allResolved = group.every((r) => r.resolved_venue_census_id);
      if (allResolved) {
        bothResolvedConflict += 1;
        if (conflictingVenueExamples.length < 10) {
          conflictingVenueExamples.push({
            platform_match_id: matchId,
            records: group.map((r) => ({
              source_census_venue_name: r.source_census_venue_name,
              source_reported_venue_name: r.source_reported_venue_name,
              resolved_venue_name: r.resolved_venue_name,
            })),
          });
        }
      }
    } else if (group.every((r) => r.resolved_venue_census_id)) {
      bothResolvedSame += 1;
    }
  }

  const multiplicities = duplicateGroups.map(([, group]) => group.length);

  const summary = {
    artifact_type: "UK_GC_FOOTBALL_VENUE_ATTRIBUTION_SUMMARY",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    resolver: "ingestion/major-event-attribution (existing generic resolver, unmodified)",
    source_dataset: "research/major-event-acquisition/uk-gc-football-01/observations.json",

    total_observations: records.length,
    by_attribution_state: stateTable(records),
    by_confidence: tally(records, (r) => r.confidence),
    by_method: tally(records.filter((r) => r.attribution_method), (r) => r.attribution_method),
    resolved: records.length - unresolvedRecords.length,
    unresolved: unresolvedRecords.length,
    distinct_resolved_venues: new Set(records.filter((r) => r.resolved_venue_census_id).map((r) => r.resolved_venue_census_id)).size,

    temporal: {
      future: { count: future.length, by_attribution_state: stateTable(future) },
      past: { count: past.length, by_attribution_state: stateTable(past) },
    },

    future_geography: {
      distinct_resolved_venues: new Set(future.filter((r) => r.resolved_venue_census_id).map((r) => r.resolved_venue_census_id)).size,
      distinct_cities: new Set(future.filter((r) => r.resolved_venue_city).map((r) => r.resolved_venue_city)).size,
      by_nation: tally(future.filter((r) => r.resolved_venue_nation), (r) => r.resolved_venue_nation),
      out_of_census_observations: future.filter((r) => r.unresolved_reason === "NOT_IN_CENSUS").length,
      no_venue_evidence_observations: future.filter((r) => r.source_vs_physical === "NO_VENUE_EVIDENCE").length,
      geography_of_out_of_census_venues: "NOT ESTABLISHED — the retained evidence does not state the country of a venue absent from the census. See reason-codes.mjs.",
    },

    source_vs_physical_effect: {
      overall: {
        source_census_venue: records.filter((r) => r.source_vs_physical === "SOURCE_CENSUS_VENUE").length,
        different_census_venue: records.filter((r) => r.source_vs_physical === "DIFFERENT_CENSUS_VENUE").length,
        out_of_census: records.filter((r) => r.source_vs_physical === "OUT_OF_CENSUS").length,
        no_venue_evidence: records.filter((r) => r.source_vs_physical === "NO_VENUE_EVIDENCE").length,
        review: records.filter((r) => r.source_vs_physical === "REVIEW").length,
      },
      by_home_away: effectByClass,
      away_resolved_to_source_census_venue: records.filter((r) => r.home_away_class === "AWAY" && r.resolved_venue_census_id && r.resolved_venue_census_id === r.source_census_venue_id).length,
      home_resolved_to_source_census_venue: records.filter((r) => r.home_away_class === "HOME" && r.resolved_venue_census_id && r.resolved_venue_census_id === r.source_census_venue_id).length,
      home_resolved_to_different_census_venue: records.filter((r) => r.home_away_class === "HOME" && r.resolved_venue_census_id && r.resolved_venue_census_id !== r.source_census_venue_id).length,
    },

    unresolved_reasons: tally(unresolvedRecords, (r) => r.unresolved_reason),
    unresolved_out_of_census_by_competition: tally(
      unresolvedRecords.filter((r) => r.unresolved_reason === "NOT_IN_CENSUS"),
      (r) => r.competition_name,
    ),
    top_out_of_census_venue_names: Object.fromEntries(
      Object.entries(tally(unresolvedRecords.filter((r) => r.unresolved_reason === "NOT_IN_CENSUS"), (r) => r.source_reported_venue_name)).slice(0, 30),
    ),

    future_venue_distribution_SOURCE_OBSERVATIONS: Object.fromEntries(
      Object.entries(tally(future.filter((r) => r.resolved_venue_name), (r) => r.resolved_venue_name)).slice(0, 30),
    ),
    venue_distribution_note: "These are SOURCE OBSERVATIONS, not unique fixtures. The same real match is published by both clubs' calendars and is counted once per source here. Cross-source reconciliation is a separate, later package.",

    duplicate_match_ids: {
      total_observations: records.length,
      distinct_platform_match_ids: byMatchId.size,
      ids_seen_once: [...byMatchId.values()].filter((g) => g.length === 1).length,
      ids_seen_multiple_times: duplicateGroups.length,
      max_source_multiplicity: multiplicities.length ? Math.max(...multiplicities) : 0,
      duplicate_groups_both_resolved_same_venue: bothResolvedSame,
      duplicate_groups_resolved_to_conflicting_venues: bothResolvedConflict,
      disagreement_counts: disagreement,
      conflicting_venue_examples: conflictingVenueExamples,
      note: "MEASURED ONLY. No Observation was merged and no canonical Event identity was created.",
    },
  };

  // --- Phase 9: candidate census defects, RECORDED not patched ---------
  // A HOME fixture whose venue text did not resolve, where the source's
  // own census venue is known, is a signal worth a human look. It is only
  // a signal: the same pattern is produced by two very different things,
  // and this package does not claim to tell them apart.
  //
  //   (a) a genuine census alias gap — the same ground under a trading
  //       name the census does not carry ("Madejski Stadium" vs
  //       "Select Car Leasing Stadium");
  //   (b) a genuinely different, non-census place — a club's training
  //       ground or academy venue ("Bodymoor Heath Training Ground"),
  //       which is CORRECTLY unresolved and is not a defect at all.
  //
  // Deciding which is which needs evidence this package does not have, so
  // both are listed together and neither is acted on. The census is not
  // modified here.
  const gapCounts = new Map();
  for (const record of records) {
    if (record.home_away_class !== "HOME") continue;
    if (record.resolved_venue_census_id) continue;
    if (record.unresolved_reason !== "NOT_IN_CENSUS") continue;
    if (!record.source_census_venue_name || !record.source_reported_venue_name) continue;
    const key = JSON.stringify([record.source_census_venue_name, record.source_reported_venue_name]);
    gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
  }
  const NON_STADIUM_HINT = /training ground|academy|sports centre|sports center|training centre/i;
  const censusReview = [...gapCounts.entries()]
    .map(([key, observations_affected]) => {
      const [census_venue_name, source_reported_venue_name] = JSON.parse(key);
      return {
        finding: "CENSUS_REVIEW_REQUIRED",
        census_venue_name,
        source_reported_venue_name,
        observations_affected,
        // A purely textual signal, stated as such. It does not decide the case.
        source_text_names_a_training_or_academy_site: NON_STADIUM_HINT.test(source_reported_venue_name),
        basis: "A HOME-labelled fixture published by this source named a venue that matches no governed census name or alias.",
        requires: "Human verification of whether this is the same ground under a trading name (census alias gap) or a genuinely different, non-census site (correct as-is).",
      };
    })
    .sort((a, b) => b.observations_affected - a.observations_affected);

  // Two systemic findings, measured rather than asserted. Neither is acted
  // on here: changing normalisation or widening aliases to raise this
  // package's own yield is exactly what it must not do.
  const outOfCensus = records.filter((record) => record.unresolved_reason === "NOT_IN_CENSUS");
  const flaggedTexts = new Set(censusReview.map((entry) => entry.source_reported_venue_name));
  const namedAsSomeClubsHomeGround = outOfCensus.filter((record) => flaggedTexts.has(record.source_reported_venue_name));

  // A source name differing from a governed census name ONLY by a leading
  // definite article is a normalisation gap in the shared resolver, not a
  // census gap. Recorded for a later generic package to consider.
  const norm = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const governed = new Set();
  for (const venue of index.venues) {
    governed.add(norm(venue.canonical_name));
    for (const alias of venue.alternative_names ?? []) governed.add(norm(alias));
  }
  const leadingArticleOnly = outOfCensus.filter((record) => {
    const n = norm(record.source_reported_venue_name);
    return n.startsWith("the ") && governed.has(n.slice(4));
  });

  const systemicFindings = {
    out_of_census_observations: outOfCensus.length,
    naming_a_venue_some_club_publishes_as_its_own_home_ground: {
      observations: namedAsSomeClubsHomeGround.length,
      share_of_out_of_census: outOfCensus.length ? Number((namedAsSomeClubsHomeGround.length / outOfCensus.length).toFixed(4)) : 0,
      meaning: "These are not obscure places. A majority of out-of-census football venue text names a ground that some club in this same estate publishes as its home venue — strong evidence the census lacks these grounds under their current trading name.",
    },
    differs_from_a_governed_name_only_by_a_leading_article: {
      observations: leadingArticleOnly.length,
      distinct_names: [...new Set(leadingArticleOnly.map((record) => record.source_reported_venue_name))].sort(),
      meaning: "A RESOLVER normalisation gap, not a census gap: the source wrote 'The X' where the census holds 'X'. Deliberately NOT fixed here — altering shared normalisation to raise this package's yield is out of scope.",
    },
  };

  await writeJson(resolve(OUT, "census-review.json"), {
    artifact_type: "UK_GC_FOOTBALL_CENSUS_REVIEW_CANDIDATES",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    status: "RECORDED ONLY — the census was not modified by this package, and no alias or normalisation rule was widened.",
    note: "Candidate census findings surfaced by football attribution. Each needs human verification; this package deliberately does not decide, and does not widen any alias to raise the resolution rate.",
    count: censusReview.length,
    observations_affected_total: censusReview.reduce((n, entry) => n + entry.observations_affected, 0),
    likely_training_or_academy_sites: censusReview.filter((entry) => entry.source_text_names_a_training_or_academy_site).length,
    systemic_findings: systemicFindings,
    candidates: censusReview,
  });

  summary.systemic_findings = systemicFindings;

  summary.census_review_candidates = {
    distinct_pairs: censusReview.length,
    observations_affected: censusReview.reduce((n, entry) => n + entry.observations_affected, 0),
    textually_training_or_academy: censusReview.filter((entry) => entry.source_text_names_a_training_or_academy_site).length,
    note: "Recorded in census-review.json. Mixed: some are genuine alias gaps, some are correctly-unresolved non-census sites. Census not modified.",
  };

  await writeJson(resolve(OUT, "attributions.json"), {
    artifact_type: "UK_GC_FOOTBALL_VENUE_ATTRIBUTION",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    source_dataset: "research/major-event-acquisition/uk-gc-football-01/observations.json",
    census: "research/major-event-venues/uk-major-event-census-01/venues.json",
    resolver: "ingestion/major-event-attribution — the existing generic resolver, used unmodified",
    note: "A DERIVED layer. The source Observations are unmodified: venue_name remains the source's own words. source_census_venue_id is the provenance of the calendar the fixture was fetched from; resolved_venue_census_id is a separate decision about where it is actually played. No canonical Event identity, no cross-source merging.",
    count: records.length,
    attributions: records,
  });

  await writeJson(resolve(OUT, "unresolved.json"), {
    artifact_type: "UK_GC_FOOTBALL_VENUE_ATTRIBUTION_UNRESOLVED",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    note: "Every Observation that did not resolve to exactly one census venue, with a factual reason code. Preferring unresolved over speculative is deliberate. No code here asserts a venue's country: the retained evidence does not establish it.",
    count: unresolvedRecords.length,
    by_reason: tally(unresolvedRecords, (r) => r.unresolved_reason),
    unresolved: unresolvedRecords.map((r) => ({
      source_id: r.source_id,
      source_record_id: r.source_record_id,
      platform_match_id: r.platform_match_id,
      source_census_venue_name: r.source_census_venue_name,
      source_reported_venue_name: r.source_reported_venue_name,
      source_venue_text_state: r.source_venue_text_state,
      home_or_away: r.home_or_away,
      competition_name: r.competition_name,
      kickoff_utc: r.kickoff_utc,
      is_future: r.is_future,
      attribution_state: r.attribution_state,
      unresolved_reason: r.unresolved_reason,
      no_venue_kind: r.no_venue_kind,
      confidence: r.confidence,
      evidence: r.evidence,
      ambiguity_candidates: r.ambiguity_candidates,
    })),
  });

  await writeJson(resolve(OUT, "evidence.json"), {
    artifact_type: "UK_GC_FOOTBALL_VENUE_ATTRIBUTION_EVIDENCE",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    note: "The evidence behind each decision and the index it was decided against, retained so any attribution can be re-checked without re-running.",
    census_index: index.counts,
    resolver_provenance: {
      module: "ingestion/major-event-attribution/resolve.mjs",
      modified_by_this_package: false,
      football_specific_rules: "none — this package adds no matching logic, no football alias table and no football-only state",
      adapter: "ingestion/gc-football-attribution/adapt.mjs supplies census PROVENANCE on a copy; it supplies no venue evidence",
    },
    per_observation: records.map((r) => ({
      source_id: r.source_id,
      source_record_id: r.source_record_id,
      attribution_state: r.attribution_state,
      attribution_method: r.attribution_method,
      confidence: r.confidence,
      unresolved_reason: r.unresolved_reason,
      evidence: r.evidence,
    })),
  });

  await writeJson(resolve(OUT, "summary.json"), summary);

  console.log(`observations : ${records.length}`);
  console.log(`states       : ${JSON.stringify(summary.by_attribution_state)}`);
  console.log(`resolved     : ${summary.resolved} / ${records.length}  (${summary.distinct_resolved_venues} distinct venues)`);
  console.log(`future       : ${future.length}  past: ${past.length}`);
  console.log(`unresolved   : ${JSON.stringify(summary.unresolved_reasons)}`);
  console.log(`AWAY -> source census venue: ${summary.source_vs_physical_effect.away_resolved_to_source_census_venue}`);
  console.log(`HOME -> different census venue: ${summary.source_vs_physical_effect.home_resolved_to_different_census_venue}`);
  console.log(`duplicate match ids: ${summary.duplicate_match_ids.ids_seen_multiple_times}, conflicting venue: ${bothResolvedConflict}`);
  console.log(`\nRetained under research/major-event-attribution/uk-gc-football-01/`);
}

await run();
