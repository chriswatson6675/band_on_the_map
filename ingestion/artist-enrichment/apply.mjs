// BEATMAPPED-ENRICHMENT-PILOT-01 — reapplies Artist/genre enrichment onto
// an ALREADY-PUBLISHED publication artifact, without a new live
// acquisition run.
//
// Every live run (ingestion/publish-map-data/run.mjs, ingestion/
// unattended-runner/run.mjs) now attaches Artist enrichment automatically
// via buildPortugalMarkers()/buildPublicationArtifact() (see
// ingestion/map/publication.mjs). This module exists for the case an
// operator curates a NEW artists/event-artist-links.json entry (or
// updates an existing Artist's genres) and wants that reflected in the
// committed artifact immediately, without waiting for/risking a fresh
// live re-scrape of every source. It re-derives enrichment from the
// artifact's own already-evidenced display listings (each one already
// carries its Observation's source_id/source_record_id — see
// docs/ARTIST_ENRICHMENT.md) — it never re-acquires, re-dates, or
// otherwise changes any listing's own source facts.
//
// Pure and side-effect-free: takes an already-parsed artifact object,
// returns a new one. ingestion/artist-enrichment/run.mjs is the only
// filesystem-touching wrapper around this.

import { attachArtistGenres } from "../map/attach-artist-genres.mjs";
import { buildArtistIndex, validatePublicationArtifact } from "../map/publication.mjs";

/**
 * Returns a NEW artifact object (never mutates `artifact`) with every
 * Portugal marker's display listings re-resolved against
 * `artistRegistry`/`artistLinks`, and a freshly rebuilt top-level
 * `artists` search index. `counts` is left untouched — enrichment adds a
 * field to existing listings, it never adds/removes a listing or
 * marker, so `display_listing_count`/`map_marker_count` cannot drift.
 */
export function applyArtistEnrichmentToArtifact(artifact, { artistRegistry = [], artistLinks = [] } = {}) {
  const enrichedPortugalMarkers = attachArtistGenres(artifact.countries.Portugal.markers, {
    artists: artistRegistry,
    links: artistLinks,
  });

  return {
    ...artifact,
    countries: {
      ...artifact.countries,
      Portugal: { markers: enrichedPortugalMarkers },
    },
    artists: buildArtistIndex(enrichedPortugalMarkers, artistRegistry, artifact.generated_at?.slice(0, 10) ?? null),
  };
}

/**
 * Convenience wrapper: apply enrichment, then validate the result before
 * a caller writes it anywhere. Returns { ok: true, artifact } or
 * { ok: false, errors }, mirroring writePublicationArtifactAtomic()'s own
 * result shape — never throws for an ordinary validation failure.
 */
export function applyAndValidate(artifact, options) {
  const enriched = applyArtistEnrichmentToArtifact(artifact, options);
  const errors = validatePublicationArtifact(enriched);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, artifact: enriched };
}
