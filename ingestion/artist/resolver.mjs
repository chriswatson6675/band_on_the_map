// BEATMAPPED-ENRICHMENT-PILOT-01 — Observation (Event) -> canonical Artist
// resolver.
//
// Mirrors ingestion/venue/resolver.mjs's own convention exactly: explicit,
// hand-curated (source_id, source_record_id) -> artist_id links only —
// deliberately no fuzzy name matching. Product decision #3 ("similar
// names alone are not enough to merge Artists") applies just as much to
// linking an Observation to an Artist as it does to merging two Artists:
// an unresolved Observation is preferable to a wrongly-attributed one.
//
// This module never invents a link. Every entry in artists/
// event-artist-links.json is a deliberate, curated decision (see that
// file's own `method`/`decided_at` fields) — this resolver only looks
// entries up, it never decides which ones exist.

export function createLinkKey(sourceId, sourceRecordId) {
  return `${sourceId}:${sourceRecordId}`;
}

/**
 * Build a Map from "source_id:source_record_id" -> link entry, for O(1)
 * lookup. `links` is the array from artists/event-artist-links.json's
 * own `links` field.
 */
export function indexArtistLinks(links) {
  const byKey = new Map();
  for (const link of links ?? []) {
    byKey.set(createLinkKey(link.source_id, link.source_record_id), link);
  }
  return byKey;
}

/**
 * Resolve one Observation-identity (source_id, source_record_id) to a
 * canonical artist_id. Accepts either a raw Observation-shaped object
 * ({source_id, source_record_id, ...}) or a display-listing-shaped
 * object with the same two fields — both already carry the identical
 * identity pair (see docs/OBSERVATION_PIPELINE.md), so one resolver
 * serves both without duplicating the lookup.
 *
 * `linkIndex` is the Map from indexArtistLinks() above (or a plain links
 * array, for convenience — indexed on the fly if so).
 */
export function resolveArtistForIdentity(sourceId, sourceRecordId, linkIndex) {
  const index = linkIndex instanceof Map ? linkIndex : indexArtistLinks(linkIndex);
  const link = index.get(createLinkKey(sourceId, sourceRecordId));
  if (link?.artist_id) {
    return { artist_id: link.artist_id, resolution_status: "RESOLVED", resolution_method: "EXPLICIT_EVENT_ARTIST_LINK" };
  }
  return { artist_id: null, resolution_status: "UNRESOLVED", resolution_method: "NO_EXPLICIT_EVENT_ARTIST_LINK" };
}

export function resolveArtistForObservation(observation, linkIndex) {
  return resolveArtistForIdentity(observation?.source_id, observation?.source_record_id, linkIndex);
}
