#!/usr/bin/env node
// LISBON-AUTOMATIC-SUBSET-01 — the one manual entry point this package
// adds: `npm run ingest:lisbon-subset` (optionally `-- --from=YYYY-MM-DD
// --to=YYYY-MM-DD`).
//
// Orchestrates the bounded, seven-source pipeline the task brief
// specifies:
//
//   selected source registry entries
//     -> acquire first-party source records (live HTTP, this source only)
//     -> adapt each into the existing Observation model
//     -> resolve venues (ingestion/venue/resolver.mjs, unchanged approach)
//     -> apply existing bounded association logic (Hot Clube <-> Capitólio
//        only, ingestion/association/hot-clube-capitolio.mjs, unchanged)
//     -> generate grouped customer-facing display listings
//        (ingestion/map/group-associated-listings.mjs, unchanged)
//     -> project resolved listings into map markers
//     -> regenerate a Lisbon map proof output
//     -> emit a human-readable run summary
//
// This is a live-network, manually-triggered script — it makes real HTTP
// requests to the seven registry sources below, and only those sources.
// It is NOT a scheduler, NOT a database writer, and NOT run automatically
// by anything in this repository. Every acquisition failure is caught
// per-source and reported; the run continues for every other source. No
// fallback/synthetic data is ever substituted for a failed source.
//
// This script deliberately reuses every already-proven module rather
// than reimplementing it: ingestion/observation/contract.mjs,
// ingestion/venue/resolver.mjs, ingestion/association/
// hot-clube-capitolio.mjs, and ingestion/map/group-associated-listings.mjs
// are called exactly as BOTM-MULTISOURCE-LINKS-01 left them.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchText, extractLinkHeaderUrl } from "../http/fetch.mjs";

import { toObservations as agendalxToObservations } from "../agendalx/observation-adapter.mjs";

import { parseHotClubeIcsLinks } from "../hot-clube/discovery.mjs";
import { toObservation as hotClubeToObservation } from "../hot-clube/observation-adapter.mjs";

import { parseCapitolioAgendaLinks, extractCapitolioEventFacts } from "../capitolio/discovery.mjs";
import { toObservations as capitolioToObservations } from "../capitolio/observation-adapter.mjs";

import { parseVillageUndergroundDiscovery } from "../village-underground/discovery.mjs";
import { toObservation as vuToObservation } from "../village-underground/observation-adapter.mjs";

import { parseBotaDiscovery } from "../bota/discovery.mjs";
import { toObservation as botaToObservation } from "../bota/observation-adapter.mjs";

import { findEventsFeedUrl } from "../odivelas/discovery.mjs";
import { toObservations as odivelasToObservations } from "../odivelas/observation-adapter.mjs";
import { parseRSS } from "../rss/parse.mjs";

import { parseMeoArenaAgenda } from "../meo-arena/discovery.mjs";
import { toObservations as meoArenaToObservations } from "../meo-arena/observation-adapter.mjs";

import { resolveObservation } from "../venue/resolver.mjs";
import { associateHotClubeCapitolio } from "../association/hot-clube-capitolio.mjs";
import { projectObservationsToDisplayMarkers } from "../map/group-associated-listings.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/lisbon-automatic-subset-01-live-run-proof.json");

// The exact bounded seven-source subset this package is scoped to. Never
// silently expanded — see docs/SOURCE_REGISTRY.md's own §I-style gate
// convention (e.g. Soterius's OBS-103 scheduler precedent) and this
// task's explicit "Do not silently add more Lisbon sources" instruction.
export const SELECTED_SOURCE_IDS = [
  "agendalx",
  "hot-clube-de-portugal",
  "teatro-variedades-capitolio",
  "village-underground-lisboa",
  "bota-anjos",
  "cm-odivelas-agenda-cultura",
  "meo-arena",
];

function parseArgs(argv) {
  const args = { from: null, to: null };
  for (const arg of argv) {
    const fromMatch = /^--from=(.+)$/.exec(arg);
    const toMatch = /^--to=(.+)$/.exec(arg);
    if (fromMatch) args.from = fromMatch[1];
    if (toMatch) args.to = toMatch[1];
  }
  return args;
}

/**
 * An Observation with a genuinely unknown start.date is never silently
 * dropped by a date-bound filter — we cannot honestly say it is out of
 * bounds. Only an Observation with a KNOWN date outside [from, to] is
 * excluded.
 */
function withinDateBounds(observation, from, to) {
  const date = observation?.start?.date;
  if (!date) return true;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

async function loadRegistryEntry(registry, sourceId) {
  const entry = registry.entries.find((candidate) => candidate.id === sourceId);
  if (!entry) throw new Error(`"${sourceId}" is not present in sources/lisbon.json`);
  return entry;
}

// ---------------------------------------------------------------------
// Per-source collectors. Each returns { rawRecordCount, observations,
// notes[] } or throws — a throw is caught by the caller and recorded as
// a clean source-level failure, never fabricated data.
// ---------------------------------------------------------------------

async function collectAgendalx() {
  // The exact frontend-evidenced music query path already governed in
  // docs/sources/AGENDALX.md — not a new/invented parameter set.
  const url =
    "https://www.agendalx.pt/wp-json/agendalx/v1/events?search=&page=1&per_page=10&categories=musica&tags=&venues=&time=&type=event";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const records = JSON.parse(res.text);
  const observations = agendalxToObservations(
    { records, metadata: { retrieved_at: res.retrievedAt, request_url: url, content_type: res.contentType } },
    { fixturePath: null },
  );
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectHotClube() {
  const homepage = await fetchText("https://hcp.pt/", {});
  if (!homepage.ok) throw new Error(`HTTP ${homepage.status} from https://hcp.pt/`);

  const icsLinks = parseHotClubeIcsLinks(homepage.text);
  const observations = [];
  const notes = [];
  let rawRecordCount = 0;

  for (const { event_id, ics_url } of icsLinks) {
    if (!ics_url) {
      notes.push(`event ${event_id}: no ICS download link found on the homepage card`);
      continue;
    }
    rawRecordCount += 1;
    const icsRes = await fetchText(encodeURI(ics_url), {});
    if (!icsRes.ok) {
      notes.push(`event ${event_id}: ICS fetch HTTP ${icsRes.status}`);
      continue;
    }
    const fixturePath = `LIVE:hot-clube-de-portugal:${event_id}`;
    const observation = hotClubeToObservation({
      eventId: event_id,
      icsText: icsRes.text,
      fixturePath,
      metadata: {
        retrieved_at: homepage.retrievedAt,
        requests_made: [{ url: ics_url, content_type: icsRes.contentType, retained_fixture: fixturePath }],
      },
      eventLinks: {},
    });
    observations.push(observation);
  }

  return { rawRecordCount, observations, notes };
}

async function collectCapitolio() {
  const indexUrl = "https://teatrovariedades-capitolio.pt/agenda/capitolio/";
  const indexRes = await fetchText(indexUrl, {});
  if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status} from ${indexUrl}`);

  const eventUrls = parseCapitolioAgendaLinks(indexRes.text);
  const records = [];
  const notes = [];

  for (const eventUrl of eventUrls) {
    const pageRes = await fetchText(eventUrl, {});
    if (!pageRes.ok) {
      notes.push(`${eventUrl}: HTTP ${pageRes.status}`);
      continue;
    }
    const shortlink = extractLinkHeaderUrl(pageRes.linkHeader, "shortlink");
    const postIdMatch = shortlink ? /[?&]p=(\d+)/.exec(shortlink) : null;
    if (!postIdMatch) {
      notes.push(`${eventUrl}: no rel=shortlink Link header with a numeric post id — skipped, not guessed`);
      continue;
    }
    const facts = extractCapitolioEventFacts(pageRes.text);
    records.push({
      wp_shortlink_post_id: postIdMatch[1],
      url: eventUrl,
      retrieved_at: pageRes.retrievedAt,
      http_status: pageRes.status,
      content_type: pageRes.contentType,
      ...facts,
    });
  }

  const observations = capitolioToObservations({ records });
  return { rawRecordCount: eventUrls.length, observations, notes };
}

async function collectVillageUnderground() {
  const indexUrl = "https://vulisboa.com/eventos";
  const indexRes = await fetchText(indexUrl, {});
  if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status} from ${indexUrl}`);

  const discovered = parseVillageUndergroundDiscovery(indexRes.text);
  const observations = [];
  const notes = [];

  for (const { slug, event_url: eventUrl, ics_url: icsUrl } of discovered) {
    const icsRes = await fetchText(icsUrl, {});
    if (!icsRes.ok) {
      notes.push(`${slug}: ICS fetch HTTP ${icsRes.status}`);
      continue;
    }
    try {
      observations.push(
        vuToObservation({
          slug,
          eventUrl,
          icsUrl,
          icsText: icsRes.text,
          retrievedAt: icsRes.retrievedAt,
          contentType: icsRes.contentType,
          fixturePath: `LIVE:village-underground-lisboa:${slug}`,
        }),
      );
    } catch (error) {
      notes.push(`${slug}: ${error.message}`);
    }
  }

  return { rawRecordCount: discovered.length, observations, notes };
}

async function collectBota() {
  const indexUrl = "https://www.botaanjos.com/programacao";
  const indexRes = await fetchText(indexUrl, {});
  if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status} from ${indexUrl}`);

  const discovered = parseBotaDiscovery(indexRes.text);
  const observations = [];
  const notes = [];

  for (const { slug, event_url: eventUrl, ics_url: icsUrl } of discovered) {
    const icsRes = await fetchText(icsUrl, {});
    if (!icsRes.ok) {
      notes.push(`${slug}: ICS fetch HTTP ${icsRes.status}`);
      continue;
    }
    try {
      observations.push(
        botaToObservation({
          slug,
          eventUrl,
          icsUrl,
          icsText: icsRes.text,
          retrievedAt: icsRes.retrievedAt,
          contentType: icsRes.contentType,
          fixturePath: `LIVE:bota-anjos:${slug}`,
        }),
      );
    } catch (error) {
      notes.push(`${slug}: ${error.message}`);
    }
  }

  return { rawRecordCount: discovered.length, observations, notes };
}

async function collectOdivelas() {
  const directoryUrl = "https://www.cm-odivelas.pt/rss-feed";
  const directoryRes = await fetchText(directoryUrl, {});
  if (!directoryRes.ok) throw new Error(`HTTP ${directoryRes.status} from ${directoryUrl}`);

  const feedUrl = findEventsFeedUrl(directoryRes.text);
  if (!feedUrl) throw new Error('"RSS de Eventos" link not found on the RSS directory page');

  const feedRes = await fetchText(feedUrl, {});
  if (!feedRes.ok) throw new Error(`HTTP ${feedRes.status} from ${feedUrl}`);

  const { items } = parseRSS(feedRes.text);
  const observations = odivelasToObservations(items, {
    retrievedAt: feedRes.retrievedAt,
    sourceUrl: feedUrl,
    contentType: feedRes.contentType,
    fixturePath: null,
  });

  return { rawRecordCount: items.length, observations, notes: [] };
}

async function collectMeoArena() {
  const agendaUrl = "https://arena.meo.pt/agenda-completa";
  const agendaRes = await fetchText(agendaUrl, {});
  if (!agendaRes.ok) throw new Error(`HTTP ${agendaRes.status} from ${agendaUrl}`);

  const cards = parseMeoArenaAgenda(agendaRes.text);
  const observations = meoArenaToObservations(cards, {
    retrievedAt: agendaRes.retrievedAt,
    sourceUrl: agendaUrl,
    contentType: agendaRes.contentType,
    fixturePath: null,
  });

  return { rawRecordCount: cards.length, observations, notes: [] };
}

const COLLECTORS = {
  agendalx: collectAgendalx,
  "hot-clube-de-portugal": collectHotClube,
  "teatro-variedades-capitolio": collectCapitolio,
  "village-underground-lisboa": collectVillageUnderground,
  "bota-anjos": collectBota,
  "cm-odivelas-agenda-cultura": collectOdivelas,
  "meo-arena": collectMeoArena,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(await readFile(resolve(ROOT, "sources/lisbon.json"), "utf8"));
  const venueRegistry = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));

  console.log(`LISBON-AUTOMATIC-SUBSET-01 live run starting (${new Date().toISOString()})`);
  if (args.from || args.to) console.log(`  date bounds: from=${args.from ?? "(none)"} to=${args.to ?? "(none)"}`);

  const sourceResults = [];
  for (const sourceId of SELECTED_SOURCE_IDS) {
    process.stdout.write(`  acquiring ${sourceId} ... `);
    try {
      await loadRegistryEntry(registry, sourceId); // fails closed if the registry entry itself is missing
      const { rawRecordCount, observations, notes } = await COLLECTORS[sourceId]();
      console.log(`ok (${rawRecordCount} raw record(s), ${observations.length} Observation(s))`);
      sourceResults.push({
        source_id: sourceId,
        success: true,
        raw_record_count: rawRecordCount,
        observation_count: observations.length,
        observations,
        notes,
      });
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      sourceResults.push({
        source_id: sourceId,
        success: false,
        error: error.message,
        raw_record_count: 0,
        observation_count: 0,
        observations: [],
        notes: [],
      });
    }
  }

  const allObservations = sourceResults.flatMap((r) => r.observations);
  const boundedObservations =
    args.from || args.to
      ? allObservations.filter((o) => withinDateBounds(o, args.from, args.to))
      : allObservations;

  const hotClubeObs = boundedObservations.filter((o) => o.source_id === "hot-clube-de-portugal");
  const capitolioObs = boundedObservations.filter((o) => o.source_id === "teatro-variedades-capitolio");
  const associations = associateHotClubeCapitolio(hotClubeObs, capitolioObs);
  const associatedCount = associations.filter((a) => a.association_status === "ASSOCIATED").length;

  const resolutions = boundedObservations.map((observation) => ({
    observation,
    resolution: resolveObservation(observation),
  }));
  const resolvedCount = resolutions.filter((r) => r.resolution.resolution_status === "RESOLVED").length;
  const unresolvedCount = resolutions.length - resolvedCount;
  const unresolvedList = resolutions
    .filter((r) => r.resolution.resolution_status !== "RESOLVED")
    .map((r) => ({
      source_id: r.observation.source_id,
      source_record_id: r.observation.source_record_id,
      title: r.observation.title,
      venue_name: r.observation.venue_name,
      location_text: r.observation.location_text,
      resolution_method: r.resolution.resolution_method,
    }));

  const markers = projectObservationsToDisplayMarkers(boundedObservations, {
    venues: venueRegistry.venues,
    sourceRegistry: registry.entries,
    associations,
  });
  const displayListingCount = markers.reduce((sum, m) => sum + m.display_listings.length, 0);

  const proof = {
    label: "LISBON-AUTOMATIC-SUBSET-01 live run proof — a point-in-time snapshot, NOT deterministic fixture data",
    note: "Generated by ingestion/lisbon-subset/run.mjs from real, live HTTP acquisition against the seven bounded sources. Re-running this command later will legitimately produce different counts as each source's own real-world listings change — see fixtures/map/lisbon-automatic-subset-01-proof.json for the deterministic, fixture-backed regeneration proof instead.",
    run_at: new Date().toISOString(),
    date_bounds: { from: args.from, to: args.to },
    selected_source_ids: SELECTED_SOURCE_IDS,
    // Omit full Observation bodies from the summary — just the counts/notes.
    source_results: sourceResults.map((r) => ({
      source_id: r.source_id,
      success: r.success,
      raw_record_count: r.raw_record_count,
      observation_count: r.observation_count,
      notes: r.notes,
      ...(r.error !== undefined ? { error: r.error } : {}),
    })),
    raw_observation_total: boundedObservations.length,
    resolved_venue_count: resolvedCount,
    unresolved_venue_count: unresolvedCount,
    unresolved: unresolvedList,
    association_group_count: associatedCount,
    display_listing_count: displayListingCount,
    map_marker_count: markers.length,
    markers,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

  console.log("\n=== LISBON-AUTOMATIC-SUBSET-01 run summary ===");
  for (const result of sourceResults) {
    const status = result.success ? "OK" : "FAILED";
    console.log(
      `  [${status}] ${result.source_id}: raw=${result.raw_record_count} observations=${result.observation_count}${result.error ? ` error="${result.error}"` : ""}`,
    );
    for (const note of result.notes ?? []) console.log(`      note: ${note}`);
  }
  console.log(`  Observation total (bounded): ${boundedObservations.length}`);
  console.log(`  Resolved venues: ${resolvedCount} / Unresolved: ${unresolvedCount}`);
  console.log(`  Hot Clube <-> Capitólio associated groups: ${associatedCount}`);
  console.log(`  Display listings: ${displayListingCount}`);
  console.log(`  Map markers: ${markers.length}`);
  console.log(`  Wrote ${OUTPUT_PATH}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
