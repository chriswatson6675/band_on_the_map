import { createVenueDiscoveryCandidate } from "../contract.mjs";

export function importCuratedDirectory(records, context) {
  return records.map((record) => createVenueDiscoveryCandidate({
    candidate_id: `cand-${context.provider_id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${record.id}`,
    city: context.city,
    country_code: context.country_code,
    reported_name: record.name,
    reported_address: record.address ?? null,
    reported_latitude: record.latitude ?? null,
    reported_longitude: record.longitude ?? null,
    reported_website: record.website ?? null,
    reported_category: record.category ?? "CURATED_MUSIC_DIRECTORY",
    discovery_provider: context.provider_id,
    provider_record_id: String(record.id),
    provider_url: record.url ?? context.provider_url,
    retrieved_at: context.retrieved_at,
    discovery_evidence: record.evidence ?? [{ kind: "CURATED_DIRECTORY_RECORD", value: String(record.id) }],
    music_relevance_hint: record.music_relevance_hint ?? "CURATED_MUSIC_DIRECTORY_MEMBERSHIP",
    active_status_hint: record.active_status_hint ?? null,
    official_site_hint: record.website ?? null,
  }));
}

export function createCuratedDirectoryAdapter(providerId) {
  return { providerId, discover(input, context) { return importCuratedDirectory(input, { ...context, provider_id: providerId }); } };
}
