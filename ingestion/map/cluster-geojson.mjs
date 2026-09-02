// BOTM-MAP-DISCOVERY-UX-01 — pure helpers backing components/DiscoveryMap.tsx's
// MapLibre-native geographic clustering (a GeoJSON source with
// `cluster: true`, plus circle/symbol layers — never DOM markers and
// never fake CSS overlap grouping).
//
// Named zoom/radius constants live here (not scattered as magic numbers
// in the component) so both the component and this package's tests share
// exactly one definition. See the FINAL REPORT for how CLUSTER_RADIUS /
// CLUSTER_MAX_ZOOM / NEAR_TERM_LABEL_MIN_ZOOM were chosen and verified.

export const VENUE_CLUSTER_SOURCE_ID = "botm-venues";
export const CLUSTER_CIRCLE_LAYER_ID = "botm-cluster-circle";
export const CLUSTER_HALO_LAYER_ID = "botm-cluster-halo";
export const CLUSTER_COUNT_LAYER_ID = "botm-cluster-count";

// The pixel radius (at the source's own tile resolution) within which
// supercluster groups points together. Tuned so Lisbon's tightly-packed
// venues combine into one city cluster at country-wide zoom while Porto's
// separate metro area (~300km away) forms its own cluster.
//
// BEATMAPPED-LONDON-MAP-CLUSTER-VISIBILITY-01: reduced from 60 to 35.
// At the wide, very-zoomed-out "All cities" default view (see
// COUNTRY_MAP_VIEWS["All cities"] in components/DiscoveryMap.tsx —
// fitBounds computes an even lower effective zoom than its own
// nominal `zoom: 4.2` once the container's wide/short aspect ratio is
// accounted for), 60px genuinely spans enough real-world distance to
// merge London into the Paris/France cluster (~340km apart) — proven
// directly: a live, instrumented MapLibre source inspection showed
// London's 8 venues as `getClusterLeaves()` members of the SAME
// cluster as Paris's 33, contributing correctly to its summed
// `gig_count` but never forming (or being visible as) their own
// circle. 35 was the smallest tested reduction that reliably separates
// Paris from London at this exact view while leaving Germany/Berlin
// and Spain/Barcelona (already single-city clusters, no separation
// risk) unaffected. The one real, accepted side effect: Lisbon and
// Porto (~300km apart, comparably close) also separate into two
// clusters at this SAME "All cities" view, instead of the one merged
// circle they previously formed there — the original tuning note above
// was always scoped to Portugal's own country-level view (zoom 5.5,
// see COUNTRY_MAP_VIEWS.Portugal), never to "All cities", and no test
// asserted Lisbon+Porto must stay merged at the wider view, so this is
// treated as an acceptable (arguably more informative — Lisbon and
// Porto are both substantial, independently real markets) side effect
// of the smallest change that reliably shows London, rather than a
// regression.
export const CLUSTER_RADIUS = 35;

// The zoom level at/above which supercluster stops merging points into
// clusters — every venue point renders individually (as its own DOM
// Marker) from this zoom upward, satisfying "at a sufficiently close zoom
// all 12 underlying venue markers must be recoverable/separable".
export const CLUSTER_MAX_ZOOM = 13;

// The zoom level at/above which automatic today/tomorrow gig labels
// appear next to individual venue markers (neighbourhood/street level).
export const NEAR_TERM_LABEL_MIN_ZOOM = 14;

// The GeoJSON feature property carrying one venue's DISPLAY GIG LISTING
// count (never raw Observation/source-record count — see
// ingestion/map/group-associated-listings.mjs). MapLibre's
// `clusterProperties: { [GIG_COUNT_PROPERTY]: ["+", ["get", GIG_COUNT_PROPERTY]] }`
// sums this across every leaf a cluster represents, so a cluster's
// displayed number is the TOTAL gig count across its venues — never
// merely the venue count (supercluster's own built-in `point_count`
// already gives us that separately, for the "N venues · M gigs" hover
// text).
export const GIG_COUNT_PROPERTY = "gig_count";

function displayListingsCount(marker) {
  if (Array.isArray(marker.display_listings)) return marker.display_listings.length;
  if (Array.isArray(marker.listings)) return marker.listings.length;
  return 0;
}

/**
 * Builds the GeoJSON FeatureCollection fed to the `VENUE_CLUSTER_SOURCE_ID`
 * source: one Point Feature per venue with a valid coordinate, carrying
 * only `venue_id` (to look the full marker back up) and `gig_count` (the
 * number to aggregate/display). Markers without a finite lat/lng
 * (shouldn't occur in the committed publication artifact, but defensive
 * regardless — see venues/manual-coordinates.json / ADDRESS_ONLY venues)
 * are skipped, never plotted at a fabricated location.
 */
export function buildVenueFeatureCollection(markers) {
  const features = (markers ?? [])
    .filter((marker) => Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude))
    .map((marker) => ({
      type: "Feature",
      properties: {
        venue_id: marker.venue_id,
        [GIG_COUNT_PROPERTY]: displayListingsCount(marker),
      },
      geometry: { type: "Point", coordinates: [marker.longitude, marker.latitude] },
    }));
  return { type: "FeatureCollection", features };
}

/**
 * Mirrors — in plain, synchronously-testable JS — the exact reduction
 * MapLibre's supercluster-backed GeoJSONSource performs when
 * `clusterProperties: { [GIG_COUNT_PROPERTY]: ["+", ["get", GIG_COUNT_PROPERTY]] }`
 * is configured (see components/DiscoveryMap.tsx): the map expression
 * reads each LEAF point's own gig_count, and the "+" operator sums
 * pairwise as leaves merge into a cluster. Used by tests to prove the
 * aggregate-gig-count semantics deterministically without needing a real
 * WebGL-backed map instance (not practical under node:test).
 */
export function sumGigCounts(markers) {
  return (markers ?? []).reduce((sum, marker) => sum + displayListingsCount(marker), 0);
}

/**
 * Formats the cluster hover tooltip text: "N venues · M gigs" (singular
 * forms when N/M is exactly 1). `pointCount` is supercluster's own
 * built-in per-cluster venue count (from the `point_count` property every
 * cluster feature carries automatically); `gigCount` is the summed
 * GIG_COUNT_PROPERTY total (see the clusterProperties config in
 * components/DiscoveryMap.tsx). Deliberately never lists individual
 * venues — see the task brief's "Do not list every venue inside the
 * hover tooltip."
 */
export function formatClusterTooltip(pointCount, gigCount) {
  const venues = Number(pointCount) || 0;
  const gigs = Number(gigCount) || 0;
  return `${venues} venue${venues === 1 ? "" : "s"} · ${gigs} gig${gigs === 1 ? "" : "s"}`;
}
