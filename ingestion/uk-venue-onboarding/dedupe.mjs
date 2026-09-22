// BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 — reconcile
// selected UK major-event census venues against every EXISTING canonical
// Venue registry (venues/*.json) before minting anything new. A census
// venue that is clearly the same real place as an already-canonical Venue
// is reused (its existing venue_id is never duplicated under a second UK
// identity) — never renamed, never re-minted, per this package's brief.
//
// Pure, dependency-free, no network calls — matching is deterministic
// string comparison only, never fuzzy/AI similarity.

function normaliseText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.,'’"«»()&-]/g, " ")
    .replace(/\b(the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed === "" ? null : trimmed;
}

function domainOf(url) {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function existingDomains(existingVenue) {
  return (existingVenue.evidence ?? [])
    .map((entry) => domainOf(entry.url))
    .filter(Boolean);
}

/**
 * Find an existing canonical Venue that is clearly the same real place as
 * `censusVenue`, or null. Checked in order of strength — official domain
 * match first (the strongest, least ambiguous signal), then exact
 * name+city match, then exact address match when both sides have one.
 */
export function findExistingMatch(censusVenue, existingVenues) {
  const censusDomain = domainOf(censusVenue.official_url);
  const censusNameNorm = normaliseText(censusVenue.canonical_name);
  const censusCityNorm = normaliseText(censusVenue.city);
  const censusAddressNorm = normaliseText(censusVenue.address);

  if (censusDomain) {
    const domainMatch = existingVenues.find((existing) => existingDomains(existing).includes(censusDomain));
    if (domainMatch) return { existing: domainMatch, method: "OFFICIAL_DOMAIN_MATCH" };
  }

  if (censusNameNorm && censusCityNorm) {
    const nameCityMatch = existingVenues.find(
      (existing) => normaliseText(existing.canonical_name) === censusNameNorm && normaliseText(existing.city) === censusCityNorm,
    );
    if (nameCityMatch) return { existing: nameCityMatch, method: "NAME_AND_CITY_MATCH" };
  }

  if (censusAddressNorm) {
    const addressMatch = existingVenues.find((existing) => normaliseText(existing.address) === censusAddressNorm);
    if (addressMatch) return { existing: addressMatch, method: "EXACT_ADDRESS_MATCH" };
  }

  return null;
}

/**
 * Reconcile every in-scope census venue against the combined set of
 * existing canonical Venues drawn from `registriesByPath`
 * (`{ "venues/london.json": { venues: [...] }, ... }`, as loaded from
 * disk). Returns `{ duplicates, newVenues }`:
 *   - `duplicates`   - census venues that matched an existing canonical
 *                      Venue (never re-minted; the existing venue_id is
 *                      reused as-is)
 *   - `newVenues`    - census venues with no existing match (safe to mint
 *                      a new canonical Venue for)
 */
export function dedupeAgainstRegistries(censusVenues, registriesByPath) {
  const allExisting = Object.values(registriesByPath ?? {}).flatMap((registry) => registry.venues ?? []);

  const duplicates = [];
  const newVenues = [];
  for (const censusVenue of censusVenues ?? []) {
    const match = findExistingMatch(censusVenue, allExisting);
    if (match) {
      duplicates.push({ census_venue_id: censusVenue.venue_census_id, canonical_name: censusVenue.canonical_name, existing_venue_id: match.existing.venue_id, method: match.method });
    } else {
      newVenues.push(censusVenue);
    }
  }
  return { duplicates, newVenues };
}

export { normaliseText, domainOf };
