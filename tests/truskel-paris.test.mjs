// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — offline, deterministic,
// no-network proof for Truskel (Paris): the EXISTING, unmodified
// ingestion/json-ld/ family reproduces real events from two independently
// retained event-details page fixtures, and the small, bespoke
// ingestion/truskel-paris/ discovery/adapter layer (sitemap enumeration +
// the location.url-based event_url/source_record_id patch) behaves
// deterministically against retained fixtures. See
// research/source-investigations/truskel-paris-01/ for the governed
// investigation this is the required DETERMINISTIC_DERIVATION offline
// proof for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventDetailUrls, deriveSourceRecordId } from "../ingestion/truskel-paris/discovery.mjs";
import { extractEventNodesFromPage, toObservation, toObservations } from "../ingestion/truskel-paris/observation-adapter.mjs";

function fixture(name) {
  return readFile(new URL(`../fixtures/truskel-paris/${name}`, import.meta.url), "utf8");
}

test("extractEventDetailUrls: real event-pages-sitemap.xml excerpt yields distinct /event-details/ URLs", async () => {
  const xml = await fixture("event-pages-sitemap-excerpt.xml");
  const urls = extractEventDetailUrls(xml);
  assert.ok(urls.length >= 5, `expected several event-details URLs, got ${urls.length}`);
  assert.ok(urls.every((u) => u.includes("/event-details/")));
  assert.equal(new Set(urls).size, urls.length, "URLs must be deduplicated");
  assert.ok(urls.includes("https://www.truskel.fr/event-details/nyx-marseille-bloody-jenny"));
});

test("extractEventDetailUrls: throws on empty input, never on zero matches for well-formed non-matching XML", () => {
  assert.throws(() => extractEventDetailUrls(""));
  assert.deepEqual(extractEventDetailUrls("<urlset><url><loc>https://www.truskel.fr/other-page</loc></url></urlset>"), []);
});

test("Flores/Wales/Blitzdolls: real event-details page's JSON-LD Event reproduces the real event", async () => {
  const html = await fixture("event-details-flores-wales-blitzdolls.html");
  const nodes = extractEventNodesFromPage(html);
  assert.equal(nodes.length, 1);

  const node = nodes[0];
  assert.equal(deriveSourceRecordId(node), "flores-wales-blitzdolls");

  const observation = toObservation(node, {
    retrievedAt: "2026-08-26T22:41:40Z",
    fixturePath: "fixtures/truskel-paris/event-details-flores-wales-blitzdolls.html",
  });

  assert.equal(observation.source_id, "truskel-paris");
  assert.equal(observation.source_record_id, "flores-wales-blitzdolls");
  assert.equal(observation.title, "FLORÉS ( WALES ) + BLITZDOLLS");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.start.date, "2026-08-27");
  assert.equal(observation.start.iso, new Date("2026-08-27T19:00:00+02:00").toISOString());
  assert.equal(observation.end.certainty, "UTC_INSTANT");
  assert.equal(observation.end.iso, new Date("2026-08-27T23:00:00+02:00").toISOString());
  assert.equal(observation.venue_name, "TRUSKEL");
  assert.equal(observation.location_text, null, "this source's location has no structured streetAddress/postalCode/etc. sub-fields, only a flat 'address' string");
  assert.equal(observation.event_url, "https://www.truskel.fr/event-details/flores-wales-blitzdolls");
  assert.equal(observation.price_text, null);
  assert.equal(observation.raw_evidence.byte_faithful, false);
});

test("Vision Périphérique + Aléas: a second, independently-sampled page reproduces the same pattern", async () => {
  const html = await fixture("event-details-vision-peripherique-aleas.html");
  const nodes = extractEventNodesFromPage(html);
  assert.equal(nodes.length, 1);

  const observations = toObservations(nodes, { retrievedAt: "2026-08-26T22:42:10Z" });
  assert.equal(observations.length, 1);
  const [observation] = observations;

  assert.equal(observation.source_record_id, "vision-peripherique-aleas");
  assert.equal(observation.title, "VISION PÉRIPHÉRIQUE + ALÉAS");
  assert.equal(observation.start.date, "2026-09-04");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.venue_name, "TRUSKEL");
  assert.equal(observation.event_url, "https://www.truskel.fr/event-details/vision-peripherique-aleas");
});
