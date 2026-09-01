// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — proves
// United Kingdom/London is actually wired into the frontend surfaces that
// matter, following the exact same source-text-inspection convention as
// tests/barcelona-frontend-integration.test.mjs (see that file's own doc
// comment for why: no TSX loader is configured for `node --test`).

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getMarkersForArea, ALL_CITIES_AREA } from "../components/map-area.mjs";

async function readDiscoveryMapSource() {
  const text = await readFile(new URL("../components/DiscoveryMap.tsx", import.meta.url), "utf8");
  return text.replace(/\r\n/g, "\n");
}

async function readPageSource() {
  const text = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  return text.replace(/\r\n/g, "\n");
}

test("DiscoveryMap.tsx: SearchCountry includes United Kingdom", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /export type SearchCountry = .*\| "United Kingdom";/);
});

test("DiscoveryMap.tsx: COUNTRY_MAP_VIEWS has a United Kingdom entry with real bounds/center/zoom", async () => {
  const src = await readDiscoveryMapSource();
  const block = src.match(/"United Kingdom":\s*{([\s\S]*?)},\n};/)?.[1];
  assert.ok(block, 'a "United Kingdom": {...} entry must exist in COUNTRY_MAP_VIEWS');
  assert.match(block, /bounds:\s*\[/);
  assert.match(block, /center:\s*\[/);
  assert.match(block, /zoom:\s*[\d.]+/);
});

test("DiscoveryMap.tsx: United Kingdom's bounds actually contain every real London first-tranche venue's observed coordinates", async () => {
  const src = await readDiscoveryMapSource();
  const block = src.match(/"United Kingdom":\s*{([\s\S]*?)},\n};/)?.[1];
  const boundsMatch = block.match(/bounds:\s*\[\s*\[([\d.-]+),\s*([\d.-]+)\],\s*\[([\d.-]+),\s*([\d.-]+)\],?\s*\]/);
  assert.ok(boundsMatch, "bounds must be a [[swLon, swLat], [neLon, neLat]] pair");
  const [swLonN, swLatN, neLonN, neLatN] = boundsMatch.slice(1).map(Number);

  const proof = JSON.parse(
    await readFile(
      new URL("../fixtures/map/beatmapped-london-first-tranche-main-rebase-and-music-gate-01-live-run-proof.json", import.meta.url),
      "utf8",
    ),
  );
  const markers = proof.london.markers;
  assert.ok(markers.length > 0, "sanity: the live-run proof has markers");
  for (const marker of markers) {
    assert.ok(marker.latitude >= swLatN && marker.latitude <= neLatN, `${marker.canonical_name} latitude ${marker.latitude} outside bounds`);
    assert.ok(marker.longitude >= swLonN && marker.longitude <= neLonN, `${marker.canonical_name} longitude ${marker.longitude} outside bounds`);
  }
});

test("page.tsx: the Where selector offers United Kingdom alongside France", async () => {
  const src = await readPageSource();
  assert.match(src, /<option>France<\/option>\s*<option>United Kingdom<\/option>/);
});

test("page.tsx: unitedKingdomMarkers is read from the SAME publicationArtifact as franceMarkers, defaulting safely when absent", async () => {
  const src = await readPageSource();
  assert.match(src, /publicationArtifact\.countries\.UnitedKingdom\?\.markers/, "must optional-chain — an artifact predating London has no countries.UnitedKingdom key");
});

test("page.tsx: still imports the same committed publication artifact — no second/parallel data path introduced for London", async () => {
  const src = await readPageSource();
  const importCount = (src.match(/from "@\/data\/public\//g) ?? []).length;
  assert.equal(importCount, 1, "exactly one publication artifact import — London must not get its own bundled JSON");
});

// --- components/map-area.mjs (pure logic, directly testable) ---

test("getMarkersForArea('All cities') includes unitedKingdomMarkers", () => {
  const result = getMarkersForArea(ALL_CITIES_AREA, ["pt"], ["es"], ["de"], ["fr"], ["gb"]);
  assert.deepEqual(result, ["pt", "es", "de", "fr", "gb"]);
});

test("getMarkersForArea('United Kingdom') returns only unitedKingdomMarkers", () => {
  const result = getMarkersForArea("United Kingdom", ["pt"], ["es"], ["de"], ["fr"], ["gb"]);
  assert.deepEqual(result, ["gb"]);
});

test("getMarkersForArea defaults unitedKingdomMarkers to [] when omitted — no regression for an existing 4-argument call site", () => {
  const result = getMarkersForArea(ALL_CITIES_AREA, ["pt"], ["es"], ["de"], ["fr"]);
  assert.deepEqual(result, ["pt", "es", "de", "fr"]);
});
