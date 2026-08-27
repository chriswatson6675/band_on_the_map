// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — additive frontend wiring
// for France/Paris, following BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-
// REUSE-TRIAL-01's own precedent exactly (see
// tests/berlin-frontend-integration.test.mjs).

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

test("DiscoveryMap.tsx: COUNTRY_MAP_VIEWS has a France entry with real bounds/center/zoom", async () => {
  const src = await readDiscoveryMapSource();
  const match = src.match(/France:\s*{([\s\S]*?)},\n};/);
  assert.ok(match, "a France: {...} entry must exist in COUNTRY_MAP_VIEWS");
  const block = match[1];
  assert.match(block, /bounds:\s*\[/, "France's view must declare bounds");
  assert.match(block, /center:\s*\[/, "France's view must declare a center");
  assert.match(block, /zoom:\s*[\d.]+/, "France's view must declare a zoom");
});

test("DiscoveryMap.tsx: Portugal/Croatia/Spain/Germany entries are byte-for-byte untouched (additive-only change)", async () => {
  const src = await readDiscoveryMapSource();
  assert.match(src, /Portugal:\s*{\s*bounds:\s*\[\s*\[-9\.85, 36\.8\],\s*\[-5\.95, 42\.35\],\s*\],\s*center:\s*\[-8\.0, 39\.6\],\s*zoom:\s*5\.5,\s*},/);
  assert.match(src, /Croatia:\s*{\s*bounds:\s*\[\s*\[13\.05, 42\.0\],\s*\[19\.8, 46\.75\],\s*\],\s*center:\s*\[16\.35, 44\.65\],\s*zoom:\s*5\.4,\s*},/);
  assert.match(src, /Spain:\s*{\s*bounds:\s*\[\s*\[2\.04, 41\.3\],\s*\[2\.27, 41\.48\],\s*\],\s*center:\s*\[2\.159, 41\.396\],\s*zoom:\s*12,\s*},/);
  assert.match(src, /Germany:\s*{\s*bounds:\s*\[\s*\[13\.1, 52\.38\],\s*\[13\.65, 52\.62\],\s*\],\s*center:\s*\[13\.38, 52\.5\],\s*zoom:\s*10\.5,\s*},/);
});

test("page.tsx: the Where selector offers France alongside Portugal/Croatia/Spain/Germany", async () => {
  const src = await readPageSource();
  assert.match(src, /<option>Portugal<\/option>\s*<option>Croatia<\/option>\s*<option>Spain<\/option>\s*<option>Germany<\/option>\s*<option>France<\/option>/);
});

test("page.tsx: franceMarkers is read from the SAME publicationArtifact as portugalMarkers, defaulting safely when absent", async () => {
  const src = await readPageSource();
  assert.match(src, /publicationArtifact\.countries\.France\?\.markers/, "must optional-chain — an older artifact predating Paris has no countries.France key");
});

test("ingestion/map/projection.mjs: getMarkersForCountry resolves 'France' to the 5th argument", async () => {
  const { getMarkersForCountry } = await import("../ingestion/map/projection.mjs");
  const portugal = [{ venue_id: "p" }];
  const spain = [{ venue_id: "s" }];
  const germany = [{ venue_id: "g" }];
  const france = [{ venue_id: "f" }];
  assert.deepEqual(getMarkersForCountry("France", portugal, spain, germany, france), france);
  assert.deepEqual(getMarkersForCountry("Germany", portugal, spain, germany, france), germany);
  assert.deepEqual(getMarkersForCountry("Portugal", portugal, spain, germany, france), portugal);
  assert.deepEqual(getMarkersForCountry("France", portugal), []); // omitted franceMarkers defaults to []
});

test("DiscoveryMap.tsx: France's bounds actually contain every real Paris venue's canonical coordinates", async () => {
  const src = await readDiscoveryMapSource();
  const match = src.match(/France:\s*{([\s\S]*?)},\n};/);
  const block = match[1];
  const boundsMatch = block.match(/bounds:\s*\[\s*\[([\d.-]+),\s*([\d.-]+)\],\s*\[([\d.-]+),\s*([\d.-]+)\]/);
  const [, lon1, lat1, lon2, lat2] = boundsMatch.map(Number);
  const minLon = Math.min(lon1, lon2);
  const maxLon = Math.max(lon1, lon2);
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);

  const parisVenues = JSON.parse(await readFile(new URL("../venues/paris.json", import.meta.url), "utf8"));
  assert.ok(parisVenues.venues.length > 0, "venues/paris.json must contain at least one map-eligible venue");
  for (const venue of parisVenues.venues) {
    assert.ok(
      venue.longitude >= minLon && venue.longitude <= maxLon && venue.latitude >= minLat && venue.latitude <= maxLat,
      `${venue.canonical_name} (${venue.latitude}, ${venue.longitude}) must fall inside France's own map bounds`,
    );
  }
});

test("ingestion/map/publication.mjs: buildFranceMarkers and buildPublicationArtifact both expose a France bucket additively", async () => {
  const { buildPublicationArtifact, validatePublicationArtifact } = await import("../ingestion/map/publication.mjs");
  const artifactWithoutFrance = buildPublicationArtifact({
    generatedAt: "2026-08-27T00:00:00Z",
    from: null,
    to: null,
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  assert.deepEqual(artifactWithoutFrance.countries.France, { markers: [] });
  assert.deepEqual(validatePublicationArtifact(artifactWithoutFrance), []);
});
