#!/usr/bin/env node
// Regenerates fixtures/map/lisbon-automatic-subset-01-proof.json —
// DERIVED PROOF DATA for LISBON-AUTOMATIC-SUBSET-01, built entirely from
// this repository's already-committed, retained fixtures for all seven
// bounded sources (the original three from BOTM-MULTISOURCE-LINKS-01,
// plus the four new ones added here), makes no network requests, and is
// not something to hand-edit — every field it contains is what
// buildLisbonAutomaticSubsetProof() below would produce again right now
// from those same committed inputs.
//
// This is deliberately a SEPARATE output file from
// fixtures/map/lisbon-map-proof.json (ingestion/map/generate-proof.mjs),
// not a replacement of it: that file's own generator, its 19/8/1/6/11-vs-6
// invariants, and its own tests (tests/map-projection.test.mjs) are the
// already-proven BOTM-MULTISOURCE-LINKS-01 three-source proof and this
// task's brief is explicit that they must not regress. This module reuses
// every one of the same underlying pipeline pieces
// (ingestion/venue/resolver.mjs, ingestion/association/
// hot-clube-capitolio.mjs, ingestion/map/group-associated-listings.mjs)
// completely unchanged; it only adds four more sources' worth of
// fixture-loading before calling into that same pipeline.
//
// For the live, real-network equivalent of this same pipeline, see
// ingestion/lisbon-subset/run.mjs (`npm run ingest:lisbon-subset`), which
// writes its own separate, explicitly-labelled point-in-time snapshot
// (fixtures/map/lisbon-automatic-subset-01-live-run-proof.json) rather
// than this deterministic, fixture-backed file.
//
// Re-run after changing any of this file's own source fixtures listed in
// `generated_from` below:
//
//   node ingestion/lisbon-subset/generate-proof.mjs

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { toObservations as agendalxToObservations } from "../agendalx/observation-adapter.mjs";
import { toObservations as hotClubeToObservations } from "../hot-clube/observation-adapter.mjs";
import { toObservations as capitolioToObservations } from "../capitolio/observation-adapter.mjs";
import { toObservations as vuToObservations } from "../village-underground/observation-adapter.mjs";
import { toObservations as botaToObservations } from "../bota/observation-adapter.mjs";
import { toObservations as odivelasToObservations } from "../odivelas/observation-adapter.mjs";
import { toObservations as meoArenaToObservations } from "../meo-arena/observation-adapter.mjs";

import { associateHotClubeCapitolio } from "../association/hot-clube-capitolio.mjs";
import { projectObservationsToDisplayMarkers } from "../map/group-associated-listings.mjs";
import { parseRSS } from "../rss/parse.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/lisbon-automatic-subset-01-proof.json");

async function loadAgendalxObservations() {
  const fixture = JSON.parse(await readFile(resolve(ROOT, "fixtures/agendalx/music-sample.json"), "utf8"));
  return agendalxToObservations(fixture);
}

async function loadHotClubeObservations() {
  const metadata = JSON.parse(await readFile(resolve(ROOT, "fixtures/hot-clube/metadata.json"), "utf8"));
  const discovery = JSON.parse(
    await readFile(resolve(ROOT, "fixtures/hot-clube/discovery/homepage-event-links.json"), "utf8"),
  );
  const eventLinks = discovery?.permalink_verification?.safe_event_urls ?? {};
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
  return hotClubeToObservations(entries, metadata, eventLinks);
}

async function loadCapitolioObservations() {
  const fixture = JSON.parse(await readFile(resolve(ROOT, "fixtures/capitolio/events.json"), "utf8"));
  return capitolioToObservations(fixture);
}

async function loadIcsDirObservations(dir, adapterToObservations) {
  const metadata = JSON.parse(await readFile(resolve(ROOT, dir, "metadata.json"), "utf8"));
  const eventsDir = resolve(ROOT, dir, "events");
  const names = (await readdir(eventsDir)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    const slug = name.replace(/\.ics$/, "");
    const request = metadata.requests_made.find((r) => r.slug === slug);
    entries.push({
      slug,
      eventUrl: request?.url?.replace(/\?format=ical$/, "") ?? null,
      icsUrl: request?.url ?? null,
      icsText: await readFile(resolve(eventsDir, name), "utf8"),
      fixturePath: `${dir}/events/${name}`,
    });
  }
  return adapterToObservations(entries, { retrievedAt: metadata.retrieved_at, contentType: "text/calendar" });
}

async function loadOdivelasObservations() {
  const excerpt = await readFile(resolve(ROOT, "fixtures/odivelas/rss-de-eventos-excerpt.rss"), "utf8");
  const { items } = parseRSS(excerpt);
  return odivelasToObservations(items, {
    retrievedAt: "2026-08-24T00:00:00Z",
    sourceUrl: "https://www.cm-odivelas.pt/pages/322.rss",
    contentType: "application/rss+xml; charset=utf-8",
    fixturePath: "fixtures/odivelas/rss-de-eventos-excerpt.rss",
  });
}

async function loadMeoArenaObservations() {
  const excerpt = await readFile(resolve(ROOT, "fixtures/meo-arena/agenda-completa-excerpt.html"), "utf8");
  const { parseMeoArenaAgenda } = await import("../meo-arena/discovery.mjs");
  const cards = parseMeoArenaAgenda(excerpt);
  return meoArenaToObservations(cards, {
    retrievedAt: "2026-08-24T00:00:00Z",
    sourceUrl: "https://arena.meo.pt/agenda-completa",
    contentType: "text/html; charset=UTF-8",
    fixturePath: "fixtures/meo-arena/agenda-completa-excerpt.html",
  });
}

/**
 * Rebuild the full derived proof object from the committed, seven-source
 * fixture set. Used both by this script (to write
 * fixtures/map/lisbon-automatic-subset-01-proof.json) and by
 * tests/lisbon-subset-proof.test.mjs (to prove the committed file has not
 * hand-edited/drifted from it).
 */
export async function buildLisbonAutomaticSubsetProof() {
  const [agendalxObs, hotClubeObs, capitolioObs, vuObs, botaObs, odivelasObs, meoArenaObs] = await Promise.all([
    loadAgendalxObservations(),
    loadHotClubeObservations(),
    loadCapitolioObservations(),
    loadIcsDirObservations("fixtures/village-underground", vuToObservations),
    loadIcsDirObservations("fixtures/bota", botaToObservations),
    loadOdivelasObservations(),
    loadMeoArenaObservations(),
  ]);

  const observations = [
    ...agendalxObs,
    ...hotClubeObs,
    ...capitolioObs,
    ...vuObs,
    ...botaObs,
    ...odivelasObs,
    ...meoArenaObs,
  ];
  const associations = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  const venueRegistry = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));
  const sourceRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/lisbon.json"), "utf8"));

  const markers = projectObservationsToDisplayMarkers(observations, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });

  return {
    label: "LISBON-AUTOMATIC-SUBSET-01 derived proof data — NOT a production dataset",
    note:
      "Generated entirely from this repository's committed, retained fixtures for all seven bounded sources (see ingestion/lisbon-subset/generate-proof.mjs). No live network requests were made to produce it. Regenerate with: node ingestion/lisbon-subset/generate-proof.mjs. For a live-network snapshot of the same pipeline, see npm run ingest:lisbon-subset instead.",
    generated_from: [
      "fixtures/agendalx/music-sample.json",
      "fixtures/hot-clube/events/*.ics",
      "fixtures/hot-clube/metadata.json",
      "fixtures/hot-clube/discovery/homepage-event-links.json",
      "fixtures/capitolio/events.json",
      "fixtures/village-underground/events/*.ics",
      "fixtures/village-underground/metadata.json",
      "fixtures/bota/events/*.ics",
      "fixtures/bota/metadata.json",
      "fixtures/odivelas/rss-de-eventos-excerpt.rss",
      "fixtures/meo-arena/agenda-completa-excerpt.html",
      "venues/lisbon.json",
      "sources/lisbon.json",
    ],
    total_underlying_observations: observations.length,
    per_source_observation_counts: {
      agendalx: agendalxObs.length,
      "hot-clube-de-portugal": hotClubeObs.length,
      "teatro-variedades-capitolio": capitolioObs.length,
      "village-underground-lisboa": vuObs.length,
      "bota-anjos": botaObs.length,
      "cm-odivelas-agenda-cultura": odivelasObs.length,
      "meo-arena": meoArenaObs.length,
    },
    associated_pair_count: associations.filter((a) => a.association_status === "ASSOCIATED").length,
    markers,
  };
}

async function main() {
  const proof = await buildLisbonAutomaticSubsetProof();
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
