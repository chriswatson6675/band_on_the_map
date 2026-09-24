#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runProviderAdapter } from "./adapters.mjs";
import { reconcileCandidates } from "./reconcile.mjs";
import { reconcileWithExistingRegistry } from "./existing-registry.mjs";
import { overpassAdapter, parseOverpassCandidates } from "./providers/overpass.mjs";
import { createCuratedDirectoryAdapter } from "./providers/curated-directory.mjs";
import { beatmappedRegistryAdapter } from "./providers/beatmapped-registry.mjs";
import { createInitialCandidateResearch } from "./research-state.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

export async function buildDiscoveryCensus(config) {
  const context = Object.freeze({ city: config.city, country_code: config.country_code, retrieved_at: config.retrieved_at });
  const osmParsed = parseOverpassCandidates(config.overpassRaw, context);
  const osm = await runProviderAdapter(overpassAdapter, config.overpassRaw, context);
  const curatedAdapter = createCuratedDirectoryAdapter(config.curatedProviderId);
  const curated = await runProviderAdapter(curatedAdapter, config.curatedInput.records, {
    ...context,
    provider_url: config.curatedProviderUrl,
  });
  const registry = await runProviderAdapter(beatmappedRegistryAdapter, {
    sources: config.sourceRegistry,
    venues: config.venueRegistry,
  }, context);
  const rawCandidates = [...osm, ...curated, ...registry];
  const groups = reconcileWithExistingRegistry(
    reconcileCandidates(rawCandidates), config.sourceRegistry, config.venueRegistry,
  ).map((group) => {
    const candidateResearch = createInitialCandidateResearch(group);
    return {
      ...group,
      candidate_research: candidateResearch,
      handoff: {
        status: "DISCOVERED_CANDIDATE",
        next_step: candidateResearch.resolution.deterministic_sub_action,
        next_action: candidateResearch.resolution.next_action,
        promotion_requires_explicit_action: true,
        governed_path: ["CANDIDATE_RESEARCH", "SOURCE_INVESTIGATION", "READY_FOR_ACTIVATION", "COLLECTOR"],
      },
    };
  });
  const countStatus = (status) => groups.filter((group) => group.existing_registry_reconciliation.status === status).length;
  const possibleDuplicateGroups = groups.filter((group) => group.possible_duplicate_refs.length > 0);
  const counts = {
    raw_by_provider: {
      OPENSTREETMAP_OVERPASS: osm.length,
      [config.curatedProviderId]: curated.length,
      BEATMAPPED_EXISTING_REGISTRY: registry.length,
    },
    raw_total: rawCandidates.length,
    deterministic_deduplicated: groups.length,
    already_acquired: countStatus("ALREADY_ACQUIRED"),
    known_source_not_active: countStatus("KNOWN_SOURCE_NOT_ACTIVE"),
    known_venue_no_source: countStatus("KNOWN_VENUE_NO_SOURCE"),
    newly_discovered: countStatus("NEW_DISCOVERY_CANDIDATE"),
    possible_existing_match_review: countStatus("POSSIBLE_EXISTING_MATCH_REVIEW"),
    possible_duplicate_groups: possibleDuplicateGroups.length,
    obviously_irrelevant_categories_excluded: osmParsed.excluded.length + (config.curatedInput.excluded?.length ?? 0),
    identities_needing_human_review: new Set([
      ...possibleDuplicateGroups.map((group) => group.reconciled_candidate_id),
      ...groups.filter((group) => group.existing_registry_reconciliation.status === "POSSIBLE_EXISTING_MATCH_REVIEW")
        .map((group) => group.reconciled_candidate_id),
    ]).size,
  };
  return {
    artifact_type: "PRACTICAL_MULTISOURCE_DISCOVERY_CENSUS",
    framework_version: "BEATMAPPED-GENERIC-MULTISOURCE-VENUE-DISCOVERY-01",
    city: config.city,
    country_code: config.country_code,
    generated_at: config.retrieved_at,
    completeness_claim: "PRACTICAL_MULTISOURCE_DISCOVERY_CENSUS_NOT_MATHEMATICALLY_COMPLETE",
    provider_evidence: config.providerEvidence,
    excluded_records: osmParsed.excluded,
    counts,
    candidates: groups,
  };
}

function renderSummary(census) {
  const c = census.counts;
  const newSamples = census.candidates
    .filter((item) => item.existing_registry_reconciliation.status === "NEW_DISCOVERY_CANDIDATE")
    .slice(0, 12).map((item) => `- ${item.reported_names[0]} (${item.providers.join(", ")})`).join("\n");
  return `# Berlin practical multisource discovery census\n\n` +
    `This is a \`${census.artifact_type}\`, not a claim to list every Berlin venue. Discovery leads are not canonical Venue facts or event facts.\n\n` +
    `## Counts\n\n` +
    `- Raw OSM/Overpass candidates: ${c.raw_by_provider.OPENSTREETMAP_OVERPASS}\n` +
    `- Raw Berlin Open Data curated-directory candidates: ${c.raw_by_provider.BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS}\n` +
    `- Existing BeatMapped registry observations: ${c.raw_by_provider.BEATMAPPED_EXISTING_REGISTRY}\n` +
    `- Deterministically deduplicated candidates: ${c.deterministic_deduplicated}\n` +
    `- Already acquired: ${c.already_acquired}\n` +
    `- Known source not active: ${c.known_source_not_active}\n` +
    `- Known venue without source: ${c.known_venue_no_source}\n` +
    `- Newly discovered: ${c.newly_discovered}\n` +
    `- Possible existing matches needing review: ${c.possible_existing_match_review}\n` +
    `- Possible duplicate groups: ${c.possible_duplicate_groups}\n` +
    `- Obviously irrelevant/malformed records excluded: ${c.obviously_irrelevant_categories_excluded}\n` +
    `- Identities needing human review: ${c.identities_needing_human_review}\n\n` +
    `## Sample new leads\n\n${newSamples || "- None"}\n\n` +
    `## Governance handoff\n\n` +
    `\`DISCOVERED_CANDIDATE → OFFICIAL_SOURCE_RESOLUTION → SOURCE_INVESTIGATION → READY_FOR_ACTIVATION → COLLECTOR\`. ` +
    `Promotion is explicit and must follow \`docs/SOURCE_INVESTIGATION_POLICY.md\`. No production registry is written by this command.\n`;
}

async function main() {
  const city = option("city", "Berlin");
  const countryCode = option("country", "DE").toUpperCase();
  if (city !== "Berlin" || countryCode !== "DE") {
    throw new Error("This retained proof fixture is Berlin-specific; generic modules accept any city/country inputs.");
  }
  const base = "research/venue-discovery/berlin-01";
  const census = await buildDiscoveryCensus({
    city, country_code: countryCode, retrieved_at: "2026-08-27T19:15:00.000Z",
    overpassRaw: await readJson(`${base}/evidence/osm-overpass-berlin.json`),
    curatedInput: await readJson(`${base}/evidence/berlin-open-data-music-relevant.json`),
    curatedProviderId: "BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS",
    curatedProviderUrl: "https://daten.berlin.de/datensaetze/standorte-institutionell-geforderter-kultureinrichtungen",
    sourceRegistry: await readJson("sources/berlin.json"),
    venueRegistry: await readJson("venues/berlin.json"),
    providerEvidence: [
      { provider: "OPENSTREETMAP_OVERPASS", evidence_ref: "osm-overpass-berlin-2026-08-27", metadata_path: `${base}/evidence/provider-evidence.json`, role: "DISCOVERY_LEAD_ONLY" },
      { provider: "BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS", evidence_ref: "berlin-open-data-cultural-institutions-2016", metadata_path: `${base}/evidence/provider-evidence.json`, role: "DISCOVERY_LEAD_ONLY" },
      { provider: "BEATMAPPED_EXISTING_REGISTRY", paths: ["sources/berlin.json", "venues/berlin.json"], role: "RECONCILIATION" },
    ],
  });
  await mkdir(resolve(ROOT, base), { recursive: true });
  await writeFile(resolve(ROOT, `${base}/census.json`), `${JSON.stringify(census, null, 2)}\n`);
  await writeFile(resolve(ROOT, `${base}/README.md`), renderSummary(census));
  console.log(JSON.stringify(census.counts, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
