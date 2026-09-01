#!/usr/bin/env node
// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — London's
// own bounded pipeline, mirroring ingestion/berlin/run.mjs's exact
// pattern (never touching it, or ingestion/lisbon-porto/run.mjs, or the
// unattended runner — London is a wholly separate, parallel entry
// point). BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 additively extended
// this from 6 to 8 sources (Eventim Apollo, Jamboree) — the original 6
// are unchanged (same source IDs, same collectors, same music gate):
//
//   selected sources/london.json registry entries
//     -> acquire first-party source records (live HTTP, these 6 sources
//        only — the new generic ingestion/squarespace-eventlist/ family
//        plus 3 small bespoke collectors ported unchanged from an earlier,
//        stale-main-based London package and re-verified live against
//        THIS branch's own fresh fetch before being trusted)
//     -> apply the MUSIC GATE (task section 4): every acquired record is
//        either a real music/live-performance listing, or it is excluded
//        before it ever becomes an Observation. No AI genre guess is ever
//        made here — every exclusion below cites the specific, retained,
//        first-party evidence that identified it as NON_MUSIC (see
//        research/source-investigations/beatmapped-london-first-tranche-
//        main-rebase-and-music-gate-01/ for the full per-venue review).
//     -> adapt each into the existing Observation model
//     -> resolve venues (ingestion/venue/resolver.mjs, unchanged; every
//        London source resolves via the DATA-DRIVEN table,
//        venues/source-venue-mappings.json — no new hardcoded resolver
//        function was added, matching Berlin's own precedent)
//     -> project resolved listings into map markers
//        (ingestion/map/publication.mjs's buildUnitedKingdomMarkers())
//     -> regenerate a London live-run proof output
//     -> emit a human-readable per-source run summary
//
// This is a live-network, manually-triggered script — real HTTP requests
// to the 6 registry sources below, and only those sources. Every
// acquisition failure is caught per-source and reported; the run
// continues for every other source. No fallback/synthetic data is ever
// substituted for a failed source.
//
// A far larger pool of London research exists (see
// research/venue-estate/london-venue-estate-01.json, 227 venues) and a
// ranked second-tranche backlog is retained in this package's own final
// report — this file deliberately implements ONLY the 6 venues that
// passed BOTH the first-party-source gate and the music gate this
// package's own live verification actually proved.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchText } from "../http/fetch.mjs";

import { extractEventCards as extractSquarespaceCards, toObservations as squarespaceToObservations } from "../squarespace-eventlist/observation-adapter.mjs";
import { extractEventCards as extract100ClubCards, toObservations as toObservations100Club } from "../100-club/observation-adapter.mjs";
import { extractEventCards as extractUnderworldCards, toObservations as toObservationsUnderworld } from "../the-underworld/observation-adapter.mjs";
import { extractEventCards as extractJazzCafePoskCards, toObservations as toObservationsJazzCafePosk } from "../jazz-cafe-posk/observation-adapter.mjs";
import { extractEventCards as extractAegPresentsCards, toObservations as aegPresentsToObservations } from "../aeg-presents/observation-adapter.mjs";
import { filterAegPresentsMusicRecords } from "../aeg-presents/filter.mjs";
import { extractEventCards as extractJamboreeCards, toObservations as toObservationsJamboree } from "../jamboree/observation-adapter.mjs";
import { filterJamboreeMusicRecords } from "../jamboree/filter.mjs";

import { resolveObservation } from "../venue/resolver.mjs";
import { buildUnitedKingdomMarkers } from "../map/publication.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/beatmapped-london-first-tranche-main-rebase-and-music-gate-01-live-run-proof.json");

const LONDON_SOURCE_IDS = [
  "downstairs-at-the-dome-london",
  "night-tales-loft-london",
  "the-roxy-london",
  "100-club-london",
  "the-underworld-london",
  "jazz-cafe-posk-london",
  // BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — additive second tranche.
  // The existing six above are UNCHANGED (same source IDs, same
  // collectors, same music gate).
  "eventim-apollo-london",
  "jamboree-london",
];

async function loadRegistryEntry(entries, sourceId) {
  const entry = entries.find((candidate) => candidate.id === sourceId);
  if (!entry) throw new Error(`"${sourceId}" is not present in sources/london.json`);
  return entry;
}

// ---------------------------------------------------------------------
// MUSIC GATE (task section 4) — a small, explicit, evidence-cited
// exclusion list per source, never a probabilistic/keyword genre
// classifier (explicitly out of scope: "Do not invent genre
// classification"). Each entry here was individually reviewed against
// this package's own live fetch and is cited in
// research/source-investigations/beatmapped-london-first-tranche-main-
// rebase-and-music-gate-01/evidence/. This mirrors the existing repo
// precedent of an adapter excluding known non-substantive titles (see
// ingestion/zenner/observation-adapter.mjs's own literal 'XXXXX'
// placeholder exclusion) — never a new invented mechanism.
const MUSIC_GATE_EXCLUDED_TITLES = {
  "100-club-london": new Set([
    "CLINTON BAPTISTE’S SUNDAY SEANCE", // a stand-up-comedy character booking, not a music act
    "UNTITLED", // unidentifiable from the card alone — excluded out of caution rather than guessed
  ]),
  "jazz-cafe-posk-london": new Set([
    "CLOSED FOR SUMMER", // not a genuine event at all — a scheduling placeholder card
  ]),
};

function applyMusicGate(sourceId, observations) {
  const excluded = MUSIC_GATE_EXCLUDED_TITLES[sourceId];
  if (!excluded || excluded.size === 0) return { keptObservations: observations, excludedCount: 0 };
  const keptObservations = observations.filter((o) => !excluded.has(o.title));
  return { keptObservations, excludedCount: observations.length - keptObservations.length };
}

// ---------------------------------------------------------------------
// Collectors — one per source. Each fetches its own single listing page
// (no per-event detail-page fetches for this tranche — every source
// here carries enough on its own listing page: title, date, and a
// genuine first-party per-event detail URL already resolved by the
// extractor itself).
// ---------------------------------------------------------------------

async function collectSquarespace({ sourceId, url, venueName, timeoutMs }) {
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractSquarespaceCards(res.text, { baseUrl: url });
  const observations = squarespaceToObservations(cards, { sourceId, venueName, retrievedAt: res.retrievedAt, fixturePath: null });
  const { keptObservations, excludedCount } = applyMusicGate(sourceId, observations);
  const notes = excludedCount > 0 ? [`MUSIC GATE: ${excludedCount} record(s) excluded — see research/source-investigations/beatmapped-london-first-tranche-main-rebase-and-music-gate-01/`] : [];
  return { rawRecordCount: cards.length, observations: keptObservations, notes };
}

async function collect100Club({ timeoutMs } = {}) {
  const url = "https://www.the100club.co.uk/100club-events/";
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extract100ClubCards(res.text);
  const observations = toObservations100Club(cards, { retrievedAt: res.retrievedAt });
  const { keptObservations, excludedCount } = applyMusicGate("100-club-london", observations);
  const notes = excludedCount > 0 ? [`MUSIC GATE: ${excludedCount} record(s) excluded (non-music/unidentifiable booking) — see research/source-investigations/beatmapped-london-first-tranche-main-rebase-and-music-gate-01/`] : [];
  return { rawRecordCount: cards.length, observations: keptObservations, notes };
}

async function collectUnderworld({ timeoutMs } = {}) {
  const url = "https://www.theunderworldcamden.co.uk/search-events/";
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractUnderworldCards(res.text);
  const observations = toObservationsUnderworld(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectJazzCafePosk({ timeoutMs } = {}) {
  const url = "https://jazzcafeposk.org/gig-guide/";
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractJazzCafePoskCards(res.text);
  const observations = toObservationsJazzCafePosk(cards, { retrievedAt: res.retrievedAt });
  const { keptObservations, excludedCount } = applyMusicGate("jazz-cafe-posk-london", observations);
  const notes = excludedCount > 0 ? [`MUSIC GATE: ${excludedCount} record(s) excluded (non-event placeholder) — see research/source-investigations/beatmapped-london-first-tranche-main-rebase-and-music-gate-01/`] : [];
  return { rawRecordCount: cards.length, observations: keptObservations, notes };
}

// ---------------------------------------------------------------------
// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — additive second tranche.
// ---------------------------------------------------------------------

async function collectEventimApollo({ timeoutMs } = {}) {
  const url = "https://www.eventimapollo.com/events/";
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractAegPresentsCards(res.text, { baseUrl: url });
  const observations = aegPresentsToObservations(cards, { sourceId: "eventim-apollo-london", venueName: "Eventim Apollo", retrievedAt: res.retrievedAt });
  const keptObservations = filterAegPresentsMusicRecords("eventim-apollo-london", observations);
  const excludedCount = observations.length - keptObservations.length;
  const notes = excludedCount > 0 ? [`MUSIC GATE: ${excludedCount} record(s) excluded (comedy/talk/podcast/ambiguous, curated inclusion list) — see research/source-investigations/london-t2-eventim-apollo-03/`] : [];
  return { rawRecordCount: cards.length, observations: keptObservations, notes };
}

async function collectJamboree({ timeoutMs } = {}) {
  const url = "https://www.jamboreevenue.co.uk/upcoming-events/";
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractJamboreeCards(res.text, { baseUrl: url });
  const observations = toObservationsJamboree(cards, { retrievedAt: res.retrievedAt });
  const keptObservations = filterJamboreeMusicRecords(observations);
  const excludedCount = observations.length - keptObservations.length;
  const notes = excludedCount > 0 ? [`MUSIC GATE: ${excludedCount} record(s) excluded (recurring class/ambiguous, own <h4> programme note lacks 'Live Music') — see research/source-investigations/london-t2-jamboree-03/`] : [];
  return { rawRecordCount: cards.length, observations: keptObservations, notes };
}

const COLLECTORS = {
  "downstairs-at-the-dome-london": () => collectSquarespace({ sourceId: "downstairs-at-the-dome-london", url: "https://www.domelondon.co.uk/whatson", venueName: "Downstairs at The Dome" }),
  "night-tales-loft-london": () => collectSquarespace({ sourceId: "night-tales-loft-london", url: "https://www.ntloft.co.uk/events", venueName: "Night Tales Loft" }),
  "the-roxy-london": () => collectSquarespace({ sourceId: "the-roxy-london", url: "https://www.theroxy.co.uk/whatson", venueName: "The Roxy" }),
  "100-club-london": collect100Club,
  "the-underworld-london": collectUnderworld,
  "jazz-cafe-posk-london": collectJazzCafePosk,
  "eventim-apollo-london": collectEventimApollo,
  "jamboree-london": collectJamboree,
};

async function acquireAll(sourceIds, registryEntries, collectors = COLLECTORS) {
  const results = [];
  for (const sourceId of sourceIds) {
    process.stdout.write(`  acquiring ${sourceId} ... `);
    try {
      await loadRegistryEntry(registryEntries, sourceId);
      const { rawRecordCount, observations, notes } = await collectors[sourceId]();
      console.log(`ok (${rawRecordCount} raw record(s), ${observations.length} Observation(s))`);
      results.push({ source_id: sourceId, success: true, raw_record_count: rawRecordCount, observation_count: observations.length, observations, notes });
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      results.push({ source_id: sourceId, success: false, error: error.message, raw_record_count: 0, observation_count: 0, observations: [], notes: [] });
    }
  }
  return results;
}

export { acquireAll, applyMusicGate, LONDON_SOURCE_IDS };

export async function acquireLondon(args = {}) {
  const londonRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/london.json"), "utf8"));
  console.log(`\n-- London (${LONDON_SOURCE_IDS.length} sources) --`);
  const londonResults = await acquireAll(LONDON_SOURCE_IDS, londonRegistry.entries, args.collectors ?? COLLECTORS);
  const londonObservations = londonResults.flatMap((r) => r.observations);
  return { londonRegistry, londonResults, londonObservations };
}

export function summariseLondon({ sourceResults, observations, venues, sourceRegistry, manualCoordinatesByVenueId }) {
  const resolutions = observations.map((observation) => ({ observation, resolution: resolveObservation(observation) }));
  const resolvedCount = resolutions.filter((r) => r.resolution.resolution_status === "RESOLVED").length;
  const unresolvedCount = resolutions.length - resolvedCount;
  const unresolvedList = resolutions
    .filter((r) => r.resolution.resolution_status !== "RESOLVED")
    .map((r) => ({ source_id: r.observation.source_id, source_record_id: r.observation.source_record_id, title: r.observation.title, venue_name: r.observation.venue_name, location_text: r.observation.location_text }));

  const markers = buildUnitedKingdomMarkers({ londonObservations: observations, londonVenues: venues, londonSourceRegistry: sourceRegistry, manualCoordinatesByVenueId });
  const displayListingCount = markers.reduce((sum, m) => sum + m.display_listings.length, 0);

  return {
    label: "London",
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
  const londonVenues = JSON.parse(await readFile(resolve(ROOT, "venues/london.json"), "utf8"));
  const manualStore = await loadManualCoordinateStore();
  const manualCoordinatesByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));

  const { londonRegistry, londonResults, londonObservations } = await acquireLondon();

  const summary = summariseLondon({
    sourceResults: londonResults,
    observations: londonObservations,
    venues: londonVenues.venues,
    sourceRegistry: londonRegistry.entries,
    manualCoordinatesByVenueId,
  });

  const proof = {
    label: "BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 live run proof — a point-in-time snapshot, NOT deterministic fixture data",
    note: "Generated by ingestion/london/run.mjs from real, live HTTP acquisition against the 6 bounded, music-gated London sources. Re-running this command later will legitimately produce different counts as each source's own real-world listings change.",
    run_at: new Date().toISOString(),
    london: summary,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

  console.log(`\n=== London run summary ===`);
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
