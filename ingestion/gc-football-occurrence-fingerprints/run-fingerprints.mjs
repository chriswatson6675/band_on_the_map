// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-IDENTITY-ARCHITECTURE-CONFORMANCE-01
// — run.
//
//   node ingestion/gc-football-occurrence-fingerprints/run-fingerprints.mjs
//
// Reads the committed reconciliation layer and writes a SEPARATE derived
// occurrence fingerprint layer under
// research/major-event-occurrence-fingerprints/uk-gc-football-01/.
//
// It creates no BeatMapped Event and no application canonical entity id.
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
  OCCURRENCE_TYPE,
  FINGERPRINT_SCHEME,
  FINGERPRINT_VERSION,
  LIFECYCLE_STATE,
  PROVIDER_NAMESPACE,
  fingerprintAll,
} from "./adapt.mjs";
import { FINGERPRINT_EXCLUSIONS, FINGERPRINT_INPUTS } from "../derived-occurrence-fingerprint/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RECON = resolve(ROOT, "research/major-event-reconciliation/uk-gc-football-01");
const OUT = resolve(ROOT, "research/major-event-occurrence-fingerprints/uk-gc-football-01");

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
  const { established, withheld } = fingerprintAll(reconciledGroups);

  if (JSON.stringify(reconciledGroups) !== inputSnapshot) {
    throw new Error("STOP: the reconciliation groups were mutated");
  }

  // Every input group must end at exactly one canonical outcome.
  if (established.length + withheld.length !== reconciledGroups.length) {
    throw new Error("STOP: reconciled groups are not accounted for exactly once");
  }

  const ids = established.map((event) => event.occurrence_fingerprint);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error("STOP: duplicate occurrence fingerprints were derived");
  }

  // No record may carry a field whose truth depends on the CURRENT
  // contents of events/event-state.json. Checked structurally rather than
  // by naming one known field, so a future field of that shape cannot
  // reintroduce the coupling unnoticed.
  //
  // Scoped precisely to canonical-Event and admission vocabulary. Fields
  // like `participant_identity_state` are NOT caught and must not be:
  // they record whether the SOURCES resolved a club or competition name,
  // which is an upstream evidence fact and is timeless.
  const DOWNSTREAM_STATE_FIELD = /(^|_)event_id$|canonical_event|application_entity|admitted|admission/i;
  for (const record of established) {
    for (const field of Object.keys(record)) {
      if (DOWNSTREAM_STATE_FIELD.test(field)) {
        throw new Error(`STOP: "${field}" states downstream Event state inside fingerprint evidence`);
      }
    }
  }

  const withGovernedVenue = established.filter((event) => event.governed_venue_census_id != null);
  const crossPublisher = established.filter((event) => event.evidence_class === "CROSS_PUBLISHER_CORROBORATED");
  const samePublisher = established.filter((event) => event.evidence_class === "SAME_PUBLISHER_MULTI_SOURCE");

  const provenance = {
    reconciled_fixtures: "research/major-event-reconciliation/uk-gc-football-01/reconciled-fixtures.json",
    single_source: "research/major-event-reconciliation/uk-gc-football-01/single-source.json",
    upstream_source_observations: "research/major-event-acquisition/uk-gc-football-01/observations.json",
    upstream_venue_attributions: "research/major-event-attribution/uk-gc-football-01/attributions.json",
    fingerprint_anchor: "provider namespace + platform_match_id + normalized kickoff instant — and nothing else",
    fingerprint_inputs: FINGERPRINT_INPUTS,
    fingerprint_deliberately_excluded: FINGERPRINT_EXCLUSIONS,
    // The architectural boundary, stated as data so it cannot be lost.
    establishes_application_canonical_event_identity: false,
    is_source_provider_dependent: true,
    creates_beatmapped_event_entity: false,
    publishes_events: false,
    mutates_upstream_artifacts: false,
    architecture_note:
      "This layer derives a provider-scoped occurrence FINGERPRINT, not an application canonical entity id. docs/ARCHITECTURE.md rule 6 says a source-specific identifier must never become the application's canonical identity scheme, and this value is a deterministic function of the provider's own event key: change that key and the fingerprint changes. Digesting the anchor hides the key, it does not remove the dependency. Rule 7 requires an Event id to be application-issued and minted once at a governed admission step (ingestion/event/admission.mjs), which is downstream of this artifact and independent of it. Accordingly no record here states whether a canonical Event has been admitted for its occurrence: that would be a claim about the current contents of events/event-state.json, and it would go stale the moment one is admitted, forcing reproducible evidence to be rewritten because application state moved. The authoritative fingerprint-to-Event linkage is events/event-state.json's event_occurrence_mappings, and it is the only place to ask.",
    event_linkage_source_of_truth: "events/event-state.json -> event_occurrence_mappings",
    reads_event_state: false,
    note:
      "A fingerprinted occurrence states that several reconciled source Observations are observations of ONE underlying occurrence, and gives that occurrence a stable derived anchor. It resolves no club identity, no competition identity and no naming vocabulary, and nothing here is published: the lifecycle on every record is "
      + `${LIFECYCLE_STATE}.`,
  };

  const summary = {
    artifact_type: "UK_GC_FOOTBALL_OCCURRENCE_FINGERPRINT_SUMMARY",
    run_id: "uk-gc-football-01",
    derived_at: derivedAt,
    provenance,

    fingerprint_contract: {
      fingerprint_scheme: FINGERPRINT_SCHEME,
      fingerprint_version: FINGERPRINT_VERSION,
      provider_namespace: PROVIDER_NAMESPACE,
      occurrence_type: OCCURRENCE_TYPE,
      value_format: "dof1-<provider slug>-<instant stamp>-<96-bit sha256 digest of the anchor>",
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
      occurrence_fingerprints_established: established.length,
      fingerprints_withheld: withheld.length,
      groups_accounted_for: established.length + withheld.length,
      distinct_occurrence_fingerprints: uniqueIds.size,
      single_source_match_ids_out_of_scope: singleSourceEntries.length,
      fingerprints_created_for_single_source: 0,
      // Counts of admitted Events deliberately do NOT appear here.
      // "how many are currently admitted" is a question about
      // events/event-state.json, not about this corpus, and an answer
      // frozen into this artifact would be wrong as soon as one is
      // admitted. What this DERIVATION creates is stated timelessly in
      // provenance.creates_beatmapped_event_entity instead.
    },

    by_fingerprint_state: {
      OCCURRENCE_FINGERPRINT_ESTABLISHED: established.length,
      OCCURRENCE_FINGERPRINT_WITHHELD: withheld.length,
    },

    withheld_by_reason: tally(withheld, (entry) => entry.withheld_reason),

    // A fact about where the corroborating records came from. NOT a
    // confidence score, and never an input to identity.
    evidence_classes: {
      CROSS_PUBLISHER_CORROBORATED: crossPublisher.length,
      SAME_PUBLISHER_MULTI_SOURCE: samePublisher.length,
      total: established.length,
      note:
        "Only the cross-publisher occurrences are independently corroborated. The same-publisher ones are one club's own calendar publishing a fixture twice; collapsing them is still correct, but they are NOT independent corroboration and must never be counted as such.",
    },

    venue: {
      with_governed_venue: withGovernedVenue.length,
      without_governed_venue: established.length - withGovernedVenue.length,
      by_venue_evidence_state: tally(established, (event) => event.venue_evidence_state),
      distinct_governed_venues: new Set(withGovernedVenue.map((event) => event.governed_venue_census_id)).size,
      venue_is_part_of_fingerprint: false,
      note: "Venue is enrichment. An occurrence whose venue is unresolved still has a safe fingerprint, and resolving it later moves no fingerprint.",
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
      future_occurrences: established.filter((event) => event.is_future === true).length,
      past_occurrences: established.filter((event) => event.is_future === false).length,
      unknown: established.filter((event) => event.is_future == null).length,
    },

    multiplicity_distribution: tally(established, (event) => `${event.source_count}_source${event.source_count === 1 ? "" : "s"}`),

    production_impact: {
      source_observations_modified: 0,
      reconciliation_artifacts_modified: 0,
      production_events_created: 0,
      application_canonical_entities_created: 0,
      production_venues_modified: 0,
      production_sources_modified: 0,
      public_events_published: 0,
      deployment: "NONE",
    },
  };

  return {
    summary,
    occurrenceFingerprints: {
      artifact_type: "UK_GC_FOOTBALL_OCCURRENCE_FINGERPRINTS",
      run_id: "uk-gc-football-01",
      derived_at: derivedAt,
      provenance,
      note:
        "Derived occurrence fingerprints: provider-scoped evidence anchors over reconciled Observations. NOT BeatMapped Events, NOT application canonical entity ids, not a production Event store, not published, and not consumed by the map.",
      count: established.length,
      occurrence_fingerprints: established,
    },
    withheld: {
      artifact_type: "UK_GC_FOOTBALL_OCCURRENCE_FINGERPRINT_WITHHELD",
      run_id: "uk-gc-football-01",
      derived_at: derivedAt,
      note:
        "Reconciled groups that received NO occurrence fingerprint, each with the factual reason. Present even when empty, so that the accounting can show every input group ended at exactly one outcome.",
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

  await writeJson(resolve(OUT, "occurrence-fingerprints.json"), artifacts.occurrenceFingerprints);
  await writeJson(resolve(OUT, "withheld.json"), artifacts.withheld);
  await writeJson(resolve(OUT, "summary.json"), artifacts.summary);

  const { accounting, evidence_classes: evidence, venue } = artifacts.summary;
  console.log(`reconciled groups in            : ${accounting.reconciled_groups_in}`);
  console.log(`occurrence fingerprints         : ${accounting.occurrence_fingerprints_established}`);
  console.log(`withheld                        : ${accounting.fingerprints_withheld}`);
  console.log(`event entities created by this  : ${artifacts.summary.provenance.creates_beatmapped_event_entity ? "some" : "none"}`);
  console.log(`cross-publisher corroborated    : ${evidence.CROSS_PUBLISHER_CORROBORATED}`);
  console.log(`same-publisher multi-source     : ${evidence.SAME_PUBLISHER_MULTI_SOURCE}`);
  console.log(`with governed venue             : ${venue.with_governed_venue}`);
  console.log(`without governed venue          : ${venue.without_governed_venue}`);
  console.log(`single-source ids left untouched: ${accounting.single_source_match_ids_out_of_scope}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-fingerprints.mjs")) {
  await main();
}
