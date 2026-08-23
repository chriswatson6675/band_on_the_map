// Deterministic, dependency-free validation for sources/*.json registry files.
// Mirrors the shape declared in sources/registry.schema.json. No network access.

export const SOURCE_TYPES = new Set([
  "VENUE",
  "PROMOTER",
  "FESTIVAL",
  "CITY_FEED",
  "TICKETING",
  "CULTURAL_CENTRE",
  "OTHER",
]);

export const ACQUISITION_METHODS = new Set([
  "API_JSON",
  "RSS",
  "ICS_CALENDAR",
  "JSON_LD_EVENT",
  "EMBEDDED_JSON",
  "STABLE_EVENT_PAGE",
  "TICKETING_WIDGET",
  "SOCIAL_ONLY",
  "NO_USEFUL_PUBLIC_SCHEDULE",
  "UNKNOWN",
]);

export const MONITORING_STATUSES = new Set([
  "READY_FOR_TECHNICAL_PROOF",
  "TECHNICAL_PATH_PROVEN",
  "NEEDS_TECHNICAL_REVIEW",
  "UNSUITABLE_AUTOMATION",
  "BLOCKED",
  "UNKNOWN",
]);

export const RIGHTS_STATUSES = new Set(["GREEN", "AMBER", "RED", "UNKNOWN"]);

export const SOURCE_PRIORITIES = new Set(["P1", "P2", "P3"]);

export const SCALES = new Set(["SMALL", "MEDIUM", "LARGE", "FESTIVAL", "UNKNOWN"]);

export const REGULAR_FUTURE_LISTINGS = new Set(["YES", "NO", "UNCLEAR"]);

export const ACTIVE_STATUSES = new Set(["ACTIVE", "DORMANT", "CLOSED", "UNKNOWN"]);

export const LIFECYCLE_STATUSES = new Set([
  "DISCOVERED",
  "TECHNICALLY_REVIEWED",
  "RIGHTS_REVIEWED",
  "ENABLED",
  "PAUSED",
  "RETIRED",
]);

// Lifecycle stages that can only be reached after the acquisition path has
// actually been directly proven (a real fetch, a passing contract test, a
// committed fixture) — not merely assessed as promising from research.
// PAUSED/RETIRED are deliberately excluded: an entry can be paused/retired
// from any earlier stage (e.g. a venue closing before technical review ever
// happened), so their monitoring_status is not constrained by this rule.
export const LIFECYCLE_STAGES_REQUIRING_PROVEN_PATH = new Set([
  "TECHNICALLY_REVIEWED",
  "RIGHTS_REVIEWED",
  "ENABLED",
]);

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function isNullableStringArray(value) {
  if (value === null) return true;
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Validate a single registry entry against sources/registry.schema.json.
 * Returns an array of human-readable error strings; empty array means valid.
 */
export function validateEntry(entry, index = 0) {
  const errors = [];
  const at = (field) => `entry[${index}] (${entry?.id ?? "unknown id"}).${field}`;

  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`entry[${index}] must be an object`];
  }

  if (!isNonEmptyString(entry.id) || !ID_PATTERN.test(entry.id)) {
    errors.push(`${at("id")} must be a non-empty kebab-case string`);
  }

  if (!isNonEmptyString(entry.name)) {
    errors.push(`${at("name")} is required`);
  }

  if (!SOURCE_TYPES.has(entry.source_type)) {
    errors.push(`${at("source_type")} must be one of ${[...SOURCE_TYPES].join(", ")}`);
  }

  if (!isNonEmptyString(entry.country_code) || !COUNTRY_CODE_PATTERN.test(entry.country_code)) {
    errors.push(`${at("country_code")} must be an ISO 3166-1 alpha-2 code`);
  }

  if (!isNonEmptyString(entry.city)) {
    errors.push(`${at("city")} is required`);
  }

  if ("municipality" in entry && !isNullableString(entry.municipality)) {
    errors.push(`${at("municipality")} must be a string or null`);
  }

  if ("neighbourhood" in entry && !isNullableString(entry.neighbourhood)) {
    errors.push(`${at("neighbourhood")} must be a string or null`);
  }

  if ("physical_address" in entry && !isNullableString(entry.physical_address)) {
    errors.push(`${at("physical_address")} must be a string or null`);
  }

  if ("official_website" in entry && !isNullableString(entry.official_website)) {
    errors.push(`${at("official_website")} must be a string or null`);
  }

  if ("events_url" in entry && !isNullableString(entry.events_url)) {
    errors.push(`${at("events_url")} must be a string or null`);
  }

  if (!SOURCE_PRIORITIES.has(entry.source_priority)) {
    errors.push(`${at("source_priority")} must be one of ${[...SOURCE_PRIORITIES].join(", ")}`);
  }

  if (!SCALES.has(entry.scale)) {
    errors.push(`${at("scale")} must be one of ${[...SCALES].join(", ")}`);
  }

  if ("genres" in entry && entry.genres !== null) {
    if (!Array.isArray(entry.genres) || !entry.genres.every((g) => typeof g === "string")) {
      errors.push(`${at("genres")} must be an array of strings or null`);
    }
  }

  if (!ACQUISITION_METHODS.has(entry.acquisition_method)) {
    errors.push(`${at("acquisition_method")} must be one of ${[...ACQUISITION_METHODS].join(", ")}`);
  }

  if ("acquisition_path_detail" in entry && !isNullableString(entry.acquisition_path_detail)) {
    errors.push(`${at("acquisition_path_detail")} must be a string or null`);
  }

  if (!MONITORING_STATUSES.has(entry.monitoring_status)) {
    errors.push(`${at("monitoring_status")} must be one of ${[...MONITORING_STATUSES].join(", ")}`);
  }

  if (!RIGHTS_STATUSES.has(entry.rights_status)) {
    errors.push(`${at("rights_status")} must be one of ${[...RIGHTS_STATUSES].join(", ")}`);
  }

  if ("rights_notes" in entry && !isNullableString(entry.rights_notes)) {
    errors.push(`${at("rights_notes")} must be a string or null`);
  }

  if (entry.rights_status === "RED" && !isNonEmptyString(entry.rights_notes)) {
    errors.push(
      `${at("rights_notes")} must be a non-empty string identifying the specific prohibition basis when rights_status is RED (docs/DATA_RIGHTS.md: RED means "not permitted for automated ingestion or intended use" — an all-rights-reserved footer or the mere absence of a reuse licence does not by itself establish that; use UNKNOWN instead unless retained evidence shows an explicit prohibition)`,
    );
  }

  if ("rights_evidence_url" in entry && !isNullableStringArray(entry.rights_evidence_url)) {
    errors.push(`${at("rights_evidence_url")} must be an array of strings or null`);
  }

  if (!REGULAR_FUTURE_LISTINGS.has(entry.regular_future_listings)) {
    errors.push(`${at("regular_future_listings")} must be one of ${[...REGULAR_FUTURE_LISTINGS].join(", ")}`);
  }

  if (!ACTIVE_STATUSES.has(entry.active_status)) {
    errors.push(`${at("active_status")} must be one of ${[...ACTIVE_STATUSES].join(", ")}`);
  }

  if ("overlap_notes" in entry && !isNullableString(entry.overlap_notes)) {
    errors.push(`${at("overlap_notes")} must be a string or null`);
  }

  if ("research_notes" in entry && !isNullableString(entry.research_notes)) {
    errors.push(`${at("research_notes")} must be a string or null`);
  }

  if ("detailed_source_ref" in entry && !isNullableString(entry.detailed_source_ref)) {
    errors.push(`${at("detailed_source_ref")} must be a string or null`);
  }

  if (!LIFECYCLE_STATUSES.has(entry.lifecycle_status)) {
    errors.push(`${at("lifecycle_status")} must be one of ${[...LIFECYCLE_STATUSES].join(", ")}`);
  } else if (
    LIFECYCLE_STAGES_REQUIRING_PROVEN_PATH.has(entry.lifecycle_status) &&
    entry.monitoring_status === "READY_FOR_TECHNICAL_PROOF"
  ) {
    errors.push(
      `${at("monitoring_status")} cannot remain READY_FOR_TECHNICAL_PROOF once lifecycle_status is ${entry.lifecycle_status} — the acquisition path has already been directly proven, so use TECHNICAL_PATH_PROVEN (or a status reflecting what was actually found) instead`,
    );
  }

  if (!isNonEmptyString(entry.discovered_at) || !DATE_PATTERN.test(entry.discovered_at)) {
    errors.push(`${at("discovered_at")} must be a YYYY-MM-DD date string`);
  }

  if (!isNonEmptyString(entry.last_reviewed_at) || !DATE_PATTERN.test(entry.last_reviewed_at)) {
    errors.push(`${at("last_reviewed_at")} must be a YYYY-MM-DD date string`);
  }

  const provenance = entry.research_provenance;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    errors.push(`${at("research_provenance")} is required and must be an object`);
  } else {
    if (!isNonEmptyString(provenance.research_id)) {
      errors.push(`${at("research_provenance.research_id")} is required`);
    }
    if (!isNonEmptyString(provenance.review_date) || !DATE_PATTERN.test(provenance.review_date)) {
      errors.push(`${at("research_provenance.review_date")} must be a YYYY-MM-DD date string`);
    }
    if ("note" in provenance && !isNullableString(provenance.note)) {
      errors.push(`${at("research_provenance.note")} must be a string or null`);
    }
  }

  return errors;
}

/**
 * Normalise a website/events URL for duplicate-identity comparison:
 * strips protocol, leading "www.", and any trailing slash, lower-cased.
 */
export function normaliseWebsite(url) {
  if (typeof url !== "string" || url.trim() === "") {
    return null;
  }

  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * Validate a full registry array: per-entry shape, unique IDs, and
 * duplicate official-website identities where detectable.
 * Returns an array of human-readable error strings; empty array means valid.
 */
export function validateRegistry(entries) {
  const errors = [];

  if (!Array.isArray(entries)) {
    return ["registry root must be an array of entries"];
  }

  entries.forEach((entry, index) => {
    errors.push(...validateEntry(entry, index));
  });

  const seenIds = new Map();
  entries.forEach((entry, index) => {
    if (!isNonEmptyString(entry?.id)) return;
    if (seenIds.has(entry.id)) {
      errors.push(
        `duplicate id "${entry.id}" at entry[${index}] (first seen at entry[${seenIds.get(entry.id)}])`,
      );
    } else {
      seenIds.set(entry.id, index);
    }
  });

  const seenWebsites = new Map();
  entries.forEach((entry, index) => {
    const normalised = normaliseWebsite(entry?.official_website);
    if (!normalised) return;

    const previous = seenWebsites.get(normalised);
    if (previous) {
      errors.push(
        `duplicate official source identity: entry[${index}] (${entry?.id ?? "unknown id"}) shares official_website "${normalised}" with entry[${previous.index}] (${previous.id})`,
      );
    } else {
      seenWebsites.set(normalised, { index, id: entry?.id ?? null });
    }
  });

  return errors;
}
