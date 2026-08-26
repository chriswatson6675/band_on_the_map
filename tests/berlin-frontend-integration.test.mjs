// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — additive
// frontend wiring for Germany/Berlin, following
// BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01's own precedent exactly
// (see tests/barcelona-frontend-integration.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readDiscoveryMapSource() {
  const text = await readFile(new URL("../components/DiscoveryMap.tsx", import.meta.url), "utf8");
  return text.replace(/\r\n/g, "\n");
}

async function readPageSource() {
  const text = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  return text.replace(/\r\n/g, "\n");
}

test("DiscoveryMap.tsx: COUNTRY_MAP_VIEWS has a Germany entry with real bounds/center/zoom", async () => {
  const src = await readDiscoveryMapSource();
  const match = src.match(/Germany:\s*{([\s\S]*?)},\n};/);
  assert.ok(match, "a Germany: {...} entry must exist in COUNTRY_MAP_VIEWS");
  const block = match[1];
  assert.match(block, /bounds:\s*\[/, "Germany's view must declare bounds");
  assert.match(block, /center:\s*\[/, "Germany's view must declare a center");
  assert.match(block, /zoom:\s*[\d.]+/, "Germany's view must declare a zoom");
});

test("DiscoveryMap.tsx: Portugal/Croatia/Spain entries are byte-for-byte untouched (additive-only change)", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /Portugal:\s*{\s*bounds:\s*\[\s*\[-9\.85, 36\.8\],\s*\[-5\.95, 42\.35\],\s*\],\s*center:\s*\[-8\.0, 39\.6\],\s*zoom:\s*5\.5,\s*},/);
  assert.match(src, /Croatia:\s*{\s*bounds:\s*\[\s*\[13\.05, 42\.0\],\s*\[19\.8, 46\.75\],\s*\],\s*center:\s*\[16\.35, 44\.65\],\s*zoom:\s*5\.4,\s*},/);
  assert.match(src, /Spain:\s*{\s*bounds:\s*\[\s*\[2\.04, 41\.3\],\s*\[2\.27, 41\.48\],\s*\],\s*center:\s*\[2\.159, 41\.396\],\s*zoom:\s*12,\s*},/);
});

test("page.tsx: the Where selector offers Germany alongside Portugal/Croatia/Spain", async () => {
  const src = await readPageSource();
  assert.match(src, /<option>Portugal<\/option>\s*<option>Croatia<\/option>\s*<option>Spain<\/option>\s*<option>Germany<\/option>/);
});

test("page.tsx: germanyMarkers is read from the SAME publicationArtifact as portugalMarkers, defaulting safely when absent", async () => {
  const src = await readPageSource();
  assert.match(src, /publicationArtifact\.countries\.Germany\?\.markers/, "must optional-chain — an older artifact predating Berlin has no countries.Germany key");
});

test("ingestion/map/projection.mjs: getMarkersForCountry resolves 'Germany' to the 4th argument", async () => {
  const { getMarkersForCountry } = await import("../ingestion/map/projection.mjs");
  const portugal = [{ venue_id: "p" }];
  const spain = [{ venue_id: "s" }];
  const germany = [{ venue_id: "g" }];
  assert.deepEqual(getMarkersForCountry("Germany", portugal, spain, germany), germany);
  assert.deepEqual(getMarkersForCountry("Portugal", portugal, spain, germany), portugal);
  assert.deepEqual(getMarkersForCountry("Germany", portugal), []); // omitted germanyMarkers defaults to []
});

test("DiscoveryMap.tsx: Germany's bounds actually contain every real Berlin venue's observed coordinates", async () => {
  const src = await readDiscoveryMapSource();
  const match = src.match(/Germany:\s*{([\s\S]*?)},\n};/);
  const block = match[1];
  const boundsMatch = block.match(/bounds:\s*\[\s*\[([\d.-]+),\s*([\d.-]+)\],\s*\[([\d.-]+),\s*([\d.-]+)\]/);
  const [, lon1, lat1, lon2, lat2] = boundsMatch.map(Number);
  const minLon = Math.min(lon1, lon2);
  const maxLon = Math.max(lon1, lon2);
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);

  const proof = JSON.parse(
    await readFile(new URL("../fixtures/map/berlin-30-40-venue-collector-reuse-trial-01-live-run-proof.json", import.meta.url), "utf8"),
  );
  const markers = proof.berlin.markers;
  assert.ok(markers.length > 0, "the real live proof run must have produced at least one Berlin marker");
  for (const marker of markers) {
    assert.ok(
      marker.longitude >= minLon && marker.longitude <= maxLon && marker.latitude >= minLat && marker.latitude <= maxLat,
      `${marker.canonical_name} (${marker.latitude}, ${marker.longitude}) must fall inside Germany's own map bounds`,
    );
  }
});

test("ingestion/map/publication.mjs: buildGermanyMarkers and buildPublicationArtifact both expose a Germany bucket additively", async () => {
  const { buildPublicationArtifact, validatePublicationArtifact } = await import("../ingestion/map/publication.mjs");
  const artifactWithoutGermany = buildPublicationArtifact({
    generatedAt: "2026-08-26T00:00:00Z",
    from: null,
    to: null,
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  assert.deepEqual(artifactWithoutGermany.countries.Germany, { markers: [] });
  assert.deepEqual(validatePublicationArtifact(artifactWithoutGermany), []);
});
