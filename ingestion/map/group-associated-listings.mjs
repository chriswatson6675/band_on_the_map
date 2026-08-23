// Builds the user-facing DISPLAY view on top of
// ingestion/map/projection.mjs's raw, ungrouped listings.
// projectObservationsToMapMarkers itself is left completely unchanged by
// BOTM-MULTISOURCE-LINKS-01 — its own contract and tests are unaffected
// — this module only adds a grouping layer on top: where two independent
// Observations (a Hot Clube programme record and a Capitólio venue-page
// record) have been evidence-backed associated as the same real-world
// gig (ingestion/association/hot-clube-capitolio.mjs), they collapse
// into ONE display listing carrying BOTH sources. This never merges
// either side's facts and never deduplicates the underlying
// Observations themselves — `listings` (raw, one entry per Observation)
// is preserved unchanged alongside the new `display_listings`.

import { projectObservationsToMapMarkers } from "./projection.mjs";
import { compareObservationFacts } from "../association/compare-facts.mjs";

function listingIdentity(listing) {
  return `${listing.source_id}:${listing.source_record_id}`;
}

/**
 *   observations           - full Observation[], every source
 *   options.venues/.sourceRegistry - same as projectObservationsToMapMarkers
 *   options.associations    - result of associateHotClubeCapitolio(...)
 *                              (or [] if none apply)
 *
 * Returns markers shaped exactly like projectObservationsToMapMarkers's
 * output (including the unchanged `listings` array), plus one additional
 * field: `display_listings`. Each entry is either
 *   { kind: "SINGLE", ...the same shape as one raw listing }
 * or, for an ASSOCIATED pair
 *   { kind: "GROUP", display_title, start, end,
 *     sources: [{source_id, source_record_id, source_name, title, event_url}, ...],
 *     fact_comparison }
 * A display listing never carries a canonical Event field of any kind.
 */
export function projectObservationsToDisplayMarkers(
  observations,
  { venues, sourceRegistry, associations = [] } = {},
) {
  const markers = projectObservationsToMapMarkers(observations, { venues, sourceRegistry });

  const groupIndexByIdentity = new Map();
  const associatedGroups = [];
  for (const assoc of associations) {
    if (assoc.association_status !== "ASSOCIATED") continue;
    const groupIndex = associatedGroups.length;
    associatedGroups.push(assoc);
    groupIndexByIdentity.set(`${assoc.hot_clube.source_id}:${assoc.hot_clube.source_record_id}`, groupIndex);
    groupIndexByIdentity.set(`${assoc.capitolio.source_id}:${assoc.capitolio.source_record_id}`, groupIndex);
  }

  return markers.map((marker) => {
    const displayListings = [];
    const emittedGroups = new Set();

    for (const listing of marker.listings) {
      const groupIndex = groupIndexByIdentity.get(listingIdentity(listing));

      if (groupIndex === undefined) {
        displayListings.push({ kind: "SINGLE", ...listing });
        continue;
      }
      if (emittedGroups.has(groupIndex)) continue; // the pair's other side already emitted this group
      emittedGroups.add(groupIndex);

      const assoc = associatedGroups[groupIndex];
      const hcListing = marker.listings.find(
        (l) => l.source_id === assoc.hot_clube.source_id && l.source_record_id === assoc.hot_clube.source_record_id,
      );
      const capListing = marker.listings.find(
        (l) => l.source_id === assoc.capitolio.source_id && l.source_record_id === assoc.capitolio.source_record_id,
      );

      displayListings.push({
        kind: "GROUP",
        // Display-only heading choice, not a resolved canonical fact:
        // Capitólio's own title omits the series-wide "– Há Jazz no
        // Parque Mayer" suffix that Hot Clube's title repeats (the venue
        // context already conveys the series). Both sources' own titles
        // remain fully available below, in `sources[].title` and in
        // `fact_comparison.title` — neither is discarded or overwritten.
        display_title: assoc.capitolio.title ?? assoc.hot_clube.title ?? null,
        start: assoc.hot_clube.start,
        end: assoc.hot_clube.end,
        sources: [hcListing, capListing].filter(Boolean).map((l) => ({
          source_id: l.source_id,
          source_record_id: l.source_record_id,
          source_name: l.source_name,
          title: l.title,
          event_url: l.event_url,
        })),
        fact_comparison: compareObservationFacts(assoc.hot_clube, assoc.capitolio),
      });
    }

    return { ...marker, display_listings: displayListings };
  });
}
