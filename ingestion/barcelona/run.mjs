#!/usr/bin/env node
// BARCELONA-30-VENUE-POPULATION-01 — the one manual entry point this
// package adds: `npm run ingest:barcelona`.
//
// Orchestrates Barcelona's own bounded, 15-source pipeline, mirroring
// ingestion/lisbon-subset/run.mjs's exact pattern (never touching it,
// or ingestion/lisbon-porto/run.mjs, or the unattended runner — Barcelona
// is a wholly separate, parallel entry point):
//
//   selected sources/barcelona.json registry entries
//     -> acquire first-party source records (live HTTP, these 15
//        sources only — 3 reusable collector families
//        [ingestion/events-calendar-api/, ingestion/json-ld/,
//        ingestion/fourvenues/] plus 5 small bespoke collectors)
//     -> adapt each into the existing Observation model
//     -> resolve venues (ingestion/venue/resolver.mjs, unchanged;
//        every Barcelona source resolves via the DATA-DRIVEN table,
//        venues/source-venue-mappings.json — no new hardcoded resolver
//        function was added)
//     -> project resolved listings into map markers
//        (ingestion/map/publication.mjs's buildSpainMarkers())
//     -> regenerate a Barcelona live-run proof output
//     -> emit a human-readable per-source run summary
//
// This is a live-network, manually-triggered script — real HTTP
// requests to the 15 registry sources below, and only those sources.
// Every acquisition failure is caught per-source and reported; the run
// continues for every other source. No fallback/synthetic data is ever
// substituted for a failed source (matching ingestion/lisbon-porto/
// run.mjs's acquireAll() isolation semantics exactly).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchText } from "../http/fetch.mjs";

import { fetchAllEvents } from "../events-calendar-api/fetch-all.mjs";
import { toObservations as eventsCalendarToObservations } from "../events-calendar-api/observation-adapter.mjs";
import { filterByronMusicRecords } from "../byron/filter.mjs";

import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { toObservations as jsonLdToObservations, toObservation as jsonLdToObservation } from "../json-ld/observation-adapter.mjs";

import { fetchFourvenuesEvents } from "../fourvenues/fetch.mjs";
import { toObservations as fourvenuesToObservations } from "../fourvenues/observation-adapter.mjs";

import { parseParalLel62Events } from "../paral-lel-62/discovery.mjs";
import { toObservations as paralLel62ToObservations } from "../paral-lel-62/observation-adapter.mjs";

import { parseCityHallEvents } from "../city-hall-barcelona/discovery.mjs";
import { toObservations as cityHallToObservations } from "../city-hall-barcelona/observation-adapter.mjs";

import { fetchLaPalomaMonth } from "../la-paloma/client.mjs";
import { parseLaPalomaEvents } from "../la-paloma/discovery.mjs";
import { toObservations as laPalomaToObservations } from "../la-paloma/observation-adapter.mjs";

import { parseSalaApoloScheduleLinks } from "../sala-apolo/discovery.mjs";

import { parseSantJordiListingLinks, parseSantJordiEventPage } from "../sant-jordi-club/discovery.mjs";
import { toObservations as santJordiToObservations } from "../sant-jordi-club/observation-adapter.mjs";

import { resolveObservation } from "../venue/resolver.mjs";
import { buildSpainMarkers } from "../map/publication.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/barcelona-30-venue-population-01-live-run-proof.json");

export const BARCELONA_SOURCE_IDS = [
  "jamboree-barcelona",
  "robadors-23-barcelona",
  "almo2bar-barcelona",
  "espai-salvadiscos-barcelona",
  "byron-barcelona",
  "moog-barcelona",
  "harlem-jazz-club-barcelona",
  "antilla-bcn-barcelona",
  "opium-barcelona",
  "ku-barcelona",
  "paral-lel-62-barcelona",
  "city-hall-barcelona",
  "la-paloma-barcelona",
  "sala-apolo-barcelona",
  "sant-jordi-club-barcelona",
];

async function loadRegistryEntry(entries, sourceId) {
  const entry = entries.find((candidate) => candidate.id === sourceId);
  if (!entry) throw new Error(`"${sourceId}" is not present in sources/barcelona.json`);
  return entry;
}

// ---------------------------------------------------------------------
// Tier 1 — ingestion/events-calendar-api/ (The Events Calendar WordPress
// plugin REST API), reused completely unchanged. perPage/maxPages are
// each set comfortably above the real observed count for that source
// (see each source's own research/source-investigations/ record),
// never tuned to exactly match it.
// ---------------------------------------------------------------------

async function collectEventsCalendarSource(config, { filterRecords } = {}) {
  const result = await fetchAllEvents(config);
  if (!result.ok && result.pagesFetched <= 1) {
    const firstError = result.errors[0];
    throw new Error(firstError ? `${firstError.message} (page ${firstError.page}, ${firstError.url})` : "Events Calendar API request failed");
  }
  const notes = result.errors.map((err) => `page ${err.page} (${err.url}): ${err.message} — stopping pagination`);
  if (result.truncated) notes.push(`stopped after ${result.pagesFetched} page(s) (configured maxPages=${config.maxPages} bound); more pages may exist`);

  const records = typeof filterRecords === "function" ? filterRecords(result.records) : result.records;
  const observations = eventsCalendarToObservations(records, config, {
    retrievedAt: new Date().toISOString(),
    sourceUrl: `${config.baseUrl}${config.restPath ?? "/wp-json/tribe/events/v1/events/"}`,
    contentType: "application/json",
    fixturePath: null,
  });
  return { rawRecordCount: result.records.length, observations, notes };
}

const JAMBOREE_CONFIG = { source_id: "jamboree-barcelona", baseUrl: "https://jamboreejazz.com", perPage: 50, maxPages: 20 };
const ROBADORS_23_CONFIG = { source_id: "robadors-23-barcelona", baseUrl: "https://23robadors.com", perPage: 50, maxPages: 10 };
const ALMO2BAR_CONFIG = { source_id: "almo2bar-barcelona", baseUrl: "https://grupalmodobar.com", perPage: 50, maxPages: 5 };
const SALVADISCOS_CONFIG = { source_id: "espai-salvadiscos-barcelona", baseUrl: "https://www.salvadiscos.com", perPage: 50, maxPages: 5 };
const BYRON_CONFIG = { source_id: "byron-barcelona", baseUrl: "https://www.llibreriabyron.com", perPage: 50, maxPages: 5 };

async function collectJamboree() {
  return collectEventsCalendarSource(JAMBOREE_CONFIG);
}
async function collectRobadors23() {
  return collectEventsCalendarSource(ROBADORS_23_CONFIG);
}
async function collectAlmo2bar() {
  return collectEventsCalendarSource(ALMO2BAR_CONFIG);
}
async function collectSalvadiscos() {
  return collectEventsCalendarSource(SALVADISCOS_CONFIG);
}
async function collectByron() {
  // Mixed literary/musical programme, no category taxonomy exposed —
  // see ingestion/byron/filter.mjs's own doc comment.
  return collectEventsCalendarSource(BYRON_CONFIG, { filterRecords: filterByronMusicRecords });
}

// ---------------------------------------------------------------------
// Tier 2 — ingestion/json-ld/ (schema.org Event/MusicEvent), reused
// completely unchanged.
// ---------------------------------------------------------------------

function lastPathSegment(url) {
  const trimmed = (url ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

async function collectMoog() {
  const url = "https://moogbarcelona.com/agenda/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const nodes = extractEventNodes(res.text);
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => lastPathSegment(n.url) }));
  const observations = jsonLdToObservations(records, { source_id: "moog-barcelona" }, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectHarlemJazzClub() {
  const url = "https://www.harlemjazzclub.es/en/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const nodes = extractEventNodes(res.text); // malformed blocks are skipped, not thrown, by default
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => lastPathSegment(n.url) }));
  const observations = jsonLdToObservations(records, { source_id: "harlem-jazz-club-barcelona" }, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: records.length, observations, notes: [] };
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function collectAntillaBcn() {
  const url = "https://antillasalsa.com/en/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const nodes = extractEventNodes(res.text);
  // This source's own `url` field is a shared third-party organizer page
  // (identical across every item) — never usable as a per-event stable
  // id. Falls back to a deterministic slug of name+startDate instead,
  // the best available stable-enough identity this source offers (see
  // research/source-investigations/antilla-bcn-barcelona-01/).
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => `${slugify(n.name)}-${slugify(n.startDate)}` }));
  const observations = jsonLdToObservations(records, { source_id: "antilla-bcn-barcelona" }, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectSalaApolo() {
  const scheduleUrl = "https://www.sala-apolo.com/en/schedule";
  const scheduleRes = await fetchText(scheduleUrl, {});
  if (!scheduleRes.ok) throw new Error(`HTTP ${scheduleRes.status} from ${scheduleUrl}`);
  const eventUrls = parseSalaApoloScheduleLinks(scheduleRes.text);

  const observations = [];
  const notes = [];
  for (const eventUrl of eventUrls) {
    const pageRes = await fetchText(eventUrl, {});
    if (!pageRes.ok) {
      notes.push(`${eventUrl}: HTTP ${pageRes.status}`);
      continue;
    }
    const nodes = extractEventNodes(pageRes.text);
    if (nodes.length === 0) {
      notes.push(`${eventUrl}: no Event/MusicEvent JSON-LD found`);
      continue;
    }
    const record = normaliseJsonLdEvent(nodes[0], { deriveId: () => lastPathSegment(eventUrl) });
    observations.push(jsonLdToObservation(record, { source_id: "sala-apolo-barcelona" }, { retrievedAt: pageRes.retrievedAt, sourceUrl: eventUrl }));
  }
  notes.push(`schedule page shows a bounded near-term window (${eventUrls.length} links) — see research/source-investigations/sala-apolo-barcelona-01/ for this documented limitation`);
  return { rawRecordCount: eventUrls.length, observations, notes };
}

// ---------------------------------------------------------------------
// Tier 3 — ingestion/fourvenues/, reused completely unchanged. An
// explicit ~2-year forward window is always passed (see
// research/source-investigations/opium-barcelona-01/: the platform's own
// default window returned far fewer records than an explicit wide one).
// ---------------------------------------------------------------------

function twoYearWindow(now = new Date()) {
  const startUnix = Math.floor(now.getTime() / 1000);
  const endUnix = Math.floor(new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()).getTime() / 1000);
  return { startUnix, endUnix };
}

async function collectFourvenuesSource(slug, sourceId) {
  const { startUnix, endUnix } = twoYearWindow();
  const result = await fetchFourvenuesEvents({ slug, startUnix, endUnix });
  const observations = fourvenuesToObservations(result.records, { source_id: sourceId }, { retrievedAt: result.retrievedAt, sourceUrl: result.sourceUrl });
  return { rawRecordCount: result.records.length, observations, notes: [] };
}

async function collectOpiumBarcelona() {
  return collectFourvenuesSource("opium-barcelona", "opium-barcelona");
}
async function collectKuBarcelona() {
  return collectFourvenuesSource("ku-barcelona", "ku-barcelona");
}

// ---------------------------------------------------------------------
// Tier 4 — bespoke collectors, one per venue.
// ---------------------------------------------------------------------

async function collectParalLel62() {
  const url = "https://paral-lel62.cat/wp-json/v1/calendar-events-futurs";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = parseParalLel62Events(res.text);
  const observations = paralLel62ToObservations(records, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectCityHallBarcelona() {
  const url = "https://www.cityhallbarcelona.com/event-list";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = parseCityHallEvents(res.text);
  const observations = cityHallToObservations(records, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: records.length, observations, notes: [] };
}

// Considerate-client bound on La Paloma's per-month querying — a fixed,
// generous forward horizon, never followed unboundedly.
const LA_PALOMA_MONTHS_AHEAD = 14;

async function collectLaPaloma() {
  const now = new Date();
  const byId = new Map();
  const notes = [];
  let rawRecordCount = 0;
  let retrievedAt = null;

  for (let offset = 0; offset < LA_PALOMA_MONTHS_AHEAD; offset++) {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const month = target.getMonth() + 1;
    const year = target.getFullYear();
    let monthRes;
    try {
      monthRes = await fetchLaPalomaMonth(month, year);
    } catch (error) {
      notes.push(`${month}/${year}: ${error.message}`);
      continue;
    }
    retrievedAt = monthRes.retrievedAt;
    const records = parseLaPalomaEvents(monthRes.text);
    rawRecordCount += records.length;
    for (const record of records) {
      if (record.source_record_id && !byId.has(record.source_record_id)) byId.set(record.source_record_id, record);
    }
  }

  const observations = laPalomaToObservations([...byId.values()], { retrievedAt, sourceUrl: "https://lapaloma.com/wp-admin/admin-ajax.php" });
  return { rawRecordCount, observations, notes };
}

async function collectSantJordiClub() {
  const listingUrl = "https://palausantjordi.barcelona/en/events";
  const listingRes = await fetchText(listingUrl, {});
  if (!listingRes.ok) throw new Error(`HTTP ${listingRes.status} from ${listingUrl}`);
  const candidates = parseSantJordiListingLinks(listingRes.text);

  const records = [];
  const notes = [];
  for (const { slug, url } of candidates) {
    const pageRes = await fetchText(url, {});
    if (!pageRes.ok) {
      notes.push(`${url}: HTTP ${pageRes.status}`);
      continue;
    }
    const record = parseSantJordiEventPage(pageRes.text, { slug, url });
    if (record) records.push(record);
  }
  notes.push(`${candidates.length} candidate link(s) crawled from the shared Anella Olímpica listing; ${records.length} discriminated to Sant Jordi Club specifically`);

  const observations = santJordiToObservations(records, { retrievedAt: listingRes.retrievedAt, sourceUrl: listingUrl });
  return { rawRecordCount: candidates.length, observations, notes };
}

const COLLECTORS = {
  "jamboree-barcelona": collectJamboree,
  "robadors-23-barcelona": collectRobadors23,
  "almo2bar-barcelona": collectAlmo2bar,
  "espai-salvadiscos-barcelona": collectSalvadiscos,
  "byron-barcelona": collectByron,
  "moog-barcelona": collectMoog,
  "harlem-jazz-club-barcelona": collectHarlemJazzClub,
  "antilla-bcn-barcelona": collectAntillaBcn,
  "opium-barcelona": collectOpiumBarcelona,
  "ku-barcelona": collectKuBarcelona,
  "paral-lel-62-barcelona": collectParalLel62,
  "city-hall-barcelona": collectCityHallBarcelona,
  "la-paloma-barcelona": collectLaPaloma,
  "sala-apolo-barcelona": collectSalaApolo,
  "sant-jordi-club-barcelona": collectSantJordiClub,
};

async function acquireAll(sourceIds, registryEntries) {
  const results = [];
  for (const sourceId of sourceIds) {
    process.stdout.write(`  acquiring ${sourceId} ... `);
    try {
      await loadRegistryEntry(registryEntries, sourceId);
      const { rawRecordCount, observations, notes } = await COLLECTORS[sourceId]();
      console.log(`ok (${rawRecordCount} raw record(s), ${observations.length} Observation(s))`);
      results.push({ source_id: sourceId, success: true, raw_record_count: rawRecordCount, observation_count: observations.length, observations, notes });
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      results.push({ source_id: sourceId, success: false, error: error.message, raw_record_count: 0, observation_count: 0, observations: [], notes: [] });
    }
  }
  return results;
}

/**
 * BARCELONA-30-VENUE-POPULATION-01: the live-acquisition half of main()
 * below, factored out (matching ingestion/lisbon-porto/run.mjs's own
 * acquireLisbonPorto() convention) so ingestion/publish-map-data/run.mjs
 * can reuse the exact same 15-source acquisition this package proved,
 * rather than re-implementing any collector.
 */
export async function acquireBarcelona() {
  const barcelonaRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/barcelona.json"), "utf8"));
  console.log(`\n-- Barcelona (${BARCELONA_SOURCE_IDS.length} sources) --`);
  const barcelonaResults = await acquireAll(BARCELONA_SOURCE_IDS, barcelonaRegistry.entries);
  const barcelonaObservations = barcelonaResults.flatMap((r) => r.observations);
  return { barcelonaRegistry, barcelonaResults, barcelonaObservations };
}

export function summariseBarcelona({ sourceResults, observations, venues, sourceRegistry }) {
  const resolutions = observations.map((observation) => ({ observation, resolution: resolveObservation(observation) }));
  const resolvedCount = resolutions.filter((r) => r.resolution.resolution_status === "RESOLVED").length;
  const unresolvedCount = resolutions.length - resolvedCount;
  const unresolvedList = resolutions
    .filter((r) => r.resolution.resolution_status !== "RESOLVED")
    .map((r) => ({ source_id: r.observation.source_id, source_record_id: r.observation.source_record_id, title: r.observation.title, venue_name: r.observation.venue_name }));

  const markers = buildSpainMarkers({ barcelonaObservations: observations, barcelonaVenues: venues, barcelonaSourceRegistry: sourceRegistry });
  const displayListingCount = markers.reduce((sum, m) => sum + m.display_listings.length, 0);

  return {
    label: "Barcelona",
    source_results: sourceResults.map((r) => ({ source_id: r.source_id, success: r.success, raw_record_count: r.raw_record_count, observation_count: r.observation_count, notes: r.notes, ...(r.error !== undefined ? { error: r.error } : {}) })),
    raw_record_total: sourceResults.reduce((sum, r) => sum + r.raw_record_count, 0),
    observation_total: observations.length,
    resolved_venue_count: resolvedCount,
    unresolved_venue_count: unresolvedCount,
    unresolved: unresolvedList,
    display_listing_count: displayListingCount,
    map_marker_count: markers.length,
    markers,
  };
}

async function main() {
  const barcelonaVenues = JSON.parse(await readFile(resolve(ROOT, "venues/barcelona.json"), "utf8"));
  const { barcelonaRegistry, barcelonaResults, barcelonaObservations } = await acquireBarcelona();

  const summary = summariseBarcelona({
    sourceResults: barcelonaResults,
    observations: barcelonaObservations,
    venues: barcelonaVenues.venues,
    sourceRegistry: barcelonaRegistry.entries,
  });

  const proof = {
    label: "BARCELONA-30-VENUE-POPULATION-01 live run proof — a point-in-time snapshot, NOT deterministic fixture data",
    note: "Generated by ingestion/barcelona/run.mjs from real, live HTTP acquisition against the 15 bounded Barcelona sources. Re-running this command later will legitimately produce different counts as each source's own real-world listings change.",
    run_at: new Date().toISOString(),
    barcelona: summary,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

  console.log(`\n=== Barcelona run summary ===`);
  for (const result of summary.source_results) {
    const status = result.success ? "OK" : "FAILED";
    console.log(`  [${status}] ${result.source_id}: raw=${result.raw_record_count} observations=${result.observation_count}${result.error ? ` error="${result.error}"` : ""}`);
    for (const note of result.notes ?? []) console.log(`      note: ${note}`);
  }
  console.log(`  Raw record total: ${summary.raw_record_total}`);
  console.log(`  Observation total: ${summary.observation_total}`);
  console.log(`  Resolved venues: ${summary.resolved_venue_count} / Unresolved: ${summary.unresolved_venue_count}`);
  console.log(`  Display listings: ${summary.display_listing_count}`);
  console.log(`  Map markers: ${summary.map_marker_count}`);
  console.log(`  Wrote ${OUTPUT_PATH}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
