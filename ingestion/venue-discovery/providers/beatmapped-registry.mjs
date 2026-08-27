import { createVenueDiscoveryCandidate } from "../contract.mjs";

export const BEATMAPPED_REGISTRY_PROVIDER_ID = "BEATMAPPED_EXISTING_REGISTRY";

export function registryCandidates(sourceRegistry, venueRegistry, context) {
  const venueByName = new Map((venueRegistry?.venues ?? []).map((venue) => [venue.canonical_name, venue]));
  return (sourceRegistry?.entries ?? []).map((source) => {
    const venue = venueByName.get(source.name);
    return createVenueDiscoveryCandidate({
      candidate_id: `cand-beatmapped-source-${source.id}`,
      city: source.city,
      country_code: source.country_code,
      reported_name: source.name,
      reported_address: source.physical_address ?? venue?.address ?? null,
      reported_latitude: venue?.latitude ?? null,
      reported_longitude: venue?.longitude ?? null,
      reported_website: source.official_website ?? null,
      reported_category: "EXISTING_BEATMAPPED_SOURCE",
      discovery_provider: BEATMAPPED_REGISTRY_PROVIDER_ID,
      provider_record_id: source.id,
      provider_url: source.official_website,
      retrieved_at: context.retrieved_at,
      discovery_evidence: [{ kind: "BEATMAPPED_SOURCE_REGISTRY_ENTRY", value: source.id }],
      music_relevance_hint: (source.genres ?? []).join(",") || null,
      active_status_hint: source.active_status ?? null,
      official_site_hint: source.official_website ?? null,
    });
  });
}

export const beatmappedRegistryAdapter = {
  providerId: BEATMAPPED_REGISTRY_PROVIDER_ID,
  discover(input, context) { return registryCandidates(input.sources, input.venues, context); },
};
