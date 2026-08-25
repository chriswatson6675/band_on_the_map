import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMarkersByArtistId,
  filterMarkersByGenre,
  findArtistByExactName,
  listingHasArtist,
  listingHasGenre,
  searchArtists,
} from "../ingestion/map/artist-genre-search.mjs";

const EVANESCENCE = { artist_id: "artist-evanescence", canonical_name: "Evanescence", genres: [{ family: "Rock", tag: "Alternative Metal" }, { family: "Metal", tag: "Gothic Metal" }] };
const AMON_AMARTH = { artist_id: "artist-amon-amarth", canonical_name: "Amon Amarth", genres: [{ family: "Metal", tag: "Death Metal / Viking Metal" }] };
const JUNGLE = { artist_id: "artist-jungle", canonical_name: "Jungle", genres: [{ family: "Electronic", tag: null }] };

function marker(venueId, listings) {
  return { venue_id: venueId, canonical_name: venueId, display_listings: listings };
}

function listing(artists) {
  return { kind: "SINGLE", source_id: "meo-arena", source_record_id: "x", artists };
}

const MARKERS = [
  marker("venue-meo-arena", [listing([EVANESCENCE]), listing([AMON_AMARTH]), listing([JUNGLE])]),
];

// --- additive/OR genre matching ---

test("listingHasGenre matches by family (case/diacritic-insensitive)", () => {
  assert.ok(listingHasGenre(listing([EVANESCENCE]), "rock"));
  assert.ok(listingHasGenre(listing([EVANESCENCE]), "ROCK"));
});

test("listingHasGenre matches by tag as well as family", () => {
  assert.ok(listingHasGenre(listing([AMON_AMARTH]), "Death Metal / Viking Metal"));
});

test("an Artist with MULTIPLE genres is findable through EITHER genre (additive/OR, product decision #6)", () => {
  assert.ok(listingHasGenre(listing([EVANESCENCE]), "Rock"));
  assert.ok(listingHasGenre(listing([EVANESCENCE]), "Metal"));
});

test("filterMarkersByGenre('Any') returns markers unchanged", () => {
  assert.deepEqual(filterMarkersByGenre(MARKERS, "Any"), MARKERS);
  assert.deepEqual(filterMarkersByGenre(MARKERS, null), MARKERS);
});

test("filterMarkersByGenre('Metal') keeps only the Metal-tagged listings (Evanescence + Amon Amarth), dropping Jungle's", () => {
  const filtered = filterMarkersByGenre(MARKERS, "Metal");
  assert.equal(filtered.length, 1);
  const titles = filtered[0].display_listings.flatMap((l) => l.artists.map((a) => a.artist_id));
  assert.deepEqual(titles.sort(), ["artist-amon-amarth", "artist-evanescence"]);
});

test("filterMarkersByGenre drops a venue left with zero matching listings entirely", () => {
  const onlyJungle = [marker("venue-x", [listing([JUNGLE])])];
  const filtered = filterMarkersByGenre(onlyJungle, "Rock");
  assert.deepEqual(filtered, []);
});

// --- Artist filter narrows to one Artist's linked events; mapped object stays the Event ---

test("filterMarkersByArtistId(null) returns markers unchanged", () => {
  assert.deepEqual(filterMarkersByArtistId(MARKERS, null), MARKERS);
});

test("filterMarkersByArtistId narrows to only that Artist's listings", () => {
  const filtered = filterMarkersByArtistId(MARKERS, "artist-jungle");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].display_listings.length, 1);
  assert.equal(filtered[0].display_listings[0].artists[0].artist_id, "artist-jungle");
  // the marker itself is still the Venue/Event structure — selecting an Artist never turns the Artist into the mapped object
  assert.equal(filtered[0].venue_id, "venue-meo-arena");
});

// --- Artist search ---

test("searchArtists with an empty query returns every artist, sorted by canonical_name", () => {
  const results = searchArtists("", [JUNGLE, EVANESCENCE, AMON_AMARTH]);
  assert.deepEqual(results.map((r) => r.canonical_name), ["Amon Amarth", "Evanescence", "Jungle"]);
});

test("searchArtists matches a case/diacritic-insensitive substring of canonical_name", () => {
  const results = searchArtists("evan", [JUNGLE, EVANESCENCE, AMON_AMARTH]);
  assert.deepEqual(results.map((r) => r.artist_id), ["artist-evanescence"]);
});

test("searchArtists also matches against aliases", () => {
  const withAlias = { ...EVANESCENCE, aliases: ["EVANESCENCE 2026 WORLD TOUR"] };
  const results = searchArtists("world tour", [withAlias, JUNGLE]);
  assert.deepEqual(results.map((r) => r.artist_id), ["artist-evanescence"]);
});

test("findArtistByExactName resolves an exact canonical_name to its full artist summary", () => {
  const found = findArtistByExactName("Jungle", [JUNGLE, EVANESCENCE]);
  assert.equal(found.artist_id, "artist-jungle");
});

test("findArtistByExactName returns null for no match — never a fuzzy guess", () => {
  assert.equal(findArtistByExactName("Junlge", [JUNGLE, EVANESCENCE]), null);
});

test("listingHasArtist is false for a listing with no artists attached", () => {
  assert.equal(listingHasArtist({ artists: [] }, "artist-jungle"), false);
  assert.equal(listingHasArtist({}, "artist-jungle"), false);
});
