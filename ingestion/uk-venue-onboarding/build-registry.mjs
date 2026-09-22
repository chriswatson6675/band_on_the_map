// BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 — build one
// canonical Venue (ingestion/venue/contract.mjs) per selected, non-
// duplicate UK major-event census venue. Every record starts as
// ADDRESS_ONLY (when the census already carries a trustworthy address) or
// UNRESOLVED (when it does not) — coordinates are NEVER set here; they are
// only ever added later by ingestion/geocoding/run-uk.mjs's live,
// evidence-checked geocoding pass. Pure, dependency-free, no network
// calls, no guessing.

import { createVenueId, validateVenue } from "../venue/contract.mjs";

/**
 * Deterministically combine the census's own separate `address`/
 * `postcode`/`city` fields into one human-readable address string,
 * matching the "<street>, <postcode>, <city>" shape venues/london.json's
 * own OSM_ID_LOOKUP-derived addresses already use — never inventing a
 * field that was null. Returns null when the census carries no address at
 * all (the majority case — see research/major-event-venues/
 * uk-major-event-census-01/venues.json's own with_coordinates/address
 * coverage).
 */
export function buildAddressString(censusVenue) {
  const street = typeof censusVenue.address === "string" ? censusVenue.address.trim() : "";
  if (street === "") return null;

  const parts = [street];
  const postcode = typeof censusVenue.postcode === "string" ? censusVenue.postcode.trim() : "";
  if (postcode && !street.toUpperCase().includes(postcode.toUpperCase())) {
    parts.push(postcode);
  }
  const city = typeof censusVenue.city === "string" ? censusVenue.city.trim() : "";
  if (city && !street.toLowerCase().includes(city.toLowerCase())) {
    parts.push(city);
  }
  return parts.join(", ");
}

function censusEvidence(censusVenue) {
  return [
    {
      url: censusVenue.official_url ?? null,
      kind: "UK_MAJOR_EVENT_CENSUS",
      note:
        `Recovered from the governed UK major-event venue census ` +
        `(research/major-event-venues/uk-major-event-census-01/venues.json), ` +
        `venue_census_id="${censusVenue.venue_census_id}", ` +
        `workstream="${censusVenue.provenance?.workstream ?? "unknown"}"` +
        `${censusVenue.official_url_status ? `, official_url_status=${censusVenue.official_url_status}` : ""}.`,
    },
  ];
}

/**
 * Build one canonical Venue from ONE selected, non-duplicate census
 * venue. Throws (via validateVenue()) if the result is somehow invalid —
 * this function must never silently produce a Venue contract violation.
 */
export function buildCanonicalUkVenue(censusVenue) {
  const address = buildAddressString(censusVenue);
  const venue = {
    venue_id: createVenueId(censusVenue.canonical_name, censusVenue.city),
    canonical_name: censusVenue.canonical_name,
    country_code: "GB",
    city: censusVenue.city,
    municipality: censusVenue.city,
    address,
    latitude: null,
    longitude: null,
    location_status: address ? "ADDRESS_ONLY" : "UNRESOLVED",
    evidence: censusEvidence(censusVenue),
  };

  const errors = validateVenue(venue);
  if (errors.length > 0) {
    throw new Error(`buildCanonicalUkVenue produced an invalid Venue for ${censusVenue.venue_census_id}: ${errors.join("; ")}`);
  }
  return venue;
}

/**
 * Build canonical Venues for every entry in `newCensusVenues` (already
 * scope-selected and dedupe-filtered by the caller). Detects and reports
 * (never silently drops) a venue_id collision BETWEEN two distinct census
 * venues (e.g. two different cities' venues that happen to slug to the
 * same id would be a real data problem, not something to paper over).
 */
export function buildCanonicalUkVenues(newCensusVenues) {
  const venues = [];
  const seenIds = new Map();
  const collisions = [];

  for (const censusVenue of newCensusVenues ?? []) {
    const venue = buildCanonicalUkVenue(censusVenue);
    if (seenIds.has(venue.venue_id)) {
      collisions.push({ venue_id: venue.venue_id, census_venue_ids: [seenIds.get(venue.venue_id), censusVenue.venue_census_id] });
      continue;
    }
    seenIds.set(venue.venue_id, censusVenue.venue_census_id);
    venues.push(venue);
  }

  return { venues, collisions };
}
