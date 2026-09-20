// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — resolves one Wave-1
// city's centre point, reusing (never duplicating) this repository's own
// existing Nominatim adapter (ingestion/geocoding/nominatim.mjs), which
// already owns rate-limiting/single-threaded-request policy compliance.
// Deliberately thin: this module makes no acquisition decisions.

import { searchNominatimLive } from "../geocoding/nominatim.mjs";

/**
 * Resolve a Wave-1 city's centre {lat, lon}. Returns null (never throws
 * for an ordinary "not found"/transient failure) so one city's geocoding
 * failure can be recorded as a defer, not a crash — the caller decides
 * what a null result means.
 */
export async function geocodeCity(city, { search = searchNominatimLive } = {}) {
  const result = await search(city.name, { countrycodes: city.nominatim_countrycodes, limit: 1 });
  const top = result?.candidates?.[0];
  if (!result?.ok || !top) return null;
  const lat = Number(top.lat);
  const lon = Number(top.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, display_name: top.display_name ?? null, osm_type: top.osm_type ?? null, osm_id: top.osm_id ?? null };
}
