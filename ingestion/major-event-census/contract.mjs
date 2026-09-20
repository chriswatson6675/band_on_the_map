// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-01 — the census contract.
//
// This is a RESEARCH/CENSUS artifact contract, deliberately separate from
// the production Venue (ingestion/venue/contract.mjs) and Source
// (docs/SOURCE_REGISTRY.md) contracts: a census record is a RESEARCHED
// CANDIDATE with cited evidence, never an admitted production venue.
// Nothing in this module can write to, or is imported by, any production
// registry path — see tests/major-event-census.test.mjs, which asserts
// that statically.
//
// It reuses the repository's EXISTING vocabularies rather than inventing
// parallel ones:
//   - TECHNICAL_MECHANISMS      (source families, from venue-discovery)
//   - COLLECTOR_CAPABILITY_ROUTES (capability routing, from venue-discovery)
// and follows the same artifact-envelope convention the existing
// research/venue-discovery/*/census.json files already use
// (artifact_type / framework_version / generated_at / counts / records).

import { TECHNICAL_MECHANISMS, COLLECTOR_CAPABILITY_ROUTES } from "../venue-discovery/research-state.mjs";

export const CENSUS_FRAMEWORK_VERSION = "1.0";
export const CENSUS_ARTIFACT_TYPE = "UK_MAJOR_EVENT_VENUE_CENSUS";

/** The inclusion threshold this census is defined by. Capacity BELOW this is out of scope. */
export const CAPACITY_THRESHOLD = 1000;

export const UK_NATIONS = new Set(["England", "Scotland", "Wales", "Northern Ireland"]);

export const VENUE_TYPES = new Set([
  "FOOTBALL_STADIUM", "RUGBY_STADIUM", "CRICKET_GROUND", "OTHER_SPORTS_VENUE",
  "RACECOURSE", "MOTORSPORT_CIRCUIT", "GREYHOUND_STADIUM",
  "INDOOR_ARENA", "CONCERT_HALL", "THEATRE", "AUDITORIUM",
  "CONVENTION_CENTRE", "CONFERENCE_CENTRE", "EXHIBITION_CENTRE",
  "MULTI_PURPOSE_COMPLEX", "OTHER_MAJOR_EVENT_VENUE",
]);

export const OPERATIONAL_STATUSES = new Set(["OPERATIONAL", "CLOSED", "UNDER_CONSTRUCTION", "STATUS_REVIEW_REQUIRED"]);

/**
 * Why this venue is in the census at all. A spectator venue qualifies on
 * a proven capacity figure; major convention/exhibition infrastructure
 * qualifies on scale even where a single seated capacity is not a
 * meaningful number (Phase 1B of this package's brief) — that exception
 * is recorded explicitly here rather than by fabricating a capacity.
 */
export const INCLUSION_BASES = new Set([
  "CAPACITY_THRESHOLD_MET",
  "MAJOR_CONVENTION_EXHIBITION_INFRASTRUCTURE",
  "CAPACITY_REVIEW_REQUIRED",
]);

export const CAPACITY_TYPES = new Set([
  "SPECTATOR", "SEATED", "STANDING", "CONCERT", "THEATRE_STYLE",
  "DELEGATE", "AUDITORIUM", "LARGEST_ROOM", "OTHER_EXPLICIT",
]);

/** Capacity evidence authority grades (Phase 8). GRADE_A is first-party/official. */
export const CAPACITY_SOURCE_AUTHORITIES = new Set(["GRADE_A", "GRADE_B", "GRADE_C"]);

export const CAPACITY_CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW", "CAPACITY_REVIEW_REQUIRED"]);

/** What KIND of scheduled activity a calendar publishes (Phase 9). */
export const CALENDAR_SOURCE_TYPES = new Set([
  "SPORT_FIXTURES", "CONCERTS", "CONFERENCES", "CONVENTIONS",
  "EXHIBITIONS", "TRADE_SHOWS", "PERFORMING_ARTS", "OTHER_MAJOR_EVENTS",
]);

export const SPORTS = new Set([
  "football", "rugby_union", "rugby_league", "cricket", "basketball", "ice_hockey",
  "tennis", "horse_racing", "motorsport", "athletics", "boxing", "cycling",
  "swimming", "greyhound", "netball", "darts", "snooker", "other",
]);

/** Acquisition readiness (Phase 14) — deliberately NOT the same axis as collector_route. */
export const ACQUISITION_READINESS = new Set([
  "READY_TIER1",
  "READY_WITH_CONFIGURATION",
  "TIER2_REUSABLE_FAMILY",
  "TIER3_BROWSER_OR_COMPLEX",
  "NO_PUBLIC_CALENDAR",
  "SOURCE_REVIEW_REQUIRED",
]);

export { TECHNICAL_MECHANISMS, COLLECTOR_CAPABILITY_ROUTES };

const text = (value) => typeof value === "string" && value.trim() !== "";
const nullableText = (value) => value === null || value === undefined || text(value);
const nullableNumber = (value) => value === null || value === undefined || (typeof value === "number" && Number.isFinite(value));
const nullableBool = (value) => value === null || value === undefined || typeof value === "boolean";

/**
 * A stable, deterministic census id. Derived from the venue's own
 * canonical name + city + nation — never random, never ordering-dependent,
 * so re-running the compile step produces byte-identical ids.
 */
export function createVenueCensusId(canonicalName, city, nation) {
  const slug = (value) => String(value ?? "").toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `ukmec-${slug(nation)}-${slug(city)}-${slug(canonicalName)}`;
}

/** A stable id for one calendar source, derived from its venue and its own URL. */
export function createCalendarSourceId(venueCensusId, sourceUrl) {
  const slug = String(sourceUrl ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${venueCensusId}--${slug}`;
}

export function validateCapacityEvidence(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["capacity evidence must be an object"];
  if (!text(record.venue_census_id)) errors.push("venue_census_id must be a non-empty string");
  if (!nullableNumber(record.capacity_value)) errors.push("capacity_value must be a number or null");
  if (typeof record.capacity_value === "number" && record.capacity_value <= 0) errors.push("capacity_value must be positive when present");
  if (!CAPACITY_TYPES.has(record.capacity_type)) errors.push(`capacity_type invalid: ${record.capacity_type}`);
  if (!nullableText(record.capacity_configuration)) errors.push("capacity_configuration must be a string or null");
  if (!nullableText(record.capacity_source)) errors.push("capacity_source must be a string or null");
  if (record.capacity_source_authority !== null && !CAPACITY_SOURCE_AUTHORITIES.has(record.capacity_source_authority)) {
    errors.push(`capacity_source_authority invalid: ${record.capacity_source_authority}`);
  }
  if (!nullableText(record.capacity_observed_at)) errors.push("capacity_observed_at must be a string or null");
  if (!CAPACITY_CONFIDENCE.has(record.capacity_confidence)) errors.push(`capacity_confidence invalid: ${record.capacity_confidence}`);
  // The core honesty rule: a real capacity number must carry a real source.
  if (typeof record.capacity_value === "number" && record.capacity_confidence !== "CAPACITY_REVIEW_REQUIRED" && !text(record.capacity_source)) {
    errors.push("a stated capacity_value requires a capacity_source");
  }
  return errors;
}

export function validateCalendarSource(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["calendar source must be an object"];
  if (!text(record.calendar_source_id)) errors.push("calendar_source_id must be a non-empty string");
  if (!text(record.venue_census_id)) errors.push("venue_census_id must be a non-empty string");
  if (!text(record.source_url)) errors.push("source_url must be a non-empty string");
  if (!CALENDAR_SOURCE_TYPES.has(record.source_type)) errors.push(`source_type invalid: ${record.source_type}`);
  if (record.sport !== null && record.sport !== undefined && !SPORTS.has(record.sport)) errors.push(`sport invalid: ${record.sport}`);
  if (!nullableBool(record.first_party)) errors.push("first_party must be a boolean or null");
  if (!nullableBool(record.publicly_accessible)) errors.push("publicly_accessible must be a boolean or null");
  if (!nullableBool(record.events_currently_present)) errors.push("events_currently_present must be a boolean or null");
  if (record.source_family !== null && record.source_family !== undefined && !TECHNICAL_MECHANISMS.has(record.source_family)) {
    errors.push(`source_family invalid: ${record.source_family}`);
  }
  if (!ACQUISITION_READINESS.has(record.acquisition_readiness)) errors.push(`acquisition_readiness invalid: ${record.acquisition_readiness}`);
  if (!nullableText(record.last_checked)) errors.push("last_checked must be a string or null");
  return errors;
}

export function validateVenueCensusRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["venue record must be an object"];
  if (!text(record.venue_census_id)) errors.push("venue_census_id must be a non-empty string");
  if (!text(record.canonical_name)) errors.push("canonical_name must be a non-empty string");
  if (!Array.isArray(record.alternative_names) || !record.alternative_names.every(text)) errors.push("alternative_names must be an array of non-empty strings");
  if (!nullableText(record.parent_complex)) errors.push("parent_complex must be a string or null");
  if (!nullableText(record.operator)) errors.push("operator must be a string or null");
  if (!text(record.city)) errors.push("city must be a non-empty string");
  if (!UK_NATIONS.has(record.nation)) errors.push(`nation invalid: ${record.nation}`);
  if (!nullableText(record.address)) errors.push("address must be a string or null");
  if (!nullableText(record.postcode)) errors.push("postcode must be a string or null");
  if (!nullableNumber(record.latitude)) errors.push("latitude must be a number or null");
  if (!nullableNumber(record.longitude)) errors.push("longitude must be a number or null");
  if (typeof record.latitude === "number" && (record.latitude < -90 || record.latitude > 90)) errors.push("latitude out of range");
  if (typeof record.longitude === "number" && (record.longitude < -180 || record.longitude > 180)) errors.push("longitude out of range");
  if (!nullableText(record.official_url)) errors.push("official_url must be a string or null");
  if (!VENUE_TYPES.has(record.venue_type)) errors.push(`venue_type invalid: ${record.venue_type}`);
  if (!OPERATIONAL_STATUSES.has(record.operational_status)) errors.push(`operational_status invalid: ${record.operational_status}`);
  if (!INCLUSION_BASES.has(record.inclusion_basis)) errors.push(`inclusion_basis invalid: ${record.inclusion_basis}`);
  if (typeof record.identity_review !== "boolean") errors.push("identity_review must be a boolean");
  if (record.identity_review && !text(record.identity_review_reason)) errors.push("identity_review requires identity_review_reason");
  if (!record.provenance || typeof record.provenance !== "object") errors.push("provenance must be an object");
  else {
    if (!text(record.provenance.workstream)) errors.push("provenance.workstream must be a non-empty string");
    if (!Array.isArray(record.provenance.evidence) || record.provenance.evidence.length === 0) errors.push("provenance.evidence must be a non-empty array");
    else record.provenance.evidence.forEach((item, index) => {
      if (!item || typeof item !== "object" || !text(item.kind) || !text(item.value)) errors.push(`provenance.evidence[${index}] requires kind and value`);
    });
  }
  return errors;
}

/** Validate the whole census artifact, including cross-record integrity. */
export function validateCensusArtifact({ venues, calendarSources, capacityEvidence }) {
  const errors = [];
  const seenVenueIds = new Set();
  const seenNameCity = new Set();

  for (const venue of venues ?? []) {
    for (const error of validateVenueCensusRecord(venue)) errors.push(`venue ${venue?.venue_census_id ?? "?"}: ${error}`);
    if (seenVenueIds.has(venue?.venue_census_id)) errors.push(`duplicate venue_census_id: ${venue.venue_census_id}`);
    seenVenueIds.add(venue?.venue_census_id);
    const nameCityKey = `${String(venue?.canonical_name ?? "").toLowerCase().trim()}|${String(venue?.city ?? "").toLowerCase().trim()}`;
    if (seenNameCity.has(nameCityKey)) errors.push(`duplicate venue name+city (possible unmerged duplicate): ${nameCityKey}`);
    seenNameCity.add(nameCityKey);
  }

  const seenCalendarIds = new Set();
  for (const source of calendarSources ?? []) {
    for (const error of validateCalendarSource(source)) errors.push(`calendar ${source?.calendar_source_id ?? "?"}: ${error}`);
    if (seenCalendarIds.has(source?.calendar_source_id)) errors.push(`duplicate calendar_source_id: ${source.calendar_source_id}`);
    seenCalendarIds.add(source?.calendar_source_id);
    if (source?.venue_census_id && !seenVenueIds.has(source.venue_census_id)) {
      errors.push(`calendar ${source.calendar_source_id} references unknown venue ${source.venue_census_id}`);
    }
  }

  const venuesWithCapacityEvidence = new Set();
  const principalCount = new Map();
  for (const evidence of capacityEvidence ?? []) {
    for (const error of validateCapacityEvidence(evidence)) errors.push(`capacity ${evidence?.venue_census_id ?? "?"}: ${error}`);
    if (evidence?.venue_census_id && !seenVenueIds.has(evidence.venue_census_id)) {
      errors.push(`capacity evidence references unknown venue ${evidence.venue_census_id}`);
    }
    venuesWithCapacityEvidence.add(evidence?.venue_census_id);
    if (evidence?.is_principal) principalCount.set(evidence.venue_census_id, (principalCount.get(evidence.venue_census_id) ?? 0) + 1);
  }

  // "Principal" means the one capacity that represents the venue. More than
  // one makes the venue's headline figure a matter of record order, so it is
  // an error rather than a presentational quirk.
  for (const [venueCensusId, count] of principalCount) {
    if (count > 1) errors.push(`venue ${venueCensusId} has ${count} principal capacity records — exactly one may be principal`);
  }

  // Every venue must carry capacity evidence OR declare an explicit
  // non-capacity inclusion basis — a venue may never be in the census
  // with neither a proven capacity nor a stated reason.
  for (const venue of venues ?? []) {
    if (!venuesWithCapacityEvidence.has(venue?.venue_census_id) && venue?.inclusion_basis === "CAPACITY_THRESHOLD_MET") {
      errors.push(`venue ${venue?.venue_census_id} claims CAPACITY_THRESHOLD_MET but has no capacity evidence`);
    }
  }

  return errors;
}
