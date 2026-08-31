// BEATMAPPED-ZIG-ZAG-LIVE-EVENT-LINK-REPAIR-01 — regression coverage for
// the fix in ingestion/berlin/run.mjs's collectListDetailJsonLd()/
// collectZigZagJazzClub(): this venue's own JSON-LD Event nodes publish
// no `url` property at all (retained evidence:
// research/source-investigations/beatmapped-zig-zag-live-event-link-
// repair-01/evidence/raw-jsonld-sample.json), so every Observation
// previously carried `event_url: null` despite the correct, real,
// individually-fetched first-party detail page already being in hand.
//
// collectListDetailJsonLd()/collectZigZagJazzClub() are module-private in
// ingestion/berlin/run.mjs (no per-source export exists, matching this
// file's own existing convention — see tests/html-link-discovery-berlin-
// cohort.test.mjs, which already tests this exact venue via the same
// underlying primitives rather than the private collector wrapper). These
// tests exercise the SAME underlying, unmodified primitives
// (extractLinksMatching, normaliseJsonLdEvent, toObservation) with the
// SAME retained fixtures and the SAME arguments the fixed collector
// actually passes — including the new `eventDetailUrl` option, which is
// toObservation()'s own pre-existing, unmodified fallback field
// (`record.event_url ?? record.ticket_url ?? options.eventDetailUrl ??
// null`) that collectListDetailJsonLd() now supplies only when its new,
// opt-in-only `eventUrlFallback` parameter is true.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractLinksMatching } from "../ingestion/html-link-discovery/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservation } from "../ingestion/json-ld/observation-adapter.mjs";
import { projectObservationsToDisplayMarkers, listingIdentity } from "../ingestion/map/group-associated-listings.mjs";

async function realBerlinVenues() {
  const raw = await readFile(new URL("../venues/berlin.json", import.meta.url), "utf8");
  return JSON.parse(raw).venues;
}

function fixture(dir, name) {
  return readFile(new URL(`../fixtures/${dir}/${name}`, import.meta.url), "utf8");
}

const DETAIL_URL = "https://www.zigzag-jazzclub.berlin/program-mai/duke-place-example";
const SOURCE_ID = "zig-zag-jazz-club-berlin";

async function realZigZagRecord() {
  const detail = await fixture("zig-zag-jazz-club-berlin", "event-detail.html");
  const nodes = extractEventNodes(detail);
  assert.ok(nodes.length >= 1, "retained fixture must still carry at least one JSON-LD Event node");
  return normaliseJsonLdEvent(nodes[0], { deriveId: () => "duke-place-example" });
}

test("(1) real Zig Zag programme markup still discovers individual event links (unchanged discovery step)", async () => {
  const list = await fixture("zig-zag-jazz-club-berlin", "program.html");
  const urls = extractLinksMatching(list, /href="(\/program-mai\/[a-z0-9-]+)"/g, { baseUrl: "https://www.zigzag-jazzclub.berlin" });
  assert.ok(urls.length >= 1);
  assert.ok(urls.every((u) => u.startsWith("https://www.zigzag-jazzclub.berlin/program-mai/")));
});

test("(root cause, retained) the real fixture's own JSON-LD Event node genuinely publishes no `url` — record.event_url is null before any fix", async () => {
  const record = await realZigZagRecord();
  assert.equal(record.event_url, null);
});

test("(2) with eventDetailUrl supplied, the already-known, already-fetched detail URL reaches the Observation's own event_url", async () => {
  const record = await realZigZagRecord();
  const observation = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: DETAIL_URL });
  assert.equal(observation.event_url, DETAIL_URL);
});

test("(3) title and date are unaffected by supplying eventDetailUrl", async () => {
  const record = await realZigZagRecord();
  const without = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club" });
  const withFix = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: DETAIL_URL });
  assert.equal(withFix.title, without.title);
  assert.deepEqual(withFix.start, without.start);
});

test("(4) venue name, source_id, and source_record_id are unaffected by supplying eventDetailUrl", async () => {
  const record = await realZigZagRecord();
  const without = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club" });
  const withFix = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: DETAIL_URL });
  assert.equal(withFix.venue_name, without.venue_name);
  assert.equal(withFix.source_id, without.source_id);
  assert.equal(withFix.source_record_id, without.source_record_id);
});

test("(5) two distinct events retain their own distinct, corresponding detail URLs — never cross-assigned", async () => {
  const record = await realZigZagRecord();
  const urlA = "https://www.zigzag-jazzclub.berlin/program-mai/event-a";
  const urlB = "https://www.zigzag-jazzclub.berlin/program-mai/event-b";
  const obsA = toObservation({ ...record }, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: urlA, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: urlA });
  const obsB = toObservation({ ...record }, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: urlB, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: urlB });
  assert.equal(obsA.event_url, urlA);
  assert.equal(obsB.event_url, urlB);
  assert.notEqual(obsA.event_url, obsB.event_url);
});

test("(6) deduplication identity (source_id + source_record_id) is untouched by the fix — event_url plays no part in listing identity", async () => {
  const record = await realZigZagRecord();
  const observation = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: DETAIL_URL });
  // listingIdentity() (ingestion/map/group-associated-listings.mjs) keys purely
  // on `${source_id}:${source_record_id}` — confirmed unaffected by event_url.
  assert.equal(listingIdentity(observation), `${observation.source_id}:${observation.source_record_id}`);
  assert.equal(listingIdentity({ ...observation, event_url: "https://example.com/completely-different" }), listingIdentity(observation));
});

test("(7) no URL is fabricated for an event that never produced a valid record at all", async () => {
  // collectListDetailJsonLd()'s own loop only ever reaches toObservation()
  // after a candidate detail page yields at least one qualifying JSON-LD
  // Event/MusicEvent/DanceEvent node (`if (nodes.length === 0) continue;`).
  // A page with zero qualifying nodes never produces an Observation at
  // all — nothing for eventUrlFallback to attach a URL to.
  const emptyHtml = "<html><body>No structured event data here.</body></html>";
  const nodes = extractEventNodes(emptyHtml);
  assert.equal(nodes.length, 0, "a page with no JSON-LD Event data must never yield a node to build a fabricated Observation from");
});

test("(8) the repaired event_url survives publication projection (Observation -> display marker listing) unchanged", async () => {
  const record = await realZigZagRecord();
  const observation = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-31T00:00:00.000Z", sourceUrl: DETAIL_URL, venueNameOverride: "Zig Zag Jazz Club", eventDetailUrl: DETAIL_URL });

  // Read-only use of the real, existing venue registry (never modified) so
  // resolveObservation() (ingestion/venue/resolver.mjs's own data-driven
  // venues/source-venue-mappings.json table) genuinely resolves this
  // observation to Zig Zag Jazz Club's real venue_id, exactly as the live
  // publication path does — not a synthetic stand-in venue shape.
  const venues = await realBerlinVenues();
  const sourceRegistry = [{ id: SOURCE_ID, name: "Zig Zag Jazz Club" }];
  const markers = projectObservationsToDisplayMarkers([observation], { venues, sourceRegistry, associations: [], manualCoordinatesByVenueId: new Map() });

  const allListings = markers.flatMap((m) => m.display_listings ?? []);
  assert.ok(allListings.length >= 1, "the observation must resolve to at least one displayed listing");
  const listing = allListings.find((l) => l.sources?.some((s) => s.event_url === DETAIL_URL) || l.event_url === DETAIL_URL);
  assert.ok(listing, `expected a display listing carrying event_url ${DETAIL_URL}, got ${JSON.stringify(allListings)}`);
});
