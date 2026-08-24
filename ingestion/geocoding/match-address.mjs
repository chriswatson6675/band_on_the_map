// Deterministic, fail-closed acceptance rules for VENUE-GEOCODING-01.
//
// Given one canonical Venue's already-evidenced official address
// (venues/lisbon.json / venues/porto.json — never Observation text, never
// a venue name alone) and the candidate list a geocoding provider
// returned for it, decide whether ONE candidate may be automatically
// accepted. A candidate is accepted only when every check below passes;
// anything else — including genuine ambiguity between multiple plausible
// candidates — leaves the Venue ADDRESS_ONLY. There is no manual
// override in this package: an ambiguous or failed match is reported,
// not guessed.
//
// Provider-agnostic in shape (it reads the normalised
// `{ lat, lon, address: { ... }, class, type, addresstype, osm_type,
// osm_id, display_name }` fields Nominatim's jsonv2 format already uses),
// but this module makes no live network calls itself — see
// ingestion/geocoding/nominatim.mjs for the one adapter that does.

const REJECTED_PLACE_TYPES = new Set([
  "administrative",
  "city",
  "town",
  "village",
  "suburb",
  "county",
  "region",
  "state",
  "country",
  "postcode",
  "municipality",
  "residential",
  "neighbourhood",
  "quarter",
  "borough",
  "hamlet",
  "state_district",
  "island",
  "road", // a road/street/square address-level type — not a building/site
  "pedestrian",
]);

// category=highway (a road, with no specific address point) and
// category=boundary (an administrative area) are never specific enough
// to be a venue/building/amenity/site/address-level location. Nominatim's
// `jsonv2` response format (this package's only format — see
// ingestion/geocoding/nominatim.mjs) names this field `category`, not the
// legacy `class`; both are checked below so a differently-shaped future
// provider adapter still works without changing this module.
const REJECTED_CLASSES = new Set(["boundary", "highway"]);

function normaliseText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  return trimmed === "" ? null : trimmed;
}

function normalisePostcode(value) {
  if (typeof value !== "string") return null;
  const stripped = value.replace(/\s+/g, "").toUpperCase();
  return stripped === "" ? null : stripped;
}

function normaliseHouseNumber(value) {
  if (typeof value !== "string") return null;
  const stripped = value.replace(/\s+/g, "").toUpperCase();
  return stripped === "" ? null : stripped;
}

/**
 * Extract a Portuguese postal code ("NNNN-NNN") from a canonical address
 * string, or null if none is present. Deterministic substring match, not
 * a fuzzy parse.
 */
export function extractPostcode(address) {
  if (typeof address !== "string") return null;
  const match = /\b\d{4}-\d{3}\b/.exec(address);
  return match ? match[0] : null;
}

/**
 * Extract a plausible house/building number token from a canonical
 * address string (the first standalone digit-led token — e.g. "52",
 * "604-610", "3D" — remaining once the postcode substring is removed), or
 * null if the address genuinely has none (e.g. a square/largo with no
 * street number). Deliberately simple: this project's five bounded
 * target addresses are all handled correctly by this rule; it is not a
 * general-purpose address parser.
 */
export function extractHouseNumber(address) {
  if (typeof address !== "string") return null;
  const postcode = extractPostcode(address);
  const withoutPostcode = postcode ? address.replace(postcode, " ") : address;
  const match = /\b(\d+(?:-\d+)?[A-Za-z]?)\b/.exec(withoutPostcode);
  return match ? match[1] : null;
}

function isSpecificEnoughResult(candidate) {
  const type = normaliseText(candidate?.type);
  // Nominatim jsonv2 (this project's only format) calls this field
  // `category`; `class` is accepted too for a differently-shaped provider.
  const klass = normaliseText(candidate?.category ?? candidate?.class);
  const addresstype = normaliseText(candidate?.addresstype);
  if (klass && REJECTED_CLASSES.has(klass)) return false;
  if (type && REJECTED_PLACE_TYPES.has(type)) return false;
  if (addresstype && REJECTED_PLACE_TYPES.has(addresstype)) return false;
  return true;
}

function cityMatches(candidate, expectedCityOrMunicipality) {
  const expected = normaliseText(expectedCityOrMunicipality);
  if (!expected) return false;
  const addr = candidate?.address ?? {};
  const observedValues = [addr.city, addr.town, addr.municipality, addr.village, addr.county]
    .map(normaliseText)
    .filter(Boolean);
  // Lisboa/Lisbon are the same real municipality under two names.
  const acceptable = new Set([expected]);
  if (expected === "lisboa") acceptable.add("lisbon");
  if (expected === "lisbon") acceptable.add("lisboa");
  return observedValues.some((value) => acceptable.has(value));
}

/**
 * Evaluate ONE provider candidate against ONE canonical Venue. Returns
 * `{ passed, checks }` where `checks` names each individual deterministic
 * rule and whether it passed — used both to decide acceptance and to
 * report exactly which rule rejected a candidate.
 */
export function evaluateCandidate(candidate, venue) {
  const checks = {};

  checks.country = normaliseText(candidate?.address?.country_code) === "pt";
  checks.city = cityMatches(candidate, venue?.municipality ?? venue?.city);

  const canonicalPostcode = extractPostcode(venue?.address);
  const candidatePostcode = candidate?.address?.postcode ?? null;
  checks.postcode =
    canonicalPostcode && candidatePostcode
      ? normalisePostcode(canonicalPostcode) === normalisePostcode(candidatePostcode)
      : true; // nothing to compare on one/both sides is not itself a rejection

  const canonicalHouseNumber = extractHouseNumber(venue?.address);
  const candidateHouseNumber = candidate?.address?.house_number ?? null;
  checks.houseNumber =
    canonicalHouseNumber && candidateHouseNumber
      ? normaliseHouseNumber(canonicalHouseNumber) === normaliseHouseNumber(candidateHouseNumber)
      : true;

  checks.specificEnough = isSpecificEnoughResult(candidate);

  const passed = Object.values(checks).every(Boolean);
  return { passed, checks };
}

/**
 * Select at most one accepted geocode match from a provider's candidate
 * list for one canonical Venue. Fail-closed:
 *   - no candidates at all -> REJECTED, NO_CANDIDATES_RETURNED
 *   - no candidate passes every check -> REJECTED, NO_CANDIDATE_PASSED_ALL_CHECKS
 *   - more than one candidate passes AND they denote genuinely different
 *     real-world locations -> REJECTED, AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED
 *     (never auto-picked, per this package's "no manual override" rule)
 *   - exactly one distinct passing location -> ACCEPTED, with that candidate
 */
export function selectGeocodeMatch(candidates, venue) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { status: "REJECTED", reason: "NO_CANDIDATES_RETURNED", evaluated: [] };
  }

  const evaluated = candidates.map((candidate) => ({ candidate, ...evaluateCandidate(candidate, venue) }));
  const passing = evaluated.filter((entry) => entry.passed);

  if (passing.length === 0) {
    return { status: "REJECTED", reason: "NO_CANDIDATE_PASSED_ALL_CHECKS", evaluated };
  }

  if (passing.length > 1) {
    const distinctPlaces = new Set(passing.map((entry) => `${entry.candidate.lat},${entry.candidate.lon}`));
    if (distinctPlaces.size > 1) {
      return { status: "REJECTED", reason: "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED", evaluated };
    }
  }

  return { status: "ACCEPTED", candidate: passing[0].candidate, evaluated };
}
