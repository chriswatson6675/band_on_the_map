// BEATMAPPED-ALL-CITIES-DEFAULT-MAP-01 — focused frontend selection proof.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ALL_CITIES_AREA, getMarkersForArea } from "../components/map-area.mjs";
import { filterMarkersByArtistId, filterMarkersByGenre } from "../ingestion/map/artist-genre-search.mjs";
import { filterMarkersByDateRange } from "../ingestion/map/date-filter.mjs";

async function readPageSource() {
  return readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
}

async function readDiscoveryMapSource() {
  return readFile(new URL("../components/DiscoveryMap.tsx", import.meta.url), "utf8");
}

async function loadPublishedCountryMarkers() {
  const artifact = JSON.parse(
    await readFile(new URL("../data/public/lisbon-porto-map.json", import.meta.url), "utf8"),
  );
  return {
    Portugal: artifact.countries.Portugal.markers,
    Spain: artifact.countries.Spain.markers,
    Germany: artifact.countries.Germany.markers,
    France: artifact.countries.France.markers,
  };
}

test("the default Where selection is All cities", async () => {
  const source = await readPageSource();
  assert.match(source, /useState<SearchArea>\(ALL_CITIES_AREA\)/);
  assert.match(source, /<option>All cities<\/option>\s*<option>Portugal<\/option>/);
});

test("All cities combines exactly the four populated country marker arrays", async () => {
  const markers = await loadPublishedCountryMarkers();
  const all = getMarkersForArea(
    ALL_CITIES_AREA,
    markers.Portugal,
    markers.Spain,
    markers.Germany,
    markers.France,
  );
  const expectedCount = Object.values(markers).reduce((sum, country) => sum + country.length, 0);
  assert.equal(all.length, expectedCount);
  assert.deepEqual(all, [
    ...markers.Portugal,
    ...markers.Spain,
    ...markers.Germany,
    ...markers.France,
  ]);
});

test("single-country selections retain their existing marker sets", () => {
  const portugal = [{ venue_id: "pt" }];
  const spain = [{ venue_id: "es" }];
  const germany = [{ venue_id: "de" }];
  const france = [{ venue_id: "fr" }];
  assert.equal(getMarkersForArea("Portugal", portugal, spain, germany, france), portugal);
  assert.equal(getMarkersForArea("Spain", portugal, spain, germany, france), spain);
  assert.equal(getMarkersForArea("Germany", portugal, spain, germany, france), germany);
  assert.equal(getMarkersForArea("France", portugal, spain, germany, france), france);
});

test("genre, artist, and date filters compose over the combined marker set", () => {
  const listing = (sourceId, artistId, genre, date) => ({
    kind: "SINGLE",
    source_id: sourceId,
    source_record_id: sourceId,
    start: { date },
    artists: [{ artist_id: artistId, genres: [{ family: genre, tag: null }] }],
  });
  const marker = (venueId, displayListing) => ({ venue_id: venueId, display_listings: [displayListing] });
  const all = getMarkersForArea(
    ALL_CITIES_AREA,
    [marker("pt", listing("pt", "artist-a", "Jazz", "2026-09-01"))],
    [marker("es", listing("es", "artist-a", "Rock", "2026-09-02"))],
    [marker("de", listing("de", "artist-b", "Jazz", "2026-09-03"))],
    [marker("fr", listing("fr", "artist-a", "Jazz", "2026-10-01"))],
  );
  const byGenre = filterMarkersByGenre(all, "Jazz");
  const byArtist = filterMarkersByArtistId(byGenre, "artist-a");
  const byDate = filterMarkersByDateRange(byArtist, "2026-09-01", "2026-09-30");
  assert.deepEqual(byDate.map((entry) => entry.venue_id), ["pt"]);
});

test("the All-cities viewport contains every currently published populated-country marker", async () => {
  const source = await readDiscoveryMapSource();
  const match = source.match(/"All cities":\s*{([\s\S]*?)},\s*Portugal:/);
  assert.ok(match, "COUNTRY_MAP_VIEWS must contain an All cities entry before Portugal");
  const bounds = match[1].match(/bounds:\s*\[\s*\[([\d.-]+),\s*([\d.-]+)\],\s*\[([\d.-]+),\s*([\d.-]+)\]/);
  assert.ok(bounds, "All cities must declare numeric bounds");
  assert.match(match[1], /center:\s*\[[\d.-]+,\s*[\d.-]+\]/);
  assert.match(match[1], /zoom:\s*[\d.]+/);
  const [, west, south, east, north] = bounds.map(Number);
  const countries = await loadPublishedCountryMarkers();
  for (const marker of Object.values(countries).flat()) {
    assert.ok(
      marker.longitude >= west && marker.longitude <= east && marker.latitude >= south && marker.latitude <= north,
      `${marker.venue_id} must be inside the All-cities viewport`,
    );
  }
});

test("empty Croatia is safe and is not added to All cities", () => {
  const portugal = [{ venue_id: "pt" }];
  assert.deepEqual(getMarkersForArea("Croatia", portugal, [], [], []), []);
  assert.deepEqual(getMarkersForArea(ALL_CITIES_AREA, portugal, [], [], []), portugal);
});

test("combining the real country arrays introduces no duplicate venue marker", async () => {
  const markers = await loadPublishedCountryMarkers();
  const all = getMarkersForArea(
    ALL_CITIES_AREA,
    markers.Portugal,
    markers.Spain,
    markers.Germany,
    markers.France,
  );
  assert.equal(new Set(all.map((marker) => marker.venue_id)).size, all.length);
});
