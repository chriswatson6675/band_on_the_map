// BEATMAPPED-ENRICHMENT-PILOT-01 — generic, browser-safe search/filter
// helpers over already-enriched display markers (see
// ingestion/map/attach-artist-genres.mjs) and the publication artifact's
// top-level `artists` index (see ingestion/map/publication.mjs's
// buildArtistIndex()). Dependency-free, matching every other module in
// ingestion/map/ — imported directly by app/page.tsx, exactly like
// ingestion/map/projection.mjs's getMarkersForCountry() already is.
//
// The mapped object is always the Event (a marker's display listing),
// never the Artist — selecting/searching an Artist only ever narrows
// which markers/listings are shown; it never changes what a marker/pin
// represents.

function normalise(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * True if `listing` (an enriched display listing — see
 * attachArtistGenres) carries at least one artist with a genre whose
 * family OR tag case/diacritic-insensitively matches `genre`. Genre
 * matching is additive/OR by product decision: an event carrying
 * Rock + Indie is findable through either.
 */
export function listingHasGenre(listing, genre) {
  const target = normalise(genre);
  if (!target) return false;
  return (listing.artists ?? []).some((artist) =>
    (artist.genres ?? []).some((claim) => normalise(claim.family) === target || normalise(claim.tag) === target),
  );
}

/** True if `listing` carries the given canonical artist_id. */
export function listingHasArtist(listing, artistId) {
  if (!artistId) return false;
  return (listing.artists ?? []).some((artist) => artist.artist_id === artistId);
}

/**
 * Generic narrowing helper shared by the genre and artist filters below:
 * keep only each marker's display listings that satisfy `predicate`, and
 * drop any marker left with zero matching listings (an irrelevant venue
 * should not still show an empty pin). Never mutates its input.
 */
export function filterMarkersByListingPredicate(markers, predicate) {
  return (markers ?? [])
    .map((marker) => ({
      ...marker,
      display_listings: (marker.display_listings ?? []).filter(predicate),
    }))
    .filter((marker) => marker.display_listings.length > 0);
}

/**
 * Filter markers to only listings carrying the given genre (family or
 * tag). `genre` of "Any"/null/undefined/"" returns `markers` unchanged —
 * matches the existing Genre <select>'s "Any" option.
 */
export function filterMarkersByGenre(markers, genre) {
  if (!genre || normalise(genre) === "any") return markers ?? [];
  return filterMarkersByListingPredicate(markers, (listing) => listingHasGenre(listing, genre));
}

/**
 * Filter markers down to only the given canonical Artist's linked
 * listings. `artistId` of null/undefined returns `markers` unchanged.
 */
export function filterMarkersByArtistId(markers, artistId) {
  if (!artistId) return markers ?? [];
  return filterMarkersByListingPredicate(markers, (listing) => listingHasArtist(listing, artistId));
}

/**
 * Case/diacritic-insensitive substring search over the publication
 * artifact's `artists` index (canonical_name + aliases). Returns matching
 * {artist_id, canonical_name} summaries, canonical_name-sorted for a
 * stable, predictable dropdown/autocomplete order. An empty/whitespace
 * query returns every artist (the full pilot roster), not an empty list.
 */
export function searchArtists(query, artists) {
  const target = normalise(query);
  const matches = (artists ?? []).filter((artist) => {
    if (!target) return true;
    if (normalise(artist.canonical_name).includes(target)) return true;
    return (artist.aliases ?? []).some((alias) => normalise(alias).includes(target));
  });
  return matches
    .map((artist) => ({ artist_id: artist.artist_id, canonical_name: artist.canonical_name }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

/** Look up one artist's own summary by exact canonical_name (used to resolve a datalist selection back to an artist_id). */
export function findArtistByExactName(name, artists) {
  const target = normalise(name);
  return (artists ?? []).find((artist) => normalise(artist.canonical_name) === target) ?? null;
}
