// BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01 — proves Spain/Barcelona
// is actually wired into the frontend surfaces that matter: the country
// selector and state type (app/page.tsx, components/DiscoveryMap.tsx),
// the map camera view (COUNTRY_MAP_VIEWS), and the display-marker data
// path (getMarkersForCountry called with Spain's own bucket, not the
// old 2-argument call that silently dropped it).
//
// Neither app/page.tsx nor components/DiscoveryMap.tsx can be imported
// directly by `node --test` (no TSX loader is configured — this
// repository's own convention for these two files, already established
// by tests/publication-artifact.test.mjs's "app/page.tsx" tests and
// tests/cluster-geojson.test.mjs / tests/map-colour-and-hover.test.mjs's
// "components/DiscoveryMap.tsx" tests, is source-text inspection rather
// than a DOM/React render harness). This file follows that same
// convention. The underlying pure logic those source strings wire
// together (getMarkersForCountry itself, resolveDefaultFromDate,
// filterMarkersByDateRange) is already exercised directly by
// tests/publication-spain-extension.test.mjs, tests/map-projection.test.mjs,
// and tests/date-filter.test.mjs — this file only proves the WIRING.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Normalizes CRLF -> LF: this repository's working tree checks these two
// files out with CRLF line endings (core.autocrlf) on Windows, and a
// literal "\n" in a regex below must match regardless of the checkout
// platform.
async function readDiscoveryMapSource() {
  const text = await readFile(new URL("../components/DiscoveryMap.tsx", import.meta.url), "utf8");
  return text.replace(/\r\n/g, "\n");
}

async function readPageSource() {
  const text = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  return text.replace(/\r\n/g, "\n");
}

// --- components/DiscoveryMap.tsx ---

test("DiscoveryMap.tsx: SearchCountry includes Spain alongside Portugal/Croatia", async () => {
  const src = await readDiscoveryMapSource();
  // BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 additively
  // appended "Germany" to this same union, and
  // BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 additively appended
  // "France" — this test's own name predates both and still asserts
  // Spain's presence correctly; the trailing `| "Germany" | "France"` is
  // asserted by its own Berlin/Paris-named tests below.
  assert.match(src, /export type SearchCountry = "Portugal" \| "Croatia" \| "Spain" \| "Germany" \| "France" \| "United Kingdom";/);
});

test("DiscoveryMap.tsx: COUNTRY_MAP_VIEWS has a Spain entry with real bounds/center/zoom", async () => {
  const src = await readDiscoveryMapSource();
  const spainBlockMatch = src.match(/Spain:\s*{([\s\S]*?)},\n};/);
  assert.ok(spainBlockMatch, "a Spain: {...} entry must exist in COUNTRY_MAP_VIEWS");
  const block = spainBlockMatch[1];
  assert.match(block, /bounds:\s*\[/, "Spain's view must declare bounds");
  assert.match(block, /center:\s*\[/, "Spain's view must declare a center");
  assert.match(block, /zoom:\s*[\d.]+/, "Spain's view must declare a zoom");
});

test("DiscoveryMap.tsx: Spain's bounds actually contain every real Barcelona venue's observed coordinates", async () => {
  // Guards against a plausible-looking but wrong bounding box: re-derives
  // the same observed lat/lon range this package's own bounds were built
  // from (fixtures/map/barcelona-30-venue-population-01-live-run-proof.json)
  // and checks the SW/NE corners actually cover it, rather than trusting
  // the doc comment's claimed range.
  const src = await readDiscoveryMapSource();
  const spainBlockMatch = src.match(/Spain:\s*{([\s\S]*?)},\n};/);
  const block = spainBlockMatch[1];
  const boundsMatch = block.match(/bounds:\s*\[\s*\[([\d.-]+),\s*([\d.-]+)\],\s*\[([\d.-]+),\s*([\d.-]+)\],?\s*\]/);
  assert.ok(boundsMatch, "bounds must be a [[swLon, swLat], [neLon, neLat]] pair");
  const swLonN = Number(boundsMatch[1]);
  const swLatN = Number(boundsMatch[2]);
  const neLonN = Number(boundsMatch[3]);
  const neLatN = Number(boundsMatch[4]);

  const proof = JSON.parse(
    await readFile(new URL("../fixtures/map/barcelona-30-venue-population-01-live-run-proof.json", import.meta.url), "utf8"),
  );
  const markers = proof.barcelona.markers;
  assert.ok(markers.length > 0, "sanity: the live-run proof has markers");
  for (const marker of markers) {
    assert.ok(
      marker.latitude >= swLatN && marker.latitude <= neLatN,
      `${marker.canonical_name} latitude ${marker.latitude} outside Spain bounds [${swLatN}, ${neLatN}]`,
    );
    assert.ok(
      marker.longitude >= swLonN && marker.longitude <= neLonN,
      `${marker.canonical_name} longitude ${marker.longitude} outside Spain bounds [${swLonN}, ${neLonN}]`,
    );
  }
});

test("DiscoveryMap.tsx: Portugal/Croatia entries are byte-for-byte untouched (additive-only change)", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /Portugal:\s*{\s*bounds:\s*\[\s*\[-9\.85, 36\.8\],\s*\[-5\.95, 42\.35\],\s*\],\s*center:\s*\[-8\.0, 39\.6\],\s*zoom:\s*5\.5,\s*},/);
  assert.match(src, /Croatia:\s*{\s*bounds:\s*\[\s*\[13\.05, 42\.0\],\s*\[19\.8, 46\.75\],\s*\],\s*center:\s*\[16\.35, 44\.65\],\s*zoom:\s*5\.4,\s*},/);
});

// --- app/page.tsx ---

test("page.tsx: the Where selector offers Spain alongside Portugal/Croatia", async () => {
  const src = await readPageSource();
  assert.match(src, /<option>Portugal<\/option>\s*<option>Croatia<\/option>\s*<option>Spain<\/option>/);
});

test("page.tsx: area selection receives Spain's marker bucket, not an old Portugal-only call", async () => {
  const src = await readPageSource();
  // BEATMAPPED-ALL-CITIES-DEFAULT-MAP-01 keeps all five populated marker
  // buckets explicit while adding the frontend-only area selection layer.
  // BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01
  // additively appended unitedKingdomMarkers as a 6th argument.
  assert.match(
    src,
    /getMarkersForArea\(area, portugalMarkers, spainMarkers, germanyMarkers, franceMarkers, unitedKingdomMarkers\)/,
    "the area selector must receive Spain, Germany, France, and United Kingdom alongside Portugal",
  );
});

test("page.tsx: spainMarkers is read from the SAME publicationArtifact as portugalMarkers, defaulting safely when absent", async () => {
  const src = await readPageSource();
  assert.match(src, /publicationArtifact\.countries\.Spain\?\.markers/, "must optional-chain — an older artifact predating Barcelona has no countries.Spain key");
});

test("page.tsx: the expired-event default-view fix (BAND-ON-THE-MAP-BARCELONA-PRE-INTEGRATION-DATE-AUDIT-01) is still present and unweakened", async () => {
  const src = await readPageSource();
  assert.match(src, /resolveDefaultFromDate\(current, getVisitorTodayDateString\(\)\)/);
  assert.match(src, /filterMarkersByDateRange\(byArtist, fromDate, toDate\)/);
});

test("page.tsx: still imports the same committed publication artifact — no second/parallel data path introduced for Spain", async () => {
  const src = await readPageSource();
  assert.match(src, /import publicationData from "@\/data\/public\/lisbon-porto-map\.json";/);
  const importCount = (src.match(/from "@\/data\/public\//g) ?? []).length;
  assert.equal(importCount, 1, "exactly one publication artifact import — Spain must not get its own bundled JSON");
});
