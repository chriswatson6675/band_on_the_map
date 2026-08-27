// PARIS-VENUE-POPULATION-01 — Le Bateau Phare's own offline derivation
// proof. Zero new collector code: this source's own official
// /en/programmation/ page embeds a single schema.org JSON-LD `@graph`
// block holding BOTH a Restaurant/NightClub/BarOrPub self-description
// (own address + own geo coordinates) AND every one of its 9 currently
// -listed MusicEvent records (name/startDate/location/url/offers/
// performer) in one fetch — the SAME reusable family already proven for
// tempodrom-berlin-01/waldbuehne-berlin-01 (ingestion/json-ld/parse.mjs +
// ingestion/json-ld/observation-adapter.mjs), completely unmodified. See
// research/source-investigations/le-bateau-phare-paris-01/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractJsonLdNodes, extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservations } from "../ingestion/json-ld/observation-adapter.mjs";

async function html() {
  return readFile(new URL("../fixtures/le-bateau-phare-paris/programmation-page.html", import.meta.url), "utf8");
}

test("extractJsonLdNodes: the real retained page's own @graph carries the Restaurant self-description AND every MusicEvent", async () => {
  const nodes = extractJsonLdNodes(await html());
  const restaurant = nodes.find((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).includes("NightClub"));
  assert.ok(restaurant, "expected a NightClub/Restaurant/BarOrPub self-description node");
  assert.equal(restaurant.address.streetAddress, "3 Port de la Gare");
  assert.equal(restaurant.address.postalCode, "75013");
  // First-party stated coordinates — CONFIRMED, not geocoder-derived.
  assert.equal(restaurant.geo.latitude, 48.83447);
  assert.equal(restaurant.geo.longitude, 2.37681);
});

test("extractEventNodes + normaliseJsonLdEvent: real MusicEvent records parse with full UTC-offset startDate", async () => {
  const nodes = extractEventNodes(await html(), { types: new Set(["Event", "MusicEvent"]) });
  assert.ok(nodes.length >= 9, `expected >=9 MusicEvent nodes, got ${nodes.length}`);

  const providence = nodes.find((n) => /Providence/i.test(n.name));
  assert.ok(providence);
  const record = normaliseJsonLdEvent(providence, { deriveId: (n) => n.url });
  assert.equal(record.title, "Artemis (Ar) • Le Bateau Phare • Providence");
  assert.equal(record.start_raw, "2026-09-12T18:00:00+02:00");
  assert.equal(record.location_name, "Le Bateau Phare");
  assert.equal(record.location_address.streetAddress, "3 Port de la Gare");
  assert.equal(record.source_record_id, "https://shotgun.live/events/providence-le-bateau-phare-12-09-26");
  assert.equal(record.event_url, "https://shotgun.live/events/providence-le-bateau-phare-12-09-26");
});

test("toObservations: real records adapt to UTC_INSTANT-certainty Observations via the EXISTING, unmodified json-ld family", async () => {
  const nodes = extractEventNodes(await html(), { types: new Set(["Event", "MusicEvent"]) });
  const records = nodes.map((n) => normaliseJsonLdEvent(n, { deriveId: (node) => node.url }));
  const observations = toObservations(records, { source_id: "le-bateau-phare-paris" }, { sourceUrl: "https://lebateauphare.paris/en/programmation/", retrievedAt: "2026-08-26T20:00:00Z" });

  assert.equal(observations.length, records.length);
  const providence = observations.find((o) => o.source_record_id.includes("providence"));
  assert.ok(providence);
  assert.equal(providence.start.certainty, "UTC_INSTANT");
  assert.equal(providence.start.date, "2026-09-12");
  assert.equal(providence.start.is_utc, true);
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every source_record_id must be unique");
});
