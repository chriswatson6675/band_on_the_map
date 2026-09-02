import assert from "node:assert/strict";
import test from "node:test";

import {
  VENUE_CLUSTER_SOURCE_ID,
  CLUSTER_CIRCLE_LAYER_ID,
  CLUSTER_HALO_LAYER_ID,
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
  NEAR_TERM_LABEL_MIN_ZOOM,
  GIG_COUNT_PROPERTY,
  buildVenueFeatureCollection,
  sumGigCounts,
  formatClusterTooltip,
} from "../ingestion/map/cluster-geojson.mjs";

// BOTM-MAP-DISCOVERY-UX-01 — deterministic tests for the pure helpers
// backing components/DiscoveryMap.tsx's MapLibre-native GeoJSON
// clustering (cluster: true + clusterProperties, not fake CSS overlap
// grouping — see the module's own doc comment).

function venue(venueId, displayListingsCount, coords = [-9.1, 38.7]) {
  return {
    venue_id: venueId,
    canonical_name: venueId,
    latitude: coords[1],
    longitude: coords[0],
    address: null,
    display_listings: Array.from({ length: displayListingsCount }, (_, i) => ({
      kind: "SINGLE",
      source_id: "test",
      source_record_id: String(i),
      source_name: "Test",
      title: `Gig ${i}`,
      start: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
      end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
      event_url: null,
    })),
  };
}

test("source/layer id constants are distinct, non-empty strings — one shared source, three distinct cluster layers", () => {
  const ids = [VENUE_CLUSTER_SOURCE_ID, CLUSTER_HALO_LAYER_ID, CLUSTER_CIRCLE_LAYER_ID, CLUSTER_COUNT_LAYER_ID];
  for (const id of ids) {
    assert.equal(typeof id, "string");
    assert.ok(id.length > 0);
  }
  assert.equal(new Set(ids).size, ids.length, "every id must be unique");
});

test("named zoom/radius constants exist and are sane numbers", () => {
  assert.equal(typeof CLUSTER_RADIUS, "number");
  assert.equal(typeof CLUSTER_MAX_ZOOM, "number");
  assert.equal(typeof NEAR_TERM_LABEL_MIN_ZOOM, "number");
  assert.ok(CLUSTER_RADIUS > 0);
  assert.ok(CLUSTER_MAX_ZOOM > 0 && CLUSTER_MAX_ZOOM < 22);
  assert.ok(NEAR_TERM_LABEL_MIN_ZOOM >= CLUSTER_MAX_ZOOM, "near-term labels should only appear once venues have fully separated out of clusters");
});

// BEATMAPPED-LONDON-MAP-CLUSTER-VISIBILITY-01: at the wide, very-zoomed-out
// "All cities" default view, the original CLUSTER_RADIUS (60) merged
// London into the Paris/France cluster (~340km apart) — proven directly
// via a real, instrumented MapLibre source inspection (see
// tests/discovery-map-uk-cluster.browser.test.mjs for the live-browser
// regression proof; this is a fast, literal-value guard against that
// specific reduction silently regressing back up).
test("CLUSTER_RADIUS is 35 (BEATMAPPED-LONDON-MAP-CLUSTER-VISIBILITY-01 — reduced from 60 so London separates from Paris/France at the All-cities view)", () => {
  assert.equal(CLUSTER_RADIUS, 35);
});

test("buildVenueFeatureCollection: one Point Feature per venue with a finite coordinate, carrying venue_id and gig_count", () => {
  const fc = buildVenueFeatureCollection([venue("a", 36), venue("b", 25), venue("c", 12)]);
  assert.equal(fc.type, "FeatureCollection");
  assert.equal(fc.features.length, 3);
  for (const feature of fc.features) {
    assert.equal(feature.type, "Feature");
    assert.equal(feature.geometry.type, "Point");
    assert.equal(feature.geometry.coordinates.length, 2);
  }
  assert.equal(fc.features[0].properties.venue_id, "a");
  assert.equal(fc.features[0].properties[GIG_COUNT_PROPERTY], 36);
  assert.equal(fc.features[1].properties[GIG_COUNT_PROPERTY], 25);
  assert.equal(fc.features[2].properties[GIG_COUNT_PROPERTY], 12);
});

test("buildVenueFeatureCollection: gig_count uses the DISPLAY listing count, never a raw per-source count", () => {
  const marker = venue("v", 4);
  // Simulate a marker that also carries the raw, ungrouped `listings`
  // (bigger, since group-associated-listings.mjs can collapse several
  // raw listings into fewer display_listings) — gig_count must still use
  // display_listings.length, matching the individual marker pin count.
  marker.listings = new Array(9).fill(null);
  const fc = buildVenueFeatureCollection([marker]);
  assert.equal(fc.features[0].properties[GIG_COUNT_PROPERTY], 4);
});

test("buildVenueFeatureCollection: skips a venue without a finite lat/lng rather than plotting a fabricated location", () => {
  const bad = venue("bad", 5);
  bad.latitude = null;
  const fc = buildVenueFeatureCollection([venue("good", 5), bad]);
  assert.equal(fc.features.length, 1);
  assert.equal(fc.features[0].properties.venue_id, "good");
});

test("sumGigCounts: matches the task brief's worked example (36 + 25 + 12 = 73), not the venue count (3)", () => {
  const total = sumGigCounts([venue("a", 36), venue("b", 25), venue("c", 12)]);
  assert.equal(total, 73);
  assert.notEqual(total, 3);
});

test("sumGigCounts mirrors what clusterProperties: { gig_count: ['+', ['get','gig_count']] } sums over the same feature set", () => {
  const markers = [venue("a", 36), venue("b", 25), venue("c", 12)];
  const fc = buildVenueFeatureCollection(markers);
  const sumFromFeatures = fc.features.reduce((sum, f) => sum + f.properties[GIG_COUNT_PROPERTY], 0);
  assert.equal(sumFromFeatures, sumGigCounts(markers));
});

test("formatClusterTooltip: reports venue count and gig count together, never a per-venue list, e.g. '4 venues · 96 gigs'", () => {
  assert.equal(formatClusterTooltip(4, 96), "4 venues · 96 gigs");
});

test("formatClusterTooltip: singular forms for exactly one venue / one gig", () => {
  assert.equal(formatClusterTooltip(1, 1), "1 venue · 1 gig");
});

test("formatClusterTooltip: never lists venue names, only totals", () => {
  const text = formatClusterTooltip(3, 73);
  assert.equal(text, "3 venues · 73 gigs");
  assert.doesNotMatch(text, /Casa da Música|BOTA|ZDB/);
});

// --- Source-inspection tests: components/DiscoveryMap.tsx wires these
// pure helpers/constants up to real MapLibre GeoJSON-source clustering,
// a click-driven cluster expansion zoom, and brand-styled (never default
// MapLibre blue) cluster layers. Regex-based by design, in the same
// deliberately simple style as tests/map-marker-anchor-css.test.mjs.

async function readDiscoveryMapSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("../components/DiscoveryMap.tsx", import.meta.url), "utf8");
}

test("components/DiscoveryMap.tsx: uses MapLibre-native GeoJSON clustering (cluster: true) on the shared venue source, not fake CSS overlap grouping", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /addSource\(VENUE_CLUSTER_SOURCE_ID,\s*\{[\s\S]*?cluster:\s*true/);
  assert.match(src, /clusterRadius:\s*CLUSTER_RADIUS/);
  assert.match(src, /clusterMaxZoom:\s*CLUSTER_MAX_ZOOM/);
});

test("components/DiscoveryMap.tsx: cluster aggregate gig count is wired via clusterProperties summing GIG_COUNT_PROPERTY", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /clusterProperties:\s*\{\s*\[GIG_COUNT_PROPERTY\]:\s*\[\s*"\+",\s*\[\s*"get",\s*GIG_COUNT_PROPERTY\s*\]\s*\]/);
});

test("components/DiscoveryMap.tsx: cluster click uses MapLibre/supercluster's own expansion-zoom semantics, not a manual zoom calculation", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /map\.on\(\s*"click",\s*CLUSTER_CIRCLE_LAYER_ID/);
  assert.match(src, /getClusterExpansionZoom\(clusterId\)/);
});

test("components/DiscoveryMap.tsx: individual marker gig count uses displayListings.length (display listings, never raw source records)", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /pin\.textContent = String\(displayListings\.length\)/);
});

test("components/DiscoveryMap.tsx: cluster styling is the brand coral, not MapLibre's default blue cluster demo colour", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /id:\s*CLUSTER_CIRCLE_LAYER_ID[\s\S]*?"circle-color":\s*"#e8876e"/);
  assert.doesNotMatch(src, /#51bbd6|#f28cb1/i, "must not reuse MapLibre/Mapbox's own default blue cluster demo palette");
});
