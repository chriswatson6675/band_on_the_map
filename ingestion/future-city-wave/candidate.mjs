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
    website_confidence: discoveryCandidate.reported_website ? "WEBSITE_FOUND_HIGH_CONFIDENCE" : "WEBSITE_NOT_FOUND",
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

/**
 * BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — build a wave
 * candidate from a RECONCILED, multi-provider group (see
 * multi-source-discovery.mjs / ingestion/venue-discovery/reconcile.mjs)
 * instead of a single provider's raw observation. Website-identity
 * confidence is a direct, honest byproduct of the EXISTING reconciliation
 * logic — never a new "guess a domain" mechanism: if every provider that
 * reported a website agrees, confidence is HIGH; if providers disagree
 * (reconcile.mjs's own WEBSITE_CONFLICT), the conflicting evidence is
 * retained but NO website is used for acquisition (an ambiguous identity
 * must defer safely, never silently pick one); if no provider reported a
 * website at all, it is honestly WEBSITE_NOT_FOUND. A venue only one
 * provider discovered (e.g. OSM alone, or the curated directory alone)
 * still gets its own website if that one provider reported one.
 */
export function toWaveCandidateFromGroup(group, city) {
  const canonicalName = group.observations[0]?.reported_name ?? group.reported_names[0];
  const venueId = createVenueId(canonicalName, city.name);
  const hasWebsiteConflict = group.coverage.conflicts.includes("WEBSITE_CONFLICT");
  const websiteConfidence = hasWebsiteConflict
    ? "WEBSITE_AMBIGUOUS"
    : group.reported_websites.length > 0
      ? "WEBSITE_FOUND_HIGH_CONFIDENCE"
      : "WEBSITE_NOT_FOUND";
  const website = hasWebsiteConflict ? null : (group.reported_websites[0] ?? null);

  const withCoords = group.observations.find((o) => typeof o.reported_latitude === "number" && typeof o.reported_longitude === "number");
  const address = group.reported_addresses[0] ?? null;

  return {
    venue_id: venueId,
    source_id: deriveSourceId(city.name, canonicalName),
    canonical_name: canonicalName,
    city: city.name,
    city_id: city.city_id,
    country: city.country,
    country_code: city.country_code,
    website,
    website_confidence: websiteConfidence,
    programme_url: null,
    acquisition_class: null,
    address,
    latitude: withCoords?.reported_latitude ?? null,
    longitude: withCoords?.reported_longitude ?? null,
    has_admissible_location: Boolean(withCoords) || Boolean(address),
    provenance: {
      kind: "MULTI_SOURCE_RECONCILED",
      reconciled_candidate_id: group.reconciled_candidate_id,
      providers: group.providers,
      provider_count: group.provider_count,
      conflicts: group.coverage.conflicts,
      wave_id: city.wave_id,
    },
  };
}

