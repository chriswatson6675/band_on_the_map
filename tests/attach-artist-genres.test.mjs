import assert from "node:assert/strict";
import test from "node:test";

import { attachArtistGenres, resolveListingArtists } from "../ingestion/map/attach-artist-genres.mjs";

const ARTISTS = [
  { artist_id: "artist-evanescence", canonical_name: "Evanescence", genres: [{ family: "Rock", tag: "Alternative Metal" }, { family: "Metal", tag: "Gothic Metal" }] },
  { artist_id: "artist-jungle", canonical_name: "Jungle", genres: [{ family: "Electronic", tag: null }] },
];

const LINKS = [
  { source_id: "meo-arena", source_record_id: "15722", artist_id: "artist-evanescence" },
  { source_id: "meo-arena", source_record_id: "16031", artist_id: "artist-jungle" },
];

function singleListing(overrides = {}) {
  return { kind: "SINGLE", source_id: "meo-arena", source_record_id: "15722", title: "EVANESCENCE 2026 WORLD TOUR", ...overrides };
}

// --- attachArtistGenres never touches the Observation/listing's own facts ---

test("attachArtistGenres adds an `artists` field without changing any existing listing field", () => {
  const markers = [{ venue_id: "v1", display_listings: [singleListing()] }];
  const enriched = attachArtistGenres(markers, { artists: ARTISTS, links: LINKS });
  const listing = enriched[0].display_listings[0];
  assert.equal(listing.title, "EVANESCENCE 2026 WORLD TOUR", "title must be untouched");
  assert.equal(listing.source_record_id, "15722", "source_record_id must be untouched");
  assert.equal(listing.artists.length, 1);
  assert.equal(listing.artists[0].artist_id, "artist-evanescence");
  assert.equal(listing.artists[0].canonical_name, "Evanescence");
  assert.deepEqual(listing.artists[0].genres, ARTISTS[0].genres);
});

test("attachArtistGenres never mutates the input markers array", () => {
  const markers = [{ venue_id: "v1", display_listings: [singleListing()] }];
  const originalListing = markers[0].display_listings[0];
  attachArtistGenres(markers, { artists: ARTISTS, links: LINKS });
  assert.ok(!("artists" in originalListing), "the original listing object must be untouched");
});

test("a SINGLE listing with no explicit link gets artists: [] — never a fabricated/guessed Artist", () => {
  const markers = [{ venue_id: "v1", display_listings: [singleListing({ source_record_id: "unlinked-999" })] }];
  const enriched = attachArtistGenres(markers, { artists: ARTISTS, links: LINKS });
  assert.deepEqual(enriched[0].display_listings[0].artists, []);
});

test("a link pointing at an artist_id absent from the registry resolves to no Artist, never a fabricated one", () => {
  const markers = [{ venue_id: "v1", display_listings: [singleListing()] }];
  const enriched = attachArtistGenres(markers, {
    artists: [], // registry empty — the link exists but the Artist record does not
    links: LINKS,
  });
  assert.deepEqual(enriched[0].display_listings[0].artists, []);
});

test("markers without display_listings are passed through unchanged", () => {
  const markers = [{ venue_id: "v1" }];
  const enriched = attachArtistGenres(markers, { artists: ARTISTS, links: LINKS });
  assert.deepEqual(enriched, markers);
});

// --- GROUP listings resolve per underlying source, deduplicated ---

test("resolveListingArtists on a GROUP listing checks every source and dedupes repeated Artists", () => {
  const group = {
    kind: "GROUP",
    sources: [
      { source_id: "meo-arena", source_record_id: "15722" },
      { source_id: "meo-arena", source_record_id: "15722" }, // deliberately repeated
    ],
  };
  const artists = resolveListingArtists(group, {
    artistsById: new Map(ARTISTS.map((a) => [a.artist_id, a])),
    linkIndex: LINKS,
  });
  assert.equal(artists.length, 1, "the same Artist found via two sources must not be duplicated");
  assert.equal(artists[0].artist_id, "artist-evanescence");
});

test("resolveListingArtists on a GROUP listing can surface distinct Artists from distinct sources", () => {
  const group = {
    kind: "GROUP",
    sources: [
      { source_id: "meo-arena", source_record_id: "15722" },
      { source_id: "meo-arena", source_record_id: "16031" },
    ],
  };
  const artists = resolveListingArtists(group, {
    artistsById: new Map(ARTISTS.map((a) => [a.artist_id, a])),
    linkIndex: LINKS,
  });
  assert.deepEqual(artists.map((a) => a.artist_id).sort(), ["artist-evanescence", "artist-jungle"]);
});
