#!/usr/bin/env node
// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — the one manual entry point
// this package adds: `npm run ingest:paris`.
//
// Orchestrates Paris's own bounded, 37-source pipeline, mirroring
// ingestion/berlin/run.mjs's exact pattern (never touching it, or any
// other existing <city>/run.mjs — Paris is a wholly separate, parallel
// entry point):
//
//   selected sources/paris.json registry entries
//     -> acquire first-party source records (live HTTP, these 37 sources
//        only — reusable collector families [ingestion/json-ld/,
//        ingestion/html-link-discovery/, ingestion/events-calendar-api/,
//        ingestion/prismic-api/, ingestion/sveltekit-data/] plus a large
//        number of bespoke per-venue collectors, all already built and
//        offline-tested — see sources/paris.json's own
//        acquisition_path_detail per entry and each source's own
//        research/source-investigations/<id>-01/)
//     -> adapt each into the existing Observation model
//     -> resolve venues (ingestion/venue/resolver.mjs, unchanged; Paris
//        sources resolve via the DATA-DRIVEN table,
//        venues/source-venue-mappings.json — no new hardcoded resolver
//        function was added)
//     -> project resolved listings into map markers
//        (ingestion/map/publication.mjs's buildFranceMarkers())
//     -> regenerate a Paris live-run proof output
//     -> emit a human-readable per-source run summary
//
// This is a live-network, manually-triggered script — real HTTP requests
// to the 37 registry sources below, and only those sources. Every
// acquisition failure is caught per-source and reported; the run
// continues for every other source. No fallback/synthetic data is ever
// substituted for a failed source.
//
// Le Trabendo and Institut du Monde Arabe are both ADDRESS_ONLY in
// venues/paris.json (no confidently-resolved coordinate) — they are still
// acquired here like every other source, they simply never resolve to a
// map marker (resolveObservation() has no venue_id to resolve them to).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchText } from "../http/fetch.mjs";

import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { toObservations as jsonLdToObservations, toObservation as jsonLdToObservation } from "../json-ld/observation-adapter.mjs";

import { extractLinksMatching } from "../html-link-discovery/discovery.mjs";

import { fetchAllEvents } from "../events-calendar-api/fetch-all.mjs";
import { toObservations as eventsCalendarToObservations } from "../events-calendar-api/observation-adapter.mjs";

import { buildApiRootUrl, parseApiRoot } from "../prismic-api/client.mjs";

import { extractEventCards as extractAccorArenaCards, filterMusicEventCards as filterAccorArenaMusicCards } from "../accor-arena/discovery.mjs";
import { toObservations as accorArenaToObservations } from "../accor-arena/observation-adapter.mjs";

import { extractEventCards as extractZenithCards } from "../zenith-la-villette/discovery.mjs";
import { toObservations as zenithToObservations } from "../zenith-la-villette/observation-adapter.mjs";

import { extractEventDetail as extractPleyelDetail } from "../salle-pleyel/discovery.mjs";
import { toObservation as pleyelToObservation } from "../salle-pleyel/observation-adapter.mjs";

import { extractEventCards as extractAdidasCards, filterMusicEventCards as filterAdidasMusicCards } from "../adidas-arena/discovery.mjs";
import { toObservations as adidasToObservations } from "../adidas-arena/observation-adapter.mjs";

import { extractEventCards as extractGrandRexCards } from "../le-grand-rex/observation-adapter.mjs";
import { toObservations as grandRexToObservations } from "../le-grand-rex/observation-adapter.mjs";

import { isMusicRecord as isOlympiaMusicRecord } from "../olympia-paris/observation-adapter.mjs";
import { toObservations as olympiaToObservations } from "../olympia-paris/observation-adapter.mjs";

import { extractEventCards as extractDomeCards, isConcertCard as isDomeConcertCard, extractDetailSchedule as extractDomeDetailSchedule } from "../dome-de-paris/observation-adapter.mjs";
import { toObservation as domeToObservation } from "../dome-de-paris/observation-adapter.mjs";

import { extractEventRecordsFromPayloadText } from "../le-bataclan/discovery.mjs";
import { toObservations as bataclanToObservations } from "../le-bataclan/observation-adapter.mjs";

import { extractEventCards as extractWpEvenementCards } from "../wp-evenement-cards/discovery.mjs";
import { toObservations as wpEvenementToObservations } from "../wp-evenement-cards/observation-adapter.mjs";

import { extractEventCards as extractMachineCards } from "../la-machine-du-moulin-rouge/discovery.mjs";
import { toObservations as machineToObservations } from "../la-machine-du-moulin-rouge/observation-adapter.mjs";

import { discoverEventUrls as discoverAlhambraEventUrls } from "../alhambra/discovery.mjs";
import { parseEventDetailPage as parseAlhambraDetailPage, toObservation as alhambraToObservation } from "../alhambra/observation-adapter.mjs";

import { extractEventCards as extractTrabendoCards } from "../le-trabendo/discovery.mjs";
import { toObservations as trabendoToObservations } from "../le-trabendo/observation-adapter.mjs";

import { extractEventCards as extractCafeDeLaDanseCards, toObservations as cafeDeLaDanseToObservations } from "../cafe-de-la-danse-paris/observation-adapter.mjs";

import { extractEventCards as extractBackstageCards } from "../backstage-btm-paris/discovery.mjs";
import { toObservations as backstageToObservations } from "../backstage-btm-paris/observation-adapter.mjs";

import { extractEventCards as extractBadaboumCards } from "../badaboum-paris/discovery.mjs";
import { toObservations as badaboumToObservations } from "../badaboum-paris/observation-adapter.mjs";

import { buildPointEphemereEventsUrl, parsePointEphemereEvents } from "../point-ephemere/discovery.mjs";
import { toObservations as pointEphemereToObservations } from "../point-ephemere/observation-adapter.mjs";

import { extractEventCards as extractBouleNoireCards } from "../la-boule-noire/discovery.mjs";
import { toObservations as bouleNoireToObservations } from "../la-boule-noire/observation-adapter.mjs";

import { extractEventOccurrences as extractDucDesLombardsOccurrences } from "../duc-des-lombards/discovery.mjs";
import { toObservations as ducDesLombardsToObservations } from "../duc-des-lombards/observation-adapter.mjs";

import { extractEventCards as extractBaiserSaleCards } from "../le-baiser-sale/discovery.mjs";
import { toObservations as baiserSaleToObservations } from "../le-baiser-sale/observation-adapter.mjs";

import { extractResidencyCards as extractCaveauResidencyCards } from "../caveau-de-la-huchette/discovery.mjs";
import { toObservations as caveauToObservations } from "../caveau-de-la-huchette/observation-adapter.mjs";

import { extractEventCards as extractGlazartCards, toObservations as glazartToObservations } from "../glazart/observation-adapter.mjs";

import { extractEventCards as extractBellevilloiseCards, extractDetailFields as extractBellevilloiseDetailFields } from "../la-bellevilloise/observation-adapter.mjs";
import { toObservation as bellevilloiseToObservation } from "../la-bellevilloise/observation-adapter.mjs";

import { extractEventDetailUrls as extractTruskelEventDetailUrls } from "../truskel-paris/discovery.mjs";
import { extractEventNodesFromPage as extractTruskelEventNodes, toObservation as truskelToObservation } from "../truskel-paris/observation-adapter.mjs";

import { extractEventCards as extractGaiteLyriqueCards } from "../gaite-lyrique-paris/discovery.mjs";
import { toObservations as gaiteLyriqueToObservations } from "../gaite-lyrique-paris/observation-adapter.mjs";

import { buildConcertEventsUrl as buildCentquatreEventsUrl, extractEventMembers as extractCentquatreEventMembers } from "../centquatre-paris/discovery.mjs";
import { toObservations as centquatreToObservations } from "../centquatre-paris/observation-adapter.mjs";

import { extractEventCardsFromApiResponse as extractHasardLudiqueCards } from "../le-hasard-ludique/discovery.mjs";
import { toObservations as hasardLudiqueToObservations } from "../le-hasard-ludique/observation-adapter.mjs";

import { extractEventCards as extractMaisonRadioCards, filterMusicCards as filterMaisonRadioMusicCards } from "../maison-de-la-radio-et-de-la-musique/discovery.mjs";
import { toObservations as maisonRadioToObservations } from "../maison-de-la-radio-et-de-la-musique/observation-adapter.mjs";

import { toObservations as theatreDeLaVilleToObservations } from "../theatre-de-la-ville/observation-adapter.mjs";

import { extractEscaleCards as extractImaCards, extractDatesHorairesText as extractImaDatesHoraires, extractLocationText as extractImaLocationText } from "../institut-du-monde-arabe/discovery.mjs";
import { toObservation as imaToObservation } from "../institut-du-monde-arabe/observation-adapter.mjs";

import { extractEventCardMeta as extractPhilharmonieCardMeta } from "../philharmonie-paris/discovery.mjs";
import { extractDetailEventNode as extractPhilharmonieDetailEventNode, toObservation as philharmonieToObservation } from "../philharmonie-paris/observation-adapter.mjs";

import { resolveObservation } from "../venue/resolver.mjs";
import { buildFranceMarkers } from "../map/publication.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/paris-30-40-venue-population-01-live-run-proof.json");

// Bounded cap on individual detail-page fetches per source in this run — a
// safety bound against an unexpectedly huge listing blowing an unbounded
// sequential-fetch run out to hours, matching ingestion/berlin/run.mjs's
// own MAX_DETAIL_FETCHES precedent exactly. Never silently disguised: a
// truncated run is always reported as such in `notes`.
const MAX_DETAIL_FETCHES = 80;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function lastPathSegment(url) {
  const trimmed = (url ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

async function loadRegistryEntry(entries, sourceId) {
  const entry = entries.find((candidate) => candidate.id === sourceId);
  if (!entry) throw new Error(`"${sourceId}" is not present in sources/paris.json`);
  return entry;
}

export const PARIS_SOURCE_IDS = [
  // A — bespoke, single-list-page card parsers (no per-event detail fetch)
  "accor-arena-paris",
  "zenith-la-villette-paris",
  "adidas-arena-paris",
  "le-grand-rex-paris",
  "la-machine-du-moulin-rouge-paris",
  "le-trabendo-paris",
  "cafe-de-la-danse-paris",
  "glazart-paris",
  "le-baiser-sale-paris",
  "gaite-lyrique-paris",
  "le-hasard-ludique-paris",
  "caveau-de-la-huchette-paris",
  "new-morning-paris",
  "le-bateau-phare-paris",
  // B — list + bounded per-event detail fetches
  "salle-pleyel-paris",
  "backstage-btm-paris",
  "badaboum-paris",
  "alhambra-paris",
  "dome-de-paris",
  "la-bellevilloise-paris",
  "institut-du-monde-arabe-paris",
  "philharmonie-paris",
  // C — direct JSON API / multi-step API acquisition
  "olympia-paris",
  "le-bataclan-paris",
  "centquatre-paris",
  "theatre-de-la-ville-paris",
  "point-ephemere-paris",
  // D — reused existing collector families, zero/near-zero new code
  "supersonic-paris",
  "sunset-sunside-paris",
  "38riv-paris",
  "les-trois-baudets-paris",
  "truskel-paris",
  // E — shared wp-evenement-cards family
  "le-trianon-paris",
  "elysee-montmartre-paris",
  // F — remaining bespoke sources
  "duc-des-lombards-paris",
  "la-boule-noire-paris",
  "maison-de-la-radio-et-de-la-musique-paris",
];

// ---------------------------------------------------------------------
// A — bespoke, single-list-page card parsers
// ---------------------------------------------------------------------

async function collectAccorArena() {
  const url = "https://www.accorarena.com/en/events-and-tickets";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const allCards = extractAccorArenaCards(res.text);
  const { musicCards, rejectedCards } = filterAccorArenaMusicCards(allCards);
  const observations = accorArenaToObservations(musicCards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: allCards.length, observations, notes: [`${musicCards.length} music-relevant, ${rejectedCards.length} rejected`] };
}

async function collectZenith() {
  const url = "https://le-zenith.com/program";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractZenithCards(res.text);
  const observations = zenithToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectAdidasArena() {
  const url = "https://www.adidasarena.com/programmation";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const allCards = extractAdidasCards(res.text);
  const { musicCards, rejectedCards } = filterAdidasMusicCards(allCards);
  const observations = adidasToObservations(musicCards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: allCards.length, observations, notes: [`${musicCards.length} music-relevant, ${rejectedCards.length} rejected`] };
}

async function collectLeGrandRex() {
  const url = "https://www.legrandrex.com/evenement";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const allCards = extractGrandRexCards(res.text);
  const musicCards = allCards.filter((card) => card.isConcert);
  const observations = grandRexToObservations(musicCards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: allCards.length, observations, notes: [`${musicCards.length} of ${allCards.length} rows tagged this source's own literal 'concerts' class`] };
}

async function collectLaMachineDuMoulinRouge() {
  const url = "https://www.lamachinedumoulinrouge.com/agenda/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractMachineCards(res.text);
  const observations = machineToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectLeTrabendo() {
  const url = "https://www.letrabendo.net/programmation/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractTrabendoCards(res.text); // de-duplicates by URL internally (own doc comment verified)
  const observations = trabendoToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectCafeDeLaDanse() {
  const url = "https://www.cafedeladanse.com/programmation/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractCafeDeLaDanseCards(res.text); // de-duplicates the "Nouvelles dates !" widget internally
  const observations = cafeDeLaDanseToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectGlazart() {
  const url = "https://www.glazart.com/agenda-concerts/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractGlazartCards(res.text);
  const observations = glazartToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectLeBaiserSale() {
  const url = "https://www.lebaisersale.com/fr/agenda";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractBaiserSaleCards(res.text);
  const observations = baiserSaleToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectGaiteLyrique() {
  const url = "https://www.gaite-lyrique.net/agenda/concerts/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractGaiteLyriqueCards(res.text);
  const observations = gaiteLyriqueToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectLeHasardLudique() {
  const url = "https://www.lehasardludique.paris/api/events?limit=54";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractHasardLudiqueCards(res.text);
  const observations = hasardLudiqueToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectCaveauDeLaHuchette() {
  // The task-given events_url is this source's own current real month page
  // (September 2026) — a bounded single-month fetch, matching this
  // investigation's own documented scope. A future month's own page would
  // need its own re-investigated URL (this source has no predictable URL
  // pattern proven safe to guess).
  const url = "https://www.caveaudelahuchette.fr/1/concerts_septembre_2026_1483451.html";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const { cards, unparsed } = extractCaveauResidencyCards(res.text);
  const observations = caveauToObservations(cards, { retrievedAt: res.retrievedAt, monthPageUrl: url });
  const notes = unparsed.length > 0 ? [`${unparsed.length} booking line(s) could not be deterministically parsed and were skipped: ${unparsed.join(" | ")}`] : [];
  return { rawRecordCount: cards.length + unparsed.length, observations, notes };
}

async function collectNewMorning() {
  // ZERO new module — the shared ingestion/json-ld/ repair pre-pass now
  // handles this source's own malformed JSON automatically.
  const url = "https://www.newmorning.com/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const nodes = extractEventNodes(res.text);
  const deriveId = (node) => {
    const match = /(\d{8}-\d+-[a-z0-9-]+)\.html$/.exec(node.url ?? "");
    return match ? match[1] : lastPathSegment(node.url);
  };
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId }));
  const observations = jsonLdToObservations(records, { source_id: "new-morning-paris" }, { retrievedAt: res.retrievedAt, sourceUrl: url, venueNameOverride: "New Morning" });
  return { rawRecordCount: nodes.length, observations, notes: [] };
}

async function collectLeBateauPhare() {
  // ZERO new module — one page's own JSON-LD @graph holds both the
  // venue's own self-description and its entire current programme.
  const url = "https://lebateauphare.paris/en/programmation/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const nodes = extractEventNodes(res.text, { types: new Set(["Event", "MusicEvent"]) });
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => n.url ?? lastPathSegment(n.url) }));
  const observations = jsonLdToObservations(records, { source_id: "le-bateau-phare-paris" }, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: nodes.length, observations, notes: [] };
}

// ---------------------------------------------------------------------
// B — list + bounded per-event detail fetches
// ---------------------------------------------------------------------

async function collectSallePleyel() {
  const listUrl = "https://www.sallepleyel.com/concerts-spectacles/";
  const baseUrl = "https://www.sallepleyel.com";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allDetailUrls = extractLinksMatching(listRes.text, /href="(https:\/\/www\.sallepleyel\.com\/evenement\/[a-z0-9-]+\/)"/g, { baseUrl });
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const notes = [`${allDetailUrls.length} candidate detail URL(s) discovered from the list page`];
  if (allDetailUrls.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail URLs for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const pageUrl of detailUrls) {
    const detailRes = await fetchText(pageUrl, {});
    if (!detailRes.ok) {
      notes.push(`${pageUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    const detail = extractPleyelDetail(detailRes.text);
    observations.push(pleyelToObservation({ pageUrl, detail }, { retrievedAt: detailRes.retrievedAt }));
  }
  return { rawRecordCount: detailUrls.length, observations, notes };
}

async function collectBackstageBtm() {
  const listUrl = "https://www.backstage-btm.com/en/calendar/";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allCards = extractBackstageCards(listRes.text);
  const cards = allCards.length > MAX_DETAIL_FETCHES ? allCards.slice(0, MAX_DETAIL_FETCHES) : allCards;

  const notes = [];
  if (allCards.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} of ${allCards.length} cards for this run (MAX_DETAIL_FETCHES)`);

  const entries = [];
  for (const card of cards) {
    const detailRes = await fetchText(card.eventUrl, {});
    if (!detailRes.ok) {
      notes.push(`${card.eventUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    entries.push({ card, detailHtml: detailRes.text, fixturePath: null });
  }
  const observations = backstageToObservations(entries, { retrievedAt: new Date().toISOString() });
  return { rawRecordCount: allCards.length, observations, notes };
}

async function collectBadaboum() {
  const listUrl = "https://badaboum.paris/agenda/";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allCards = extractBadaboumCards(listRes.text);
  const cards = allCards.length > MAX_DETAIL_FETCHES ? allCards.slice(0, MAX_DETAIL_FETCHES) : allCards;

  const notes = [];
  if (allCards.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} of ${allCards.length} cards for this run (MAX_DETAIL_FETCHES)`);

  const entries = [];
  for (const card of cards) {
    const detailRes = await fetchText(card.eventUrl, {});
    if (!detailRes.ok) {
      notes.push(`${card.eventUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    entries.push({ card, detailHtml: detailRes.text, fixturePath: null });
  }
  const observations = badaboumToObservations(entries, { retrievedAt: new Date().toISOString() });
  return { rawRecordCount: allCards.length, observations, notes };
}

async function collectAlhambra() {
  const homeUrl = "https://www.alhambra-paris.com/";
  const homeRes = await fetchText(homeUrl, {});
  if (!homeRes.ok) throw new Error(`HTTP ${homeRes.status} from ${homeUrl}`);
  // Never trust the homepage's own dates (card-ordering hazard) — only
  // harvest title+href pairs; each event's own detail page is the sole
  // authority for start_date/time/price/venue.
  const allDetailUrls = discoverAlhambraEventUrls(homeRes.text, { baseUrl: homeUrl });
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const notes = [`${allDetailUrls.length} candidate event URL(s) discovered on the homepage`];
  if (allDetailUrls.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail URLs for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const detailUrl of detailUrls) {
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    try {
      const record = parseAlhambraDetailPage(detailRes.text, detailUrl);
      observations.push(alhambraToObservation(record, { retrievedAt: detailRes.retrievedAt }));
    } catch (error) {
      notes.push(`${detailUrl}: ${error.message}`);
    }
  }
  return { rawRecordCount: detailUrls.length, observations, notes };
}

async function collectDomeDeParis() {
  const listUrl = "https://www.ledomedeparis.com/fr/spectacles/a-laffiche";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allCards = extractDomeCards(listRes.text);
  const musicCards = allCards.filter((card) => isDomeConcertCard(card.category));
  const boundedCards = musicCards.length > MAX_DETAIL_FETCHES ? musicCards.slice(0, MAX_DETAIL_FETCHES) : musicCards;

  const notes = [`${musicCards.length} of ${allCards.length} cards tagged this source's own literal 'Concert' category`];
  if (musicCards.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} of ${musicCards.length} music-relevant detail fetches for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const card of boundedCards) {
    const detailRes = await fetchText(card.eventUrl, {});
    let detail;
    if (!detailRes.ok) {
      notes.push(`${card.eventUrl}: HTTP ${detailRes.status} — proceeding with the listing card's own PROVEN date only`);
      detail = undefined;
    } else {
      detail = extractDomeDetailSchedule(detailRes.text);
    }
    observations.push(domeToObservation(card, { retrievedAt: listRes.retrievedAt, detail }));
  }
  return { rawRecordCount: allCards.length, observations, notes };
}

async function collectLaBellevilloise() {
  const listUrl = "https://labellevilloise.com/agenda/";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allCards = extractBellevilloiseCards(listRes.text);
  const cards = allCards.length > MAX_DETAIL_FETCHES ? allCards.slice(0, MAX_DETAIL_FETCHES) : allCards;

  const notes = [];
  if (allCards.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} of ${allCards.length} cards for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const card of cards) {
    const detailRes = await fetchText(card.eventUrl, {});
    let detail;
    if (!detailRes.ok) {
      notes.push(`${card.eventUrl}: HTTP ${detailRes.status} — proceeding with the listing card's own PROVEN date only`);
      detail = undefined;
    } else {
      detail = extractBellevilloiseDetailFields(detailRes.text);
    }
    observations.push(bellevilloiseToObservation(card, { retrievedAt: listRes.retrievedAt, detail }));
  }
  return { rawRecordCount: allCards.length, observations, notes };
}

async function collectInstitutDuMondeArabe() {
  const listUrl = "https://www.imarabe.org/fr/agenda/les-escales-musicales-du-musee";
  const baseUrl = "https://www.imarabe.org";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const cards = extractImaCards(listRes.text);

  const notes = [];
  const observations = [];
  for (const card of cards) {
    const detailUrl = new URL(card.href, baseUrl).toString();
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    const detail = { ...extractImaDatesHoraires(detailRes.text), locationText: extractImaLocationText(detailRes.text) };
    observations.push(imaToObservation(card, detail, { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl, baseUrl }));
  }
  return { rawRecordCount: cards.length, observations, notes };
}

async function collectPhilharmonie() {
  const listUrl = "https://philharmoniedeparis.fr/en/agenda-ajax?place_i=45";
  const listRes = await fetchText(listUrl, { headers: { Accept: "application/json" } });
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  let body;
  try {
    body = JSON.parse(listRes.text);
  } catch (error) {
    throw new Error(`agenda-ajax response was not valid JSON: ${error.message}`);
  }
  const contentHtml = typeof body?.content === "string" ? body.content : "";
  const allCards = contentHtml.trim() === "" ? [] : extractPhilharmonieCardMeta(contentHtml);
  const cardsWithDetail = allCards.filter((card) => card.detailHref);
  const boundedCards = cardsWithDetail.length > MAX_DETAIL_FETCHES ? cardsWithDetail.slice(0, MAX_DETAIL_FETCHES) : cardsWithDetail;

  const notes = [`nbEvents (server-reported, unfiltered future window): ${body?.nbEvents ?? "unknown"}`, `${cardsWithDetail.length} of ${allCards.length} EventCard block(s) carried a detail href`];
  if (cardsWithDetail.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail fetches for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const cardMeta of boundedCards) {
    const detailUrl = new URL(cardMeta.detailHref, "https://philharmoniedeparis.fr").toString();
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    try {
      const node = extractPhilharmonieDetailEventNode(detailRes.text);
      observations.push(philharmonieToObservation(cardMeta, node, { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl }));
    } catch (error) {
      notes.push(`${detailUrl}: ${error.message}`);
    }
  }
  return { rawRecordCount: allCards.length, observations, notes };
}

// ---------------------------------------------------------------------
// C — direct JSON API / multi-step API acquisition
// ---------------------------------------------------------------------

async function collectOlympia() {
  const notes = [];
  const observations = [];
  let rawRecordCount = 0;
  const seenIds = new Set();

  // The source's own JS bundle constructs filter_periods[0][begin_date]
  // from "today" and paginates via page=N, posts_per_page=20 (see
  // research/source-investigations/olympia-paris-01/investigation.json's
  // own data_paths). Bounded to a handful of pages, never the whole
  // catalogue blindly.
  const maxPages = 8;
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `https://www.olympiahall.com/wp-json/df-elastic-search/v1/search-evenements/?lang=en&filter_periods[0][begin_date]=${todayDateString()}&page=${page}&posts_per_page=20&keyword=`;
    const res = await fetchText(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      notes.push(`page ${page}: HTTP ${res.status}`);
      break;
    }
    let body;
    try {
      body = JSON.parse(res.text);
    } catch (error) {
      notes.push(`page ${page}: ${error.message}`);
      break;
    }
    const items = Array.isArray(body?.items) ? body.items : [];
    rawRecordCount += items.length;
    const musicItems = items.filter((item) => isOlympiaMusicRecord(item) && !seenIds.has(item.ID));
    for (const item of musicItems) seenIds.add(item.ID);
    observations.push(...olympiaToObservations(musicItems, { retrievedAt: res.retrievedAt }));
    if (items.length === 0 || page >= (body?.nb_pages ?? maxPages)) break;
  }
  return { rawRecordCount, observations, notes };
}

async function collectLeBataclan() {
  const url = "https://www.bataclan.fr/programmation/_payload.json";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = extractEventRecordsFromPayloadText(res.text);
  const observations = bataclanToObservations(records, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectCentquatre() {
  const url = buildCentquatreEventsUrl(todayDateString());
  // This Hydra/API-Platform endpoint content-negotiates: a plain
  // "application/json" Accept header returns an ordinary JSON array with
  // no 'hydra:member' envelope at all, while "application/ld+json" returns
  // the real Hydra collection this module's own extractEventMembers()
  // expects (confirmed live) — the exact same content-negotiation
  // convention already relied on for theatre-de-la-ville-paris's API.
  const res = await fetchText(url, { headers: { Accept: "application/ld+json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  let body;
  try {
    body = JSON.parse(res.text);
  } catch (error) {
    throw new Error(`/api/events response was not valid JSON: ${error.message}`);
  }
  const members = extractCentquatreEventMembers(body);
  const observations = centquatreToObservations(members, { retrievedAt: res.retrievedAt, sourceUrl: url });
  return { rawRecordCount: members.length, observations, notes: [] };
}

async function collectTheatreDeLaVille() {
  const apiBase = "https://api.theatredelaville-paris.com";
  const notes = [];

  // Only future-dated events, per this source's own documented, exposed
  // 'dates.doorTime[after]' filter — never walking all 279 historical
  // Musiques-category events to find the handful still upcoming.
  const eventIds = [];
  let nextUrl = (() => {
    const params = new URLSearchParams();
    params.set("mainCategory", "/taxons/63");
    params.set("dates.doorTime[after]", todayDateString());
    return `${apiBase}/events?${params.toString()}`;
  })();
  let pagesFetched = 0;
  const maxEventPages = 10;
  while (nextUrl && pagesFetched < maxEventPages) {
    pagesFetched += 1;
    const res = await fetchText(nextUrl, { headers: { Accept: "application/ld+json" } });
    if (!res.ok) {
      notes.push(`${nextUrl}: HTTP ${res.status}`);
      break;
    }
    let body;
    try {
      body = JSON.parse(res.text);
    } catch (error) {
      notes.push(`${nextUrl}: ${error.message}`);
      break;
    }
    const members = Array.isArray(body?.["hydra:member"]) ? body["hydra:member"] : [];
    for (const member of members) {
      if (typeof member?.["@id"] === "string") eventIds.push(member["@id"]);
    }
    const next = body?.["hydra:view"]?.["hydra:next"];
    nextUrl = typeof next === "string" ? new URL(next, apiBase).toString() : null;
  }

  const boundedEventIds = eventIds.length > MAX_DETAIL_FETCHES ? eventIds.slice(0, MAX_DETAIL_FETCHES) : eventIds;
  if (eventIds.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} of ${eventIds.length} future Musiques-category events for this run (MAX_DETAIL_FETCHES)`);

  const eventDateNodes = [];
  for (const eventId of boundedEventIds) {
    const url = `${apiBase}/event_dates?event=${encodeURIComponent(eventId)}`;
    const res = await fetchText(url, { headers: { Accept: "application/ld+json" } });
    if (!res.ok) {
      notes.push(`${url}: HTTP ${res.status}`);
      continue;
    }
    let body;
    try {
      body = JSON.parse(res.text);
    } catch (error) {
      notes.push(`${url}: ${error.message}`);
      continue;
    }
    const members = Array.isArray(body?.["hydra:member"]) ? body["hydra:member"] : [];
    eventDateNodes.push(...members);
  }

  const observations = theatreDeLaVilleToObservations(eventDateNodes, { retrievedAt: new Date().toISOString(), baseUrl: "https://www.theatredelaville-paris.com" });
  return { rawRecordCount: eventDateNodes.length, observations, notes };
}

async function collectPointEphemere() {
  const rootUrl = buildApiRootUrl("pointf");
  const rootRes = await fetchText(rootUrl, { headers: { Accept: "application/json" } });
  if (!rootRes.ok) throw new Error(`HTTP ${rootRes.status} from ${rootUrl}`);
  const { masterRef, searchFormAction } = parseApiRoot(rootRes.text);

  const notes = [];
  const allRecords = [];
  const seen = new Set();
  let page = 1;
  const maxPages = 10;
  while (page <= maxPages) {
    const url = buildPointEphemereEventsUrl(searchFormAction, masterRef, { fromDate: todayDateString(), page, pageSize: 100 });
    const res = await fetchText(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      notes.push(`page ${page}: HTTP ${res.status}`);
      break;
    }
    let records;
    try {
      records = parsePointEphemereEvents(res.text);
    } catch (error) {
      notes.push(`page ${page}: ${error.message}`);
      break;
    }
    for (const record of records) {
      if (record.source_record_id && !seen.has(record.source_record_id)) {
        seen.add(record.source_record_id);
        allRecords.push({ record, retrievedAt: res.retrievedAt });
      }
    }
    if (records.length === 0) break;
    page += 1;
  }

  const observations = allRecords.map(({ record, retrievedAt }) => pointEphemereToObservations([record], { retrievedAt })[0]);
  return { rawRecordCount: allRecords.length, observations, notes };
}

// ---------------------------------------------------------------------
// D — reused existing collector families, zero/near-zero new code
// ---------------------------------------------------------------------

async function collectSupersonic() {
  const config = { source_id: "supersonic-paris", baseUrl: "https://supersonic-club.fr", perPage: 50, maxPages: 10 };
  const result = await fetchAllEvents(config);
  if (!result.ok && result.pagesFetched <= 1) {
    const firstError = result.errors[0];
    throw new Error(firstError ? `${firstError.message} (page ${firstError.page}, ${firstError.url})` : "Events Calendar API request failed");
  }
  const notes = result.errors.map((err) => `page ${err.page} (${err.url}): ${err.message}`);
  const observations = eventsCalendarToObservations(result.records, config, { retrievedAt: new Date().toISOString(), sourceUrl: `${config.baseUrl}/wp-json/tribe/events/v1/events`, contentType: "application/json" });
  return { rawRecordCount: result.records.length, observations, notes };
}

async function collectSunsetSunside() {
  const config = { source_id: "sunset-sunside-paris", baseUrl: "https://www.sunset-sunside.com", perPage: 50, maxPages: 10 };
  // This source's own real REST API has been observed live taking close to
  // 50 seconds to respond (matching a-trane-berlin/kesselhaus-kulturbrauerei
  // -berlin's own precedent in ingestion/berlin/run.mjs for a genuinely slow
  // source) — a longer, still-bounded timeout, not an unbounded wait.
  const result = await fetchAllEvents(config, { timeoutMs: 75_000 });
  if (!result.ok && result.pagesFetched <= 1) {
    const firstError = result.errors[0];
    throw new Error(firstError ? `${firstError.message} (page ${firstError.page}, ${firstError.url})` : "Events Calendar API request failed");
  }
  const notes = result.errors.map((err) => `page ${err.page} (${err.url}): ${err.message}`);
  const observations = eventsCalendarToObservations(result.records, config, { retrievedAt: new Date().toISOString(), sourceUrl: `${config.baseUrl}/wp-json/tribe/events/v1/events`, contentType: "application/json" });
  return { rawRecordCount: result.records.length, observations, notes };
}

async function collect38Riv() {
  const listUrl = "https://38riv.com/en/concerts";
  const baseUrl = "https://38riv.com";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allDetailUrls = extractLinksMatching(listRes.text, /href="(\/en\/concerts\/[a-z0-9-]+)"/g, { baseUrl });
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const notes = [`${allDetailUrls.length} candidate detail URL(s) discovered from the list page`];
  if (allDetailUrls.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail URLs for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const detailUrl of detailUrls) {
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    try {
      // This source's own top-level JSON-LD node is typed 'EventSeries', not
      // the default Event/MusicEvent — widened here, caller-side, matching
      // this project's existing precedent (never a shared-module edit).
      const nodes = extractEventNodes(detailRes.text, { types: new Set(["Event", "MusicEvent", "EventSeries"]) });
      if (nodes.length === 0) continue;
      const record = normaliseJsonLdEvent(nodes[0], { deriveId: () => lastPathSegment(detailUrl) });
      observations.push(jsonLdToObservation(record, { source_id: "38riv-paris" }, { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl, venueNameOverride: "38Riv" }));
    } catch (error) {
      notes.push(`${detailUrl}: ${error.message}`);
    }
  }
  return { rawRecordCount: detailUrls.length, observations, notes };
}

async function collectLesTroisBaudets() {
  const listUrl = "https://lestroisbaudets.com/l-agenda";
  const baseUrl = "https://lestroisbaudets.com";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allDetailUrls = extractLinksMatching(listRes.text, /href="(\/l-agenda\/[a-z0-9-]+)"/g, { baseUrl });
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const notes = [`${allDetailUrls.length} candidate detail URL(s) discovered from the list page`];
  if (allDetailUrls.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail URLs for this run (MAX_DETAIL_FETCHES)`);

  // This source's own Event node carries no top-level 'url' at all — its
  // canonical detail URL is instead stated only on 'offers.url' (see
  // tests/les-trois-baudets.test.mjs's own deriveEventId, copied exactly).
  const deriveEventId = (node) => {
    const offersUrl = Array.isArray(node.offers) ? node.offers[0]?.url : node.offers?.url;
    return lastPathSegment(node.url ?? offersUrl);
  };

  const observations = [];
  for (const detailUrl of detailUrls) {
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    try {
      const nodes = extractEventNodes(detailRes.text);
      if (nodes.length === 0) continue;
      const record = normaliseJsonLdEvent(nodes[0], { deriveId: deriveEventId });
      observations.push(jsonLdToObservation(record, { source_id: "les-trois-baudets-paris" }, { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl, venueNameOverride: "Les Trois Baudets" }));
    } catch (error) {
      notes.push(`${detailUrl}: ${error.message}`);
    }
  }
  return { rawRecordCount: detailUrls.length, observations, notes };
}

async function collectTruskel() {
  const sitemapUrl = "https://www.truskel.fr/event-pages-sitemap.xml";
  const sitemapRes = await fetchText(sitemapUrl, { headers: { Accept: "application/xml" } });
  if (!sitemapRes.ok) throw new Error(`HTTP ${sitemapRes.status} from ${sitemapUrl}`);
  const allDetailUrls = extractTruskelEventDetailUrls(sitemapRes.text);
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const notes = [`${allDetailUrls.length} candidate event-details URL(s) discovered from the sitemap`];
  if (allDetailUrls.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail URLs for this run (MAX_DETAIL_FETCHES)`);

  const observations = [];
  for (const detailUrl of detailUrls) {
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    try {
      const nodes = extractTruskelEventNodes(detailRes.text);
      for (const node of nodes) {
        observations.push(truskelToObservation(node, { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl }));
      }
    } catch (error) {
      notes.push(`${detailUrl}: ${error.message}`);
    }
  }
  return { rawRecordCount: detailUrls.length, observations, notes };
}

// ---------------------------------------------------------------------
// E — shared wp-evenement-cards family
// ---------------------------------------------------------------------

async function collectLeTrianon() {
  const url = "https://www.letrianon.fr/en/event/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractWpEvenementCards(res.text);
  const observations = wpEvenementToObservations(cards, { source_id: "le-trianon-paris", venueName: "Le Trianon", retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectElyseeMontmartre() {
  const url = "https://www.elyseemontmartre.com/fr/programmation/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractWpEvenementCards(res.text);
  const observations = wpEvenementToObservations(cards, { source_id: "elysee-montmartre-paris", venueName: "Élysée Montmartre", retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

// ---------------------------------------------------------------------
// F — remaining bespoke sources
// ---------------------------------------------------------------------

async function collectDucDesLombards() {
  const url = "https://ducdeslombards.com/fr/l-agenda";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const occurrences = extractDucDesLombardsOccurrences(res.text);
  const observations = ducDesLombardsToObservations(occurrences, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: occurrences.length, observations, notes: [] };
}

async function collectLaBouleNoire() {
  const url = "https://laboule-noire.fr/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractBouleNoireCards(res.text);
  // Per-event price requires a bounded per-event detail fetch
  // (extractEventPrice()); this investigation records price as an OPTIONAL
  // field (not required for activation) and this run deliberately skips
  // those ~24 extra detail fetches to keep the run fast — every event's
  // title/date/url is still fully PROVEN from the homepage alone.
  const observations = bouleNoireToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: ["per-event price detail fetches skipped (price is OPTIONAL for this source, not gated for activation)"] };
}

async function collectMaisonDeLaRadio() {
  const baseUrl = "https://www.maisondelaradioetdelamusique.fr/agenda";
  const pageUrls = [baseUrl, `${baseUrl}?page=1`, `${baseUrl}?page=2`];
  const notes = [`bounded to the first ${pageUrls.length} pages of this source's own paginated /agenda Drupal View — never silently pretending this is the full catalogue`];

  let allCards = [];
  let retrievedAt = new Date().toISOString();
  for (const pageUrl of pageUrls) {
    const res = await fetchText(pageUrl, {});
    if (!res.ok) {
      notes.push(`${pageUrl}: HTTP ${res.status}`);
      continue;
    }
    retrievedAt = res.retrievedAt ?? retrievedAt;
    allCards = allCards.concat(extractMaisonRadioCards(res.text));
  }
  const { musicCards, rejectedCards } = filterMaisonRadioMusicCards(allCards);
  notes.push(`${musicCards.length} music-relevant ('Concert'), ${rejectedCards.length} rejected (non-concert event type)`);
  const observations = maisonRadioToObservations(musicCards, { retrievedAt });
  return { rawRecordCount: allCards.length, observations, notes };
}

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------

const COLLECTORS = {
  "accor-arena-paris": collectAccorArena,
  "zenith-la-villette-paris": collectZenith,
  "adidas-arena-paris": collectAdidasArena,
  "le-grand-rex-paris": collectLeGrandRex,
  "la-machine-du-moulin-rouge-paris": collectLaMachineDuMoulinRouge,
  "le-trabendo-paris": collectLeTrabendo,
  "cafe-de-la-danse-paris": collectCafeDeLaDanse,
  "glazart-paris": collectGlazart,
  "le-baiser-sale-paris": collectLeBaiserSale,
  "gaite-lyrique-paris": collectGaiteLyrique,
  "le-hasard-ludique-paris": collectLeHasardLudique,
  "caveau-de-la-huchette-paris": collectCaveauDeLaHuchette,
  "new-morning-paris": collectNewMorning,
  "le-bateau-phare-paris": collectLeBateauPhare,
  "salle-pleyel-paris": collectSallePleyel,
  "backstage-btm-paris": collectBackstageBtm,
  "badaboum-paris": collectBadaboum,
  "alhambra-paris": collectAlhambra,
  "dome-de-paris": collectDomeDeParis,
  "la-bellevilloise-paris": collectLaBellevilloise,
  "institut-du-monde-arabe-paris": collectInstitutDuMondeArabe,
  "philharmonie-paris": collectPhilharmonie,
  "olympia-paris": collectOlympia,
  "le-bataclan-paris": collectLeBataclan,
  "centquatre-paris": collectCentquatre,
  "theatre-de-la-ville-paris": collectTheatreDeLaVille,
  "point-ephemere-paris": collectPointEphemere,
  "supersonic-paris": collectSupersonic,
  "sunset-sunside-paris": collectSunsetSunside,
  "38riv-paris": collect38Riv,
  "les-trois-baudets-paris": collectLesTroisBaudets,
  "truskel-paris": collectTruskel,
  "le-trianon-paris": collectLeTrianon,
  "elysee-montmartre-paris": collectElyseeMontmartre,
  "duc-des-lombards-paris": collectDucDesLombards,
  "la-boule-noire-paris": collectLaBouleNoire,
  "maison-de-la-radio-et-de-la-musique-paris": collectMaisonDeLaRadio,
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

export async function acquireParis() {
  const parisRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/paris.json"), "utf8"));
  console.log(`\n-- Paris (${PARIS_SOURCE_IDS.length} sources) --`);
  const parisResults = await acquireAll(PARIS_SOURCE_IDS, parisRegistry.entries);
  const parisObservations = parisResults.flatMap((r) => r.observations);
  return { parisRegistry, parisResults, parisObservations };
}

export function summariseParis({ sourceResults, observations, venues, sourceRegistry, manualCoordinatesByVenueId }) {
  const resolutions = observations.map((observation) => ({ observation, resolution: resolveObservation(observation) }));
  const resolvedCount = resolutions.filter((r) => r.resolution.resolution_status === "RESOLVED").length;
  const unresolvedCount = resolutions.length - resolvedCount;
  const unresolvedList = resolutions
    .filter((r) => r.resolution.resolution_status !== "RESOLVED")
    .map((r) => ({ source_id: r.observation.source_id, source_record_id: r.observation.source_record_id, title: r.observation.title, venue_name: r.observation.venue_name, location_text: r.observation.location_text }));

  const markers = buildFranceMarkers({ parisObservations: observations, parisVenues: venues, parisSourceRegistry: sourceRegistry, manualCoordinatesByVenueId });
  const displayListingCount = markers.reduce((sum, m) => sum + m.display_listings.length, 0);

  return {
    label: "Paris",
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
  const parisVenues = JSON.parse(await readFile(resolve(ROOT, "venues/paris.json"), "utf8"));
  const manualStore = await loadManualCoordinateStore();
  const manualCoordinatesByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));

  const { parisRegistry, parisResults, parisObservations } = await acquireParis();

  const summary = summariseParis({
    sourceResults: parisResults,
    observations: parisObservations,
    venues: parisVenues.venues,
    sourceRegistry: parisRegistry.entries,
    manualCoordinatesByVenueId,
  });

  const proof = {
    label: "BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 live run proof — a point-in-time snapshot, NOT deterministic fixture data",
    note: "Generated by ingestion/paris/run.mjs from real, live HTTP acquisition against the 37 bounded Paris sources. Re-running this command later will legitimately produce different counts as each source's own real-world listings change.",
    run_at: new Date().toISOString(),
    paris: summary,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

  console.log(`\n=== Paris run summary ===`);
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
