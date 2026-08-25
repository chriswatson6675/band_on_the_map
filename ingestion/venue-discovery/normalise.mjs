// VENUE-DISCOVERY-ENGINE-01 — normalisation utilities shared by every
// discovery source adapter and by dedupe.mjs.
//
// Deliberately small and mechanical — never fuzzy, never guesses a
// missing value. Matches this repository's existing slugification
// pattern (ingestion/venue/contract.mjs, ingestion/venue-onboarding/
// candidates.mjs) rather than importing it, per this codebase's existing
// precedent of a small duplicated slug() per module.

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
 * Normalise a venue display name for MATCHING purposes only (dedupe,
 * "known venue" sanity-check lookups) — never used as the candidate's
 * displayed `name`, which always keeps the original source string
 * verbatim.
 */
export function normaliseName(name) {
  if (typeof name !== "string" || name.trim() === "") return null;
  return slug(name);
}

/**
 * Normalise a free-text address for exact-match comparison only
 * (dedupe.mjs's "same address" evidence type) — lowercases, strips
 * diacritics/punctuation, and collapses whitespace. Never a geocoder,
 * never partial/fuzzy: two addresses either normalise to the same
 * string or they don't.
 */
export function normaliseAddress(address) {
  if (typeof address !== "string" || address.trim() === "") return null;
  return String(address)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.,ºª'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise a website URL to a bare registrable-ish domain: lowercase
 * host, protocol/path/query/fragment stripped, leading "www." stripped,
 * trailing dot stripped. Returns null for anything that doesn't parse as
 * a URL with a host — never guessed/repaired.
 */
export function normaliseDomain(url) {
  if (typeof url !== "string" || url.trim() === "") return null;
  let candidate = url.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (!parsed.hostname) return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/**
 * Great-circle distance in meters between two lat/lon points (haversine
 * formula) — used only by dedupe.mjs's proximity checks, never by any
 * geocoding/coordinate-resolution code (see ingestion/geocoding/, which
 * this module does not touch).
 */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}
