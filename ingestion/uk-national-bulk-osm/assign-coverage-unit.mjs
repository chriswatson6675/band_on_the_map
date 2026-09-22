// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — assigns a
// bulk-OSM-derived candidate's own coordinate to exactly one of the 209
// coverage units ingestion/uk-national-discovery/coverage-plan.mjs already
// defines (the SAME grid package-01/02 used for their live Overpass sweep
// — never a second, competing partition). Pure module — no network, no
// filesystem.

/**
 * Which coverage unit's bounds contain (lat, lon), or null if the point
 * falls outside every unit (e.g. a candidate right on/past the UK_BBOX
 * edge, or a bad/missing coordinate). Bounds are treated as inclusive on
 * both edges (a point exactly on a shared border between two adjacent
 * cells matches the first one encountered, in buildCoverageUnits()'s own
 * row-major order) — a linear scan over 209 units per candidate is fast
 * enough at this scale to need no spatial index.
 */
export function assignCoverageUnit(units, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  for (const unit of units) {
    const { south, west, north, east } = unit.bounds;
    if (latitude >= south && latitude <= north && longitude >= west && longitude <= east) return unit;
  }
  return null;
}
