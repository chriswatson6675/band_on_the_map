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

// BEATMAPPED-UK-VENUE-CANONICAL-INTEGRITY-04 — the England/Wales and
// England/Scotland borders, approximated closely enough that no real
// venue in venues/uk.json lands in the wrong nation.
//
// The previous approximation was a single axis-aligned box per nation
// ("west of -2.65 and between 51.3 and 53.45 is Wales"; "north of 55.3 is
// Scotland"). Both borders run diagonally and both meet the sea at an
// ESTUARY, where the two nations face each other across the water and
// neither latitude nor longitude alone separates them. A box therefore
// cannot express either border, and the old one misclassified 116 of the
// 3,537 canonical UK venues — Liverpool, Birkenhead and the whole Wirral
// as Wales (they sit east of the Dee), Bristol/Weston-super-Mare as Wales
// (they sit south of the Severn), Dumfries & Galloway as England (it sits
// south of 55.3), and Berwick-upon-Tweed as Scotland (it sits north of
// 55.3, which the old comment explicitly claimed to prevent).
//
// The replacement is still a straight-line approximation with no boundary
// dataset or network dependency — just a piecewise one, plus an explicit
// carve-out at each estuary and at the Berwick salient. Every constant is
// checked against real postcode-arbitrated venue coordinates by
// tests/uk-venue-canonical-integrity-04.test.mjs, which pins the known
// reference points AND asserts the rule agrees with the postcode area of
// every arbitrable venue in the registry.

/** Eastern limit of Wales, per latitude band: [southLat, northLat, maxLongitude]. */
const WALES_EASTERN_LIMIT = Object.freeze([
  Object.freeze([51.52, 52.0, -2.64]), // Monmouthshire: Chepstow/Monmouth are Welsh, Bristol is not
  Object.freeze([52.0, 52.6, -2.85]), // Herefordshire border: Hay-on-Wye Welsh, Hereford/Ludlow not
  Object.freeze([52.6, 52.8, -2.95]), // Shropshire border: Welshpool Welsh, Shrewsbury not
  Object.freeze([52.8, 53.0, -3.07]), // Oswestry salient: Weston Rhyn is English despite being far west
  Object.freeze([53.0, 53.3, -2.95]), // Wrexham/Flintshire: Wrexham Welsh, Chester not
]);

/**
 * True when a point lies in Wales. Latitude band 51.28-53.46 is Wales's
 * own extent; within it the eastern limit varies by latitude, except at
 * the two estuaries where the nations face each other across water:
 *   - Severn/Bristol Channel (south of 51.52): the Somerset and Avon
 *     coast runs WEST of Cardiff's longitude, so longitude alone would
 *     call Weston-super-Mare Welsh. Wales here means west of -3.05.
 *   - Dee estuary (north of 53.30): the Wirral and Merseyside sit east of
 *     the Flintshire coast, so Wales here means west of -3.30 — which
 *     keeps Rhyl and Prestatyn Welsh while Birkenhead and Liverpool are
 *     English.
 */
function isWales(latitude, longitude) {
  if (latitude < 51.28 || latitude > 53.46) return false;
  if (latitude < 51.52) return longitude <= -3.05;
  if (latitude >= 53.3) return longitude <= -3.3;
  const band = WALES_EASTERN_LIMIT.find(([south, north]) => latitude >= south && latitude < north);
  return band ? longitude < band[2] : false;
}

/**
 * True when a point lies in Scotland. The border runs diagonally from the
 * Solway Firth in the west up to the Tweed in the east, so it is a line in
 * (longitude, latitude), not a latitude threshold: a single threshold puts
 * either Dumfries in England or Berwick-upon-Tweed in Scotland, and the old
 * one did both. The line is anchored at the Solway (-3.25, 54.99) with the
 * slope that carries it to the Tweed.
 *
 * Berwick-upon-Tweed is then an explicit exception: it is an English town
 * NORTH of the border's eastern end, on the coast. No Scottish venue lies
 * east of -2.10 below 55.82 (Eyemouth, the nearest, is at 55.87).
 */
function isScotland(latitude, longitude) {
  if (longitude > -2.1 && latitude < 55.82) return false;
  return latitude > 54.99 + (longitude + 3.25) * 0.37;
}

/**
 * Approximate nation for one point, from its own coordinates — never from
 * a coverage unit's cell membership (a cell can straddle a real border).
 *   - Northern Ireland: its own separate landmass, entirely west of -5.3.
 *   - Scotland / Wales: see isScotland()/isWales() above.
 *   - Everything else: England.
 * This is a REPORTING heuristic only (coverage-plan prioritisation, the
 * FINAL REPORT's by-nation counts) — never used to gate admission, and
 * never written into a canonical Venue record as fact. A venue whose
 * nation actually matters should be resolved from its own postcode or
 * address evidence, not from this function.
 */
export function approximateNation(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "UNKNOWN";
  if (longitude < -5.3 && latitude >= 54.0 && latitude <= 55.4) return "Northern Ireland";
  if (isScotland(latitude, longitude)) return "Scotland";
  if (isWales(latitude, longitude)) return "Wales";
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
 *
 * RETRYABLE_PROVIDER_FAILURE (added by
 * BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02, see
 * ingestion/uk-national-bulk-osm/reclassify-provider-outage.mjs) is
 * distinct from RETRYABLE_FAILURE: RETRYABLE_FAILURE is an in-run state a
 * unit passes through before its own retries are exhausted;
 * RETRYABLE_PROVIDER_FAILURE is a corrected TERMINAL-in-that-run state
 * applied after the fact, for a unit whose PERMANENT_FAILURE was later
 * determined to reflect a transient provider outage rather than a
 * genuine per-unit failure — never written by controller.mjs's own
 * per-unit retry loop.
 */
export const COVERAGE_UNIT_STATUSES = new Set([
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "RETRYABLE_FAILURE",
  "PERMANENT_FAILURE",
  "RETRYABLE_PROVIDER_FAILURE",
]);
