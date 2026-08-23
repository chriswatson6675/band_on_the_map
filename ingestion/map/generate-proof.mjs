#!/usr/bin/env node
// Regenerates fixtures/map/lisbon-map-proof.json — DERIVED PROOF DATA for
// the browser, not a production dataset. It is built entirely from this
// repository's already-committed, retained Observation + Venue-resolution
// pipeline (the same fixtures/adapters/registries proven in
// BOTM-OBSERVATION-01/01A and BOTM-VENUE-01/01A), makes no network
// requests, and is not something to hand-edit — every field it contains
// is what buildLisbonMapProof() below would produce again right now from
// those same committed inputs. tests/map-projection.test.mjs regenerates
// this in memory and asserts it exactly matches the committed file, so a
// manual edit to the committed JSON (without a matching, honest change to
// the underlying fixtures) fails the test suite.
//
// Re-run after changing fixtures/agendalx/music-sample.json,
// fixtures/hot-clube/{events/*.ics,metadata.json}, venues/lisbon.json, or
// sources/lisbon.json:
//
//   node ingestion/map/generate-proof.mjs

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toObservations as agendalxToObservations } from "../agendalx/observation-adapter.mjs";
import { toObservations as hotClubeToObservations } from "../hot-clube/observation-adapter.mjs";
import { projectObservationsToMapMarkers } from "./projection.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/lisbon-map-proof.json");

async function loadAgendalxObservations() {
  const fixture = JSON.parse(
    await readFile(resolve(ROOT, "fixtures/agendalx/music-sample.json"), "utf8"),
  );
  return agendalxToObservations(fixture);
}

async function loadHotClubeObservations() {
  const metadata = JSON.parse(
    await readFile(resolve(ROOT, "fixtures/hot-clube/metadata.json"), "utf8"),
  );
  const eventsDir = resolve(ROOT, "fixtures/hot-clube/events");
  const names = (await readdir(eventsDir)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    entries.push({
      eventId: name.replace(/\.ics$/, ""),
      icsText: await readFile(resolve(eventsDir, name), "utf8"),
      fixturePath: `fixtures/hot-clube/events/${name}`,
    });
  }
  return hotClubeToObservations(entries, metadata);
}

/**
 * Rebuild the full derived proof object from the committed pipeline. Used
 * both by this script (to write fixtures/map/lisbon-map-proof.json) and
 * by tests/map-projection.test.mjs (to prove the committed file wasn't
 * hand-edited/drifted from it).
 */
export async function buildLisbonMapProof() {
  const [agendalxObs, hotClubeObs] = await Promise.all([
    loadAgendalxObservations(),
    loadHotClubeObservations(),
  ]);
  const observations = [...agendalxObs, ...hotClubeObs];

  const venueRegistry = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));
  const sourceRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/lisbon.json"), "utf8"));

  const markers = projectObservationsToMapMarkers(observations, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  return {
    label: "BOTM-MAP-EVENTS-01 derived proof data — NOT a production dataset",
    note:
      "Generated entirely from this repository's committed, retained Observation + Venue-resolution pipeline (see ingestion/map/generate-proof.mjs). No live network requests were made to produce it. Regenerate with: node ingestion/map/generate-proof.mjs",
    generated_from: [
      "fixtures/agendalx/music-sample.json",
      "fixtures/hot-clube/events/*.ics",
      "fixtures/hot-clube/metadata.json",
      "venues/lisbon.json",
      "sources/lisbon.json",
    ],
    markers,
  };
}

async function main() {
  const proof = await buildLisbonMapProof();
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
