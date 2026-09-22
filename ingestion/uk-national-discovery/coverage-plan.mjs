// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — a
// deterministic geographic partition of the whole United Kingdom into
// bounded coverage units, so a national discovery sweep has a real,
// checkable "every part of the UK maps to a coverage unit" property
// rather than an ad hoc list of named cities (this repository's existing
// city-list approach — ingestion/future-city-wave/wave-config.mjs — by
// construction only ever covers the towns someone thought to name).
//
// Partition strategy: a fixed-size longitude/latitude grid over the UK's
// own bounding box (matching components/DiscoveryMap.tsx's own
// COUNTRY_MAP_VIEWS["United Kingdom"] bounds exactly, so "the whole UK
// map view" and "the whole discovery estate" are the same claim). Grid
// cells are simple arithmetic — no administrative-boundary lookup/service
// dependency — so this plan is 100% reproducible offline and never
// silently drops a region because a boundary dataset was unavailable.
// Every cell size is a simple compromise: fine enough that a single
// Overpass query per cell stays well within response-size/timeout limits
// even over dense conurbations, coarse enough that the whole country is a
// few hundred queries, not thousands.
//
// Pure module — no network, no filesystem. Nation attribution is a
// deliberately approximate, DOCUMENTED heuristic (nearest real UK borders
// are not straight lines) used only for reporting/prioritisation, never
// for venue identity or admission decisions — a discovered venue's own
// coordinates (not its coverage unit's nominal nation) are what a
// consumer should trust.

export const UK_BBOX = Object.freeze({ south: 49.85, west: -8.65, north: 60.9, east: 1.85 });

export const DEFAULT_CELL_WIDTH_DEG = 1.0;
export const DEFAULT_CELL_HEIGHT_DEG = 0.6;

/**
 * Approximate nation for one point, from its own coordinates — never from
 * a coverage unit's cell membership (a cell can straddle a real border).
 * Deliberately conservative straight-line/bbox approximations:
 *   - Northern Ireland: its own separate landmass, entirely west of -5.3.
 *   - Scotland: north of the England/Scotland border's northernmost real
 *     latitude extent (55.3 keeps Berwick-upon-Tweed/Carlisle in England).
 *   - Wales: west of -2.65 within Wales's own latitude band (51.3-53.45),
 *     which also correctly excludes Cornwall/Devon further south and
 *     Cumbria/Scotland further north/east.
 *   - Everything else: England.
 * This is a REPORTING heuristic only (coverage-plan prioritisation, the
 * FINAL REPORT's by-nation counts) — never used to gate admission, and
 * never written into a canonical Venue record as fact.
 */
export function approximateNation(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "UNKNOWN";
  if (longitude < -5.3 && latitude >= 54.0 && latitude <= 55.4) return "Northern Ireland";
  if (latitude > 55.3) return "Scotland";
  if (longitude < -2.65 && latitude >= 51.3 && latitude <= 53.45) return "Wales";
  return "England";
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Build the full, deterministic coverage-unit list. Same inputs always
 * produce the same `coverage_unit_id`s in the same order — a resumable
 * campaign's checkpoint files are keyed by this id, so stability matters
 * as much as coverage.
 */
export function buildCoverageUnits({
  bbox = UK_BBOX,
  cellWidthDeg = DEFAULT_CELL_WIDTH_DEG,
  cellHeightDeg = DEFAULT_CELL_HEIGHT_DEG,
} = {}) {
  const columns = Math.ceil((bbox.east - bbox.west) / cellWidthDeg);
  const rows = Math.ceil((bbox.north - bbox.south) / cellHeightDeg);

  const units = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const south = round(bbox.south + row * cellHeightDeg);
      const north = round(Math.min(bbox.south + (row + 1) * cellHeightDeg, bbox.north));
      const west = round(bbox.west + col * cellWidthDeg);
      const east = round(Math.min(bbox.west + (col + 1) * cellWidthDeg, bbox.east));
      const centreLat = round((south + north) / 2);
      const centreLon = round((west + east) / 2);
      units.push({
        coverage_unit_id: `uk-grid-r${String(row).padStart(2, "0")}-c${String(col).padStart(2, "0")}`,
        nation_hint: approximateNation(centreLat, centreLon),
        bounds: { south, west, north, east },
        centre: { lat: centreLat, lon: centreLon },
        status: "PENDING",
        attempt_count: 0,
        candidate_count: 0,
        started_at: null,
        completed_at: null,
        error: null,
      });
    }
  }
  return units;
}

/**
 * Every valid terminal or in-progress state a coverage unit can be in.
 * The controller (ingestion/uk-national-discovery/controller.mjs) never
 * writes a value outside this set — a checkpoint file with an unknown
 * status is a bug, not a new silent state.
 */
export const COVERAGE_UNIT_STATUSES = new Set(["PENDING", "RUNNING", "COMPLETE", "RETRYABLE_FAILURE", "PERMANENT_FAILURE"]);
