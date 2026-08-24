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

// ===========================================================================
// VENUE-LOCATION-RESOLUTION-02 — NAME_PLUS_ADDRESS_QUERY's OWN, STRICTER
// acceptance rules.
//
// This strategy queries `<canonical_name>, <canonical official address>`
// (see ingestion/geocoding/nominatim.mjs's buildNamePlusAddressQuery), so a
// returned candidate must pass every ADDRESS_ONLY_QUERY check ABOVE
// (country, city/municipality, postcode, house number, "specific enough"
// place type) PLUS two new, additive checks:
//
//   - nameCompatible     - a bounded, deterministic (never fuzzy/AI) check
//                           that the canonical Venue's own name is actually
//                           attested somewhere in the candidate's own
//                           name/amenity/theatre/arts_centre/community_centre/
//                           building/display_name fields — see
//                           isVenueNameCompatible() below. This is what
//                           prevents a first-strategy postcode/identity
//                           conflict from being silently "papered over" by
//                           the second strategy: a wrong-place candidate
//                           essentially never also carries the right name.
//   - featureCompatible  - the candidate's OSM feature kind must be one a
//                           real cultural/event venue plausibly is (a
//                           positive allowlist — see
//                           PLAUSIBLE_VENUE_FEATURE_TYPES below), not merely
//                           "not on the existing rejection list". This is
//                           venue-relative in effect (a library candidate
//                           only ever survives for a venue whose own name
//                           coincidentally names it, via nameCompatible) but
//                           the allowlist itself intentionally stays generic
//                           enough to admit every real feature kind this
//                           project's target venues can be (theatre, arts
//                           centre, community centre, concert hall, library,
//                           place of worship, museum, nightclub/bar/social
//                           venue, or a named building) while still refusing
//                           obviously irrelevant feature kinds (fuel
//                           stations, parking, shops, ATMs, ...).
//
// Nothing here loosens or bypasses the checks above — a candidate that
// fails country/city/postcode/houseNumber/specificEnough under
// evaluateCandidate() also fails those same checks under
// evaluateNamePlusAddressCandidate().

// A positive allowlist (not merely "absent from REJECTED_PLACE_TYPES") of
// OSM feature kinds a genuine cultural/event venue plausibly is. Kept
// intentionally broad across venue kinds (this project's ADDRESS_ONLY
// venues span theatres, libraries, a church, cultural centres, and small
// independent music/arts spaces) rather than narrowed per-venue — the real,
// venue-specific anchor is nameCompatible, not this list.
const PLAUSIBLE_VENUE_FEATURE_TYPES = new Set([
  "theatre",
  "arts_centre",
  "community_centre",
  "concert_hall",
  "library",
  "place_of_worship",
  "church",
  "museum",
  "attraction",
  "gallery",
  "nightclub",
  "bar",
  "pub",
  "music_venue",
  "events_venue",
  "social_centre",
  "cultural_centre",
  "civic",
  "public_building",
  "hall",
  "yes", // generic amenity/building=yes — only ever survives alongside a real nameCompatible match
]);

function isPlausibleVenueFeature(candidate) {
  const type = normaliseText(candidate?.type);
  const addresstype = normaliseText(candidate?.addresstype);
  // A named building-level feature is plausible regardless of its exact
  // `type` string — buildings are not further subtyped by Nominatim.
  if (addresstype === "building" && normaliseText(candidate?.name ?? candidate?.address?.building)) return true;
  if (type && PLAUSIBLE_VENUE_FEATURE_TYPES.has(type)) return true;
  if (addresstype && PLAUSIBLE_VENUE_FEATURE_TYPES.has(addresstype)) return true;
  return false;
}

/**
 * Cautious, harmless-only text normalisation for venue NAME compatibility —
 * deliberately distinct from normaliseText() above (which is used for
 * address-field comparison) so this function's own doc comment/behaviour
 * can be reasoned about in isolation: Unicode normalisation, case folding,
 * diacritic folding, whitespace collapse, and stripping obvious
 * legal/typographic punctuation. NEVER edit-distance, embeddings, or any
 * broad fuzzy similarity.
 */
function normaliseVenueNameText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.,'’"«»()]/g, " ")
    .replace(/&/g, " e ") // "&" / "e" are used interchangeably in PT venue names
    .replace(/\s+/g, " ")
    .trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Governed alias list for venue name compatibility (section 5 of this
 * package's brief): ONLY entries backed by retained evidence that the
 * canonical Venue's official identity is genuinely also known/published
 * under the alias — never invented merely to gain acceptance. Exported so
 * a future package can extend it, and so tests can exercise the mechanism
 * against a synthetic alias without touching real venue identities.
 *
 * Two entries were added by VENUE-LOCATION-RESOLUTION-02's live proof run,
 * each independently evidenced BEFORE (and separately from) the OSM
 * candidate that happened to need it:
 *
 *   - "teatro rivoli" / "teatro campo alegre" — venues/porto.json's own
 *     evidence entries (committed by the earlier LISBON-PORTO-OVERNIGHT-
 *     COVERAGE-01 package, independent of this one) already record, from
 *     https://www.teatromunicipaldoporto.pt/PT/quem-somos/contactos/ (the
 *     official municipal theatre's own contacts page), that "Rivoli" and
 *     "Campo Alegre" are the two operating poles of "Teatro Municipal do
 *     Porto" — i.e. the venues' own official operator styles them "Teatro
 *     Municipal Rivoli" / "Teatro Municipal do Campo Alegre". This is
 *     exactly what the live NAME_PLUS_ADDRESS_QUERY run's own accepted OSM
 *     candidates are independently named (see
 *     fixtures/geocoding/nominatim/venue-porto-teatro-rivoli--name-plus-address.json
 *     and .../venue-porto-teatro-campo-alegre--name-plus-address.json) —
 *     the alias reflects a real, pre-existing, independently-sourced
 *     naming fact, not an ad hoc widening to force a match.
 */
export const VENUE_NAME_ALIASES = {
  "teatro rivoli": ["teatro municipal rivoli"],
  "teatro campo alegre": ["teatro municipal do campo alegre", "teatro municipal campo alegre"],
};

function candidateNameFields(candidate) {
  const addr = candidate?.address ?? {};
  return [
    candidate?.name,
    addr.amenity,
    addr.theatre,
    addr.arts_centre,
    addr.community_centre,
    addr.concert_hall,
    addr.library,
    addr.place_of_worship,
    addr.building,
    addr.tourism,
    addr.leisure,
    addr.club,
    addr.shop,
  ];
}

/**
 * Bounded, deterministic venue-name compatibility (section 5): true only
 * when the canonical Venue's own name (or a governed alias of it) exactly
 * matches — after only the cautious normalisation above — one of the
 * candidate's own name-bearing fields, OR the FIRST comma-separated segment
 * of its `display_name` (never a raw substring/fuzzy scan of the whole
 * display_name string, which could spuriously match an unrelated
 * neighbourhood/street/city component elsewhere in it).
 *
 * This operates ONLY between an already-existing canonical Venue and a
 * provider candidate — never between an Observation's own free-text
 * venue_name and anything (see docs/VENUE_RESOLUTION.md /
 * ingestion/venue/contract.mjs: Observations are never fuzzy-matched here
 * or anywhere in this project).
 */
export function isVenueNameCompatible(canonicalName, candidate, { aliases = VENUE_NAME_ALIASES } = {}) {
  const canonical = normaliseVenueNameText(canonicalName);
  if (!canonical) return false;

  const acceptable = new Set([canonical, ...(aliases[canonical] ?? [])]);

  const fields = candidateNameFields(candidate).map(normaliseVenueNameText).filter(Boolean);
  if (fields.some((field) => acceptable.has(field))) return true;

  // Split the RAW display_name on its comma separators FIRST, then
  // normalise only the first segment — normaliseVenueNameText() itself
  // strips commas as harmless punctuation, so normalising before
  // splitting would silently collapse every segment into one string and
  // let a name appearing anywhere later in display_name match.
  if (typeof candidate?.display_name === "string") {
    const rawFirstSegment = candidate.display_name.split(",")[0];
    const firstSegment = normaliseVenueNameText(rawFirstSegment);
    if (firstSegment && acceptable.has(firstSegment)) return true;
  }

  return false;
}

/**
 * Evaluate ONE provider candidate against ONE canonical Venue under the
 * NAME_PLUS_ADDRESS_QUERY strategy's own, stricter rules: every
 * ADDRESS_ONLY_QUERY check (country/city/postcode/houseNumber/
 * specificEnough — identical logic, reused, never loosened) PLUS
 * featureCompatible and nameCompatible.
 */
export function evaluateNamePlusAddressCandidate(candidate, venue, options = {}) {
  const checks = {};

  checks.country = normaliseText(candidate?.address?.country_code) === "pt";
  checks.city = cityMatches(candidate, venue?.municipality ?? venue?.city);

  const canonicalPostcode = extractPostcode(venue?.address);
  const candidatePostcode = candidate?.address?.postcode ?? null;
  checks.postcode =
    canonicalPostcode && candidatePostcode
      ? normalisePostcode(canonicalPostcode) === normalisePostcode(candidatePostcode)
      : true;

  const canonicalHouseNumber = extractHouseNumber(venue?.address);
  const candidateHouseNumber = candidate?.address?.house_number ?? null;
  checks.houseNumber =
    canonicalHouseNumber && candidateHouseNumber
      ? normaliseHouseNumber(canonicalHouseNumber) === normaliseHouseNumber(candidateHouseNumber)
      : true;

  checks.specificEnough = isSpecificEnoughResult(candidate);
  checks.featureCompatible = isPlausibleVenueFeature(candidate);
  checks.nameCompatible = isVenueNameCompatible(venue?.canonical_name, candidate, options);

  const passed = Object.values(checks).every(Boolean);
  return { passed, checks };
}

/**
 * NAME_PLUS_ADDRESS_QUERY's own selectGeocodeMatch analogue — identical
 * fail-closed shape (NO_CANDIDATES_RETURNED / NO_CANDIDATE_PASSED_ALL_CHECKS
 * / AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED / ACCEPTED), but evaluating every
 * candidate against evaluateNamePlusAddressCandidate()'s stricter rules.
 * Evaluates EVERY returned candidate (section 7: never just candidates[0]),
 * so a correct match ranked below an incorrect/rejected one is still found.
 */
export function selectNamePlusAddressMatch(candidates, venue, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { status: "REJECTED", reason: "NO_CANDIDATES_RETURNED", evaluated: [] };
  }

  const evaluated = candidates.map((candidate) => ({
    candidate,
    ...evaluateNamePlusAddressCandidate(candidate, venue, options),
  }));
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
