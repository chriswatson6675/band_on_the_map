// VENUE-DISCOVERY-ENGINE-01 — generic Overpass QL query construction.
//
// Builds a geographic (centre + radius) live-music-venue-lead query for
// ANY Area config — nothing here is Barcelona-specific, and radius_km is
// always read from the Area, never hardcoded (see PHASE 1's "25km for
// the first proof, but do NOT hardcode 25km into the generic engine").
//
// The tag selection deliberately does NOT pull every amenity=bar,
// amenity=pub, amenity=nightclub, or amenity=theatre in the radius —
// that would return thousands of ordinary bars/restaurants/cinemas with
// zero music evidence (see PHASE 2A's "Do NOT blindly classify every
// bar/nightclub/theatre as a live-music venue"). Instead it fetches:
//   - elements with an explicit music-venue-shaped amenity/leisure tag
//     (amenity=music_venue, leisure=music_venue, amenity=concert_hall,
//     amenity=events_venue);
//   - EVERY element carrying a `live_music` key at all, any amenity
//     (bar/pub/restaurant/nightclub/etc — the tag itself is the useful
//     discovery signal, not the coarser amenity value);
//   - amenity=nightclub (evaluated by tag-rules.mjs as WEAK on its own,
//     MEDIUM if it also has live_music=yes — see PRODUCT INTENT's "clubs
///    that regularly host concerts");
//   - amenity=theatre (music evidence, e.g. theatre:type=concert_hall,
//     is evaluated by tag-rules.mjs, not assumed);
//   - amenity=arts_centre / community_centre / social_centre (candidate
//     cultural centres — PRODUCT INTENT's "cultural centres with
//     recurring live music"; evaluated by tag-rules.mjs, not assumed).
//
// Dependency-free.

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// One selector per (key, value) or (key alone) lead worth fetching.
// Exported so tests and tag-rules.mjs can assert the two stay in sync.
export const OVERPASS_LEAD_SELECTORS = Object.freeze([
  { key: "amenity", value: "music_venue" },
  { key: "leisure", value: "music_venue" },
  { key: "amenity", value: "concert_hall" },
  { key: "amenity", value: "events_venue" },
  { key: "amenity", value: "nightclub" },
  { key: "amenity", value: "theatre" },
  { key: "amenity", value: "arts_centre" },
  { key: "amenity", value: "community_centre" },
  { key: "amenity", value: "social_centre" },
  { key: "live_music", value: null }, // key-existence filter, any value, any amenity
]);

/**
 * Build the exact Overpass QL query string for one Area's centre +
 * radius_km. `timeoutS` bounds the server-side query timeout (Overpass
 * API's own `[timeout:N]` setting), not a client HTTP timeout (see
 * client.mjs for that). `out center` ensures ways/relations (not just
 * nodes) always carry a usable coordinate.
 */
export function buildOverpassQuery(area, { timeoutS = 60 } = {}) {
  if (!area?.centre || !isFiniteNumber(area.centre.latitude) || !isFiniteNumber(area.centre.longitude)) {
    throw new Error("buildOverpassQuery requires area.centre.{latitude,longitude}");
  }
  if (!isFiniteNumber(area.radius_km) || area.radius_km <= 0) {
    throw new Error("buildOverpassQuery requires a positive area.radius_km");
  }

  const radiusM = Math.round(area.radius_km * 1000);
  const { latitude, longitude } = area.centre;
  const around = `(around:${radiusM},${latitude},${longitude})`;

  const clauses = OVERPASS_LEAD_SELECTORS.flatMap(({ key, value }) => {
    const filter = value === null ? `["${key}"]` : `["${key}"="${value}"]`;
    return [`node${filter}${around};`, `way${filter}${around};`, `relation${filter}${around};`];
  });

  return [`[out:json][timeout:${timeoutS}];`, "(", ...clauses.map((c) => `  ${c}`), ");", "out center tags;"].join(
    "\n",
  );
}
