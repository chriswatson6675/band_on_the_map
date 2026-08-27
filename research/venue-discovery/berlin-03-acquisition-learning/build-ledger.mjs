import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COLLECTOR_CAPABILITY_ROUTES, TECHNICAL_MECHANISMS } from "../../../ingestion/venue-discovery/research-state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

const PROVEN_TRIAGE = new Set([
  "CURRENT_REGULAR_MUSIC_VENUE",
  "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE",
]);
const VALID_LIKELIHOOD = new Set([
  "PROVEN_CURRENT_MUSIC_VENUE",
  "LIKELY_CURRENT_MUSIC_VENUE",
]);

const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
const countBy = (records, key) => Object.fromEntries(
  [...records.reduce((counts, record) => counts.set(record[key] ?? "NONE", (counts.get(record[key] ?? "NONE") ?? 0) + 1), new Map())]
    .sort(([a], [b]) => a.localeCompare(b)),
);

const MECHANISM_ALIASES = {
  ICS: "ICS_OR_ICAL",
  PUBLIC_JSON_API: "PUBLIC_REST_JSON",
  STATIC_HTML: "LIST_TO_DETAIL_HTML",
  STATIC_OR_SERVER_RENDERED_EVENT_LIST: "LIST_TO_DETAIL_HTML",
  THIRD_PARTY_PROGRAMME_ONLY: "NO_CURRENT_PROGRAMME_FOUND",
  SOURCE_IDENTITY_UNRESOLVED: "NO_CURRENT_PROGRAMME_FOUND",
};
const FIT_ALIASES = {
  BESPOKE_COLLECTOR: "LIKELY_BESPOKE",
  NEW_REUSABLE_COLLECTOR: "NEW_REUSABLE_COLLECTOR_FAMILY",
};
function mechanism(value) {
  const normalized = MECHANISM_ALIASES[value] ?? value;
  if (!TECHNICAL_MECHANISMS.has(normalized)) throw new Error(`unknown technical mechanism: ${value}`);
  return normalized;
}
function fit(value) {
  if (value == null) return null;
  const normalized = FIT_ALIASES[value] ?? value;
  if (!COLLECTOR_CAPABILITY_ROUTES.has(normalized)) throw new Error(`unknown collector fit: ${value}`);
  return normalized;
}

function acquiredRecord(entry) {
  return {
    candidate_id: `canonical-source-${entry.id}`,
    canonical_name: entry.name,
    independent_venue: true,
    venue_likelihood: "PROVEN_CURRENT_MUSIC_VENUE",
    universe_source: "CANONICAL_BERLIN_SOURCE_REGISTRY",
    canonical_source_id: entry.id,
    official_url: entry.official_website,
    programme_url: entry.events_url,
    official_source_confidence: "HIGH",
    future_programme_state: "FUTURE_PROGRAMME_PROVEN",
    technical_mechanism: mechanism(entry.acquisition_method),
    collector_fit_before: fit(entry.berlin_collector_classification),
    collector_fit_after: fit(entry.berlin_collector_classification),
    legacy_collector_classification: entry.berlin_collector_classification,
    acquisition_result: "CANONICALLY_ACQUIRED",
    generic_capability_dependency: null,
    next_action: "NO_FURTHER_ACTION",
    ai_research_required: false,
    human_review_required: false,
    source_evidence: [entry.detailed_source_ref],
    read_only_proof: null,
    last_investigation_state: entry.monitoring_status,
  };
}

function triageRecord(record) {
  const name = record.canonical_name ?? record.reported_names[0];
  return {
    candidate_id: record.candidate_id,
    canonical_name: name,
    independent_venue: true,
    venue_likelihood: "PROVEN_CURRENT_MUSIC_VENUE",
    universe_source: "BERLIN_181_CANDIDATE_TRIAGE",
    canonical_source_id: null,
    official_url: record.official_url,
    programme_url: record.programme_url,
    official_source_confidence: record.official_site_confidence,
    future_programme_state: record.future_programme_status,
    technical_mechanism: mechanism(record.technical_mechanism),
    collector_fit_before: fit(record.collector_fit),
    collector_fit_after: fit(record.collector_fit),
    acquisition_result: "NOT_PROVEN",
    generic_capability_dependency: record.collector_fit === "GENERIC_CAPABILITY_WIDENING" ? record.technical_mechanism : null,
    next_action: record.collector_fit === "CONFIGURATION_ONLY" ? "DETERMINISTIC_CONTINUE" : "AI_RESEARCH_REQUIRED",
    ai_research_required: record.collector_fit !== "CONFIGURATION_ONLY",
    human_review_required: false,
    source_evidence: record.evidence_refs,
    read_only_proof: null,
    last_investigation_state: record.future_programme_status,
  };
}

function recoveredRecord(record) {
  const deterministic = record.best_next_resolver === "DETERMINISTIC_CODE_CAN_CONTINUE";
  const human = record.best_next_resolver === "HUMAN_JUDGEMENT_USEFUL";
  const programmeState = record.future_events_visible
    ? "FUTURE_PROGRAMME_PROVEN"
    : record.first_party_programme_url
      ? "CURRENT_VENUE_PROGRAMME_EMPTY"
      : record.apparent_acquisition_mechanism === "THIRD_PARTY_PROGRAMME_ONLY"
        ? "THIRD_PARTY_PROGRAMME_ONLY"
        : record.apparent_acquisition_mechanism === "SOCIAL_FIRST_PROGRAMME"
          ? "SOCIAL_FIRST_PROGRAMME"
          : "NEEDS_DEEPER_INVESTIGATION";
  return {
    candidate_id: record.candidate_id,
    canonical_name: record.candidate_name,
    independent_venue: true,
    venue_likelihood: record.venue_likelihood,
    universe_source: "INSUFFICIENT_EVIDENCE_SECOND_PASS",
    canonical_source_id: null,
    official_url: record.official_website_candidate,
    programme_url: record.first_party_programme_url,
    official_source_confidence: record.official_site_confidence,
    future_programme_state: programmeState,
    technical_mechanism: mechanism(record.apparent_acquisition_mechanism),
    collector_fit_before: deterministic ? "NEEDS_DEEPER_INVESTIGATION" : null,
    collector_fit_after: deterministic ? "NEEDS_DEEPER_INVESTIGATION" : null,
    acquisition_result: "NOT_PROVEN",
    generic_capability_dependency: deterministic ? "PROGRAMME_STRUCTURE_RESOLUTION" : null,
    next_action: human ? "HUMAN_REVIEW_REQUIRED" : deterministic ? "DETERMINISTIC_CONTINUE" : "AI_RESEARCH_REQUIRED",
    ai_research_required: !deterministic && !human,
    human_review_required: human,
    source_evidence: record.second_pass_evidence_refs,
    read_only_proof: null,
    last_investigation_state: record.evidence_state,
  };
}

function applyProof(record, proof) {
  if (!proof) return record;
  return {
    ...record,
    programme_url: proof.programme_url ?? record.programme_url,
    official_source_confidence: proof.official_source_confidence ?? record.official_source_confidence,
    future_programme_state: proof.future_programme_state,
    technical_mechanism: mechanism(proof.technical_mechanism),
    collector_fit_after: fit(proof.collector_fit),
    acquisition_result: proof.acquisition_result,
    generic_capability_dependency: proof.generic_capability_dependency ?? null,
    next_action: proof.next_action,
    ai_research_required: proof.next_action === "AI_RESEARCH_REQUIRED",
    human_review_required: proof.next_action === "HUMAN_REVIEW_REQUIRED",
    source_evidence: [...new Set([...record.source_evidence, ...(proof.evidence_refs ?? [])])],
    read_only_proof: proof.read_only_proof ?? null,
    last_investigation_state: proof.last_investigation_state,
  };
}

export async function buildLedger({ proofPath = null } = {}) {
  const [sources, venues, triage, review] = await Promise.all([
    readJson("sources/berlin.json"),
    readJson("venues/berlin.json"),
    readJson("research/venue-discovery/berlin-02-triage/triage.json"),
    readJson("research/venue-discovery/berlin-02-triage/insufficient-evidence-review.json"),
  ]);
  if (sources.entries.length !== venues.venues.length) throw new Error("canonical Berlin source/venue counts diverge");
  const records = [
    ...sources.entries.map(acquiredRecord),
    ...triage.candidate_ledger.filter((record) => PROVEN_TRIAGE.has(record.primary_status)).map(triageRecord),
    ...review.records.filter((record) => VALID_LIKELIHOOD.has(record.venue_likelihood) && record.counts_as_independent_universe_addition).map(recoveredRecord),
  ];
  const ids = new Set(records.map((record) => record.candidate_id));
  if (ids.size !== records.length) throw new Error("duplicate candidate identity in Berlin acquisition universe");
  const proofById = proofPath
    ? new Map((await readJson(proofPath)).results.map((proof) => [proof.candidate_id, proof]))
    : new Map();
  const overlaid = records.map((record) => applyProof(record, proofById.get(record.candidate_id)));
  const proven = overlaid.filter((record) => record.venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE");
  const likely = overlaid.filter((record) => record.venue_likelihood === "LIKELY_CURRENT_MUSIC_VENUE");
  const acquired = overlaid.filter((record) => record.acquisition_result === "CANONICALLY_ACQUIRED");
  const acquisitionProven = overlaid.filter((record) => record.acquisition_result === "ACQUISITION_PROVEN_NOT_ACTIVATED");
  if (proven.length !== 104 || likely.length !== 6 || acquired.length !== 38) {
    throw new Error(`unexpected universe counts: proven=${proven.length}, likely=${likely.length}, acquired=${acquired.length}`);
  }
  return {
    artifact_type: "BERLIN_DEEP_ACQUISITION_LEDGER",
    schema_version: "BEATMAPPED-BERLIN-ACQUISITION-LEARNING-v1",
    generated_at: new Date().toISOString(),
    prerequisite_shas: {
      generic_research_framework: "681b8cbe019b2a1a6c7e01e83f2cf2a8eba2174c",
      berlin_candidate_triage: "0465eccf717d858d18f66ff950d13b8be1b0ba16",
    },
    counts: {
      proven_independent_venues: proven.length,
      likely_additional_independent_venues: likely.length,
      proven_plus_likely_working_universe: overlaid.length,
      canonically_acquired: acquired.length,
      proven_not_canonically_acquired: proven.length - acquired.length,
      likely_not_canonically_acquired: likely.length,
      acquisition_proven_not_activated: acquisitionProven.length,
      deterministic_acquisition_capability: acquired.length + acquisitionProven.length,
      current_acquisition_coverage_percent: Number((acquired.length / proven.length * 100).toFixed(1)),
      acquisition_proven_coverage_percent: Number(((acquired.length + acquisitionProven.length) / proven.length * 100).toFixed(1)),
      official_programmes_resolved: overlaid.filter((record) => record.programme_url && ["HIGH", "MEDIUM"].includes(record.official_source_confidence)).length,
      future_programmes_proven: overlaid.filter((record) => record.future_programme_state === "FUTURE_PROGRAMME_PROVEN").length,
      ai_research_queue: overlaid.filter((record) => record.ai_research_required).length,
      human_review_queue: overlaid.filter((record) => record.human_review_required).length,
    },
    distributions: {
      technical_mechanism: countBy(overlaid, "technical_mechanism"),
      collector_fit_before: countBy(overlaid, "collector_fit_before"),
      collector_fit_after: countBy(overlaid, "collector_fit_after"),
      acquisition_result: countBy(overlaid, "acquisition_result"),
    },
    records: overlaid.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const proofArg = process.argv.find((arg) => arg.startsWith("--proof="));
  const ledger = await buildLedger({ proofPath: proofArg?.slice("--proof=".length) ?? null });
  await writeFile(resolve(HERE, "acquisition-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(ledger.counts, null, 2));
}
