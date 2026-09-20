// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — maps one OSM
// VenueDiscoveryCandidate (ingestion/venue-discovery/contract.mjs) into
// the SAME candidate shape ingestion/global-easy-harvester/tier1-gate.mjs
// already consumes — so evaluateTier1Candidate() is reused completely
// unchanged (see controller.mjs). No new Tier-1 gate logic here.

import { createVenueId } from "../venue/contract.mjs";
import { deriveSourceId } from "../global-easy-harvester/contract.mjs";

/**
 * Real OSM coordinates are direct, first-party location evidence — not a
 * guess — so any discovery candidate with numeric lat/lon clears the
 * identity/location gate exactly the way an ADDRESS_ONLY evidenced venue
 * would (see admission.mjs's own convention in a later, separate
 * package — this module never admits anything itself).
 */
function hasAdmissibleLocation(discoveryCandidate) {
  return typeof discoveryCandidate.reported_latitude === "number" && typeof discoveryCandidate.reported_longitude === "number";
}

export function toWaveCandidate(discoveryCandidate, city) {
  const canonicalName = discoveryCandidate.reported_name;
  const venueId = createVenueId(canonicalName, city.name);
  return {
    venue_id: venueId,
    source_id: deriveSourceId(city.name, canonicalName),
    canonical_name: canonicalName,
    city: city.name,
    city_id: city.city_id,
    country: city.country,
    country_code: city.country_code,
    website: discoveryCandidate.reported_website ?? null,
    programme_url: null,
    acquisition_class: null,
    address: discoveryCandidate.reported_address ?? null,
    latitude: discoveryCandidate.reported_latitude ?? null,
    longitude: discoveryCandidate.reported_longitude ?? null,
    has_admissible_location: hasAdmissibleLocation(discoveryCandidate),
    provenance: {
      kind: "OSM_OVERPASS",
      candidate_id: discoveryCandidate.candidate_id,
      provider_url: discoveryCandidate.provider_url,
      wave_id: city.wave_id,
    },
  };
}

