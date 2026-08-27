import { createVenueDiscoveryCandidate } from "../contract.mjs";

export const OVERPASS_PROVIDER_ID = "OPENSTREETMAP_OVERPASS";

function address(tags) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  return [street, tags["addr:postcode"], tags["addr:city"]].filter(Boolean).join(", ") || null;
}

function category(tags) {
  return [tags.amenity && `amenity=${tags.amenity}`, tags.leisure && `leisure=${tags.leisure}`,
    tags.live_music && `live_music=${tags.live_music}`, tags.music_venue && `music_venue=${tags.music_venue}`,
    tags["theatre:type"] && `theatre:type=${tags["theatre:type"]}`].filter(Boolean).join(";");
}

export function parseOverpassCandidates(raw, context) {
  if (!raw || !Array.isArray(raw.elements)) throw new Error("Overpass fixture requires elements[]");
  const candidates = [];
  const excluded = [];
  for (const element of raw.elements) {
    const tags = element.tags ?? {};
    if (!tags.name) {
      excluded.push({ provider_record_id: `${element.type}/${element.id}`, reason: "MISSING_NAME" });
      continue;
    }
    const lat = element.lat ?? element.center?.lat ?? null;
    const lon = element.lon ?? element.center?.lon ?? null;
    const recordId = `${element.type}/${element.id}`;
    candidates.push(createVenueDiscoveryCandidate({
      candidate_id: `cand-osm-${element.type}-${element.id}`,
      city: context.city,
      country_code: context.country_code,
      reported_name: tags.name,
      reported_address: address(tags),
      reported_latitude: lat,
      reported_longitude: lon,
      reported_website: tags.website ?? tags["contact:website"] ?? null,
      reported_category: category(tags),
      discovery_provider: OVERPASS_PROVIDER_ID,
      provider_record_id: recordId,
      provider_url: `https://www.openstreetmap.org/${recordId}`,
      retrieved_at: context.retrieved_at,
      discovery_evidence: [
        { kind: "OSM_ELEMENT", value: recordId },
        { kind: "OSM_TAGS", value: JSON.stringify(tags) },
      ],
      music_relevance_hint: category(tags),
      active_status_hint: null,
      official_site_hint: tags.website ?? tags["contact:website"] ?? null,
    }));
  }
  return { candidates, excluded };
}

export const overpassAdapter = {
  providerId: OVERPASS_PROVIDER_ID,
  discover(input, context) { return parseOverpassCandidates(input, context).candidates; },
};
