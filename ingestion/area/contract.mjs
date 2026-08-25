// VENUE-DISCOVERY-ENGINE-01 — generic managed-Area configuration contract.
//
// An Area is a city/metro-scale configuration that tells the venue
// discovery engine (ingestion/venue-discovery/) WHERE and HOW to look
// for candidate live-music venues — it is not itself a Venue, a Source,
// or a Candidate (see docs/ARCHITECTURE.md and docs/VENUE_DISCOVERY.md).
// The first managed Area is Barcelona (areas/barcelona-es.json), but
// nothing about this module, or the discovery engine that consumes it,
// is Barcelona-specific: adding Madrid or Berlin means adding a new
// areas/<area_id>.json file, never editing this contract or the
// collector code.
//
// Dependency-free, matching every other ingestion module in this
// repository.

export const AREA_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Build one Area config. `area_id` is never derived/defaulted — unlike a
 * Venue or Candidate, an Area's identity is hand-authored (matching the
 * source registry's `id` convention in sources/registry.schema.json), so
 * a caller must always supply it explicitly. Throws if the resulting
 * config fails validateAreaConfig().
 */
export function createAreaConfig(fields) {
  const area = {
    area_id: fields.area_id ?? null,
    country: fields.country ?? null,
    country_code: fields.country_code ?? null,
    city: fields.city ?? null,
    metro_name: fields.metro_name ?? null,
    centre: fields.centre ?? null,
    radius_km: fields.radius_km ?? null,
    languages: fields.languages ?? [],
    discovery_keywords: fields.discovery_keywords ?? {},
    discovery_sources: fields.discovery_sources ?? [],
    active_status: fields.active_status ?? "ACTIVE",
    created_at: fields.created_at ?? null,
  };

  const errors = validateAreaConfig(area);
  if (errors.length > 0) {
    throw new Error(`Invalid Area config: ${errors.join("; ")}`);
  }
  return area;
}

/**
 * Return an array of validation error strings (empty if valid). Kept
 * deliberately generic — nothing here references Barcelona, Overpass, or
 * any specific discovery_sources.source_kind, so this same validator
 * covers every future managed Area unchanged.
 */
export function validateAreaConfig(area) {
  const errors = [];

  if (!nonEmptyString(area?.area_id)) {
    errors.push("area_id is required");
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(area.area_id)) {
    errors.push("area_id must be a lowercase slug matching ^[a-z0-9]+(-[a-z0-9]+)*$");
  }

  if (!nonEmptyString(area?.country)) errors.push("country is required");
  if (!/^[A-Z]{2}$/.test(area?.country_code ?? "")) {
    errors.push("country_code must be an ISO 3166-1 alpha-2 code");
  }
  if (!nonEmptyString(area?.city)) errors.push("city is required");

  if (!area?.centre || typeof area.centre !== "object") {
    errors.push("centre is required ({ latitude, longitude })");
  } else {
    const { latitude, longitude } = area.centre;
    if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
      errors.push("centre.latitude must be a number between -90 and 90");
    }
    if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
      errors.push("centre.longitude must be a number between -180 and 180");
    }
  }

  if (!isFiniteNumber(area?.radius_km) || area.radius_km <= 0) {
    errors.push("radius_km must be a positive number");
  }

  if (!Array.isArray(area?.languages) || area.languages.length === 0) {
    errors.push("languages must be a non-empty array");
  } else if (area.languages.some((l) => !nonEmptyString(l))) {
    errors.push("languages must contain only non-empty strings");
  }

  if (typeof area?.discovery_keywords !== "object" || area.discovery_keywords === null || Array.isArray(area.discovery_keywords)) {
    errors.push("discovery_keywords must be an object keyed by language code");
  } else {
    for (const [lang, keywords] of Object.entries(area.discovery_keywords)) {
      if (!Array.isArray(keywords) || keywords.some((k) => !nonEmptyString(k))) {
        errors.push(`discovery_keywords.${lang} must be an array of non-empty strings`);
      }
    }
  }

  if (!Array.isArray(area?.discovery_sources)) {
    errors.push("discovery_sources must be an array");
  } else {
    area.discovery_sources.forEach((source, index) => {
      if (!source || typeof source !== "object" || !nonEmptyString(source.source_kind)) {
        errors.push(`discovery_sources[${index}] must be an object with a non-empty source_kind`);
      }
    });
  }

  if (!area?.active_status || !AREA_STATUSES.has(area.active_status)) {
    errors.push(`active_status must be one of ${[...AREA_STATUSES].join(", ")}`);
  }

  if (!nonEmptyString(area?.created_at) || !/^\d{4}-\d{2}-\d{2}$/.test(area.created_at)) {
    errors.push("created_at must be a YYYY-MM-DD string");
  }

  return errors;
}
