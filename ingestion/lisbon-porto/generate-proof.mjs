#!/usr/bin/env node
// Regenerates fixtures/map/lisbon-porto-overnight-coverage-01-proof.json —
// DERIVED PROOF DATA for LISBON-PORTO-OVERNIGHT-COVERAGE-01, built
// entirely from this repository's already-committed, retained fixtures
// for the seven bounded Lisbon sources (unchanged from
// LISBON-AUTOMATIC-SUBSET-01 — see ingestion/lisbon-subset/generate-proof.mjs,
// which this module reuses rather than reimplements) plus the two new
// Porto sources proven tonight (casa-da-musica, teatro-municipal-do-porto).
// Makes no network requests. Not something to hand-edit — every field it
// contains is what buildLisbonPortoOvernightCoverageProof() below would
// produce again right now from those same committed inputs.
// tests/lisbon-porto-coverage-proof.test.mjs regenerates this in memory
// and asserts it exactly matches the committed file.
//
// This is deliberately a SEPARATE output file from both
// fixtures/map/lisbon-map-proof.json and
// fixtures/map/lisbon-automatic-subset-01-proof.json — neither of those
// generators or their own committed outputs/invariants are touched by
// this module (see docs/LISBON_PORTO_OVERNIGHT_COVERAGE_01.md).
//
// For the live, real-network equivalent of this same pipeline, see
// ingestion/lisbon-porto/run.mjs (`npm run ingest:lisbon-porto`).
//
// Re-run after changing any of this file's own source fixtures listed in
// `generated_from` below:
//
//   node ingestion/lisbon-porto/generate-proof.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLisbonAutomaticSubsetProof } from "../lisbon-subset/generate-proof.mjs";

import { parseCasaDaMusicaAgenda } from "../casa-da-musica/discovery.mjs";
import { toObservations as casaDaMusicaToObservations } from "../casa-da-musica/observation-adapter.mjs";
import { parseTeatroMunicipalPortoAgenda } from "../teatro-municipal-porto/discovery.mjs";
import { toObservations as teatroMunicipalPortoToObservations } from "../teatro-municipal-porto/observation-adapter.mjs";

import { projectObservationsToDisplayMarkers } from "../map/group-associated-listings.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/lisbon-porto-overnight-coverage-01-proof.json");

const DATE_BOUNDS = { from: "2026-08-24", to: "2026-12-31" };

function withinDateBounds(observation, from, to) {
  const date = observation?.start?.date;
  if (!date) return true; // never drop an Observation with a genuinely unknown date
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

async function loadCasaDaMusicaObservations() {
  const html = await readFile(resolve(ROOT, "fixtures/casa-da-musica/agenda-page-1-excerpt.html"), "utf8");
  const records = parseCasaDaMusicaAgenda(html);
  return casaDaMusicaToObservations(records, {
    retrievedAt: "2026-08-24T01:34:47.000Z",
    sourceUrl: "https://casadamusica.com/agenda/",
    contentType: "text/html; charset=UTF-8",
    fixturePath: "fixtures/casa-da-musica/agenda-page-1-excerpt.html",
  });
}

async function loadTeatroMunicipalPortoObservations() {
  const html = await readFile(
    resolve(ROOT, "fixtures/teatro-municipal-porto/programa-musica-setembro-excerpt.html"),
    "utf8",
  );
  const records = parseTeatroMunicipalPortoAgenda(html);
  return teatroMunicipalPortoToObservations(records, {
    retrievedAt: "2026-08-24T01:33:47.000Z",
    sourceUrl: "https://www.teatromunicipaldoporto.pt/pt/programa/?categoria=musica",
    contentType: "text/html; charset=UTF-8",
    fixturePath: "fixtures/teatro-municipal-porto/programa-musica-setembro-excerpt.html",
  });
}

/**
 * Rebuild the full derived Lisbon+Porto proof object from the committed
 * fixture set. Used both by this script (to write
 * fixtures/map/lisbon-porto-overnight-coverage-01-proof.json) and by
 * tests/lisbon-porto-coverage-proof.test.mjs.
 */
export async function buildLisbonPortoOvernightCoverageProof() {
  const lisbonSubset = await buildLisbonAutomaticSubsetProof(); // unchanged, reused wholesale

  const [casaDaMusicaObs, teatroMunicipalPortoObs] = await Promise.all([
    loadCasaDaMusicaObservations(),
    loadTeatroMunicipalPortoObservations(),
  ]);

  const portoObservations = [...casaDaMusicaObs, ...teatroMunicipalPortoObs];
  const portoWithinBounds = portoObservations.filter((o) => withinDateBounds(o, DATE_BOUNDS.from, DATE_BOUNDS.to));

  const venueRegistryLisbon = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));
  const venueRegistryPorto = JSON.parse(await readFile(resolve(ROOT, "venues/porto.json"), "utf8"));
  const sourceRegistryLisbon = JSON.parse(await readFile(resolve(ROOT, "sources/lisbon.json"), "utf8"));
  const sourceRegistryPorto = JSON.parse(await readFile(resolve(ROOT, "sources/porto.json"), "utf8"));

  const combinedVenues = [...venueRegistryLisbon.venues, ...venueRegistryPorto.venues];
  const combinedSourceRegistry = [...sourceRegistryLisbon.entries, ...sourceRegistryPorto.entries];

  const portoMarkers = projectObservationsToDisplayMarkers(portoWithinBounds, {
    venues: combinedVenues,
    sourceRegistry: combinedSourceRegistry,
    associations: [], // no cross-source association proven for Porto tonight
  });

  const portoDisplayListingCount = portoMarkers.reduce((sum, m) => sum + m.display_listings.length, 0);

  return {
    label: "LISBON-PORTO-OVERNIGHT-COVERAGE-01 derived proof data — NOT a production dataset",
    note:
      "Generated entirely from this repository's committed, retained fixtures: the unchanged seven-source LISBON-AUTOMATIC-SUBSET-01 fixture set (embedded below as lisbon_subset, reused wholesale via ingestion/lisbon-subset/generate-proof.mjs) plus two new Porto sources proven under LISBON-PORTO-OVERNIGHT-COVERAGE-01 (casa-da-musica, teatro-municipal-do-porto). No live network requests were made to produce it. Regenerate with: node ingestion/lisbon-porto/generate-proof.mjs. For a live-network snapshot of the combined pipeline, see npm run ingest:lisbon-porto instead.",
    date_bounds: DATE_BOUNDS,
    generated_from: [
      "(all fixtures listed in lisbon_subset.generated_from, unchanged)",
      "fixtures/casa-da-musica/agenda-page-1-excerpt.html",
      "fixtures/casa-da-musica/metadata.json",
      "fixtures/teatro-municipal-porto/programa-musica-setembro-excerpt.html",
      "fixtures/teatro-municipal-porto/metadata.json",
      "venues/porto.json",
      "sources/porto.json",
    ],
    lisbon_subset: lisbonSubset,
    porto: {
      raw_observation_total: portoObservations.length,
      observations_within_date_bounds: portoWithinBounds.length,
      per_source_observation_counts: {
        "casa-da-musica": casaDaMusicaObs.length,
        "teatro-municipal-do-porto": teatroMunicipalPortoObs.length,
      },
      display_listing_count: portoDisplayListingCount,
      map_marker_count: portoMarkers.length,
      markers: portoMarkers,
    },
    combined: {
      raw_observation_total: lisbonSubset.total_underlying_observations + portoObservations.length,
      observations_within_date_bounds_note:
        "Lisbon subset counts are the fixture-backed LISBON-AUTOMATIC-SUBSET-01 totals (that generator does not itself apply this proof's 2026-08-24..2026-12-31 date bounds); Porto's own within-bounds count is reported separately above. See docs/LISBON_PORTO_OVERNIGHT_COVERAGE_01.md for the combined, bounded live-run figures instead.",
      map_marker_count: lisbonSubset.markers.length + portoMarkers.length,
    },
  };
}

async function main() {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
