#!/usr/bin/env node
// LISBON-PORTO-OVERNIGHT-COVERAGE-01 — the one manual entry point this
// package adds: `npm run ingest:lisbon-porto` (optionally
// `-- --from=YYYY-MM-DD --to=YYYY-MM-DD`).
//
// Orchestrates the bounded, nine-source pipeline (the seven already-proven
// Lisbon sources from LISBON-AUTOMATIC-SUBSET-01, unchanged, plus the two
// new Porto sources proven tonight):
//
//   selected source registry entries (sources/lisbon.json + sources/porto.json)
//     -> acquire first-party source records (live HTTP, these sources only)
//     -> adapt each into the existing Observation model
//     -> apply date bounds
//     -> resolve venues (ingestion/venue/resolver.mjs, now Lisbon+Porto-aware)
//     -> apply existing bounded association logic (Hot Clube <-> Capitólio
//        only — unchanged, Lisbon-only)
//     -> generate grouped customer-facing display listings
//        (ingestion/map/group-associated-listings.mjs, unchanged)
//     -> project resolved listings into map markers
//     -> regenerate a combined Lisbon+Porto live-run proof output
//     -> emit a detailed, per-city coverage summary
//
// LISBON-PORTO-P1-SOURCE-AUTOMATION-01 adds three more sources on top of
// the above, converting three strong P1 venue-estate candidates into live
// deterministic collectors: galeria-ze-dos-bois and lav-lisboa-ao-vivo
// (Lisbon), super-bock-arena (Porto). Every existing source above is
// completely unchanged; the new three are isolated in their own
// try/catch exactly like every other source, so one of them failing
// never affects the other nine.
//
// This is a live-network, manually-triggered script. Every source's
// acquisition is isolated in its own try/catch: one source's failure is
// recorded and reported, never allowed to abort any other source or the
// run as a whole. No fallback/synthetic data is ever substituted for a
// failed source. This script reuses every already-proven module rather
// than reimplementing it — see ingestion/lisbon-subset/run.mjs, whose
// seven Lisbon collectors are called here completely unchanged.

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

import { parseCasaDaMusicaAgenda, parseCasaDaMusicaNextPageUrl } from "../casa-da-musica/discovery.mjs";
import { toObservations as casaDaMusicaToObservations } from "../casa-da-musica/observation-adapter.mjs";
import { parseTeatroMunicipalPortoAgenda } from "../teatro-municipal-porto/discovery.mjs";
import { toObservations as teatroMunicipalPortoToObservations } from "../teatro-municipal-porto/observation-adapter.mjs";
import {
  parseCmGaiaEventosAgenda,
  filterMusicRecords as filterCmGaiaMusicRecords,
  parseCmGaiaEventosNextPageUrl,
} from "../cm-gaia-eventos/discovery.mjs";
import { toObservations as cmGaiaEventosToObservations } from "../cm-gaia-eventos/observation-adapter.mjs";

import {
  parseSuperBockArenaAgenda,
  filterMusicRecords as filterSuperBockArenaMusicRecords,
} from "../super-bock-arena/discovery.mjs";
import { toObservations as superBockArenaToObservations } from "../super-bock-arena/observation-adapter.mjs";
import { parseLavAgendaJsonLd } from "../lav/discovery.mjs";
import { toObservations as lavToObservations } from "../lav/observation-adapter.mjs";
import { parseZdbProgramme, filterMusicRecords as filterZdbMusicRecords } from "../galeria-ze-dos-bois/discovery.mjs";
import { toObservations as zdbToObservations } from "../galeria-ze-dos-bois/observation-adapter.mjs";

import { resolveObservation } from "../venue/resolver.mjs";
import { associateHotClubeCapitolio } from "../association/hot-clube-capitolio.mjs";
import { projectObservationsToDisplayMarkers } from "../map/group-associated-listings.mjs";
import { isValidCoordinate } from "../map/projection.mjs";
import { MAP_ELIGIBLE_LOCATION_STATUSES } from "../venue/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/lisbon-porto-overnight-coverage-01-live-run-proof.json");

// Considerate-client bound on Casa da Música pagination — see
// ingestion/casa-da-musica/discovery.mjs's doc comment. Never followed
// unboundedly.
const CASA_DA_MUSICA_MAX_PAGES = 5;

// Considerate-client bound on CM Gaia Eventos pagination — see
// ingestion/cm-gaia-eventos/discovery.mjs's doc comment. Only 2 real pages
// were ever observed live, but this is never followed unboundedly.
const CM_GAIA_EVENTOS_MAX_PAGES = 5;

export const LISBON_SOURCE_IDS = [
  "agendalx",
  "hot-clube-de-portugal",
  "teatro-variedades-capitolio",
  "village-underground-lisboa",
  "bota-anjos",
  "cm-odivelas-agenda-cultura",
  "meo-arena",
  "galeria-ze-dos-bois",
  "lav-lisboa-ao-vivo",
];

export const PORTO_SOURCE_IDS = ["casa-da-musica", "teatro-municipal-do-porto", "cm-gaia-eventos", "super-bock-arena"];

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

function withinDateBounds(observation, from, to) {
  const date = observation?.start?.date;
  if (!date) return true; // never drop an Observation with a genuinely unknown date
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

async function loadRegistryEntry(entries, sourceId, registryLabel) {
  const entry = entries.find((candidate) => candidate.id === sourceId);
  if (!entry) throw new Error(`"${sourceId}" is not present in ${registryLabel}`);
  return entry;
}

// ---------------------------------------------------------------------
// Lisbon collectors — unchanged from ingestion/lisbon-subset/run.mjs.
// ---------------------------------------------------------------------

async function collectAgendalx() {
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
    observations.push(
      hotClubeToObservation({
        eventId: event_id,
        icsText: icsRes.text,
        fixturePath,
        metadata: {
          retrieved_at: homepage.retrievedAt,
          requests_made: [{ url: ics_url, content_type: icsRes.contentType, retained_fixture: fixturePath }],
        },
        eventLinks: {},
      }),
    );
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

// ---------------------------------------------------------------------
// New Porto collectors.
// ---------------------------------------------------------------------

async function collectCasaDaMusica() {
  const notes = [];
  const allRecords = [];
  let url = "https://casadamusica.com/agenda/";
  let pagesFetched = 0;
  let lastRes = null;

  while (url && pagesFetched < CASA_DA_MUSICA_MAX_PAGES) {
    const res = await fetchText(url, {});
    pagesFetched += 1;
    if (!res.ok) {
      if (pagesFetched === 1) throw new Error(`HTTP ${res.status} from ${url}`);
      notes.push(`page ${pagesFetched} (${url}): HTTP ${res.status} — stopping pagination`);
      break;
    }
    lastRes = res;
    allRecords.push(...parseCasaDaMusicaAgenda(res.text));
    url = parseCasaDaMusicaNextPageUrl(res.text);
  }
  if (url && pagesFetched >= CASA_DA_MUSICA_MAX_PAGES) {
    notes.push(`stopped after ${CASA_DA_MUSICA_MAX_PAGES} pages (considerate-client bound); more pages exist`);
  }

  const observations = casaDaMusicaToObservations(allRecords, {
    retrievedAt: lastRes?.retrievedAt ?? null,
    sourceUrl: "https://casadamusica.com/agenda/",
    contentType: lastRes?.contentType ?? null,
    fixturePath: null,
  });
  return { rawRecordCount: allRecords.length, observations, notes };
}

async function collectTeatroMunicipalPorto() {
  const url = "https://www.teatromunicipaldoporto.pt/pt/programa/?categoria=musica";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = parseTeatroMunicipalPortoAgenda(res.text);
  const observations = teatroMunicipalPortoToObservations(records, {
    retrievedAt: res.retrievedAt,
    sourceUrl: url,
    contentType: res.contentType,
    fixturePath: null,
  });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectCmGaiaEventos() {
  const notes = [];
  const allRecords = [];
  let url = "https://www.cm-gaia.pt/pt/eventos/";
  let pagesFetched = 0;
  let lastRes = null;

  while (url && pagesFetched < CM_GAIA_EVENTOS_MAX_PAGES) {
    const res = await fetchText(url, {});
    pagesFetched += 1;
    if (!res.ok) {
      if (pagesFetched === 1) throw new Error(`HTTP ${res.status} from ${url}`);
      notes.push(`page ${pagesFetched} (${url}): HTTP ${res.status} — stopping pagination`);
      break;
    }
    lastRes = res;
    allRecords.push(...parseCmGaiaEventosAgenda(res.text));
    url = parseCmGaiaEventosNextPageUrl(res.text);
  }
  if (url && pagesFetched >= CM_GAIA_EVENTOS_MAX_PAGES) {
    notes.push(`stopped after ${CM_GAIA_EVENTOS_MAX_PAGES} pages (considerate-client bound); more pages may exist`);
  }

  const musicRecords = filterCmGaiaMusicRecords(allRecords);
  const observations = cmGaiaEventosToObservations(musicRecords, {
    retrievedAt: lastRes?.retrievedAt ?? null,
    sourceUrl: "https://www.cm-gaia.pt/pt/eventos/",
    contentType: lastRes?.contentType ?? null,
    fixturePath: null,
  });
  notes.push(`${allRecords.length} raw record(s) across all categories; ${musicRecords.length} tagged "música" and retained`);
  // raw_record_count intentionally reports the ALREADY-MUSIC-FILTERED
  // count here, matching this field's meaning everywhere else in this
  // file (the count of records this source's own collector actually
  // turned into Observations) — the true pre-filter total is recorded
  // honestly in `notes` above instead of being conflated with it.
  return { rawRecordCount: musicRecords.length, observations, notes };
}

async function collectGaleriaZeDosBois() {
  const url = "https://zedosbois.org/en/programme/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = parseZdbProgramme(res.text);
  const musicRecords = filterZdbMusicRecords(records);
  const observations = zdbToObservations(musicRecords, {
    retrievedAt: res.retrievedAt,
    sourceUrl: url,
    contentType: res.contentType,
    fixturePath: null,
  });
  return {
    rawRecordCount: musicRecords.length,
    observations,
    notes: [`${records.length} raw record(s) across all areas/categories; ${musicRecords.length} tagged Music/Concerts and retained`],
  };
}

async function collectLav() {
  const url = "https://lisboaaovivo.com/agenda/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = parseLavAgendaJsonLd(res.text);
  const observations = lavToObservations(records, {
    retrievedAt: res.retrievedAt,
    sourceUrl: url,
    contentType: "application/ld+json",
    fixturePath: null,
  });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectSuperBockArena() {
  const url = "https://www.superbockarena.pt/agenda/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = parseSuperBockArenaAgenda(res.text);
  const musicRecords = filterSuperBockArenaMusicRecords(records);
  const observations = superBockArenaToObservations(musicRecords, {
    retrievedAt: res.retrievedAt,
    sourceUrl: url,
    contentType: res.contentType,
    fixturePath: null,
  });
  return {
    rawRecordCount: musicRecords.length,
    observations,
    notes: [`${records.length} raw record(s) across all categories; ${musicRecords.length} tagged with a music category and retained`],
  };
}

const COLLECTORS = {
  agendalx: collectAgendalx,
  "hot-clube-de-portugal": collectHotClube,
  "teatro-variedades-capitolio": collectCapitolio,
  "village-underground-lisboa": collectVillageUnderground,
  "bota-anjos": collectBota,
  "cm-odivelas-agenda-cultura": collectOdivelas,
  "meo-arena": collectMeoArena,
  "galeria-ze-dos-bois": collectGaleriaZeDosBois,
  "lav-lisboa-ao-vivo": collectLav,
  "casa-da-musica": collectCasaDaMusica,
  "teatro-municipal-do-porto": collectTeatroMunicipalPorto,
  "cm-gaia-eventos": collectCmGaiaEventos,
  "super-bock-arena": collectSuperBockArena,
};

async function acquireAll(sourceIds, registryEntries, registryLabel) {
  const results = [];
  for (const sourceId of sourceIds) {
    process.stdout.write(`  acquiring ${sourceId} ... `);
    try {
      await loadRegistryEntry(registryEntries, sourceId, registryLabel); // fails closed if the registry entry itself is missing
      const { rawRecordCount, observations, notes } = await COLLECTORS[sourceId]();
      console.log(`ok (${rawRecordCount} raw record(s), ${observations.length} Observation(s))`);
      results.push({
        source_id: sourceId,
        success: true,
        raw_record_count: rawRecordCount,
        observation_count: observations.length,
        observations,
        notes,
      });
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      results.push({
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
  return results;
}

// VENUE-GEOCODING-01 terminology cleanup: the field previously named
// `raw_observation_total` here actually held the DATE-BOUNDED Observation
// count (main() below applies withinDateBounds() before calling this
// function) — not a genuinely raw, pre-bound count. The truly raw,
// pre-adapter count already lived correctly on each per-source result as
// `raw_record_count`. This function now exposes three unambiguous,
// correctly-named totals instead of one misleadingly-named one:
//
//   raw_record_total            - sum of every source's own raw_record_count
//                                  (pre-adapter, pre-date-bound records)
//   observation_total_before_bounds - sum of every source's own
//                                  observation_count (post-adapter
//                                  Observations, still pre-date-bound)
//   observation_total_in_bounds - `observations.length` as actually passed
//                                  in here (post-date-bound — this is what
//                                  the old, misleading field name held)
function summariseCity({ label, sourceResults, observations, venues, sourceRegistry, associations = [] }) {
  const resolutions = observations.map((observation) => ({
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

  const markers = projectObservationsToDisplayMarkers(observations, { venues, sourceRegistry, associations });
  const displayListingCount = markers.reduce((sum, m) => sum + m.display_listings.length, 0);
  // "Raw map-eligible": every individual map-eligible Observation listing,
  // BEFORE the HCP<->Capitólio association layer groups any pair into one
  // display listing (display_listing_count, above, is the grouped/display
  // count customers actually see).
  const rawMapEligibleCount = markers.reduce((sum, m) => sum + m.listings.length, 0);
  // Resolved to a real canonical venue_id, but that venue is not (yet)
  // map-eligible — either ADDRESS_ONLY/UNRESOLVED location_status, or
  // missing invalid coordinates. This is exactly the bottleneck
  // VENUE-GEOCODING-01 targets.
  const resolvedButUnmappedCount = resolvedCount - rawMapEligibleCount;
  const associatedCount = associations.filter((a) => a.association_status === "ASSOCIATED").length;

  // VENUE-MANUAL-COORDINATES-DASHBOARD-01: per-venue breakdown of exactly
  // which canonical Venue each resolved-but-unmapped Observation belongs
  // to — cheaply derivable from `resolutions` (already computed above)
  // plus each Observation's own resolved venue_id's current
  // location_status/coordinates. This is the exact ("Unlocks N current
  // listings"), never-estimated per-venue figure the operator dashboard
  // (ingestion/geocoding/venue-coordinate-dashboard.mjs) reads from this
  // proof's committed JSON output — never guessed, never a live query at
  // dashboard render time.
  const venueById = new Map(venues.map((venue) => [venue.venue_id, venue]));
  const resolvedButUnmappedByVenueId = {};
  for (const { resolution } of resolutions) {
    if (resolution.resolution_status !== "RESOLVED") continue;
    const venue = venueById.get(resolution.venue_id);
    if (!venue) continue;
    const isMapEligible = MAP_ELIGIBLE_LOCATION_STATUSES.has(venue.location_status) && isValidCoordinate(venue.latitude, venue.longitude);
    if (isMapEligible) continue;
    resolvedButUnmappedByVenueId[resolution.venue_id] = (resolvedButUnmappedByVenueId[resolution.venue_id] ?? 0) + 1;
  }

  return {
    label,
    source_results: sourceResults.map((r) => ({
      source_id: r.source_id,
      success: r.success,
      raw_record_count: r.raw_record_count,
      observation_count: r.observation_count,
      notes: r.notes,
      ...(r.error !== undefined ? { error: r.error } : {}),
    })),
    raw_record_total: sourceResults.reduce((sum, r) => sum + r.raw_record_count, 0),
    observation_total_before_bounds: sourceResults.reduce((sum, r) => sum + r.observation_count, 0),
    observation_total_in_bounds: observations.length,
    resolved_venue_count: resolvedCount,
    unresolved_venue_count: unresolvedCount,
    unresolved: unresolvedList,
    resolved_but_unmapped_count: resolvedButUnmappedCount,
    resolved_but_unmapped_by_venue_id: resolvedButUnmappedByVenueId,
    raw_map_eligible_count: rawMapEligibleCount,
    association_group_count: associatedCount,
    display_listing_count: displayListingCount,
    map_marker_count: markers.length,
    markers,
  };
}

/**
 * VENUE-AUTO-ONBOARDING-01: the live-acquisition half of main() below,
 * factored out so ingestion/venue-onboarding/run.mjs (`npm run
 * onboard:venues`) can reuse the exact same nine-source acquisition
 * this package already proved, rather than re-implementing any
 * collector. Returns everything main() needs to build its own summary/
 * proof — main()'s own behaviour and output are completely unchanged by
 * this refactor.
 */
export async function acquireLisbonPorto(args = {}) {
  const lisbonRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/lisbon.json"), "utf8"));
  const portoRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/porto.json"), "utf8"));

  console.log(`LISBON-PORTO-OVERNIGHT-COVERAGE-01 live run starting (${new Date().toISOString()})`);
  if (args.from || args.to) console.log(`  date bounds: from=${args.from ?? "(none)"} to=${args.to ?? "(none)"}`);

  console.log(`\n-- Lisbon (${LISBON_SOURCE_IDS.length} sources) --`);
  const lisbonResults = await acquireAll(LISBON_SOURCE_IDS, lisbonRegistry.entries, "sources/lisbon.json");

  console.log(`\n-- Porto (${PORTO_SOURCE_IDS.length} sources) --`);
  const portoResults = await acquireAll(PORTO_SOURCE_IDS, portoRegistry.entries, "sources/porto.json");

  const boundObs = (results) =>
    results
      .flatMap((r) => r.observations)
      .filter((o) => (args.from || args.to ? withinDateBounds(o, args.from, args.to) : true));

  const lisbonObservations = boundObs(lisbonResults);
  const portoObservations = boundObs(portoResults);

  const hotClubeObs = lisbonObservations.filter((o) => o.source_id === "hot-clube-de-portugal");
  const capitolioObs = lisbonObservations.filter((o) => o.source_id === "teatro-variedades-capitolio");
  const lisbonAssociations = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  return {
    lisbonRegistry,
    portoRegistry,
    lisbonResults,
    portoResults,
    lisbonObservations,
    portoObservations,
    lisbonAssociations,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lisbonVenues = JSON.parse(await readFile(resolve(ROOT, "venues/lisbon.json"), "utf8"));
  const portoVenues = JSON.parse(await readFile(resolve(ROOT, "venues/porto.json"), "utf8"));

  const {
    lisbonRegistry,
    portoRegistry,
    lisbonResults,
    portoResults,
    lisbonObservations,
    portoObservations,
    lisbonAssociations,
  } = await acquireLisbonPorto(args);

  const lisbonSummary = summariseCity({
    label: "Lisbon",
    sourceResults: lisbonResults,
    observations: lisbonObservations,
    venues: lisbonVenues.venues,
    sourceRegistry: lisbonRegistry.entries,
    associations: lisbonAssociations,
  });

  const portoSummary = summariseCity({
    label: "Porto",
    sourceResults: portoResults,
    observations: portoObservations,
    venues: [...lisbonVenues.venues, ...portoVenues.venues],
    sourceRegistry: [...lisbonRegistry.entries, ...portoRegistry.entries],
    associations: [],
  });

  const proof = {
    label: "LISBON-PORTO-OVERNIGHT-COVERAGE-01 live run proof — a point-in-time snapshot, NOT deterministic fixture data",
    note:
      "Generated by ingestion/lisbon-porto/run.mjs from real, live HTTP acquisition against the nine bounded sources (7 Lisbon, unchanged from LISBON-AUTOMATIC-SUBSET-01, plus 2 new Porto). Re-running this command later will legitimately produce different counts as each source's own real-world listings change — see fixtures/map/lisbon-porto-overnight-coverage-01-proof.json for the deterministic, fixture-backed regeneration proof instead.",
    run_at: new Date().toISOString(),
    date_bounds: { from: args.from, to: args.to },
    lisbon: lisbonSummary,
    porto: portoSummary,
    combined: {
      raw_record_total: lisbonSummary.raw_record_total + portoSummary.raw_record_total,
      observation_total_before_bounds:
        lisbonSummary.observation_total_before_bounds + portoSummary.observation_total_before_bounds,
      observation_total_in_bounds: lisbonSummary.observation_total_in_bounds + portoSummary.observation_total_in_bounds,
      resolved_venue_count: lisbonSummary.resolved_venue_count + portoSummary.resolved_venue_count,
      unresolved_venue_count: lisbonSummary.unresolved_venue_count + portoSummary.unresolved_venue_count,
      resolved_but_unmapped_count: lisbonSummary.resolved_but_unmapped_count + portoSummary.resolved_but_unmapped_count,
      resolved_but_unmapped_by_venue_id: {
        ...lisbonSummary.resolved_but_unmapped_by_venue_id,
        ...portoSummary.resolved_but_unmapped_by_venue_id,
      },
      raw_map_eligible_count: lisbonSummary.raw_map_eligible_count + portoSummary.raw_map_eligible_count,
      display_listing_count: lisbonSummary.display_listing_count + portoSummary.display_listing_count,
      map_marker_count: lisbonSummary.map_marker_count + portoSummary.map_marker_count,
    },
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

  for (const summary of [lisbonSummary, portoSummary]) {
    console.log(`\n=== ${summary.label} run summary ===`);
    for (const result of summary.source_results) {
      const status = result.success ? "OK" : "FAILED";
      console.log(
        `  [${status}] ${result.source_id}: raw=${result.raw_record_count} observations=${result.observation_count}${result.error ? ` error="${result.error}"` : ""}`,
      );
      for (const note of result.notes ?? []) console.log(`      note: ${note}`);
    }
    console.log(`  Raw record total (pre-adapter, pre-date-bound): ${summary.raw_record_total}`);
    console.log(`  Observation total before bounds: ${summary.observation_total_before_bounds}`);
    console.log(`  Observation total in bounds: ${summary.observation_total_in_bounds}`);
    console.log(`  Resolved venues: ${summary.resolved_venue_count} / Unresolved: ${summary.unresolved_venue_count}`);
    console.log(`  Resolved-but-unmapped: ${summary.resolved_but_unmapped_count}`);
    console.log(`  Raw map-eligible (ungrouped): ${summary.raw_map_eligible_count}`);
    console.log(`  Association groups: ${summary.association_group_count}`);
    console.log(`  Display listings: ${summary.display_listing_count}`);
    console.log(`  Map markers: ${summary.map_marker_count}`);
  }

  console.log(`\n=== Combined ===`);
  console.log(`  Observation total in bounds: ${proof.combined.observation_total_in_bounds}`);
  console.log(`  Resolved-but-unmapped: ${proof.combined.resolved_but_unmapped_count}`);
  console.log(`  Raw map-eligible (ungrouped): ${proof.combined.raw_map_eligible_count}`);
  console.log(`  Display listings: ${proof.combined.display_listing_count}`);
  console.log(`  Map markers: ${proof.combined.map_marker_count}`);
  console.log(`  Wrote ${OUTPUT_PATH}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
