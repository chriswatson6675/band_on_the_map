import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { extractLinksMatching } from "../ingestion/html-link-discovery/discovery.mjs";
import { createDetailPageHandoff } from "../ingestion/html-link-discovery/detail-page-handoff.mjs";
import { toObservation } from "../ingestion/json-ld/observation-adapter.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { projectObservationsToDisplayMarkers } from "../ingestion/map/group-associated-listings.mjs";
import { toPublicationMarker } from "../ingestion/map/publication.mjs";

const RETRIEVED_AT = "2026-08-26T00:00:00.000Z";

const fixture = (path) => readFile(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

function section(html, marker, nextMarker = null) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing retained marker ${marker}`);
  const end = nextMarker ? html.indexOf(nextMarker, start + marker.length) : -1;
  return html.slice(start, end === -1 ? undefined : end);
}

test("retained Zig Zag detail URL survives discovery through publication output", async () => {
  const programme = await fixture("zig-zag-jazz-club-berlin/program.html");
  const discovered = extractLinksMatching(programme, /href="(\/program-mai\/[a-z0-9-]+)"/g, {
    baseUrl: "https://www.zigzag-jazzclub.berlin",
  });
  const detailUrl = "https://www.zigzag-jazzclub.berlin/program-mai/duky-4tbm9";
  assert.ok(discovered.includes(detailUrl));

  const retained = await fixture("zig-zag-jazz-club-berlin/event-detail.html");
  const dukePage = section(retained, detailUrl, "https://www.zigzag-jazzclub.berlin/program-mai/juh2-7m9a7");
  const [node] = extractEventNodes(dukePage);
  const record = normaliseJsonLdEvent(node, { deriveId: () => "duky-4tbm9" });
  assert.match(record.title, /Duke.s Place/);
  assert.equal(record.event_url, null);
  assert.equal(record.ticket_url, null);

  const beforeFix = toObservation(
    record,
    { source_id: "zig-zag-jazz-club-berlin" },
    { retrievedAt: RETRIEVED_AT, sourceUrl: detailUrl, venueNameOverride: "Zig Zag Jazz Club" },
  );
  assert.equal(beforeFix.source_url, detailUrl);
  assert.equal(beforeFix.event_url, null);

  const handoff = createDetailPageHandoff({ detailPageUrl: detailUrl, pageText: dukePage, venueNameOverride: "Zig Zag Jazz Club" });
  const observation = toObservation(record, { source_id: "zig-zag-jazz-club-berlin" }, { retrievedAt: RETRIEVED_AT, ...handoff });
  assert.equal(observation.source_url, detailUrl);
  assert.equal(observation.event_url, detailUrl);
  assert.equal(observation.source_fields.event_detail_url, detailUrl);

  const venueRegistry = await json("venues/berlin.json");
  const sourceRegistry = await json("sources/berlin.json");
  const [beforeMarker] = projectObservationsToDisplayMarkers([beforeFix], {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });
  assert.equal(beforeMarker.listings[0].event_url, null);
  assert.equal(beforeMarker.display_listings[0].event_url, null);
  const [marker] = projectObservationsToDisplayMarkers([observation], {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });
  assert.ok(marker);
  assert.equal(marker.listings[0].event_url, detailUrl);
  assert.equal(marker.display_listings[0].event_url, detailUrl);
  assert.equal(toPublicationMarker(marker).display_listings[0].event_url, detailUrl);
});

test("an explicit alternate-venue notice suppresses a fixed-venue override and map projection", async () => {
  const retained = await fixture("zig-zag-jazz-club-berlin/event-detail.html");
  const detailUrl = "https://www.zigzag-jazzclub.berlin/program-mai/kennedy-pzxmg";
  const kennedyPage = section(retained, detailUrl);
  const [node] = extractEventNodes(kennedyPage);
  const record = normaliseJsonLdEvent(node, { deriveId: () => "kennedy-pzxmg" });
  const handoff = createDetailPageHandoff({ detailPageUrl: detailUrl, pageText: kennedyPage, venueNameOverride: "Zig Zag Jazz Club" });
  assert.equal(handoff.venueNameOverride, null);
  assert.equal(handoff.venueRelocationNoticeDetected, true);

  const observation = toObservation(record, { source_id: "zig-zag-jazz-club-berlin" }, { retrievedAt: RETRIEVED_AT, ...handoff });
  assert.equal(observation.venue_name, null);
  assert.equal(observation.event_url, detailUrl, "the genuine event page remains useful even when venue resolution fails closed");
  assert.equal(observation.source_fields.venue_relocation_notice_detected, true);

  const venueRegistry = await json("venues/berlin.json");
  const sourceRegistry = await json("sources/berlin.json");
  assert.deepEqual(projectObservationsToDisplayMarkers([observation], { venues: venueRegistry.venues, sourceRegistry: sourceRegistry.entries }), []);
});

test("unrelated retained list-detail sources preserve explicit, ticket, and detail fallback precedence", async () => {
  const explicitHtml = await fixture("konzerthaus-berlin/event-detail-1.html");
  const explicitDetail = "https://www.konzerthaus.de/en/programm/konzerthausorchester-berlin-ivan-fischer/12461";
  const explicitRecord = normaliseJsonLdEvent(extractEventNodes(explicitHtml)[0], { deriveId: () => "12461" });
  assert.equal(toObservation(explicitRecord, { source_id: "explicit" }, { retrievedAt: RETRIEVED_AT, ...createDetailPageHandoff({ detailPageUrl: explicitDetail }) }).event_url, explicitRecord.event_url);

  const ticketHtml = await fixture("so36-berlin/product-detail.html");
  const ticketDetail = "https://www.so36.com/produkte/98733-tickets-burning-berlin-so36-berlin-am-26-08-2026";
  const ticketRecord = normaliseJsonLdEvent(extractEventNodes(ticketHtml)[0], { deriveId: () => "98733" });
  assert.equal(ticketRecord.event_url, null);
  assert.ok(ticketRecord.ticket_url);
  assert.equal(toObservation(ticketRecord, { source_id: "ticket" }, { retrievedAt: RETRIEVED_AT, ...createDetailPageHandoff({ detailPageUrl: ticketDetail }) }).event_url, ticketRecord.ticket_url);

  const fallbackHtml = await fixture("b-flat-berlin/event-detail.html");
  const fallbackProgramme = await fixture("b-flat-berlin/programm.html");
  const [fallbackDetail] = extractLinksMatching(fallbackProgramme, /href="(\/events\/[a-z0-9-]+)"/g, { baseUrl: "https://b-flat-berlin.de" });
  const fallbackRecord = normaliseJsonLdEvent(extractEventNodes(fallbackHtml)[0], { deriveId: () => new URL(fallbackDetail).pathname.split("/").filter(Boolean).at(-1) });
  assert.equal(fallbackRecord.event_url, null);
  assert.equal(fallbackRecord.ticket_url, null);
  assert.equal(toObservation(fallbackRecord, { source_id: "fallback" }, { retrievedAt: RETRIEVED_AT, ...createDetailPageHandoff({ detailPageUrl: fallbackDetail }) }).event_url, fallbackDetail);
});

test("detail handoff rejects non-HTTP and missing URLs", () => {
  assert.throws(() => createDetailPageHandoff(), /absolute HTTP/);
  assert.throws(() => createDetailPageHandoff({ detailPageUrl: "file:///tmp/event.html" }), /absolute HTTP/);
});
