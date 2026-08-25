// BEATMAPPED-ENRICHMENT-PILOT-01 — attaches canonical Artist + genre
// enrichment onto already-built display markers, as a thin layer on top
// of ingestion/map/group-associated-listings.mjs's projectObservationsToDisplayMarkers.
//
// This module NEVER touches an Observation. It only reads the
// (source_id, source_record_id) identity every display listing already
// carries (SINGLE listings directly; GROUP listings via each of their
// `sources[]` entries) and, where an explicit Event->Artist link exists
// (ingestion/artist/resolver.mjs), attaches a read-only `artists: []`
// array to that listing — the enriched Artist record's own canonical
// name and genre claims, never rewritten into the listing's own
// title/source fields. A listing with no resolvable link keeps
// `artists: []` — absence of evidence is never turned into a fact.
//
// Operating on already-built display listings (rather than raw
// Observations) is deliberate: it lets this same pure function enrich
// either a freshly-produced live marker set (ingestion/map/publication.mjs)
// or an already-committed publication artifact's markers directly (see
// ingestion/artist-enrichment/apply.mjs) — both shapes carry the same
// source_id/source_record_id identity, so one implementation serves both.

import { indexArtistLinks, resolveArtistForIdentity } from "../artist/resolver.mjs";

/**
 * artistsById: Map (or plain array) of canonical Artist records
 * (artists/artists.json's own `artists` array) keyed by artist_id.
 */
function indexArtists(artists) {
  if (artists instanceof Map) return artists;
  return new Map((artists ?? []).map((a) => [a.artist_id, a]));
}

function artistRef(artist) {
  return {
    artist_id: artist.artist_id,
    canonical_name: artist.canonical_name,
    genres: artist.genres ?? [],
  };
}

/**
 * Resolve the Artist(s) linked to one display listing. A SINGLE listing
 * carries its own source_id/source_record_id directly; a GROUP listing
 * has none of its own — it is resolved per underlying source, and every
 * distinct Artist found across `sources[]` is included (deduplicated),
 * since a future multi-performer association could genuinely link more
 * than one Artist to one grouped listing. Neither case fabricates an
 * Artist when no explicit link exists.
 */
export function resolveListingArtists(listing, { artistsById, linkIndex }) {
  const identities =
    listing.kind === "GROUP"
      ? (listing.sources ?? []).map((s) => [s.source_id, s.source_record_id])
      : [[listing.source_id, listing.source_record_id]];

  const seen = new Set();
  const artists = [];
  for (const [sourceId, sourceRecordId] of identities) {
    const resolution = resolveArtistForIdentity(sourceId, sourceRecordId, linkIndex);
    if (resolution.resolution_status !== "RESOLVED") continue;
    if (seen.has(resolution.artist_id)) continue;
    const artist = artistsById.get(resolution.artist_id);
    if (!artist) continue; // linked to an artist_id absent from the registry — never fabricated
    seen.add(resolution.artist_id);
    artists.push(artistRef(artist));
  }
  return artists;
}

/**
 * Return a NEW markers array (never mutates the input) where every
 * display listing gains an `artists` field. Markers without any
 * `display_listings` (should not happen for a valid publication marker,
 * but this stays defensive) are passed through unchanged.
 */
export function attachArtistGenres(markers, { artists, links } = {}) {
  const artistsById = indexArtists(artists);
  const linkIndex = indexArtistLinks(links);

  return (markers ?? []).map((marker) => {
    if (!Array.isArray(marker.display_listings)) return marker;
    return {
      ...marker,
      display_listings: marker.display_listings.map((listing) => ({
        ...listing,
        artists: resolveListingArtists(listing, { artistsById, linkIndex }),
      })),
    };
  });
}
