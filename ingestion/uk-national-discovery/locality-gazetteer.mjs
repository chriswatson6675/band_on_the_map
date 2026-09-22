// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — a
// self-sufficient locality gazetteer built entirely from data this
// campaign already retrieves, used only to assign a `city` value to an
// OSM candidate whose own element carries no addr:city/addr:town/
// addr:suburb tag (a real, common gap — roughly 2 in 5 of a typical
// dense-area sweep). This is never a network call (no reverse-geocoding
// service, no extra Nominatim load at national candidate volume) and
// never a guess about the VENUE's own identity — only an honest
// "nearest known named locality" approximation for the city FIELD, used
// for venue_id derivation and display grouping. A candidate's own
// coordinates (already OSM-evidenced) remain exactly as discovered
// regardless of which locality name it's grouped under.
//
// Pure module — no network, no filesystem.

function distanceSquared(lat1, lon1, lat2, lon2) {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return dLat * dLat + dLon * dLon;
}

/**
 * Build a gazetteer (Map of normalised-city-name -> {name, lat, lon}, one
 * entry per distinct named locality, using the FIRST coordinate seen for
 * each name — deterministic given a fixed candidate order) from every
 * candidate that already carries a real addr:city/addr:town/addr:suburb
 * tag, plus every already-known canonical UK venue passed in as
 * `seedLocalities` (e.g. venues/uk.json + venues/london.json's own
 * {city, latitude, longitude} triples) — so sparser discovery runs still
 * benefit from this repository's own already-established place names.
 */
export function buildLocalityGazetteer(candidatesWithLocality, seedLocalities = []) {
  const gazetteer = new Map();
  const add = (name, lat, lon) => {
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const key = name.trim().toLowerCase();
    if (key === "" || gazetteer.has(key)) return;
    gazetteer.set(key, { name: name.trim(), lat, lon });
  };
  for (const seed of seedLocalities) add(seed.city, seed.latitude, seed.longitude);
  for (const entry of candidatesWithLocality) add(entry.city, entry.latitude, entry.longitude);
  return gazetteer;
}

/**
 * The nearest gazetteer entry's own name to (latitude, longitude), or
 * null if the gazetteer is empty. Plain squared-Euclidean distance on
 * lat/lon degrees — adequate at UK scale for "which named place is this
 * closest to" (never used for a distance measurement claim, only for
 * ranking).
 */
export function nearestLocality(gazetteer, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || gazetteer.size === 0) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const entry of gazetteer.values()) {
    const distance = distanceSquared(latitude, longitude, entry.lat, entry.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.name;
    }
  }
  return best;
}

/**
 * Extract {city, latitude, longitude} tag-derived locality info from one
 * raw OSM tags object, or null if none of addr:city/addr:town/
 * addr:suburb is present. `latitude`/`longitude` are the CANDIDATE's own
 * coordinates (passed in, since the tags object alone has none) — this
 * function only decides the NAME.
 */
export function localityFromTags(tags, latitude, longitude) {
  const name = tags?.["addr:city"] || tags?.["addr:town"] || tags?.["addr:suburb"] || null;
  if (!name) return null;
  return { city: name, latitude, longitude };
}
