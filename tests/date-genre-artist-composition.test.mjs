import assert from "node:assert/strict";
import test from "node:test";

import { filterMarkersByGenre, filterMarkersByArtistId } from "../ingestion/map/artist-genre-search.mjs";
import { filterMarkersByDateRange } from "../ingestion/map/date-filter.mjs";

// BEATMAPPED-DATE-FILTER-LIVE-01 — proves Genre + Date (+ Artist) compose
// with AND semantics across dimensions, conceptually mirroring the real
// enrichment pilot's own Evanescence (2026-10-04, Metal) and Amon Amarth
// (2026-11-15, Metal) live examples — synthetic fixtures only; nothing
// here is hard-coded into ingestion/map/date-filter.mjs or
// ingestion/map/artist-genre-search.mjs, both of which stay fully
// generic and never reference a specific artist/date.

const EVANESCENCE = { artist_id: "artist-evanescence", canonical_name: "Evanescence", genres: [{ family: "Metal", tag: "Gothic Metal" }] };
const AMON_AMARTH = { artist_id: "artist-amon-amarth", canonical_name: "Amon Amarth", genres: [{ family: "Metal", tag: "Death Metal" }] };

function listing(dateStr, artist) {
  return {
    kind: "SINGLE",
    source_id: "meo-arena",
    source_record_id: artist.artist_id,
    title: artist.canonical_name,
    start: { raw: null, date: dateStr, iso: null, is_utc: null, tzid: null, certainty: "DATE_ONLY" },
    end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
    event_url: null,
    artists: [artist],
  };
}

function meoArenaMarkers() {
  return [
    {
      venue_id: "venue-lisboa-meo-arena",
      canonical_name: "MEO Arena",
      latitude: 38.77,
      longitude: -9.09,
      address: "Lisboa",
      display_listings: [listing("2026-10-04", EVANESCENCE), listing("2026-11-15", AMON_AMARTH)],
    },
  ];
}

function titlesOf(markers) {
  return markers.flatMap((m) => m.display_listings.map((l) => l.title));
}

test("Metal + October 2026 -> Evanescence only, not Amon Amarth", () => {
  const byGenre = filterMarkersByGenre(meoArenaMarkers(), "Metal");
  const byDate = filterMarkersByDateRange(byGenre, "2026-10-01", "2026-10-31");
  assert.deepEqual(titlesOf(byDate), ["Evanescence"]);
});

test("Metal + November 2026 -> Amon Amarth only, not Evanescence", () => {
  const byGenre = filterMarkersByGenre(meoArenaMarkers(), "Metal");
  const byDate = filterMarkersByDateRange(byGenre, "2026-11-01", "2026-11-30");
  assert.deepEqual(titlesOf(byDate), ["Amon Amarth"]);
});

test("Metal + Oct-Nov inclusive -> both", () => {
  const byGenre = filterMarkersByGenre(meoArenaMarkers(), "Metal");
  const byDate = filterMarkersByDateRange(byGenre, "2026-10-01", "2026-11-30");
  assert.deepEqual(titlesOf(byDate).sort(), ["Amon Amarth", "Evanescence"]);
});

test("clearing Genre while keeping the October date range still returns Evanescence (date filter alone)", () => {
  const byDate = filterMarkersByDateRange(meoArenaMarkers(), "2026-10-01", "2026-10-31");
  assert.deepEqual(titlesOf(byDate), ["Evanescence"]);
});

test("Artist + Date compose: selecting Evanescence AND November returns nothing (their event is in October)", () => {
  const byArtist = filterMarkersByArtistId(meoArenaMarkers(), "artist-evanescence");
  const byDate = filterMarkersByDateRange(byArtist, "2026-11-01", "2026-11-30");
  assert.deepEqual(byDate, []);
});

test("Artist + Date compose: selecting Evanescence AND October returns their event", () => {
  const byArtist = filterMarkersByArtistId(meoArenaMarkers(), "artist-evanescence");
  const byDate = filterMarkersByDateRange(byArtist, "2026-10-01", "2026-10-31");
  assert.deepEqual(titlesOf(byDate), ["Evanescence"]);
});
