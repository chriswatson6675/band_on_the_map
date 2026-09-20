// BEATMAPPED-UK-MAJOR-EVENT-VENUE-ATTRIBUTION-01 — Phases 3/4.
//
// Builds a generic venue match index from the FROZEN census. It is built
// entirely from governed census evidence — canonical names, retained
// aliases, city, nation, address, postcode, coordinates, operator and
// parent/sub-venue relations.
//
// There are deliberately NO hand-maintained mappings in this module: no
// Jockey Club table, no racecourse list, no operator special-case. The
// index must work identically for a stadium, an arena, a theatre, a
// conference centre, an exhibition hall, a showground and a racecourse.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CENSUS_VENUES = resolve(ROOT, "research/major-event-venues/uk-major-event-census-01/venues.json");

/**
 * Conservative name normalisation: case, diacritics, punctuation and
 * whitespace only.
 *
 * It deliberately does NOT strip venue-type words such as "stadium",
 * "arena", "hall", "park" or "theatre". Removing them collapses genuinely
 * different venues onto one identity — the census contains "Meadow Park"
 * in three separate towns and a "St James Park" in both Exeter and
 * Newcastle. Suffix tolerance is handled separately and explicitly, where
 * it can be checked against geography.
 */
export function normaliseName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Generic venue-type words a source may omit from an otherwise identical
 * name ("Kempton Park" for "Kempton Park Racecourse"). Used ONLY to allow
 * a suffix-tolerant candidate, which must then still survive the same
 * geography and uniqueness checks as any other candidate.
 */
export const VENUE_TYPE_SUFFIXES = [
  // Longest first: a source may carry a multi-word qualifier the census
  // does not ("Mallory Park RACING CIRCUIT" for "Mallory Park Circuit").
  "exhibition centre", "conference centre", "convention centre",
  "events centre", "event centre", "racing circuit", "motor racing circuit",
  "race course", "show ground", "sports ground", "football stadium",
  "racecourses", "racecourse", "showground", "stadium", "arena",
  "grounds", "ground", "theatre", "theater", "circuit", "raceway",
  "complex", "centre", "center", "park", "hall",
].sort((a, b) => b.length - a.length);

/** Strip ONE trailing generic venue-type qualifier, if present. */
export function stripVenueTypeSuffix(normalisedName) {
  for (const suffix of VENUE_TYPE_SUFFIXES) {
    if (normalisedName.endsWith(` ${suffix}`)) {
      const core = normalisedName.slice(0, -(suffix.length + 1)).trim();
      if (core.length >= 4) return core;
    }
  }
  return null;
}

/** UK postcode, normalised to a comparable form (outward+inward, no space). */
export function normalisePostcode(value) {
  const compact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact) ? compact : null;
}

/** The outward code only (district), for a weaker geographic signal. */
export function postcodeDistrict(value) {
  const full = normalisePostcode(value);
  return full ? full.slice(0, full.length - 3) : null;
}

/**
 * Every name this venue is governed to be known by — its canonical name
 * plus its RETAINED aliases. An alias is never inferred from string
 * similarity; it exists only because a researcher recorded it.
 */
export function governedNames(venue) {
  return [venue.canonical_name, ...(venue.alternative_names ?? [])]
    .filter((name) => typeof name === "string" && name.trim() !== "");
}

/**
 * Build the match index. Names map to ARRAYS of venues, never to a single
 * venue: 23 normalised names in this census are claimed by more than one
 * venue, and silently keeping the first would invent certainty.
 */
export async function buildCensusIndex({ venuesPath } = {}) {
  const doc = JSON.parse(await readFile(venuesPath ?? CENSUS_VENUES, "utf8"));
  return indexVenues(doc.venues);
}

export function indexVenues(venues) {
  const byId = new Map();
  const byName = new Map();
  const bySuffixTrimmedName = new Map();
  const byNameWithCity = new Map();
  const byPostcode = new Map();
  const byCity = new Map();

  const push = (map, key, venue) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), venue]);
  };

  for (const venue of venues) {
    byId.set(venue.venue_census_id, venue);

    for (const name of governedNames(venue)) {
      const normalised = normaliseName(name);
      push(byName, normalised, venue);

      // Also index the name with a trailing generic venue-type word
      // removed, so a source saying "Kempton Park" can reach "Kempton Park
      // Racecourse". This is an additional, weaker index — it never
      // bypasses the geography or uniqueness checks.
      const core = stripVenueTypeSuffix(normalised);
      if (core) push(bySuffixTrimmedName, core, venue);

      // A source commonly qualifies a venue by its city ("AO Arena
      // Manchester" for "AO Arena" in Manchester). Indexed explicitly so
      // that qualification resolves instead of failing, and still subject
      // to the same geography and uniqueness checks.
      const city = normaliseName(venue.city);
      if (city && city.length >= 4) {
        push(byNameWithCity, `${normalised} ${city}`, venue);
        if (core) push(byNameWithCity, `${core} ${city}`, venue);
      }
    }

    push(byPostcode, normalisePostcode(venue.postcode), venue);
    push(byCity, normaliseName(venue.city), venue);
  }

  return {
    venues,
    byId,
    byName,
    bySuffixTrimmedName,
    byNameWithCity,
    byPostcode,
    byCity,
    counts: {
      venues: venues.length,
      distinct_names: byName.size,
      names_claimed_by_multiple_venues: [...byName.values()].filter((list) => new Set(list.map((v) => v.venue_census_id)).size > 1).length,
      with_postcode: [...byPostcode.values()].reduce((total, list) => total + list.length, 0),
    },
  };
}

/**
 * Is this venue a separately-represented SUB-VENUE of another census
 * venue? The census protects parent/sub-venue pairs, so attribution must
 * not collapse a named hall into its parent complex.
 */
export function isSubVenueOf(candidate, parentVenue) {
  if (!candidate?.parent_complex || !parentVenue) return false;
  return normaliseName(candidate.parent_complex) === normaliseName(parentVenue.canonical_name);
}
