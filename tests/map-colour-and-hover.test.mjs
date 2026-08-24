import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// BOTM-MAP-DISCOVERY-UX-01 — colour map style + venue/cluster hover
// behaviour. Regex-based source inspection, in the same deliberately
// simple style as tests/map-marker-anchor-css.test.mjs, since the actual
// rendering only happens inside a real (WebGL) browser — see the
// package's separate Playwright browser verification for the live proof.

async function readDiscoveryMapSource() {
  return readFile(new URL("../components/DiscoveryMap.tsx", import.meta.url), "utf8");
}

test("colour map: uses the OpenFreeMap Liberty style, not the previous Positron style", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /MAP_STYLE_URL\s*=\s*"https:\/\/tiles\.openfreemap\.org\/styles\/liberty"/);
  assert.doesNotMatch(src, /styles\/positron/);
});

test("colour map: stays on MapLibre + OpenFreeMap (no other mapping provider introduced)", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /from "maplibre-gl"/);
  assert.doesNotMatch(src, /mapbox-gl|google\.maps|leaflet/i);
});

test("venue hover: the tooltip's primary text is the canonical venue name", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /tooltip\.textContent = marker\.canonical_name/);
});

test("venue hover: the tooltip is a CSS :hover reveal (no click required, disappears on pointer-leave) rather than a JS-simulated hover", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /botm-marker-tooltip/);
  const cssSrc = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(cssSrc, /\.botm-marker:hover \.botm-marker-tooltip\s*\{[^}]*opacity:\s*1/);
});

test("cluster hover: reads supercluster's own point_count and the summed GIG_COUNT_PROPERTY, never a per-venue list", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /feature\.properties\?\.point_count/);
  assert.match(src, /feature\.properties\?\.\[GIG_COUNT_PROPERTY\]/);
  assert.match(src, /formatClusterTooltip\(venueCount, gigCount\)/);
});

test("mobile fallback: individual marker click handling is a plain DOM click listener (fires for tap, no hover dependency)", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /el\.addEventListener\("click"/);
});

test("no live HTTP calls are introduced by the new pure map modules (near-term.mjs, cluster-geojson.mjs)", async () => {
  const nearTermSrc = await readFile(new URL("../ingestion/map/near-term.mjs", import.meta.url), "utf8");
  const clusterSrc = await readFile(new URL("../ingestion/map/cluster-geojson.mjs", import.meta.url), "utf8");
  for (const src of [nearTermSrc, clusterSrc]) {
    assert.doesNotMatch(src, /\bfetch\s*\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
    assert.doesNotMatch(src, /require\(["']https?:/);
    assert.doesNotMatch(src, /\baxios\b/);
    assert.doesNotMatch(src, /node:https?|from "https?"|from "node:http/);
  }
});

test("neither the new map modules nor the component import/read venues/manual-coordinates.json — this UX package never touches or regenerates it", async () => {
  const discoveryMapSrc = await readDiscoveryMapSource();
  const nearTermSrc = await readFile(new URL("../ingestion/map/near-term.mjs", import.meta.url), "utf8");
  const clusterSrc = await readFile(new URL("../ingestion/map/cluster-geojson.mjs", import.meta.url), "utf8");
  // A prose mention in a doc comment (explaining why coordinates are
  // sometimes null) is fine; actually importing/reading the file is not.
  for (const src of [discoveryMapSrc, nearTermSrc, clusterSrc]) {
    assert.doesNotMatch(src, /from ["'][^"']*manual-coordinate/);
    assert.doesNotMatch(src, /readFile\([^)]*manual-coordinate/);
    assert.doesNotMatch(src, /manual-coordinate-store/);
  }
});
