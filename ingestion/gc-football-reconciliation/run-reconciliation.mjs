// BEATMAPPED-UK-GC-FOOTBALL-MULTISOURCE-FIXTURE-RECONCILIATION-01 — run.
//
//   node ingestion/gc-football-reconciliation/run-reconciliation.mjs
//
// Reads the retained football Observations and their derived venue
// attributions, and writes a SEPARATE derived reconciliation layer under
// research/major-event-reconciliation/uk-gc-football-01/.
//
// Pure and offline: it fetches nothing and writes nothing outside its own
// output directory. It creates NO canonical Event identity, publishes
// nothing, and modifies no source record.
//
// Reruns are byte-identical: pass --derived-at=<iso> (or BOTM_DERIVED_AT)
// to fix the only non-deterministic field, which is the run timestamp.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { reconcileAll } from "./reconcile.mjs";
import { auditCollisions } from "./collision-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ACQ = resolve(ROOT, "research/major-event-acquisition/uk-gc-football-01");
const ATTR = resolve(ROOT, "research/major-event-attribution/uk-gc-football-01");
const OUT = resolve(ROOT, "research/major-event-reconciliation/uk-gc-football-01");

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

function derivedAtFromArgv() {
  const flag = process.argv.find((arg) => arg.startsWith("--derived-at="));
  if (flag) return flag.slice("--derived-at=".length);
  if (process.env.BOTM_DERIVED_AT) return process.env.BOTM_DERIVED_AT;
  return new Date().toISOString();
}

/** Everything the artifacts contain, as a pure function of the inputs. */
export function buildArtifacts(observations, attributions, derivedAt) {
  const inputSnapshot = JSON.stringify(observations);
  const { groups, without_key: withoutKey } = reconcileAll(observations, attributions);
  const audit = auditCollisions(observations, attributions);

  if (JSON.stringify(observations) !== inputSnapshot) {
    throw new Error("STOP: the source Observations were mutated");
  }

  const reconciled = groups.filter((g) => g.reconciliation_state === "RECONCILED_MULTI_SOURCE");
  const singleSource = groups.filter((g) => g.reconciliation_state === "SINGLE_SOURCE_NOT_IN_SCOPE");
  const conflicts = groups.filter((g) => g.reconciliation_state.startsWith("CONFLICT_"));

  const multiSourceGroups = groups.filter((g) => g.source_count >= 2);
  const observationsInMultiSource = multiSourceGroups.reduce((n, g) => n + g.member_count, 0);
  const observationsReconciled = reconciled.reduce((n, g) => n + g.member_count, 0);

  // Every Observation must be accounted for exactly once.
  const accounted = groups.reduce((n, g) => n + g.member_count, 0) + withoutKey.length;

  const provenance = {
    source_observations: "research/major-event-acquisition/uk-gc-football-01/observations.json",
    venue_attributions: "research/major-event-attribution/uk-gc-football-01/attributions.json",
    reconciliation_key: "platform_match_id + normalized kickoff instant — and nothing else",
    keys_deliberately_not_used: ["home team name", "away team name", "competition name", "source venue text", "source calendar", "inferred club identity"],
    creates_canonical_event_identity: false,
    note: "A reconciliation group states that several source Observations describe one underlying fixture. It is NOT a canonical Event: no event id is minted, nothing is published, and no source record is altered.",
  };

  const summary = {
    artifact_type: "UK_GC_FOOTBALL_FIXTURE_RECONCILIATION_SUMMARY",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    provenance,

    accounting: {
      source_observations: observations.length,
      observations_accounted_for: accounted,
      observations_without_reconciliation_key: withoutKey.length,
      distinct_platform_match_ids: groups.length,
      multi_source_match_ids: multiSourceGroups.length,
      single_source_match_ids: singleSource.length,
      observations_in_multi_source_ids: observationsInMultiSource,
      observations_in_single_source_ids: singleSource.reduce((n, g) => n + g.member_count, 0),
    },

    by_reconciliation_state: tally(groups, (g) => g.reconciliation_state),

    reconciliation: {
      reconciled_multi_source_groups: reconciled.length,
      source_observations_represented: observationsReconciled,
      // A DERIVED count only. No Observation is deleted: this is how many
      // fewer rows an analytical fixture count would have if each group
      // were counted once instead of once per publishing club.
      analytical_duplicate_reduction: observationsReconciled - reconciled.length,
      conflict_groups: conflicts.length,
      single_source_groups_left_untouched: singleSource.length,
    },

    multiplicity_distribution: tally(groups, (g) => `${g.source_count}_source${g.source_count === 1 ? "" : "s"}`),
    max_source_multiplicity: groups.reduce((m, g) => Math.max(m, g.source_count), 0),

    // A registered calendar source is not an independent publisher.
    // Reported separately so that "reconciled across sources" is never
    // read as "corroborated by two different clubs" when it is not.
    independent_publisher_evidence: {
      reconciled_groups: reconciled.length,
      corroborated_by_more_than_one_publishing_domain: reconciled.filter((g) => g.publisher_domain_count > 1).length,
      all_members_from_a_single_publishing_domain: reconciled.filter((g) => g.publisher_domain_count === 1).length,
      publisher_domain_distribution: tally(reconciled, (g) => `${g.publisher_domain_count}_domain${g.publisher_domain_count === 1 ? "" : "s"}`),
      note: "Groups whose members all share one publishing domain are one club's own duplicate calendar entries (a /matches and a /tickets page, or a club registered under two census venues). Collapsing them is still correct — it is the same fixture twice — but they are NOT independent corroboration, and this package attaches no confidence score either way.",
    },

    venue: {
      by_venue_evidence_state: tally(reconciled, (g) => g.venue_evidence_state),
      reconciled_with_agreed_venue: reconciled.filter((g) => g.reconciled_venue_census_id).length,
      reconciled_with_no_venue_evidence: reconciled.filter((g) => g.venue_evidence_state === "NO_MEMBER_RESOLVED").length,
      conflicting_venue_groups: conflicts.filter((g) => g.reconciliation_state === "CONFLICT_RESOLVED_VENUE").length,
      // Groups where one member established the venue and another simply
      // had no evidence — absence did not veto it.
      venue_carried_by_partial_evidence: reconciled.filter(
        (g) => g.reconciled_venue_census_id && g.venue_supported_by.length < g.member_count,
      ).length,
      distinct_reconciled_venues: new Set(reconciled.filter((g) => g.reconciled_venue_census_id).map((g) => g.reconciled_venue_census_id)).size,
    },

    naming_variants_retained: {
      groups_with_multiple_home_team_spellings: multiSourceGroups.filter((g) => g.home_team_variants.length > 1).length,
      groups_with_multiple_away_team_spellings: multiSourceGroups.filter((g) => g.away_team_variants.length > 1).length,
      groups_with_multiple_competition_labels: multiSourceGroups.filter((g) => g.competition_variants.length > 1).length,
      groups_with_multiple_source_venue_texts: multiSourceGroups.filter((g) => g.source_venue_text_variants.length > 1).length,
      note: "Retained verbatim and never overwritten. None is a reconciliation key, and this package chooses no canonical spelling — it reconciles fixture occurrence, not vocabulary.",
    },

    collision_audit: audit.summary,

    temporal: {
      reconciled_future_groups: reconciled.filter((g) => g.is_future === true).length,
      reconciled_past_groups: reconciled.filter((g) => g.is_future === false).length,
      reconciled_mixed_or_unknown: reconciled.filter((g) => g.is_future === null).length,
    },
  };

  return { groups, reconciled, singleSource, conflicts, withoutKey, audit, summary, provenance, derivedAt };
}

async function run() {
  const derivedAt = derivedAtFromArgv();
  const observations = JSON.parse(await readFile(resolve(ACQ, "observations.json"), "utf8")).observations;
  const attributions = JSON.parse(await readFile(resolve(ATTR, "attributions.json"), "utf8")).attributions;

  const built = buildArtifacts(observations, attributions, derivedAt);
  const { reconciled, singleSource, conflicts, withoutKey, audit, summary, provenance } = built;

  const accounting = summary.accounting;
  if (accounting.observations_accounted_for !== observations.length) {
    throw new Error(`STOP: ${observations.length} observations but ${accounting.observations_accounted_for} accounted for`);
  }

  await writeJson(resolve(OUT, "reconciled-fixtures.json"), {
    artifact_type: "UK_GC_FOOTBALL_RECONCILED_FIXTURES",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    provenance,
    note: "Each group is several source Observations proven to describe ONE underlying fixture, keyed on platform match id + kickoff. Not a canonical Event.",
    count: reconciled.length,
    reconciled_fixtures: reconciled,
  });

  await writeJson(resolve(OUT, "conflicts.json"), {
    artifact_type: "UK_GC_FOOTBALL_RECONCILIATION_CONFLICTS",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    note: "Groups this package REFUSED to reconcile. Nothing here was resolved by picking a winner.",
    count: conflicts.length,
    by_state: tally(conflicts, (g) => g.reconciliation_state),
    conflicts,
  });

  await writeJson(resolve(OUT, "single-source.json"), {
    artifact_type: "UK_GC_FOOTBALL_SINGLE_SOURCE_MATCH_IDS",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    note: "Match ids published by exactly one source calendar. These are OUT OF SCOPE for this package, not failures. No group was manufactured for them and no identity was invented.",
    count: singleSource.length,
    single_source: singleSource.map((g) => ({
      platform_match_id: g.platform_match_id,
      reconciliation_group_id: g.reconciliation_group_id,
      kickoff_utc: g.kickoff_utc,
      source_id: g.source_ids[0],
      members: g.members,
      reconciliation_state: g.reconciliation_state,
    })),
  });

  await writeJson(resolve(OUT, "evidence.json"), {
    artifact_type: "UK_GC_FOOTBALL_RECONCILIATION_EVIDENCE",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    provenance,
    note: "The full per-match-id collision audit behind every decision, retained so any group can be re-checked without re-running.",
    observations_without_reconciliation_key: withoutKey,
    collision_audit: audit.per_match_id,
  });

  await writeJson(resolve(OUT, "summary.json"), summary);

  console.log(`source observations        : ${accounting.source_observations}`);
  console.log(`distinct match ids         : ${accounting.distinct_platform_match_ids}`);
  console.log(`  multi-source ids         : ${accounting.multi_source_match_ids}`);
  console.log(`  single-source ids        : ${accounting.single_source_match_ids}`);
  console.log(`states                     : ${JSON.stringify(summary.by_reconciliation_state)}`);
  console.log(`reconciled groups          : ${summary.reconciliation.reconciled_multi_source_groups}`);
  console.log(`  observations represented : ${summary.reconciliation.source_observations_represented}`);
  console.log(`  analytical reduction     : ${summary.reconciliation.analytical_duplicate_reduction}`);
  console.log(`venue                      : ${JSON.stringify(summary.venue.by_venue_evidence_state)}`);
  console.log(`collision audit            : ${JSON.stringify(summary.collision_audit)}`);
  console.log(`\nRetained under research/major-event-reconciliation/uk-gc-football-01/`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-reconciliation.mjs")) {
  await run();
}
