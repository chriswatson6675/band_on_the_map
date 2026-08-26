#!/usr/bin/env node
// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — the one manual
// entry point this package adds: `npm run ingest:berlin`.
//
// Orchestrates Berlin's own bounded, 24-source pipeline, mirroring
// ingestion/barcelona/run.mjs's exact pattern (never touching it, or
// ingestion/lisbon-porto/run.mjs, or the unattended runner — Berlin is a
// wholly separate, parallel entry point):
//
//   selected sources/berlin.json registry entries
//     -> acquire first-party source records (live HTTP, these 24
//        sources only — reusable collector families
//        [ingestion/json-ld/, ingestion/ics/, ingestion/per-event-ics/,
//        ingestion/html-link-discovery/, ingestion/events-calendar-api/,
//        ingestion/sveltekit-data/] plus a handful of small bespoke
//        collectors)
//     -> adapt each into the existing Observation model
//     -> resolve venues (ingestion/venue/resolver.mjs, unchanged; every
//        Berlin source resolves via the DATA-DRIVEN table,
//        venues/source-venue-mappings.json — no new hardcoded resolver
//        function was added)
//     -> project resolved listings into map markers
//        (ingestion/map/publication.mjs's buildGermanyMarkers())
//     -> regenerate a Berlin live-run proof output
//     -> emit a human-readable per-source run summary
//
// This is a live-network, manually-triggered script — real HTTP requests
// to the 24 registry sources below, and only those sources. Every
// acquisition failure is caught per-source and reported; the run
// continues for every other source. No fallback/synthetic data is ever
// substituted for a failed source.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchText } from "../http/fetch.mjs";

import { extractEventNodes, filterMusicEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { toObservations as jsonLdToObservations, toObservation as jsonLdToObservation } from "../json-ld/observation-adapter.mjs";

import { extractLinksMatching } from "../html-link-discovery/discovery.mjs";

import { extractEventCards, filterMusicEventCards, extractIcalLink } from "../per-event-ics/discovery.mjs";
import { toObservation as perEventIcsToObservation } from "../per-event-ics/observation-adapter.mjs";

import { fetchAllEvents } from "../events-calendar-api/fetch-all.mjs";
import { toObservations as eventsCalendarToObservations } from "../events-calendar-api/observation-adapter.mjs";

import { decodeSvelteKitData } from "../sveltekit-data/decode.mjs";
import { toObservations as biNuuToObservations } from "../bi-nuu/observation-adapter.mjs";

import { toObservationsBatch as heimathafenToObservations } from "../heimathafen-neukoelln/observation-adapter.mjs";
import { toObservations as festsaalToObservations } from "../festsaal-kreuzberg/observation-adapter.mjs";
import { toObservations as zennerToObservations } from "../zenner/observation-adapter.mjs";
import { extractEventCards as extractBadehausCards, toObservations as badehausToObservations } from "../badehaus/observation-adapter.mjs";
import { extractEventCards as extractUrbanSpreeCards, toObservations as urbanSpreeToObservations } from "../urban-spree/observation-adapter.mjs";
import { extractEventCards as extractAuslandCards, toObservations as auslandToObservations } from "../ausland/observation-adapter.mjs";
import { toObservation as kunstfabrikSchlotToObservation } from "../kunstfabrik-schlot/observation-adapter.mjs";

import { resolveObservation } from "../venue/resolver.mjs";
import { buildGermanyMarkers } from "../map/publication.mjs";
import { loadManualCoordinateStore } from "../geocoding/manual-coordinate-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = resolve(ROOT, "fixtures/map/berlin-30-40-venue-collector-reuse-trial-01-live-run-proof.json");

export const BERLIN_SOURCE_IDS = [
  // A — EXISTING_COLLECTOR_ZERO_CODE / near-zero
  "waldbuehne-berlin",
  "a-trane-berlin",
  "privatclub-berlin",
  "yaam-berlin",
  "tempodrom-berlin", // CONFIGURATION_ONLY: required a 1-line existing-parser widening (see ingestion/json-ld/parse.mjs)
  // B — CONFIGURATION_ONLY (html-link-discovery + existing json-ld)
  "konzerthaus-berlin",
  "lido-berlin",
  "b-flat-berlin",
  "so36-berlin",
  "zig-zag-jazz-club-berlin",
  "kesselhaus-kulturbrauerei-berlin",
  "hkw-berlin",
  "volksbuehne-berlin",
  // C/B — per-event-ics family
  "uber-arena-berlin",
  "verti-music-hall-berlin",
  "columbiahalle-berlin",
  // D — bespoke, unique platforms
  "bi-nuu-berlin",
  "heimathafen-neukoelln-berlin",
  "festsaal-kreuzberg-berlin",
  "zenner-berlin",
  "badehaus-berlin",
  "urban-spree-berlin",
  "ausland-berlin",
  "kunstfabrik-schlot-berlin",
];

async function loadRegistryEntry(entries, sourceId) {
  const entry = entries.find((candidate) => candidate.id === sourceId);
  if (!entry) throw new Error(`"${sourceId}" is not present in sources/berlin.json`);
  return entry;
}

function lastPathSegment(url) {
  const trimmed = (url ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

// ---------------------------------------------------------------------
// Family A/B — a single JSON-LD page fetch, or list+detail via the new
// ingestion/html-link-discovery/ module, both feeding the EXISTING,
// unmodified ingestion/json-ld/ parser + observation-adapter.
// ---------------------------------------------------------------------

async function collectSinglePageJsonLd({ sourceId, url, venueNameOverride, filterMusic = false, timeoutMs }) {
  const res = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const nodes = extractEventNodes(res.text);
  const { musicNodes, rejectedNodes } = filterMusic ? filterMusicEventNodes(nodes) : { musicNodes: nodes, rejectedNodes: [] };
  const records = musicNodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => n.url ?? lastPathSegment(n.url) }));
  const observations = jsonLdToObservations(records, { source_id: sourceId }, { retrievedAt: res.retrievedAt, sourceUrl: url, venueNameOverride });
  const notes = filterMusic ? [`${musicNodes.length} music-relevant, ${rejectedNodes.length} rejected`] : [];
  return { rawRecordCount: nodes.length, observations, notes };
}

// Bounded cap on individual detail-page fetches per source, in this
// bounded trial — a safety bound against a genuinely huge sitemap (e.g.
// HKW's own 4,153 total /en/programme/ URLs spanning its entire
// multi-year, multi-discipline archive, not just its current/near-term
// music programme) blowing an unbounded sequential-fetch run out to
// hours. Never silently disguised: a truncated run is always reported as
// such in `notes`. Every non-sitemap source in this trial (list/detail
// HTML pages) has stayed comfortably under this bound on its own.
const MAX_DETAIL_FETCHES = 80;

async function collectListDetailJsonLd({ sourceId, listUrl, listIsXml = false, linkPattern, baseUrl, venueNameOverride, timeoutMs }) {
  const fetchOpts = timeoutMs ? { timeoutMs } : {};
  const listRes = await fetchText(listUrl, fetchOpts);
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allDetailUrls = extractLinksMatching(listRes.text, linkPattern, { baseUrl });
  const truncated = allDetailUrls.length > MAX_DETAIL_FETCHES;
  const detailUrls = truncated ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const observations = [];
  const notes = [`${allDetailUrls.length} candidate detail URL(s) discovered from ${listIsXml ? "sitemap.xml" : "the list page"}`];
  if (truncated) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} detail URLs for this trial run (MAX_DETAIL_FETCHES) — more candidates exist, not silently dropped`);
  let rawCount = 0;
  for (const detailUrl of detailUrls) {
    const detailRes = await fetchText(detailUrl, fetchOpts);
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    const nodes = extractEventNodes(detailRes.text, { types: new Set(["Event", "MusicEvent", "DanceEvent"]) });
    rawCount += nodes.length;
    if (nodes.length === 0) continue;
    const record = normaliseJsonLdEvent(nodes[0], { deriveId: () => lastPathSegment(detailUrl) });
    observations.push(jsonLdToObservation(record, { source_id: sourceId }, { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl, venueNameOverride }));
  }
  return { rawRecordCount: rawCount, observations, notes };
}

async function collectWaldbuehne() {
  return collectSinglePageJsonLd({ sourceId: "waldbuehne-berlin", url: "https://www.waldbuehne-berlin.de/programm-und-tickets/", venueNameOverride: "Waldbühne" });
}
async function collectATrane() {
  // This source's own real page has been observed slower than the
  // default 20s bound (research/source-investigations/a-trane-berlin-01/
  // itself proved it live) — a longer, still-bounded timeout, not an
  // unbounded wait.
  return collectSinglePageJsonLd({ sourceId: "a-trane-berlin", url: "https://a-trane.de/programm/", venueNameOverride: "A-Trane", timeoutMs: 45_000 });
}
async function collectPrivatclub() {
  return collectSinglePageJsonLd({ sourceId: "privatclub-berlin", url: "https://privatclub-berlin.de/", venueNameOverride: "Privatclub" });
}
async function collectTempodrom() {
  return collectSinglePageJsonLd({ sourceId: "tempodrom-berlin", url: "https://www.tempodrom.de/programm-und-tickets/", venueNameOverride: "Tempodrom" });
}

async function collectKonzerthaus() {
  return collectListDetailJsonLd({
    sourceId: "konzerthaus-berlin",
    listUrl: "https://www.konzerthaus.de/en/programm",
    linkPattern: /href="(\/en\/programm\/[a-z0-9-]+\/\d+)"/g,
    baseUrl: "https://www.konzerthaus.de",
    venueNameOverride: "Konzerthaus Berlin",
  });
}
async function collectLido() {
  return collectListDetailJsonLd({
    sourceId: "lido-berlin",
    listUrl: "https://www.lido-berlin.de/",
    linkPattern: /href="(\/events\/[a-z0-9-]+)"/g,
    baseUrl: "https://www.lido-berlin.de",
    venueNameOverride: "Lido",
  });
}
async function collectBFlat() {
  return collectListDetailJsonLd({
    sourceId: "b-flat-berlin",
    listUrl: "https://b-flat-berlin.de/programm",
    linkPattern: /href="(\/events\/[a-z0-9-]+)"/g,
    baseUrl: "https://b-flat-berlin.de",
    venueNameOverride: "b-flat",
  });
}
async function collectSo36() {
  return collectListDetailJsonLd({
    sourceId: "so36-berlin",
    listUrl: "https://www.so36.com/tickets",
    linkPattern: /href="(\/produkte\/[0-9]+-[a-z0-9-]+)"/g,
    baseUrl: "https://www.so36.com",
    venueNameOverride: "SO36",
  });
}
async function collectZigZagJazzClub() {
  return collectListDetailJsonLd({
    sourceId: "zig-zag-jazz-club-berlin",
    listUrl: "https://www.zigzag-jazzclub.berlin/menu-marquee",
    linkPattern: /href="(\/program-mai\/[a-z0-9-]+)"/g,
    baseUrl: "https://www.zigzag-jazzclub.berlin",
    venueNameOverride: "Zig Zag Jazz Club",
  });
}
async function collectKesselhaus() {
  return collectListDetailJsonLd({
    sourceId: "kesselhaus-kulturbrauerei-berlin",
    listUrl: "https://www.kesselhaus.net/en/calendar",
    linkPattern: /href="(\/en\/calendar\/[A-Za-z0-9_-]+)"/g,
    baseUrl: "https://www.kesselhaus.net",
    timeoutMs: 45_000, // this source's own calendar page has been observed slower than the default 20s bound
    venueNameOverride: "Kesselhaus (Kulturbrauerei)",
  });
}
async function collectHkw() {
  return collectListDetailJsonLd({
    sourceId: "hkw-berlin",
    listUrl: "https://www.hkw.de/sitemap.xml",
    listIsXml: true,
    linkPattern: /<loc>(https:\/\/www\.hkw\.de\/en\/programme\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)<\/loc>/g,
    baseUrl: "https://www.hkw.de",
    venueNameOverride: "Haus der Kulturen der Welt (HKW)",
  });
}
async function collectVolksbuehne() {
  return collectListDetailJsonLd({
    sourceId: "volksbuehne-berlin",
    listUrl: "https://volksbuehne-berlin.de/sitemap.xml",
    listIsXml: true,
    linkPattern: /<loc>(https:\/\/volksbuehne-berlin\.de\/produktionen\/[a-z0-9-]+\/\d{8}-\d{4}\/)<\/loc>/g,
    baseUrl: "https://volksbuehne-berlin.de",
    venueNameOverride: "Volksbühne am Rosa-Luxemburg-Platz",
  });
}

// ---------------------------------------------------------------------
// Family C/B — ingestion/per-event-ics/: a NEW reusable collector family
// (Uber Arena, its origin), reused unchanged by Verti Music Hall and
// (via an additive record.sourceRecordId override) Columbiahalle.
// ---------------------------------------------------------------------

async function collectPerEventIcs({ sourceId, listUrl, baseUrl, venueNameOverride, icsUrlFromDetail }) {
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allCards = extractEventCards(listRes.text);
  const { musicCards, rejectedCards } = filterMusicEventCards(allCards);

  const observations = [];
  const notes = [`${allCards.length} total card(s), ${musicCards.length} music-relevant, ${rejectedCards.length} rejected`];
  for (const card of musicCards) {
    const detailUrl = new URL(card.detailUrl, baseUrl).toString();
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    let icalLink;
    try {
      icalLink = extractIcalLink(detailRes.text);
    } catch (error) {
      notes.push(`${detailUrl}: ${error.message}`);
      continue;
    }
    const icsUrl = icsUrlFromDetail ? icsUrlFromDetail(detailUrl) : new URL(icalLink, baseUrl).toString();
    const icsRes = await fetchText(icsUrl, {});
    if (!icsRes.ok) {
      notes.push(`${icsUrl}: HTTP ${icsRes.status}`);
      continue;
    }
    observations.push(
      perEventIcsToObservation(
        { detailUrl, title: card.title, icsText: icsRes.text, icsUrl, retrievedAt: icsRes.retrievedAt, categoryName: card.categoryName },
        { source_id: sourceId, venueNameOverride },
      ),
    );
  }
  return { rawRecordCount: allCards.length, observations, notes };
}

async function collectUberArena() {
  return collectPerEventIcs({ sourceId: "uber-arena-berlin", listUrl: "https://www.uber-arena.de/events/all", baseUrl: "https://www.uber-arena.de", venueNameOverride: "Uber Arena" });
}
async function collectVertiMusicHall() {
  return collectPerEventIcs({ sourceId: "verti-music-hall-berlin", listUrl: "https://www.uber-eats-music-hall.de/events/all", baseUrl: "https://www.uber-eats-music-hall.de", venueNameOverride: "Verti Music Hall" });
}

async function collectColumbiahalle() {
  // Contao's own calendar module serves the per-event ICS at the SAME
  // URL as the "detail" link itself (a routing quirk, not a separate
  // page) — see research/source-investigations/columbiahalle-berlin-01/.
  const listUrl = "https://columbiahalle.berlin/veranstaltungen.html";
  const baseUrl = "https://columbiahalle.berlin";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  // NOTE: this source's real live page states this link with SINGLE
  // quotes and a relative (no leading slash) path
  // (<a href='veranstaltung/elle.html'>), unlike the bounded evidence
  // excerpt retained in the governed investigation — both quote styles
  // and both relative-path forms are matched here.
  const allDetailUrls = extractLinksMatching(listRes.text, /href=['"](\/?veranstaltung\/[a-z0-9-]+\.html)['"]/g, { baseUrl });
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const observations = [];
  const notes = [`${allDetailUrls.length} candidate event URL(s) discovered`];
  if (allDetailUrls.length > MAX_DETAIL_FETCHES) notes.push(`bounded to the first ${MAX_DETAIL_FETCHES} for this trial run`);
  for (const detailUrl of detailUrls) {
    const icsRes = await fetchText(detailUrl, { headers: { Accept: "text/calendar" } });
    if (!icsRes.ok) {
      notes.push(`${detailUrl}: HTTP ${icsRes.status}`);
      continue;
    }
    if (!/^BEGIN:VCALENDAR/m.test(icsRes.text)) {
      notes.push(`${detailUrl}: response was not a VCALENDAR (likely an HTML detail page, not an ICS export) — skipped`);
      continue;
    }
    // This source's own ICS UID is PROVEN stable (empirically re-fetched
    // and confirmed identical — see research/source-investigations/
    // columbiahalle-berlin-01/), so it is used directly as
    // sourceRecordId rather than falling back to the AEG-style detail
    // -URL-slug derivation (which this source's own URL shape does not
    // match anyway).
    const uidMatch = /^UID:(.+)$/m.exec(icsRes.text);
    if (!uidMatch) {
      notes.push(`${detailUrl}: no UID found in ICS — skipped`);
      continue;
    }
    observations.push(
      perEventIcsToObservation(
        { detailUrl, sourceRecordId: uidMatch[1].trim(), icsText: icsRes.text, icsUrl: detailUrl, retrievedAt: icsRes.retrievedAt },
        { source_id: "columbiahalle-berlin", venueNameOverride: "Columbiahalle" },
      ),
    );
  }
  return { rawRecordCount: detailUrls.length, observations, notes };
}

// ---------------------------------------------------------------------
// Family D — bespoke per-venue collectors, each layered on either an
// existing reusable module (events-calendar-api, sveltekit-data,
// html-link-discovery) or genuinely new small parsing code.
// ---------------------------------------------------------------------

async function collectYaam() {
  const config = { source_id: "yaam-berlin", baseUrl: "https://yaam.de", perPage: 50, maxPages: 10 };
  const result = await fetchAllEvents(config);
  if (!result.ok && result.pagesFetched <= 1) {
    const firstError = result.errors[0];
    throw new Error(firstError ? `${firstError.message} (page ${firstError.page}, ${firstError.url})` : "Events Calendar API request failed");
  }
  const notes = result.errors.map((err) => `page ${err.page} (${err.url}): ${err.message}`);
  const observations = eventsCalendarToObservations(result.records, config, { retrievedAt: new Date().toISOString(), sourceUrl: `${config.baseUrl}/wp-json/tribe/events/v1/events`, contentType: "application/json" });
  return { rawRecordCount: result.records.length, observations, notes };
}

async function collectBiNuu() {
  const url = "https://binuu.de/de/events/__data.json";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const decoded = decodeSvelteKitData(res.text);
  const events = decoded.events ?? [];
  const observations = biNuuToObservations(events, { retrievedAt: res.retrievedAt, sourceUrl: url, fixturePath: null });
  return { rawRecordCount: events.length, observations, notes: [] };
}

async function collectHeimathafenNeukoelln() {
  const url = "https://heimathafen-neukoelln.de/wp-json/wp/v2/events?per_page=50";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const records = JSON.parse(res.text);
  const observations = heimathafenToObservations(records, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: records.length, observations, notes: [] };
}

async function collectFestsaalKreuzberg() {
  const url = "https://admin.festsaal-kreuzberg.de/api/v2/pages/?type=home.EventPage&fields=*&limit=50";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const body = JSON.parse(res.text);
  const items = body.items ?? [];
  const observations = festsaalToObservations(items, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: items.length, observations, notes: [] };
}

async function collectZenner() {
  const url = "https://zenner.berlin/page-data/programm/page-data.json";
  const res = await fetchText(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const body = JSON.parse(res.text);
  const nodes = body?.result?.data?.queryKultur?.nodes ?? [];
  const observations = zennerToObservations(nodes, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: nodes.length, observations, notes: [] };
}

async function collectBadehaus() {
  const url = "https://badehaus-berlin.com/en/events/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractBadehausCards(res.text);
  const observations = badehausToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectUrbanSpree() {
  const url = "https://www.urbanspree.com/program/concerts/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractUrbanSpreeCards(res.text);
  const observations = urbanSpreeToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectAusland() {
  const url = "https://ausland.berlin/program/";
  const res = await fetchText(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cards = extractAuslandCards(res.text);
  const observations = auslandToObservations(cards, { retrievedAt: res.retrievedAt });
  return { rawRecordCount: cards.length, observations, notes: [] };
}

async function collectKunstfabrikSchlot() {
  const listUrl = "https://kunstfabrik-schlot.de/programm/";
  const baseUrl = "https://kunstfabrik-schlot.de";
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const titleRe = /<h4 class="edgtf-el-item-title">\s*([^<]+?)\s*<\/h4>[\s\S]*?<a itemprop="url" href="([^"]+)"/g;
  const cards = [];
  let match;
  titleRe.lastIndex = 0;
  while ((match = titleRe.exec(listRes.text)) !== null) {
    cards.push({ title: match[1].trim(), eventUrl: match[2] });
  }
  // Fall back to plain link discovery if the combined title+link regex
  // above doesn't match this run's exact markup ordering.
  const allLinks = cards.length > 0 ? cards.map((c) => c.eventUrl) : extractLinksMatching(listRes.text, /href="(https:\/\/kunstfabrik-schlot\.de\/event\/[a-z0-9-]+\/)"/g, { baseUrl });
  const links = allLinks.length > MAX_DETAIL_FETCHES ? allLinks.slice(0, MAX_DETAIL_FETCHES) : allLinks;

  const observations = [];
  const notes = allLinks.length > MAX_DETAIL_FETCHES ? [`bounded to the first ${MAX_DETAIL_FETCHES} of ${allLinks.length} discovered event URLs for this trial run`] : [];
  for (const link of links) {
    const card = cards.find((c) => c.eventUrl === link) ?? { title: null, eventUrl: link };
    const detailRes = await fetchText(link, {});
    if (!detailRes.ok) {
      notes.push(`${link}: HTTP ${detailRes.status}`);
      continue;
    }
    observations.push(kunstfabrikSchlotToObservation({ card, detailHtml: detailRes.text, retrievedAt: detailRes.retrievedAt }));
  }
  return { rawRecordCount: links.length, observations, notes };
}

const COLLECTORS = {
  "waldbuehne-berlin": collectWaldbuehne,
  "a-trane-berlin": collectATrane,
  "privatclub-berlin": collectPrivatclub,
  "yaam-berlin": collectYaam,
  "tempodrom-berlin": collectTempodrom,
  "konzerthaus-berlin": collectKonzerthaus,
  "lido-berlin": collectLido,
  "b-flat-berlin": collectBFlat,
  "so36-berlin": collectSo36,
  "zig-zag-jazz-club-berlin": collectZigZagJazzClub,
  "kesselhaus-kulturbrauerei-berlin": collectKesselhaus,
  "hkw-berlin": collectHkw,
  "volksbuehne-berlin": collectVolksbuehne,
  "uber-arena-berlin": collectUberArena,
  "verti-music-hall-berlin": collectVertiMusicHall,
  "columbiahalle-berlin": collectColumbiahalle,
  "bi-nuu-berlin": collectBiNuu,
  "heimathafen-neukoelln-berlin": collectHeimathafenNeukoelln,
  "festsaal-kreuzberg-berlin": collectFestsaalKreuzberg,
  "zenner-berlin": collectZenner,
  "badehaus-berlin": collectBadehaus,
  "urban-spree-berlin": collectUrbanSpree,
  "ausland-berlin": collectAusland,
  "kunstfabrik-schlot-berlin": collectKunstfabrikSchlot,
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

export async function acquireBerlin() {
  const berlinRegistry = JSON.parse(await readFile(resolve(ROOT, "sources/berlin.json"), "utf8"));
  console.log(`\n-- Berlin (${BERLIN_SOURCE_IDS.length} sources) --`);
  const berlinResults = await acquireAll(BERLIN_SOURCE_IDS, berlinRegistry.entries);
  const berlinObservations = berlinResults.flatMap((r) => r.observations);
  return { berlinRegistry, berlinResults, berlinObservations };
}

export function summariseBerlin({ sourceResults, observations, venues, sourceRegistry, manualCoordinatesByVenueId }) {
  const resolutions = observations.map((observation) => ({ observation, resolution: resolveObservation(observation) }));
  const resolvedCount = resolutions.filter((r) => r.resolution.resolution_status === "RESOLVED").length;
  const unresolvedCount = resolutions.length - resolvedCount;
  const unresolvedList = resolutions
    .filter((r) => r.resolution.resolution_status !== "RESOLVED")
    .map((r) => ({ source_id: r.observation.source_id, source_record_id: r.observation.source_record_id, title: r.observation.title, venue_name: r.observation.venue_name, location_text: r.observation.location_text }));

  const markers = buildGermanyMarkers({ berlinObservations: observations, berlinVenues: venues, berlinSourceRegistry: sourceRegistry, manualCoordinatesByVenueId });
  const displayListingCount = markers.reduce((sum, m) => sum + m.display_listings.length, 0);

  return {
    label: "Berlin",
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
  const berlinVenues = JSON.parse(await readFile(resolve(ROOT, "venues/berlin.json"), "utf8"));
  const manualStore = await loadManualCoordinateStore();
  const manualCoordinatesByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));

  const { berlinRegistry, berlinResults, berlinObservations } = await acquireBerlin();

  const summary = summariseBerlin({
    sourceResults: berlinResults,
    observations: berlinObservations,
    venues: berlinVenues.venues,
    sourceRegistry: berlinRegistry.entries,
    manualCoordinatesByVenueId,
  });

  const proof = {
    label: "BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 live run proof — a point-in-time snapshot, NOT deterministic fixture data",
    note: "Generated by ingestion/berlin/run.mjs from real, live HTTP acquisition against the 24 bounded Berlin sources. Re-running this command later will legitimately produce different counts as each source's own real-world listings change.",
    run_at: new Date().toISOString(),
    berlin: summary,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

  console.log(`\n=== Berlin run summary ===`);
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
