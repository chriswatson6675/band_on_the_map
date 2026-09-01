// Source-agnostic canonical Venue contract.
//
// A canonical Venue is a resolved, evidence-backed real-world place —
// distinct from an Observation's own venue_name/location_text, which
// remain unresolved, source-reported text (see docs/ARCHITECTURE.md:
// "Venue identity and coordinates are canonical rather than
// independently trusted from every source"). This module never invents
// an address or coordinates; every Venue's location_status honestly
// reflects exactly what was evidenced — see docs/VENUE_RESOLUTION.md.
//
// Dependency-free, matching the rest of this repository's ingestion code.

export const LOCATION_STATUSES = new Set(["CONFIRMED", "GEOCODED", "ADDRESS_ONLY", "UNRESOLVED"]);

// The two location_status values whose coordinates are trusted enough to
// place a marker on the map (see ingestion/map/projection.mjs). Kept here
// (not just inline in the projection module) so every consumer shares one
// definition of "map-eligible" rather than re-deriving it.
export const MAP_ELIGIBLE_LOCATION_STATUSES = new Set(["CONFIRMED", "GEOCODED"]);

// Every deterministic method by which a GEOCODED venue's coordinates may
// have been derived. GEOCODED_FROM_OFFICIAL_ADDRESS (VENUE-GEOCODING-01)
// is a Nominatim free-text/structured search against this venue's own
// already-evidenced official address. BEATMAPPED-LONDON-FIRST-TRANCHE-
// MAIN-REBASE-AND-MUSIC-GATE-01 adds OSM_ID_LOOKUP: a direct Nominatim
// /lookup of the exact OpenStreetMap node/way/relation this venue was
// originally discovered from (ingestion/geocoding/nominatim.mjs's
// lookupNominatimOsmIdLive()) — not a fuzzy address search at all, so it
// is honestly recorded under its own, differently-named method rather than
// mislabeled as an address query that never happened. Both are equally
// deterministic, evidence-backed, non-guessed coordinate derivations;
// GEOCODED never distinguishes further between them beyond this method
// name.
export const GEOCODED_PROVENANCE_METHODS = new Set(["GEOCODED_FROM_OFFICIAL_ADDRESS", "OSM_ID_LOOKUP"]);

/**
 *   CONFIRMED     - a non-empty address AND coordinates are both
 *                    evidenced DIRECTLY through the venue/official
 *                    authority itself (e.g. an official page's own linked
 *                    Google Maps place marker) — validateVenue() requires
 *                    both. Never used for a geocoder-derived coordinate.
 *   GEOCODED      - (VENUE-GEOCODING-01) a non-empty address AND
 *                    coordinates are both present, but the coordinates
 *                    were deterministically DERIVED by geocoding the
 *                    venue's own already independently evidenced official
 *                    address (see ingestion/geocoding/), not read
 *                    directly from a first-party source. Structurally
 *                    identical requirements to CONFIRMED (address +
 *                    coordinates + evidence), but permanently distinct in
 *                    meaning and provenance — a GEOCODED venue must carry
 *                    a `coordinate_provenance` object recording how, and
 *                    must never be silently relabeled CONFIRMED.
 *   ADDRESS_ONLY  - a trustworthy, non-empty address is evidenced, but no
 *                    first-party coordinate evidence was found — latitude
 *                    and longitude must be null; this is the honest,
 *                    expected outcome when this project's "no bulk
 *                    third-party geocoding, no guessing" rule means a
 *                    real, correctly-addressed venue still has no
 *                    coordinates yet (until/unless a later, explicit
 *                    geocoding task promotes it to GEOCODED)
 *   UNRESOLVED    - neither an address nor coordinates could be
 *                    confidently evidenced; address, latitude, and
 *                    longitude must all be null
 */

function slug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deterministic Band on the Map venue ID, derived only from
 * canonical_name and city — never a random or incrementing value. The
 * same two inputs always produce the same ID, and different inputs
 * (almost always) produce a different one.
 */
export function createVenueId(canonicalName, city) {
  return `venue-${slug(city)}-${slug(canonicalName)}`;
}

/**
 * Build one canonical Venue. venue_id defaults to createVenueId() from
 * canonical_name/city when not explicitly supplied. Throws if the
 * resulting Venue fails validateVenue().
 */
export function createVenue(fields) {
  const venue = {
    venue_id: fields.venue_id ?? createVenueId(fields.canonical_name, fields.city),
    canonical_name: fields.canonical_name ?? null,
    country_code: fields.country_code ?? null,
    city: fields.city ?? null,
    municipality: fields.municipality ?? null,
    address: fields.address ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    location_status: fields.location_status ?? "UNRESOLVED",
    evidence: fields.evidence ?? [],
    // Only meaningful (and required) for GEOCODED — see validateVenue().
    // Left undefined-by-default for every other status so existing
    // CONFIRMED/ADDRESS_ONLY/UNRESOLVED venue objects are unaffected.
    ...(fields.coordinate_provenance !== undefined ? { coordinate_provenance: fields.coordinate_provenance } : {}),
  };

  const errors = validateVenue(venue);
  if (errors.length > 0) {
    throw new Error(`Invalid Venue: ${errors.join("; ")}`);
  }
  return venue;
}

/**
 * Return an array of validation error strings (empty if valid). Enforces
 * the fail-closed rules this whole module exists for — each
 * location_status has an exact, non-overlapping set of requirements, not
 * just a loose "coordinates imply CONFIRMED" heuristic:
 *
 *   - latitude/longitude are either both present or both null, never one
 *     without the other;
 *   - present coordinates must be real, in-range numeric latitude
 *     (-90..90) / longitude (-180..180) values, backed by at least one
 *     evidence entry;
 *   - CONFIRMED requires a non-empty address AND coordinates;
 *   - GEOCODED requires a non-empty address AND coordinates AND a
 *     coordinate_provenance object recording GEOCODED_FROM_OFFICIAL_ADDRESS
 *     — structurally like CONFIRMED, but never interchangeable with it;
 *   - a coordinate_provenance whose method is GEOCODED_FROM_OFFICIAL_ADDRESS
 *     may only appear on a GEOCODED venue, never a CONFIRMED one (coordinates
 *     directly evidenced through the venue/official authority itself must
 *     never be relabeled as geocoder-derived, or vice versa);
 *   - ADDRESS_ONLY requires a non-empty address AND forbids coordinates;
 *   - UNRESOLVED forbids both an address and coordinates.
 */
export function validateVenue(venue) {
  const errors = [];

  if (!venue?.venue_id) errors.push("venue_id is required");
  if (!venue?.canonical_name) errors.push("canonical_name is required");
  if (!venue?.location_status || !LOCATION_STATUSES.has(venue.location_status)) {
    errors.push(`location_status must be one of ${[...LOCATION_STATUSES].join(", ")}`);
  }

  const hasAddress = typeof venue?.address === "string" && venue.address.trim() !== "";
  const hasLat = venue?.latitude !== null && venue?.latitude !== undefined;
  const hasLng = venue?.longitude !== null && venue?.longitude !== undefined;

  if (hasLat !== hasLng) {
    errors.push("latitude and longitude must both be present or both be null");
  }

  if (hasLat) {
    if (typeof venue.latitude !== "number" || Number.isNaN(venue.latitude) || venue.latitude < -90 || venue.latitude > 90) {
      errors.push("latitude must be a number between -90 and 90");
    }
    if (typeof venue.longitude !== "number" || Number.isNaN(venue.longitude) || venue.longitude < -180 || venue.longitude > 180) {
      errors.push("longitude must be a number between -180 and 180");
    }
    if (!Array.isArray(venue.evidence) || venue.evidence.length === 0) {
      errors.push("coordinates must be backed by at least one evidence entry");
    }
  }

  const provenanceMethod =
    venue?.coordinate_provenance && typeof venue.coordinate_provenance === "object"
      ? venue.coordinate_provenance.method
      : undefined;

  if (venue?.location_status === "CONFIRMED") {
    if (!hasAddress) {
      errors.push("a CONFIRMED venue must carry a non-empty address");
    }
    if (!hasLat || !hasLng) {
      errors.push(
        "a CONFIRMED venue must carry coordinates (use ADDRESS_ONLY if only the address is evidenced)",
      );
    }
    if (GEOCODED_PROVENANCE_METHODS.has(provenanceMethod)) {
      errors.push(
        `a CONFIRMED venue must not carry a ${provenanceMethod} coordinate_provenance (use location_status GEOCODED instead — never relabel a geocoded coordinate as first-party CONFIRMED)`,
      );
    }
  } else if (venue?.location_status === "GEOCODED") {
    if (!hasAddress) {
      errors.push("a GEOCODED venue must carry a non-empty address");
    }
    if (!hasLat || !hasLng) {
      errors.push(
        "a GEOCODED venue must carry coordinates (from ingestion/geocoding/ — use ADDRESS_ONLY if geocoding has not yet succeeded)",
      );
    }
    if (!venue.coordinate_provenance || typeof venue.coordinate_provenance !== "object") {
      errors.push(
        "a GEOCODED venue must carry a coordinate_provenance object recording how its coordinates were derived",
      );
    } else if (!GEOCODED_PROVENANCE_METHODS.has(provenanceMethod)) {
      errors.push(
        `a GEOCODED venue's coordinate_provenance.method must be one of ${[...GEOCODED_PROVENANCE_METHODS].join(", ")}`,
      );
    }
  } else if (venue?.location_status === "ADDRESS_ONLY") {
    if (!hasAddress) {
      errors.push("an ADDRESS_ONLY venue must carry a non-empty address");
    }
    if (hasLat || hasLng) {
      errors.push(
        "an ADDRESS_ONLY venue must not carry coordinates (use CONFIRMED once first-party coordinates are " +
          "evidenced directly, or GEOCODED once coordinates are deterministically derived from this venue's " +
          "own official address — see ingestion/geocoding/)",
      );
    }
  } else if (venue?.location_status === "UNRESOLVED") {
    if (hasAddress) {
      errors.push("an UNRESOLVED venue must not carry an address");
    }
    if (hasLat || hasLng) {
      errors.push("an UNRESOLVED venue must not carry coordinates");
    }
  }

  return errors;
}
