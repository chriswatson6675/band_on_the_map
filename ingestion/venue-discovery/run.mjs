#!/usr/bin/env node
// VENUE-DISCOVERY-ENGINE-01 — the one manual entry point this package
// adds: `npm run discover:venues -- <area_id>` (defaults to
// barcelona-es).
//
// AREA CONFIG (ingestion/area/) -> DISCOVERY SOURCES (this area's own
// discovery_sources[], each dispatched to a collector under
// ingestion/venue-discovery/<source>/) -> RAW CANDIDATES -> NORMALISATION
// (candidate-contract.mjs + normalise.mjs) -> DEDUPLICATION (dedupe.mjs)
// -> CANDIDATE VENUE ESTATE.
//
// This is a DISCOVERY-ONLY pipeline (see docs/VENUE_DISCOVERY.md PHASE
// 9): it never creates a Venue, Source, or Observation, never runs the
// existing venue-onboarding/source-investigation machinery, and never
// touches venues/*.json, sources/*.json, or data/public/*. Its only
// output is a generated, git-ignored candidate-estate artifact under
// runtime/discovery/<area_id>/ — see PHASE 8.
//
// This script performs live HTTP acquisition (Overpass + Barcelona Open
// Data) — never used by `npm test`, which exercises every pure module
// here (query-builder, parse, category-rules, classify, dedupe,
// candidate-contract) directly against retained fixtures, never this
// file, never the network. `runDiscovery()` itself takes injectable
// fetch implementations for exactly this reason.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAreaConfig } from "../area/registry.mjs";
import { createCandidate } from "./candidate-contract.mjs";
import { classifyCandidate } from "./classify.mjs";
import { dedupeCandidates } from "./dedupe.mjs";
import { normaliseDomain, normaliseName } from "./normalise.mjs";
import { fetchOverpass } from "./overpass/client.mjs";
import { buildOverpassQuery } from "./overpass/query-builder.mjs";
import { parseOverpassResponse } from "./overpass/parse.mjs";
import { evaluateOsmTags } from "./overpass/tag-rules.mjs";
import { fetchBarcelonaOpenData } from "./barcelona-open-data/client.mjs";
import { parseBarcelonaOpenData } from "./barcelona-open-data/parse.mjs";
import { evaluateSecondaryFilters } from "./barcelona-open-data/category-rules.mjs";

const RUNTIME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../runtime/discovery");

// Sanity-check list used ONLY to annotate, in the human-readable report,
// which naturally-discovered candidates happen to be well-known
// Barcelona venues (PHASE 7's "make clear whether sources naturally
// recover recognised venues"). Never used to create, inject, or bias a
// candidate — a name on this list that discovery does NOT find simply
// does not appear in the sample below.
const KNOWN_VENUE_NAMES_FOR_SANITY_CHECK = [
  "Jamboree",
  "Sala Apolo",
  "Apolo",
  "Sidecar",
  "Harlem Jazz Club",
  "Heliogàbal",
  "Jazz Man",
  "Milano Jazz Club",
  "Balius",
  "Bodega Saltó",
  "Palau Dalmases",
  "L'Auditori",
];

function websiteFromOsmTags(tags) {
  if (typeof tags?.website === "string" && tags.website.trim() !== "") return tags.website.trim();
  if (typeof tags?.["contact:website"] === "string" && tags["contact:website"].trim() !== "") {
    return tags["contact:website"].trim();
  }
  return null;
}

/**
 * Collect + normalise + classify raw leads from ONE OSM_OVERPASS
 * discovery_sources entry into discovery Candidates. Returns
 * `{ candidates, rawRecordCount }`.
 */
async function collectOsmOverpass(area, { fetchImpl } = {}) {
  const query = buildOverpassQuery(area);
  const { body, retrievedAt } = await fetchOverpass(query, { fetchImpl });
  const leads = parseOverpassResponse(body);

  const candidates = [];
  let droppedNoName = 0;
  for (const lead of leads) {
    if (!lead.name) {
      droppedNoName += 1;
      continue;
    }
    const websiteUrl = websiteFromOsmTags(lead.tags);
    const { status, reasons } = classifyCandidate(evaluateOsmTags(lead.tags));
    candidates.push(
      createCandidate({
        area_id: area.area_id,
        name: lead.name,
        normalised_name: normaliseName(lead.name),
        country: area.country,
        country_code: area.country_code,
        city: area.city,
        address: null,
        latitude: lead.latitude,
        longitude: lead.longitude,
        website_url: websiteUrl,
        normalised_domain: normaliseDomain(websiteUrl),
        source_kind: "OSM_OVERPASS",
        source_id: "openstreetmap-overpass",
        source_record_id: lead.source_record_id,
        source_url: lead.source_url,
        source_tags: lead.tags,
        discovery_status: status,
        discovery_status_reasons: reasons,
        first_seen_at: retrievedAt,
        last_seen_at: retrievedAt,
      }),
    );
  }

  return { candidates, rawRecordCount: leads.length, droppedNoName };
}

/**
 * Collect + normalise + classify raw leads from ONE
 * BARCELONA_OPEN_DATA_ESPAIS_MUSICA_COPES discovery_sources entry into
 * discovery Candidates. Area-specific — see barcelona-open-data/client.mjs's
 * doc comment. Returns `{ candidates, rawRecordCount }`.
 */
async function collectBarcelonaOpenData(area, sourceConfig, { fetchImpl } = {}) {
  const { body, retrievedAt } = await fetchBarcelonaOpenData(sourceConfig.dataset_json_url, { fetchImpl });
  const leads = parseBarcelonaOpenData(body);
  const sourceUrl = sourceConfig.dataset_page_url ?? sourceConfig.dataset_json_url;

  const candidates = [];
  let droppedNoName = 0;
  for (const lead of leads) {
    if (!lead.name) {
      droppedNoName += 1;
      continue;
    }
    const { status, reasons } = classifyCandidate(evaluateSecondaryFilters(lead.categories));
    candidates.push(
      createCandidate({
        area_id: area.area_id,
        name: lead.name,
        normalised_name: normaliseName(lead.name),
        country: area.country,
        country_code: area.country_code,
        city: area.city,
        address: lead.address,
        latitude: lead.latitude,
        longitude: lead.longitude,
        website_url: lead.website_url,
        normalised_domain: normaliseDomain(lead.website_url),
        source_kind: "BARCELONA_OPEN_DATA_ESPAIS_MUSICA_COPES",
        source_id: "barcelona-open-data-espais-musica-copes",
        source_record_id: lead.source_record_id,
        source_url: sourceUrl,
        source_tags: { categories: lead.categories },
        discovery_status: status,
        discovery_status_reasons: reasons,
        first_seen_at: retrievedAt,
        last_seen_at: retrievedAt,
      }),
    );
  }

  return { candidates, rawRecordCount: leads.length, droppedNoName };
}

/**
 * Run the full AREA CONFIG -> ... -> CANDIDATE VENUE ESTATE pipeline for
 * one already-loaded Area config. `fetchOverpassImpl`/
 * `fetchBarcelonaOpenDataImpl` are injected fetch implementations —
 * tests always supply fixture-backed fakes here, never the network.
 * Throws on an area with an unrecognised discovery_sources[].source_kind
 * rather than silently skipping a misconfigured source.
 */
export async function runDiscovery(area, { fetchOverpassImpl, fetchBarcelonaOpenDataImpl } = {}) {
  const sourceResults = [];
  const rawCandidates = [];
  let droppedNoName = 0;

  for (const sourceConfig of area.discovery_sources ?? []) {
    let outcome;
    if (sourceConfig.source_kind === "OSM_OVERPASS") {
      outcome = await collectOsmOverpass(area, { fetchImpl: fetchOverpassImpl });
    } else if (sourceConfig.source_kind === "BARCELONA_OPEN_DATA_ESPAIS_MUSICA_COPES") {
      outcome = await collectBarcelonaOpenData(area, sourceConfig, { fetchImpl: fetchBarcelonaOpenDataImpl });
    } else {
      throw new Error(`Unknown discovery_sources.source_kind "${sourceConfig.source_kind}" for area "${area.area_id}"`);
    }

    sourceResults.push({ source_kind: sourceConfig.source_kind, raw_record_count: outcome.rawRecordCount });
    rawCandidates.push(...outcome.candidates);
    droppedNoName += outcome.droppedNoName;
  }

  const { candidates, uncertainPairs, mergedCount } = dedupeCandidates(rawCandidates);

  return {
    area_id: area.area_id,
    sourceResults,
    candidatesAfterNormalisation: rawCandidates.length,
    droppedNoName,
    candidates,
    uncertainPairs,
    mergedCount,
  };
}

function statusBreakdown(candidates) {
  const breakdown = { LIKELY_LIVE_MUSIC_VENUE: 0, POSSIBLE_LIVE_MUSIC_VENUE: 0, WEAK_CANDIDATE: 0, EXCLUDED: 0 };
  for (const candidate of candidates) breakdown[candidate.discovery_status] += 1;
  return breakdown;
}

function findRecognisedVenues(candidates) {
  const knownSlugs = KNOWN_VENUE_NAMES_FOR_SANITY_CHECK.map((name) => normaliseName(name));
  return candidates.filter((candidate) => {
    if (!candidate.normalised_name) return false;
    return knownSlugs.some((slug) => candidate.normalised_name === slug || candidate.normalised_name.includes(slug));
  });
}

/**
 * Build the PHASE 7 proof summary from one runDiscovery() result. Pure
 * function (no I/O) so it is independently testable.
 */
export function buildDiscoveryReport(result) {
  const breakdown = statusBreakdown(result.candidates);
  const recognisedVenues = findRecognisedVenues(result.candidates);
  const smallLocalCandidates = result.candidates.filter(
    (c) => c.discovery_status === "LIKELY_LIVE_MUSIC_VENUE" && !recognisedVenues.includes(c),
  );

  return {
    area_id: result.area_id,
    raw_records_by_source: result.sourceResults,
    raw_records_dropped_no_name: result.droppedNoName,
    candidates_after_normalisation: result.candidatesAfterNormalisation,
    candidates_after_deduplication: result.candidates.length,
    duplicates_merged: result.mergedCount,
    uncertain_duplicate_pairs: result.uncertainPairs.length,
    status_breakdown: breakdown,
    recognised_venues_sample: recognisedVenues.map((c) => ({ name: c.name, discovery_status: c.discovery_status })),
    small_local_candidates_sample: smallLocalCandidates.slice(0, 15).map((c) => ({ name: c.name, discovery_status: c.discovery_status })),
  };
}

function renderReportText(report) {
  const lines = [
    `# Venue discovery proof — ${report.area_id}`,
    "",
    "## Raw records by source",
    ...report.raw_records_by_source.map((s) => `- ${s.source_kind}: ${s.raw_record_count}`),
    `- dropped (no name evidence): ${report.raw_records_dropped_no_name}`,
    "",
    `## Candidates after normalisation: ${report.candidates_after_normalisation}`,
    `## Candidates after deduplication: ${report.candidates_after_deduplication}`,
    `## Duplicates merged: ${report.duplicates_merged}`,
    `## Uncertain duplicate pairs: ${report.uncertain_duplicate_pairs}`,
    "",
    "## Status breakdown",
    ...Object.entries(report.status_breakdown).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Recognised venues naturally recovered",
    ...(report.recognised_venues_sample.length > 0
      ? report.recognised_venues_sample.map((v) => `- ${v.name} (${v.discovery_status})`)
      : ["- none of the sanity-check names were found by these sources in this run"]),
    "",
    "## Sample of other LIKELY_LIVE_MUSIC_VENUE candidates",
    ...report.small_local_candidates_sample.map((v) => `- ${v.name} (${v.discovery_status})`),
  ];
  return lines.join("\n");
}

async function writeCandidateEstate(area, result, report) {
  const outDir = join(RUNTIME_DIR, area.area_id);
  await mkdir(outDir, { recursive: true });

  const artifact = {
    area_id: area.area_id,
    generated_at: new Date().toISOString(),
    candidate_count: result.candidates.length,
    candidates: result.candidates,
    uncertain_duplicate_pairs: result.uncertainPairs,
  };

  await writeFile(join(outDir, "candidates.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(join(outDir, "report.md"), `${renderReportText(report)}\n`, "utf8");
  return outDir;
}

async function main() {
  const areaId = process.argv[2] ?? "barcelona-es";
  console.log(`Running venue discovery for area "${areaId}"...`);

  const area = await loadAreaConfig(areaId);
  const result = await runDiscovery(area);
  const report = buildDiscoveryReport(result);
  const outDir = await writeCandidateEstate(area, result, report);

  console.log(renderReportText(report));
  console.log(`\nWrote candidate estate + report to ${outDir}`);

  return { area, result, report, outDir };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
