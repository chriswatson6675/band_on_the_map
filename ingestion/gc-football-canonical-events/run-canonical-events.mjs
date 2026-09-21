// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-EVENT-IDENTITY-01 — run.
//
//   node ingestion/gc-football-canonical-events/run-canonical-events.mjs
//
// Reads the committed reconciliation layer and writes a SEPARATE derived
// canonical identity layer under
// research/major-event-canonical/uk-gc-football-01/.
//
// Pure and offline. It fetches nothing, and it writes nothing outside its
// own output directory: no Observation, no attribution, no reconciliation
// artifact, no venue registry, no source registry and nothing under
// data/public is read for writing or touched in any way. It publishes
// nothing and deploys nothing.
//
// Reruns are byte-identical: pass --derived-at=<iso> (or BOTM_DERIVED_AT)
// to fix the only non-deterministic field, which is the run timestamp.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVENT_TYPE,
  IDENTITY_SCHEME,
  IDENTITY_VERSION,
  LIFECYCLE_STATE,
  PROVIDER_NAMESPACE,
  canonicaliseAll,
} from "./adapt.mjs";
import { IDENTITY_EXCLUSIONS, IDENTITY_INPUTS } from "../canonical-event-identity/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RECON = resolve(ROOT, "research/major-event-reconciliation/uk-gc-football-01");
const OUT = resolve(ROOT, "research/major-event-canonical/uk-gc-football-01");

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
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))),
  );
};

function derivedAtFromArgv() {
  const flag = process.argv.find((arg) => arg.startsWith("--derived-at="));
  if (flag) return flag.slice("--derived-at=".length);
  if (process.env.BOTM_DERIVED_AT) return process.env.BOTM_DERIVED_AT;
  return new Date().toISOString();
}

/** Everything the artifacts contain, as a pure function of the inputs. */
export function buildArtifacts(reconciledGroups, singleSourceEntries, derivedAt) {
  const inputSnapshot = JSON.stringify(reconciledGroups);
  const { established, withheld } = canonicaliseAll(reconciledGroups);

  if (JSON.stringify(reconciledGroups) !== inputSnapshot) {
    throw new Error("STOP: the reconciliation groups were mutated");
  }

  // Every input group must end at exactly one canonical outcome.
  if (established.length + withheld.length !== reconciledGroups.length) {
    throw new Error("STOP: reconciled groups are not accounted for exactly once");
  }

  const ids = established.map((event) => event.canonical_event_id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error("STOP: duplicate canonical event ids were minted");
  }

  const withGovernedVenue = established.filter((event) => event.governed_venue_census_id != null);
  const crossPublisher = established.filter((event) => event.evidence_class === "CROSS_PUBLISHER_CORROBORATED");
  const samePublisher = established.filter((event) => event.evidence_class === "SAME_PUBLISHER_MULTI_SOURCE");

  const provenance = {
    reconciled_fixtures: "research/major-event-reconciliation/uk-gc-football-01/reconciled-fixtures.json",
    single_source: "research/major-event-reconciliation/uk-gc-football-01/single-source.json",
    upstream_source_observations: "research/major-event-acquisition/uk-gc-football-01/observations.json",
    upstream_venue_attributions: "research/major-event-attribution/uk-gc-football-01/attributions.json",
    identity_anchor: "provider namespace + platform_match_id + normalized kickoff instant — and nothing else",
    identity_inputs: IDENTITY_INPUTS,
    identity_deliberately_excluded: IDENTITY_EXCLUSIONS,
    creates_canonical_event_identity: true,
    publishes_events: false,
    mutates_upstream_artifacts: false,
    note:
      "A canonical event states that several reconciled source Observations are observations of ONE underlying occurrence, and gives that occurrence a stable id. It resolves no club identity, no competition identity and no naming vocabulary, and nothing here is published: the lifecycle on every record is "
      + `${LIFECYCLE_STATE}.`,
  };

  const summary = {
    artifact_type: "UK_GC_FOOTBALL_CANONICAL_EVENT_IDENTITY_SUMMARY",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    provenance,

    identity_contract: {
      identity_scheme: IDENTITY_SCHEME,
      identity_version: IDENTITY_VERSION,
      provider_namespace: PROVIDER_NAMESPACE,
      event_type: EVENT_TYPE,
      id_format: "cev1-<provider slug>-<instant stamp>-<96-bit sha256 digest of the anchor>",
      stable_under: [
        "a later source observation joining the group",
        "improved or corrected venue attribution",
        "a corrected team or competition spelling",
        "a future canonicalisation of club or competition vocabulary",
        "changed publisher evidence",
        "any reordering of members",
      ],
    },

    accounting: {
      reconciled_groups_in: reconciledGroups.length,
      canonical_event_identities_established: established.length,
      canonical_identity_withheld: withheld.length,
      groups_accounted_for: established.length + withheld.length,
      distinct_canonical_event_ids: uniqueIds.size,
      single_source_match_ids_out_of_scope: singleSourceEntries.length,
      canonical_identities_created_for_single_source: 0,
    },

    by_canonical_state: {
      CANONICAL_EVENT_ESTABLISHED: established.length,
      CANONICAL_IDENTITY_WITHHELD: withheld.length,
    },

    withheld_by_reason: tally(withheld, (entry) => entry.withheld_reason),

    // A fact about where the corroborating records came from. NOT a
    // confidence score, and never an input to identity.
    evidence_classes: {
      CROSS_PUBLISHER_CORROBORATED: crossPublisher.length,
      SAME_PUBLISHER_MULTI_SOURCE: samePublisher.length,
      total: established.length,
      note:
        "Only the cross-publisher events are independently corroborated. The same-publisher events are one club's own calendar publishing a fixture twice; collapsing them is still correct, but they are NOT independent corroboration and must never be counted as such.",
    },

    venue: {
      with_governed_venue: withGovernedVenue.length,
      without_governed_venue: established.length - withGovernedVenue.length,
      by_venue_evidence_state: tally(established, (event) => event.venue_evidence_state),
      distinct_governed_venues: new Set(withGovernedVenue.map((event) => event.governed_venue_census_id)).size,
      venue_is_part_of_identity: false,
      note: "Venue is enrichment. An event whose venue is unresolved still has a safe occurrence identity, and resolving it later moves no id.",
    },

    participants_and_competition: {
      groups_with_multiple_home_team_spellings: established.filter((e) => e.home_team_variants.length > 1).length,
      groups_with_multiple_away_team_spellings: established.filter((e) => e.away_team_variants.length > 1).length,
      groups_with_multiple_competition_labels: established.filter((e) => e.competition_variants.length > 1).length,
      groups_with_multiple_source_venue_texts: established.filter((e) => e.source_venue_text_variants.length > 1).length,
      canonical_club_identities_introduced: 0,
      canonical_competition_identities_introduced: 0,
      note: "Every spelling is retained verbatim with its publishing member. This package chooses no canonical spelling and builds no club or competition registry.",
    },

    temporal: {
      future_events: established.filter((event) => event.is_future === true).length,
      past_events: established.filter((event) => event.is_future === false).length,
      unknown: established.filter((event) => event.is_future == null).length,
    },

    multiplicity_distribution: tally(established, (event) => `${event.source_count}_source${event.source_count === 1 ? "" : "s"}`),

    production_impact: {
      source_observations_modified: 0,
      reconciliation_artifacts_modified: 0,
      production_events_created: 0,
      production_venues_modified: 0,
      production_sources_modified: 0,
      public_events_published: 0,
      deployment: "NONE",
    },
  };

  return {
    summary,
    canonicalEvents: {
      artifact_type: "UK_GC_FOOTBALL_CANONICAL_EVENTS",
      run_id: "uk-gc-football-01",
      derived_at: derivedAt,
      provenance,
      note:
        "Derived governed occurrence identity. Not a production Event store, not published, and not consumed by the map.",
      count: established.length,
      canonical_events: established,
    },
    withheld: {
      artifact_type: "UK_GC_FOOTBALL_CANONICAL_IDENTITY_WITHHELD",
      run_id: "uk-gc-football-01",
      derived_at: derivedAt,
      note:
        "Reconciled groups that received NO canonical identity, each with the factual reason. Present even when empty, so that the accounting can show every input group ended at exactly one outcome.",
      count: withheld.length,
      withheld,
    },
  };
}

async function main() {
  const derivedAt = derivedAtFromArgv();
  const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

  const reconciled = (await readJson(resolve(RECON, "reconciled-fixtures.json"))).reconciled_fixtures;
  const singleSource = (await readJson(resolve(RECON, "single-source.json"))).single_source;

  const artifacts = buildArtifacts(reconciled, singleSource, derivedAt);

  await writeJson(resolve(OUT, "canonical-events.json"), artifacts.canonicalEvents);
  await writeJson(resolve(OUT, "withheld.json"), artifacts.withheld);
  await writeJson(resolve(OUT, "summary.json"), artifacts.summary);

  const { accounting, evidence_classes: evidence, venue } = artifacts.summary;
  console.log(`reconciled groups in            : ${accounting.reconciled_groups_in}`);
  console.log(`canonical identities established: ${accounting.canonical_event_identities_established}`);
  console.log(`withheld                        : ${accounting.canonical_identity_withheld}`);
  console.log(`cross-publisher corroborated    : ${evidence.CROSS_PUBLISHER_CORROBORATED}`);
  console.log(`same-publisher multi-source     : ${evidence.SAME_PUBLISHER_MULTI_SOURCE}`);
  console.log(`with governed venue             : ${venue.with_governed_venue}`);
  console.log(`without governed venue          : ${venue.without_governed_venue}`);
  console.log(`single-source ids left untouched: ${accounting.single_source_match_ids_out_of_scope}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-canonical-events.mjs")) {
  await main();
}
