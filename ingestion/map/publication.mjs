// BOTM-PUBLIC-MAP-LIVE-DATA-01 — the pure, dependency-free heart of the
// product publication boundary.
//
// This module NEVER touches the filesystem or the network itself. It
// takes already-acquired Observations, already-loaded canonical Venue/
// source registries, and an already-loaded manual-coordinate lookup (see
// ingestion/geocoding/manual-coordinate-store.mjs), and produces:
//
//   1. buildPortugalMarkers()      - the SAME display markers real
//      customers already see, using the SAME
//      projectObservationsToDisplayMarkers() /
//      resolveVenueMapCoordinates() semantics as `npm run
//      ingest:lisbon-porto` (ingestion/lisbon-porto/run.mjs) — this is
//      deliberately ONE PIPELINE, not a second homepage-only projection.
//   2. buildPublicationArtifact()  - the MINIMAL, product-facing shape
//      committed to data/public/lisbon-porto-map.json and read by
//      app/page.tsx. It never dumps proof/debug fields (unresolved
//      lists, resolution methods, raw ungrouped `listings`, etc.) — only
//      what the public site needs to render/search the current product.
//   3. validatePublicationArtifact() - schema + internal cross-check
//      validation, used both by tests and by the atomic-write layer
//      (ingestion/map/publish-artifact-io.mjs) to refuse ever replacing a
//      good committed artifact with a broken one.
//   4. isCatastrophicPublicationRun() - the one, deliberately simple,
//      documented rule for when a live run must NOT be published — see
//      its own doc comment below.
//
// Being import-safe and side-effect-free, this module is exercised
// directly by deterministic tests (no live network, no filesystem writes)
// and reused unchanged by ingestion/publish-map-data/run.mjs (the live,
// operator-triggered `npm run publish:map-data` entry point) and, later,
// by the future scheduler this package hands off to.

import { projectObservationsToDisplayMarkers } from "./group-associated-listings.mjs";
import { isValidCoordinate } from "./projection.mjs";
import { attachArtistGenres } from "./attach-artist-genres.mjs";

/**
 * Build the combined Lisbon+Porto display-marker set that becomes the
 * public "Portugal" country bucket — the exact same
 * projectObservationsToDisplayMarkers() call every other real display/map
 * surface in this repository already uses (ingestion/lisbon-porto/run.mjs's
 * summariseCity(), ingestion/venue-onboarding/run.mjs). Lisbon and Porto
 * are combined into ONE marker list here because the public product is
 * "Portugal", not two separately-branded cities — the previous obsolete
 * fixture only covered Lisbon; this package's whole point is that Porto
 * markers must not be dropped.
 *
 * `lisbonAssociations` (Hot Clube <-> Capitólio) is Lisbon-only by
 * construction (associateHotClubeCapitolio only ever pairs those two
 * Lisbon source_ids) and is safe to pass alongside Porto observations —
 * it simply never matches any Porto listing identity.
 *
 * `artistRegistry`/`artistLinks` (BEATMAPPED-ENRICHMENT-PILOT-01, both
 * optional, default to none): the canonical Artist roster
 * (artists/artists.json's own `artists` array) and the explicit
 * Event->Artist links (artists/event-artist-links.json's own `links`
 * array). When supplied, every display listing gains an `artists` field
 * via attachArtistGenres() — see that module's own doc comment. Omitting
 * either leaves every listing's `artists` field an empty array, and
 * every existing caller that omits both keeps today's exact behaviour
 * otherwise unchanged.
 */
export function buildPortugalMarkers({
  lisbonObservations,
  portoObservations,
  lisbonVenues,
  portoVenues,
  lisbonSourceRegistry,
  portoSourceRegistry,
  lisbonAssociations = [],
  manualCoordinatesByVenueId,
  artistRegistry = [],
  artistLinks = [],
}) {
  const combinedObservations = [...(lisbonObservations ?? []), ...(portoObservations ?? [])];
  const combinedVenues = [...(lisbonVenues ?? []), ...(portoVenues ?? [])];
  const combinedSourceRegistry = [...(lisbonSourceRegistry ?? []), ...(portoSourceRegistry ?? [])];

  const markers = projectObservationsToDisplayMarkers(combinedObservations, {
    venues: combinedVenues,
    sourceRegistry: combinedSourceRegistry,
    associations: lisbonAssociations,
    manualCoordinatesByVenueId,
  });

  return attachArtistGenres(markers, { artists: artistRegistry, links: artistLinks });
}

/**
 * BARCELONA-30-VENUE-POPULATION-01: the Spain/Barcelona sibling of
 * buildPortugalMarkers() above — same projectObservationsToDisplayMarkers()
 * machinery, same manual-coordinate composition, same artist-genre
 * attachment, so Barcelona is never a second, independently-drifting
 * projection path. `associations` defaults to `[]` (no hand-authored
 * cross-source association pairs exist for Barcelona yet — see
 * ingestion/association/hot-clube-capitolio.mjs's own doc comment on why
 * that concern is source-pair-specific, never generic); a future
 * Barcelona duplicate-listing case would need its own explicit,
 * evidence-backed association module, following that exact precedent.
 */
export function buildSpainMarkers({
  barcelonaObservations,
  barcelonaVenues,
  barcelonaSourceRegistry,
  associations = [],
  manualCoordinatesByVenueId,
  artistRegistry = [],
  artistLinks = [],
}) {
  const markers = projectObservationsToDisplayMarkers(barcelonaObservations ?? [], {
    venues: barcelonaVenues ?? [],
    sourceRegistry: barcelonaSourceRegistry ?? [],
    associations,
    manualCoordinatesByVenueId,
  });

  return attachArtistGenres(markers, { artists: artistRegistry, links: artistLinks });
}

/**
 * BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01: the
 * Germany/Berlin sibling of buildPortugalMarkers()/buildSpainMarkers()
 * above — same projectObservationsToDisplayMarkers() machinery, same
 * manual-coordinate composition, same artist-genre attachment, so Berlin
 * is never a second, independently-drifting projection path. `associations`
 * defaults to `[]` (no hand-authored cross-source association pairs exist
 * for Berlin yet, matching Spain's own precedent) — a future Berlin
 * duplicate-listing case would need its own explicit, evidence-backed
 * association module, following the Hot Clube/Capitólio precedent exactly.
 */
export function buildGermanyMarkers({
  berlinObservations,
  berlinVenues,
  berlinSourceRegistry,
  associations = [],
  manualCoordinatesByVenueId,
  artistRegistry = [],
  artistLinks = [],
}) {
  const markers = projectObservationsToDisplayMarkers(berlinObservations ?? [], {
    venues: berlinVenues ?? [],
    sourceRegistry: berlinSourceRegistry ?? [],
    associations,
    manualCoordinatesByVenueId,
  });

  return attachArtistGenres(markers, { artists: artistRegistry, links: artistLinks });
}

/**
 * Trim one full display marker (as produced by
 * projectObservationsToDisplayMarkers, which also carries the raw,
 * ungrouped `listings` array used only for internal proof/debug
 * accounting) down to the minimal, product-facing shape this package's
 * brief calls for: venue_id, canonical_name, latitude, longitude,
 * address, display_listings. `display_listings` itself is passed through
 * completely unchanged — it is already the governed, customer-facing
 * association layer (ingestion/map/group-associated-listings.mjs); this
 * function never collapses or reshapes it further.
 */
export function toPublicationMarker(marker) {
  return {
    venue_id: marker.venue_id,
    canonical_name: marker.canonical_name,
    latitude: marker.latitude,
    longitude: marker.longitude,
    address: marker.address,
    display_listings: marker.display_listings,
  };
}

/**
 * BEATMAPPED-ENRICHMENT-PILOT-01 — builds the publication artifact's
 * top-level `artists` search index: one entry per canonical Artist in
 * `artistRegistry` (artists/artists.json's own `artists` array), each
 * carrying its own genre claims plus every linked upcoming Event this
 * publication run actually produced a marker for.
 *
 * This is the ONE place Artist search results are assembled — the public
 * site never re-derives "this Artist's events" by re-walking every
 * marker's display_listings itself (see ingestion/map/
 * artist-genre-search.mjs, which searches THIS index, then narrows
 * markers by artist_id for the map).
 *
 * "Upcoming" means the listing's own start.date is >= asOfDate, OR the
 * listing's date is genuinely unknown (null) — an unknown date is never
 * silently dropped, matching this project's "absence of evidence is
 * never turned into a fact" rule; it is surfaced, not hidden. asOfDate
 * is accepted as a parameter (never computed here) so this stays pure.
 */
export function buildArtistIndex(publicationMarkers, artistRegistry, asOfDate) {
  const events = [];
  for (const marker of publicationMarkers ?? []) {
    for (const listing of marker.display_listings ?? []) {
      if (!(listing.artists?.length > 0)) continue;
      const date = listing.start?.date ?? null;
      if (asOfDate && date && date < asOfDate) continue; // past event — not "upcoming"
      const event = {
        venue_id: marker.venue_id,
        venue_name: marker.canonical_name,
        address: marker.address,
        latitude: marker.latitude,
        longitude: marker.longitude,
        title: listing.kind === "GROUP" ? listing.display_title : listing.title,
        start: listing.start,
        end: listing.end,
        event_url: listing.kind === "SINGLE" ? listing.event_url : null,
      };
      for (const artist of listing.artists) {
        events.push({ artist_id: artist.artist_id, event });
      }
    }
  }

  return (artistRegistry ?? []).map((artist) => ({
    artist_id: artist.artist_id,
    canonical_name: artist.canonical_name,
    aliases: artist.aliases ?? [],
    genres: artist.genres ?? [],
    events: events.filter((e) => e.artist_id === artist.artist_id).map((e) => e.event),
  }));
}

/**
 * Assemble the full publication artifact object (the exact shape written
 * to data/public/lisbon-porto-map.json). `generatedAt` is accepted as a
 * parameter rather than computed here (never `new Date()` inside this
 * function) so this function stays pure and deterministic for identical
 * inputs — a requirement the tests rely on directly.
 *
 * Croatia is always published as an empty marker list: this repository
 * has no Croatian source registry, no Croatian venues, and no Croatian
 * Observations of any kind — see docs/PUBLIC_MAP_LIVE_DATA_01.md. Never
 * fabricated, never inferred.
 *
 * `artistRegistry` (BEATMAPPED-ENRICHMENT-PILOT-01, optional, defaults to
 * []): forwarded to buildArtistIndex() as the artifact's top-level
 * `artists` search index. Omitting it publishes `artists: []` — every
 * existing caller/test that omits it keeps today's exact artifact shape
 * otherwise unchanged (display_listings' own `artists` field, if
 * present from buildPortugalMarkers, is passed through unaffected either
 * way).
 *
 * `spainMarkers` (BARCELONA-30-VENUE-POPULATION-01, optional, defaults to
 * `[]`): Barcelona's own display markers (buildSpainMarkers() above),
 * published as a new `countries.Spain` bucket alongside the existing
 * Portugal/Croatia ones — the SAME artifact, the SAME publication
 * function, never a second/parallel publication path. Every count below
 * (`display_listing_count`, `map_marker_count`) is the TOTAL across every
 * published country (Portugal + Spain; Croatia is always empty) — not a
 * Portugal-only figure — so a caller that never supplies `spainMarkers`
 * gets back exactly the counts it always has (adding zero markers changes
 * nothing), and a caller that does gets an honest combined total rather
 * than a silently Portugal-only one.
 */
export function buildPublicationArtifact({
  generatedAt,
  from,
  to,
  portugalMarkers,
  spainMarkers = [],
  germanyMarkers = [],
  sourceResults,
  observationCount,
  artistRegistry = [],
}) {
  const publicationPortugalMarkers = (portugalMarkers ?? []).map(toPublicationMarker);
  const publicationSpainMarkers = (spainMarkers ?? []).map(toPublicationMarker);
  const publicationGermanyMarkers = (germanyMarkers ?? []).map(toPublicationMarker);
  const allPublicationMarkers = [...publicationPortugalMarkers, ...publicationSpainMarkers, ...publicationGermanyMarkers];
  const displayListingCount = allPublicationMarkers.reduce((sum, marker) => sum + marker.display_listings.length, 0);
  const successCount = (sourceResults ?? []).filter((result) => result.success).length;
  const failureCount = (sourceResults ?? []).length - successCount;

  return {
    generated_at: generatedAt,
    window: { from: from ?? null, to: to ?? null },
    source_report: {
      success_count: successCount,
      failure_count: failureCount,
      sources: (sourceResults ?? []).map((result) => ({
        source_id: result.source_id,
        success: result.success,
        raw_record_count: result.raw_record_count,
        observation_count: result.observation_count,
        ...(result.error !== undefined ? { error: result.error } : {}),
      })),
    },
    counts: {
      observation_count: observationCount,
      display_listing_count: displayListingCount,
      map_marker_count: allPublicationMarkers.length,
    },
    countries: {
      Portugal: { markers: publicationPortugalMarkers },
      Croatia: { markers: [] },
      Spain: { markers: publicationSpainMarkers },
      Germany: { markers: publicationGermanyMarkers },
    },
    artists: buildArtistIndex(allPublicationMarkers, artistRegistry, generatedAt ? generatedAt.slice(0, 10) : null),
  };
}

function isValidDisplayListing(listing) {
  if (!listing || typeof listing !== "object") return false;
  if (listing.kind === "SINGLE") {
    return typeof listing.source_id === "string" && typeof listing.source_record_id === "string";
  }
  if (listing.kind === "GROUP") {
    return Array.isArray(listing.sources) && listing.sources.length > 0;
  }
  return false;
}

/**
 * Validate a publication artifact's schema AND its own internal
 * cross-checks (PUBLIC ARTIFACT CROSS-CHECK — the task's own requirement
 * that `counts.display_listing_count` and `counts.map_marker_count` are
 * never independently-computed drifting totals, but exactly derived from
 * `countries.Portugal.markers` itself). Returns an array of human-readable
 * error strings; empty means valid. Never throws.
 *
 * This is the ONE gate ingestion/map/publish-artifact-io.mjs's atomic
 * writer calls before ever touching disk — a failing artifact is refused
 * before a temp file is even opened, so a failed validation can never
 * replace a previously good committed artifact.
 */
export function validatePublicationArtifact(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object") return ["artifact must be an object"];

  if (typeof artifact.generated_at !== "string" || Number.isNaN(Date.parse(artifact.generated_at))) {
    errors.push("generated_at must be a valid ISO 8601 timestamp string");
  }

  if (!artifact.window || typeof artifact.window !== "object") {
    errors.push("window must be an object");
  } else {
    if (artifact.window.from !== null && typeof artifact.window.from !== "string") {
      errors.push("window.from must be a string or null");
    }
    if (artifact.window.to !== null && typeof artifact.window.to !== "string") {
      errors.push("window.to must be a string or null");
    }
  }

  if (!artifact.source_report || !Array.isArray(artifact.source_report.sources)) {
    errors.push("source_report.sources must be an array");
  } else {
    const sources = artifact.source_report.sources;
    for (const source of sources) {
      if (!source || typeof source.source_id !== "string" || typeof source.success !== "boolean") {
        errors.push(`source_report entry is malformed: ${JSON.stringify(source)}`);
      }
    }
    const derivedSuccessCount = sources.filter((s) => s?.success).length;
    if (artifact.source_report.success_count !== derivedSuccessCount) {
      errors.push("source_report.success_count does not match sources[].success — drifting total");
    }
    if (artifact.source_report.failure_count !== sources.length - derivedSuccessCount) {
      errors.push("source_report.failure_count does not match sources[].success — drifting total");
    }
  }

  if (!artifact.countries || typeof artifact.countries !== "object") {
    errors.push("countries must be an object");
    return errors; // nothing further can be checked safely
  }

  for (const countryName of ["Portugal", "Croatia"]) {
    const country = artifact.countries[countryName];
    if (!country || !Array.isArray(country.markers)) {
      errors.push(`countries.${countryName}.markers must be an array`);
    }
  }

  // BARCELONA-30-VENUE-POPULATION-01: "Spain" joins "Portugal"/"Croatia"
  // as a recognised country bucket, but — unlike them — is OPTIONAL at
  // the schema level: every artifact built before Barcelona existed (and
  // every hand-authored minimal test fixture predating it, e.g.
  // tests/runtime-publication.test.mjs's validArtifact()) legitimately
  // has no `countries.Spain` key at all, and must remain valid without
  // being rewritten. When present, it is validated with the exact same
  // rules as Portugal, and its markers join the SAME global cross-checks
  // below — counts.map_marker_count/display_listing_count are the TOTAL
  // across every published country (never a Portugal-only figure — see
  // buildPublicationArtifact()'s own doc comment), and venue_id
  // uniqueness is checked GLOBALLY (a Barcelona venue_id must never
  // collide with a Lisbon/Porto one either).
  if (artifact.countries.Spain !== undefined) {
    if (!artifact.countries.Spain || !Array.isArray(artifact.countries.Spain.markers)) {
      errors.push("countries.Spain.markers must be an array when present");
    }
  }

  // BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01: "Germany"
  // joins "Spain" as another OPTIONAL country bucket, for the exact same
  // reason Spain was optional relative to Portugal/Croatia — every
  // artifact built before Berlin existed legitimately has no
  // `countries.Germany` key at all. Its markers join the SAME global
  // cross-checks below (map_marker_count/display_listing_count/venue_id
  // uniqueness are the TOTAL across every published country).
  if (artifact.countries.Germany !== undefined) {
    if (!artifact.countries.Germany || !Array.isArray(artifact.countries.Germany.markers)) {
      errors.push("countries.Germany.markers must be an array when present");
    }
  }

  const portugalMarkers = Array.isArray(artifact.countries.Portugal?.markers) ? artifact.countries.Portugal.markers : null;
  const spainMarkers = Array.isArray(artifact.countries.Spain?.markers) ? artifact.countries.Spain.markers : [];
  const germanyMarkers = Array.isArray(artifact.countries.Germany?.markers) ? artifact.countries.Germany.markers : [];
  const allCountryMarkers = portugalMarkers ? [...portugalMarkers, ...spainMarkers, ...germanyMarkers] : null;

  if (allCountryMarkers) {
    let listingSum = 0;
    const seenVenueIds = new Set();
    for (const marker of allCountryMarkers) {
      if (!marker || typeof marker.venue_id !== "string" || marker.venue_id.trim() === "") {
        errors.push(`marker is missing a valid venue_id: ${JSON.stringify(marker)}`);
        continue;
      }
      if (seenVenueIds.has(marker.venue_id)) {
        errors.push(`duplicate marker venue_id: ${marker.venue_id}`);
      }
      seenVenueIds.add(marker.venue_id);

      if (typeof marker.canonical_name !== "string" || marker.canonical_name.trim() === "") {
        errors.push(`${marker.venue_id}: canonical_name must be a non-empty string`);
      }
      if (!isValidCoordinate(marker.latitude, marker.longitude)) {
        errors.push(`${marker.venue_id}: invalid coordinates (${marker.latitude}, ${marker.longitude})`);
      }
      if (!Array.isArray(marker.display_listings) || marker.display_listings.length === 0) {
        errors.push(`${marker.venue_id}: display_listings must be a non-empty array`);
      } else {
        for (const listing of marker.display_listings) {
          if (!isValidDisplayListing(listing)) {
            errors.push(`${marker.venue_id}: malformed display listing ${JSON.stringify(listing)}`);
          }
        }
        listingSum += marker.display_listings.length;
      }
    }

    if (!artifact.counts || typeof artifact.counts !== "object") {
      errors.push("counts must be an object");
    } else {
      if (artifact.counts.map_marker_count !== allCountryMarkers.length) {
        errors.push(
          `counts.map_marker_count (${artifact.counts.map_marker_count}) does not match the total marker count across countries.Portugal + countries.Spain (${allCountryMarkers.length}) — no independently-computed drifting totals allowed`,
        );
      }
      if (artifact.counts.display_listing_count !== listingSum) {
        errors.push(
          `counts.display_listing_count (${artifact.counts.display_listing_count}) does not match the sum of markers[].display_listings.length across all countries (${listingSum}) — no independently-computed drifting totals allowed`,
        );
      }
      if (typeof artifact.counts.observation_count !== "number" || artifact.counts.observation_count < 0) {
        errors.push("counts.observation_count must be a non-negative number");
      }
    }
  }

  // BEATMAPPED-ENRICHMENT-PILOT-01: `artists` is optional (an artifact
  // built before this pilot, or by a caller that omitted artistRegistry,
  // legitimately has none) — only validated when present, and never
  // required to be non-empty.
  if (artifact.artists !== undefined) {
    if (!Array.isArray(artifact.artists)) {
      errors.push("artists must be an array when present");
    } else {
      for (const artist of artifact.artists) {
        if (!artist || typeof artist.artist_id !== "string" || artist.artist_id.trim() === "") {
          errors.push(`artists entry is missing a valid artist_id: ${JSON.stringify(artist)}`);
          continue;
        }
        if (typeof artist.canonical_name !== "string" || artist.canonical_name.trim() === "") {
          errors.push(`${artist.artist_id}: canonical_name must be a non-empty string`);
        }
        if (!Array.isArray(artist.genres)) {
          errors.push(`${artist.artist_id}: genres must be an array`);
        }
        if (!Array.isArray(artist.events)) {
          errors.push(`${artist.artist_id}: events must be an array`);
        }
      }
    }
  }

  return errors;
}

/**
 * CATASTROPHIC-RUN RULE (documented once, here, and nowhere else):
 *
 * A publication run is CATASTROPHIC — and must never replace the
 * previously committed publication artifact — when EITHER:
 *
 *   (a) zero of the attempted sources succeeded (total acquisition
 *       failure — every one of the 13 sources' own try/catch isolation
 *       reported failure), OR
 *   (b) the resulting Portugal map marker count is zero (the run
 *       "succeeded" in some narrow technical sense but produced a
 *       genuinely unusable/empty product — an empty map is exactly the
 *       kind of catastrophic-but-not-technically-erroring run this rule
 *       exists to catch).
 *
 * A run where at least one source succeeds AND produces at least one
 * Portugal map marker is considered publishable — even if several other
 * sources failed. This matches this project's existing, already-proven
 * source-isolation semantics (ingestion/lisbon-porto/run.mjs's
 * acquireAll(): one source's failure never blocks the others) — no
 * additional availability threshold (e.g. "at least N/13 sources must
 * succeed") is invented here, per this task's own instruction not to.
 *
 * BARCELONA-30-VENUE-POPULATION-01: `spainMarkerCount` is a new,
 * optional parameter (defaults to `0`) so rule (b) becomes "the TOTAL
 * (Portugal + Spain) map marker count is zero" — a run that produces
 * real Barcelona markers is never treated as catastrophic merely because
 * Portugal's own count happens to be zero, and vice versa. Every existing
 * caller that omits `spainMarkerCount` (ingestion/unattended-runner/run.mjs)
 * keeps EXACTLY today's behaviour: `spainMarkerCount` defaults to `0`, so
 * rule (b) reduces to the original `portugalMarkerCount === 0` check.
 */
export function isCatastrophicPublicationRun({
  sourceSuccessCount,
  portugalMarkerCount,
  spainMarkerCount = 0,
  germanyMarkerCount = 0,
}) {
  return sourceSuccessCount === 0 || portugalMarkerCount + spainMarkerCount + germanyMarkerCount === 0;
}
