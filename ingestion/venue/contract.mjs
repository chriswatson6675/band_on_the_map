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

export const LOCATION_STATUSES = new Set(["CONFIRMED", "ADDRESS_ONLY", "UNRESOLVED"]);

/**
 *   CONFIRMED     - address AND coordinates are both evidenced
 *   ADDRESS_ONLY  - a trustworthy address is evidenced, but no
 *                    first-party coordinate evidence was found; this is
 *                    the honest, expected outcome when this project's
 *                    "no bulk third-party geocoding, no guessing" rule
 *                    means a real, correctly-addressed venue still has no
 *                    coordinates yet
 *   UNRESOLVED    - neither an address nor coordinates could be
 *                    confidently evidenced; must never carry either
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
  };

  const errors = validateVenue(venue);
  if (errors.length > 0) {
    throw new Error(`Invalid Venue: ${errors.join("; ")}`);
  }
  return venue;
}

/**
 * Return an array of validation error strings (empty if valid). Enforces
 * the fail-closed rules this whole module exists for:
 *   - latitude/longitude are either both present or both null, never one
 *     without the other;
 *   - present coordinates must be real, in-range numeric latitude
 *     (-90..90) / longitude (-180..180) values;
 *   - an UNRESOLVED venue must never carry coordinates;
 *   - a CONFIRMED venue must carry coordinates (an evidenced address with
 *     no coordinate evidence is ADDRESS_ONLY, not CONFIRMED);
 *   - any venue that does carry coordinates must cite at least one
 *     evidence entry backing them.
 */
export function validateVenue(venue) {
  const errors = [];

  if (!venue?.venue_id) errors.push("venue_id is required");
  if (!venue?.canonical_name) errors.push("canonical_name is required");
  if (!venue?.location_status || !LOCATION_STATUSES.has(venue.location_status)) {
    errors.push(`location_status must be one of ${[...LOCATION_STATUSES].join(", ")}`);
  }

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
  }

  if (venue?.location_status === "UNRESOLVED" && hasLat) {
    errors.push("an UNRESOLVED venue must not carry coordinates");
  }

  if (venue?.location_status === "CONFIRMED" && !hasLat) {
    errors.push(
      "a CONFIRMED venue must carry coordinates (use ADDRESS_ONLY if only the address is evidenced)",
    );
  }

  if (hasLat && (!Array.isArray(venue.evidence) || venue.evidence.length === 0)) {
    errors.push("coordinates must be backed by at least one evidence entry");
  }

  return errors;
}
