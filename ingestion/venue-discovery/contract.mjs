const REQUIRED = [
  "candidate_id", "city", "country_code", "reported_name",
  "discovery_provider", "provider_record_id", "provider_url", "retrieved_at",
];

const OPTIONAL_STRINGS = [
  "reported_address", "reported_website", "reported_category",
  "music_relevance_hint", "active_status_hint", "official_site_hint",
];

const isText = (value) => typeof value === "string" && value.trim() !== "";

export function validateVenueDiscoveryCandidate(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return ["candidate must be an object"];
  }
  for (const field of REQUIRED) {
    if (!isText(candidate[field])) errors.push(`${field} must be a non-empty string`);
  }
  if (isText(candidate.country_code) && !/^[A-Z]{2}$/.test(candidate.country_code)) {
    errors.push("country_code must be ISO 3166-1 alpha-2 uppercase");
  }
  for (const field of OPTIONAL_STRINGS) {
    if (candidate[field] !== null && candidate[field] !== undefined && typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string or null`);
    }
  }
  for (const field of ["reported_latitude", "reported_longitude"]) {
    if (candidate[field] !== null && candidate[field] !== undefined && typeof candidate[field] !== "number") {
      errors.push(`${field} must be a number or null`);
    }
  }
  if (typeof candidate.reported_latitude === "number" && (candidate.reported_latitude < -90 || candidate.reported_latitude > 90)) {
    errors.push("reported_latitude is out of range");
  }
  if (typeof candidate.reported_longitude === "number" && (candidate.reported_longitude < -180 || candidate.reported_longitude > 180)) {
    errors.push("reported_longitude is out of range");
  }
  if (!Array.isArray(candidate.discovery_evidence) || candidate.discovery_evidence.length === 0) {
    errors.push("discovery_evidence must be a non-empty array");
  } else {
    candidate.discovery_evidence.forEach((item, index) => {
      if (!item || typeof item !== "object") errors.push(`discovery_evidence[${index}] must be an object`);
      else if (!isText(item.kind) || !isText(item.value)) errors.push(`discovery_evidence[${index}] requires kind and value`);
    });
  }
  return errors;
}

export function createVenueDiscoveryCandidate(input) {
  const candidate = {
    candidate_id: input.candidate_id,
    city: input.city,
    country_code: input.country_code,
    reported_name: input.reported_name,
    reported_address: input.reported_address ?? null,
    reported_latitude: input.reported_latitude ?? null,
    reported_longitude: input.reported_longitude ?? null,
    reported_website: input.reported_website ?? null,
    reported_category: input.reported_category ?? null,
    discovery_provider: input.discovery_provider,
    provider_record_id: String(input.provider_record_id),
    provider_url: input.provider_url,
    retrieved_at: input.retrieved_at,
    discovery_evidence: input.discovery_evidence,
    music_relevance_hint: input.music_relevance_hint ?? null,
    active_status_hint: input.active_status_hint ?? null,
    official_site_hint: input.official_site_hint ?? null,
  };
  const errors = validateVenueDiscoveryCandidate(candidate);
  if (errors.length) throw new Error(`invalid VenueDiscoveryCandidate: ${errors.join("; ")}`);
  return candidate;
}
