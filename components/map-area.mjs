// BEATMAPPED-ALL-CITIES-DEFAULT-MAP-01 — frontend-only area selection.
// The publication artifact remains country-bucketed; "All cities" simply
// presents the four currently populated buckets together before the existing
// genre -> artist -> date filter pipeline runs in app/page.tsx.

import { getMarkersForCountry } from "../ingestion/map/projection.mjs";

export const ALL_CITIES_AREA = "All cities";

export function getMarkersForArea(
  area,
  portugalMarkers,
  spainMarkers = [],
  germanyMarkers = [],
  franceMarkers = [],
) {
  if (area === ALL_CITIES_AREA) {
    return [
      ...(portugalMarkers ?? []),
      ...(spainMarkers ?? []),
      ...(germanyMarkers ?? []),
      ...(franceMarkers ?? []),
    ];
  }

  return getMarkersForCountry(
    area,
    portugalMarkers,
    spainMarkers,
    germanyMarkers,
    franceMarkers,
  );
}
