// UK high-value venue estate census contract
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05).
//
// Defines the durable shape of one high-value venue CENSUS ROW and its
// self-contained structural/business-rule validation.
//
// What this is, and is not
// ------------------------
// This is a DISCOVERY census: it answers "what permanent UK venues of at
// least 1,000 capacity should be in BeatMapped's high-value estate, and
// where would their programme come from?". It is research only.
//
// A census row is NOT:
//   - a canonical venue (see venues/uk.json — this package never writes it);
//   - a Source (see sources/registry.schema.json, docs/SOURCE_REGISTRY.md);
//   - a governed source investigation (see
//     ingestion/source-investigation/contract.mjs and
//     docs/SOURCE_INVESTIGATION_POLICY.md);
//   - an Event or Observation (see docs/OBSERVATION_PIPELINE.md).
//
// Reaching acquisition_readiness "READY_FIRST_PARTY" in a census row
// changes nothing about what BeatMapped collects. Turning a census row
// into an activated source still requires a full governed investigation
// under docs/SOURCE_INVESTIGATION_POLICY.md, then a separate, explicitly
// authorised registry admission. The census narrows WHERE to spend that
// investigation effort; it never substitutes for it.
//
// The honesty rules this module enforces mechanically
// ---------------------------------------------------
// These exist because the two failure modes that actually damage this
// project are (a) an unevidenced number presented as fact, and (b) tool
// exhaustion silently recorded as a negative finding.
//
//   1. A CONFIRMED_1000_PLUS row must carry real capacity evidence and a
//      capacity_max that actually reaches 1,000. A capacity claim with no
//      cited source is rejected outright.
//   2. A NEGATIVE claim (no public calendar found, below threshold) must
//      cite evidence that somebody actually looked.
//   3. A row whose research_status is NOT_YET_RESEARCHED or
//      RESEARCH_BLOCKED may NOT carry any negative claim at all. Absence
//      of research is never evidence of absence — this is the rule the
//      previous package's "2,014 venues have no website" headline broke,
//      and it is enforced here rather than left to discipline.
//   4. A third-party source may never be labelled official. Wikipedia,
//      directories, ticketing sites and aggregators are discovery leads
//      (see "Third-party sources" in docs/SOURCE_INVESTIGATION_POLICY.md).
//   5. A MISSING_FROM_CANON claim must cite identity evidence — asserting
//      a venue is absent from the canonical estate is a claim about the
//      venue's identity, and needs the same support as any other.
//
// Deliberately dependency-free and venue-agnostic, matching
// ingestion/source-investigation/contract.mjs. Performs no I/O and makes
// no network requests. The fs-aware layer lives in ./validate.mjs.

export const CENSUS_FRAMEWORK_VERSION = "BOTM-UK-HIGH-VALUE-VENUE-CENSUS-v1.0";

export const HIGH_VALUE_CAPACITY_THRESHOLD = 1000;

export const VENUE_CLASSES = Object.freeze([
  "ARENA",
  "STADIUM",
  "THEATRE",
  "CONCERT_HALL",
  "CIVIC_HALL",
  "EVENT_HALL",
  "CONFERENCE_CENTRE",
  "CONVENTION_CENTRE",
  "EXHIBITION_CENTRE",
  "MAJOR_HOTEL_EVENT_VENUE",
  "UNIVERSITY_EVENT_VENUE",
  "RACECOURSE",
  "FOOTBALL_GROUND",
  "RUGBY_UNION_GROUND",
  "RUGBY_LEAGUE_GROUND",
  "CRICKET_GROUND",
  "ATHLETICS_STADIUM",
  "MOTORSPORT_VENUE",
  "ICE_HOCKEY_ARENA",
  "BASKETBALL_ARENA",
  "MULTI_SPORT_ARENA",
  "OTHER_PERMANENT_SPECTATOR_SPORT",
  "MULTI_PURPOSE_VENUE",
]);

// Venue classes whose primary public programme is a sporting fixture list.
// Used by the coverage/report layers, and by the readiness cross-check
// below (only a sports venue may claim READY_SPORTS_FIXTURE_SOURCE).
export const SPORTS_VENUE_CLASSES = Object.freeze([
  "STADIUM",
  "RACECOURSE",
  "FOOTBALL_GROUND",
  "RUGBY_UNION_GROUND",
  "RUGBY_LEAGUE_GROUND",
  "CRICKET_GROUND",
  "ATHLETICS_STADIUM",
  "MOTORSPORT_VENUE",
  "ICE_HOCKEY_ARENA",
  "BASKETBALL_ARENA",
  "MULTI_SPORT_ARENA",
  "OTHER_PERMANENT_SPECTATOR_SPORT",
]);

export const CONFERENCE_VENUE_CLASSES = Object.freeze([
  "CONFERENCE_CENTRE",
  "CONVENTION_CENTRE",
  "EXHIBITION_CENTRE",
  "MAJOR_HOTEL_EVENT_VENUE",
  "UNIVERSITY_EVENT_VENUE",
]);

export const NATIONS = Object.freeze([
  "England",
  "Wales",
  "Scotland",
  "Northern Ireland",
  "UNKNOWN",
]);

export const CAPACITY_KINDS = Object.freeze([
  "STANDING",
  "SEATED",
  "FIXED_SEATING",
  "SPECTATOR",
  "DELEGATE",
  "BANQUET",
  "THEATRE_STYLE",
  "EXHIBITION",
  "MULTI_CONFIGURATION",
  "OTHER",
]);

export const CAPACITY_SOURCE_KINDS = Object.freeze([
  "OFFICIAL_VENUE",
  "OFFICIAL_OPERATOR",
  "OFFICIAL_GOVERNING_BODY",
  "OFFICIAL_LEAGUE",
  "OFFICIAL_LOCAL_AUTHORITY",
  "HIGH_QUALITY_THIRD_PARTY",
  "OTHER",
]);

// The subset of CAPACITY_SOURCE_KINDS that assert first-party/official
// authority. Used to enforce honesty rule 4.
export const OFFICIAL_CAPACITY_SOURCE_KINDS = Object.freeze([
  "OFFICIAL_VENUE",
  "OFFICIAL_OPERATOR",
  "OFFICIAL_GOVERNING_BODY",
  "OFFICIAL_LEAGUE",
  "OFFICIAL_LOCAL_AUTHORITY",
]);

export const CAPACITY_CONFIDENCES = Object.freeze([
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNKNOWN",
]);

export const HIGH_VALUE_STATES = Object.freeze([
  "CONFIRMED_1000_PLUS",
  "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
  "BELOW_THRESHOLD",
  "UNRESOLVED",
]);

export const CANONICAL_MATCH_STATES = Object.freeze([
  "EXISTING_CANONICAL",
  "PROBABLE_EXISTING_CANONICAL",
  "MISSING_FROM_CANON",
  "POSSIBLE_DUPLICATE",
  "AMBIGUOUS_IDENTITY",
  "UNASSESSED",
]);

export const CALENDAR_SCOPES = Object.freeze([
  "GENERAL",
  "MUSIC",
  "THEATRE",
  "CONFERENCE",
  "EXHIBITION",
  "SPORT",
  "MULTI",
  "NONE",
  "UNKNOWN",
]);

export const CALENDAR_SOURCE_KINDS = Object.freeze([
  "VENUE",
  "OPERATOR",
  "CLUB",
  "LEAGUE",
  "GOVERNING_BODY",
  "TICKETING",
  "THIRD_PARTY",
  "NONE",
  "UNKNOWN",
]);

// The subset of CALENDAR_SOURCE_KINDS that are first-party to the venue
// or its operator/club/governing body. TICKETING and THIRD_PARTY are not.
export const FIRST_PARTY_CALENDAR_SOURCE_KINDS = Object.freeze([
  "VENUE",
  "OPERATOR",
  "CLUB",
  "LEAGUE",
  "GOVERNING_BODY",
]);

export const CALENDAR_STATES = Object.freeze([
  "HAS_PUBLIC_EVENT_CALENDAR",
  "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
  "PRIVATE_BOOKINGS_ONLY",
  "NO_PUBLIC_CALENDAR_FOUND",
  "CALENDAR_ACCESS_RESTRICTED",
  "UNKNOWN",
]);

export const POSITIVE_CALENDAR_STATES = Object.freeze([
  "HAS_PUBLIC_EVENT_CALENDAR",
  "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
]);

export const ACQUISITION_SHAPES = Object.freeze([
  "SERVER_RENDERED_HTML",
  "JSON_LD",
  "PUBLIC_JSON_API",
  "GRAPHQL",
  "WORDPRESS_REST",
  "EMBEDDED_WIDGET",
  "CLIENT_RENDERED",
  "IFRAME",
  "TICKETING_STOREFRONT",
  "DOWNLOADABLE_FIXTURE_FILE",
  "ICS",
  "ACCESS_RESTRICTED",
  "UNKNOWN",
]);

export const ACQUISITION_READINESS_STATES = Object.freeze([
  "READY_FIRST_PARTY",
  "READY_OPERATOR_LEVEL",
  "READY_SPORTS_FIXTURE_SOURCE",
  "READY_THIRD_PARTY_ONLY",
  "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
  "PUBLIC_CALENDAR_NOT_FOUND",
  "ACCESS_RESTRICTED",
  "IDENTITY_OR_CAPACITY_REVIEW",
  "NOT_YET_RESEARCHED",
]);

// Readiness states that assert a usable programme source was actually
// found. Each one is a positive claim and is cross-checked below.
export const READY_STATES = Object.freeze([
  "READY_FIRST_PARTY",
  "READY_OPERATOR_LEVEL",
  "READY_SPORTS_FIXTURE_SOURCE",
  "READY_THIRD_PARTY_ONLY",
  "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
]);

export const RESEARCH_STATUSES = Object.freeze([
  "COMPLETE",
  "NOT_YET_RESEARCHED",
  "RESEARCH_BLOCKED",
  "REVIEW_REQUIRED",
]);

// Research statuses that mean "we have not actually established anything
// about this venue yet". Honesty rule 3: these may never carry a negative
// claim.
export const UNRESEARCHED_STATUSES = Object.freeze([
  "NOT_YET_RESEARCHED",
  "RESEARCH_BLOCKED",
]);

// Claims that assert a negative about the world. Each one requires
// evidence that somebody actually looked.
export const NEGATIVE_CALENDAR_STATES = Object.freeze([
  "NO_PUBLIC_CALENDAR_FOUND",
  "PRIVATE_BOOKINGS_ONLY",
]);

export const EVIDENCE_KINDS = Object.freeze([
  "FETCHED_URL",
  "SEARCH_RESULT",
  "COMMITTED_RESEARCH_ARTIFACT",
  "CANONICAL_REGISTRY",
  "DETERMINISTIC_DERIVATION",
]);

const RESEARCH_ID_PATTERN = /^hv05-[a-z0-9-]+$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Validate one evidence array, appending to `errors`.
 * Evidence is the backbone of every honesty rule in this module, so its
 * shape is checked strictly: a malformed evidence item must not be able
 * to satisfy an evidence requirement it does not really meet.
 */
function validateEvidenceArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    const where = `${label}[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (!isValidUrl(item.url)) {
      errors.push(`${where}.url must be an http(s) URL`);
    }
    if (!EVIDENCE_KINDS.includes(item.kind)) {
      errors.push(`${where}.kind "${item.kind}" is not a known evidence kind`);
    }
    if (!isNonEmptyString(item.note)) {
      errors.push(
        `${where}.note must be a non-empty string saying what this evidence actually showed`,
      );
    }
  });
}

const REQUIRED_KEYS = Object.freeze([
  "research_id",
  "canonical_venue_id",
  "canonical_match_state",
  "name",
  "aliases",
  "venue_class",
  "locality",
  "nation",
  "postcode",
  "operator_name",
  "capacity_max",
  "capacity_kind",
  "capacity_context",
  "capacity_source_url",
  "capacity_source_kind",
  "capacity_confidence",
  "high_value_state",
  "official_website_url",
  "general_programme_url",
  "conference_calendar_url",
  "sports_calendar_url",
  "ticketing_url",
  "calendar_scope",
  "calendar_source_kind",
  "calendar_state",
  "platform_family",
  "platform_evidence",
  "acquisition_shape",
  "acquisition_readiness",
  "identity_evidence",
  "capacity_evidence",
  "calendar_evidence",
  "research_status",
  "notes",
]);

const URL_KEYS = Object.freeze([
  "capacity_source_url",
  "official_website_url",
  "general_programme_url",
  "conference_calendar_url",
  "sports_calendar_url",
  "ticketing_url",
]);

const NULLABLE_TEXT_KEYS = Object.freeze([
  "locality",
  "postcode",
  "operator_name",
  "capacity_context",
  "platform_family",
  "platform_evidence",
]);

/**
 * Validate one high-value venue census row.
 *
 * Returns an array of human-readable error strings; an empty array means
 * the row is valid. Never throws on malformed input and never performs
 * I/O — a caller can safely run this over untrusted researcher output.
 */
export function validateCensusRow(row) {
  const errors = [];

  if (!isPlainObject(row)) {
    return ["census row must be an object"];
  }

  for (const key of REQUIRED_KEYS) {
    if (!hasOwn(row, key)) {
      errors.push(`missing required key "${key}"`);
    }
  }
  // A row missing structural keys cannot be meaningfully cross-checked;
  // report the missing keys rather than an avalanche of derived errors.
  if (errors.length > 0) return errors;

  // --- identity ------------------------------------------------------
  if (!isNonEmptyString(row.research_id)) {
    errors.push("research_id must be a non-empty string");
  } else if (!RESEARCH_ID_PATTERN.test(row.research_id)) {
    errors.push(
      `research_id "${row.research_id}" must match ${RESEARCH_ID_PATTERN}`,
    );
  }

  if (!isNonEmptyString(row.name)) {
    errors.push("name must be a non-empty string");
  }

  if (!Array.isArray(row.aliases)) {
    errors.push("aliases must be an array");
  } else if (row.aliases.some((alias) => !isNonEmptyString(alias))) {
    errors.push("aliases entries must be non-empty strings");
  }

  if (!VENUE_CLASSES.includes(row.venue_class)) {
    errors.push(`venue_class "${row.venue_class}" is not a known venue class`);
  }

  if (!NATIONS.includes(row.nation)) {
    errors.push(`nation "${row.nation}" is not a known nation value`);
  }

  if (!CANONICAL_MATCH_STATES.includes(row.canonical_match_state)) {
    errors.push(
      `canonical_match_state "${row.canonical_match_state}" is not a known state`,
    );
  }

  if (
    row.canonical_venue_id !== null &&
    !isNonEmptyString(row.canonical_venue_id)
  ) {
    errors.push("canonical_venue_id must be a non-empty string or null");
  }

  // --- controlled vocabularies (nullable ones allow null) ------------
  if (row.capacity_kind !== null && !CAPACITY_KINDS.includes(row.capacity_kind)) {
    errors.push(`capacity_kind "${row.capacity_kind}" is not a known capacity kind`);
  }
  if (
    row.capacity_source_kind !== null &&
    !CAPACITY_SOURCE_KINDS.includes(row.capacity_source_kind)
  ) {
    errors.push(
      `capacity_source_kind "${row.capacity_source_kind}" is not a known capacity source kind`,
    );
  }
  if (!CAPACITY_CONFIDENCES.includes(row.capacity_confidence)) {
    errors.push(
      `capacity_confidence "${row.capacity_confidence}" is not a known confidence`,
    );
  }
  if (!HIGH_VALUE_STATES.includes(row.high_value_state)) {
    errors.push(`high_value_state "${row.high_value_state}" is not a known state`);
  }
  if (!CALENDAR_SCOPES.includes(row.calendar_scope)) {
    errors.push(`calendar_scope "${row.calendar_scope}" is not a known scope`);
  }
  if (!CALENDAR_SOURCE_KINDS.includes(row.calendar_source_kind)) {
    errors.push(
      `calendar_source_kind "${row.calendar_source_kind}" is not a known source kind`,
    );
  }
  if (!CALENDAR_STATES.includes(row.calendar_state)) {
    errors.push(`calendar_state "${row.calendar_state}" is not a known calendar state`);
  }
  if (
    row.acquisition_shape !== null &&
    !ACQUISITION_SHAPES.includes(row.acquisition_shape)
  ) {
    errors.push(
      `acquisition_shape "${row.acquisition_shape}" is not a known acquisition shape`,
    );
  }
  if (!ACQUISITION_READINESS_STATES.includes(row.acquisition_readiness)) {
    errors.push(
      `acquisition_readiness "${row.acquisition_readiness}" is not a known readiness state`,
    );
  }
  if (!RESEARCH_STATUSES.includes(row.research_status)) {
    errors.push(`research_status "${row.research_status}" is not a known status`);
  }

  // --- nullable free text --------------------------------------------
  for (const key of NULLABLE_TEXT_KEYS) {
    if (row[key] !== null && !isNonEmptyString(row[key])) {
      errors.push(`${key} must be a non-empty string or null`);
    }
  }
  if (typeof row.notes !== "string") {
    errors.push("notes must be a string");
  }

  // --- URLs ------------------------------------------------------------
  for (const key of URL_KEYS) {
    if (row[key] !== null && !isValidUrl(row[key])) {
      errors.push(`${key} must be an http(s) URL or null`);
    }
  }

  // --- capacity --------------------------------------------------------
  if (
    typeof row.capacity_max !== "number" ||
    !Number.isInteger(row.capacity_max) ||
    row.capacity_max < 0
  ) {
    errors.push("capacity_max must be a non-negative integer");
  }

  // --- evidence --------------------------------------------------------
  validateEvidenceArray(row.identity_evidence, "identity_evidence", errors);
  validateEvidenceArray(row.capacity_evidence, "capacity_evidence", errors);
  validateEvidenceArray(row.calendar_evidence, "calendar_evidence", errors);

  // Structural problems above make the cross-checks below meaningless.
  if (errors.length > 0) return errors;

  const identityEvidence = row.identity_evidence;
  const capacityEvidence = row.capacity_evidence;
  const calendarEvidence = row.calendar_evidence;
  const unresearched = UNRESEARCHED_STATUSES.includes(row.research_status);

  // Every row asserts that a venue exists. That is itself a claim.
  if (identityEvidence.length === 0) {
    errors.push(
      "identity_evidence must be non-empty — asserting a venue exists is a claim that needs support",
    );
  }

  // Honesty rule 1: a confirmed high-value venue needs a real, cited
  // capacity that actually reaches the threshold.
  if (row.high_value_state === "CONFIRMED_1000_PLUS") {
    if (capacityEvidence.length === 0) {
      errors.push(
        "high_value_state CONFIRMED_1000_PLUS requires non-empty capacity_evidence",
      );
    }
    if (row.capacity_source_url === null) {
      errors.push("high_value_state CONFIRMED_1000_PLUS requires a capacity_source_url");
    }
    if (row.capacity_source_kind === null) {
      errors.push("high_value_state CONFIRMED_1000_PLUS requires a capacity_source_kind");
    }
    if (row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(
        `high_value_state CONFIRMED_1000_PLUS requires capacity_max >= ${HIGH_VALUE_CAPACITY_THRESHOLD} (got ${row.capacity_max})`,
      );
    }
    if (row.capacity_confidence === "UNKNOWN") {
      errors.push(
        "high_value_state CONFIRMED_1000_PLUS cannot carry capacity_confidence UNKNOWN",
      );
    }
  }

  // Honesty rule 2 (negative capacity claim): calling a venue below the
  // threshold is a finding, not a default.
  if (row.high_value_state === "BELOW_THRESHOLD") {
    if (capacityEvidence.length === 0) {
      errors.push(
        "high_value_state BELOW_THRESHOLD is a negative claim and requires non-empty capacity_evidence",
      );
    }
    if (row.capacity_max >= HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(
        `high_value_state BELOW_THRESHOLD contradicts capacity_max ${row.capacity_max}`,
      );
    }
  }

  // A capacity number with no source is exactly the kind of unevidenced
  // figure this census exists to avoid.
  if (row.capacity_max > 0 && capacityEvidence.length === 0) {
    errors.push(`capacity_max ${row.capacity_max} is claimed with no capacity_evidence`);
  }
  if (row.capacity_max > 0 && row.capacity_source_url === null) {
    errors.push(`capacity_max ${row.capacity_max} is claimed with no capacity_source_url`);
  }
  // Inverse: a source described for a capacity that was never
  // established is a description of nothing.
  if (row.capacity_max === 0 && row.capacity_source_url !== null) {
    errors.push(
      "capacity_source_url is set but capacity_max is 0 — an unestablished capacity cannot have a source",
    );
  }

  // Honesty rule 4: a third-party lead may never be dressed as official.
  if (
    OFFICIAL_CAPACITY_SOURCE_KINDS.includes(row.capacity_source_kind) &&
    capacityEvidence.length === 0
  ) {
    errors.push(
      `capacity_source_kind "${row.capacity_source_kind}" claims official authority with no capacity_evidence`,
    );
  }

  // Honesty rule 2 (negative calendar claim).
  if (
    NEGATIVE_CALENDAR_STATES.includes(row.calendar_state) &&
    calendarEvidence.length === 0
  ) {
    errors.push(
      `calendar_state "${row.calendar_state}" is a negative claim and requires non-empty calendar_evidence`,
    );
  }
  if (
    row.acquisition_readiness === "PUBLIC_CALENDAR_NOT_FOUND" &&
    calendarEvidence.length === 0
  ) {
    errors.push(
      "acquisition_readiness PUBLIC_CALENDAR_NOT_FOUND is a negative claim and requires non-empty calendar_evidence",
    );
  }

  // Honesty rule 3: absence of research is never evidence of absence.
  if (unresearched) {
    if (NEGATIVE_CALENDAR_STATES.includes(row.calendar_state)) {
      errors.push(
        `research_status ${row.research_status} cannot carry negative calendar_state "${row.calendar_state}" — absence of research is not evidence of absence`,
      );
    }
    if (row.high_value_state === "BELOW_THRESHOLD") {
      errors.push(
        `research_status ${row.research_status} cannot carry high_value_state BELOW_THRESHOLD — absence of research is not evidence of absence`,
      );
    }
    if (row.acquisition_readiness === "PUBLIC_CALENDAR_NOT_FOUND") {
      errors.push(
        `research_status ${row.research_status} cannot carry acquisition_readiness PUBLIC_CALENDAR_NOT_FOUND — absence of research is not evidence of absence`,
      );
    }
    if (row.canonical_match_state === "MISSING_FROM_CANON") {
      errors.push(
        `research_status ${row.research_status} cannot assert MISSING_FROM_CANON — the venue's identity was never established`,
      );
    }
  }

  // Honesty rule 5: claiming a venue is absent from canon is an identity
  // claim about that venue.
  if (
    row.canonical_match_state === "MISSING_FROM_CANON" &&
    identityEvidence.length === 0
  ) {
    errors.push(
      "canonical_match_state MISSING_FROM_CANON requires non-empty identity_evidence",
    );
  }
  // A matched row must name the canonical venue it matched, and an
  // unmatched row must not pretend to.
  if (
    (row.canonical_match_state === "EXISTING_CANONICAL" ||
      row.canonical_match_state === "PROBABLE_EXISTING_CANONICAL") &&
    row.canonical_venue_id === null
  ) {
    errors.push(
      `canonical_match_state ${row.canonical_match_state} requires a canonical_venue_id`,
    );
  }
  if (
    row.canonical_match_state === "MISSING_FROM_CANON" &&
    row.canonical_venue_id !== null
  ) {
    errors.push("canonical_match_state MISSING_FROM_CANON cannot carry a canonical_venue_id");
  }

  // --- calendar / readiness coherence ----------------------------------
  // A positive calendar state must actually point at a calendar, and must
  // cite the evidence that it was seen.
  if (POSITIVE_CALENDAR_STATES.includes(row.calendar_state)) {
    if (calendarEvidence.length === 0) {
      errors.push(
        `calendar_state "${row.calendar_state}" requires non-empty calendar_evidence`,
      );
    }
    const anyCalendarUrl =
      row.general_programme_url !== null ||
      row.conference_calendar_url !== null ||
      row.sports_calendar_url !== null ||
      row.ticketing_url !== null;
    if (!anyCalendarUrl) {
      errors.push(
        `calendar_state "${row.calendar_state}" claims a calendar exists but no calendar URL is recorded`,
      );
    }
    if (row.calendar_scope === "NONE") {
      errors.push(`calendar_state "${row.calendar_state}" contradicts calendar_scope NONE`);
    }
  }

  // A "ready" readiness state is a claim that a usable source was found.
  if (READY_STATES.includes(row.acquisition_readiness)) {
    const anySourceUrl =
      row.general_programme_url !== null ||
      row.conference_calendar_url !== null ||
      row.sports_calendar_url !== null ||
      row.ticketing_url !== null;
    if (!anySourceUrl) {
      errors.push(
        `acquisition_readiness "${row.acquisition_readiness}" claims a usable source but records no source URL`,
      );
    }
    if (calendarEvidence.length === 0) {
      errors.push(
        `acquisition_readiness "${row.acquisition_readiness}" claims a usable source but cites no calendar_evidence`,
      );
    }
    if (unresearched) {
      errors.push(
        `research_status ${row.research_status} cannot carry acquisition_readiness "${row.acquisition_readiness}"`,
      );
    }
  }

  // Honesty rule 4, calendar side: a first-party readiness claim may not
  // rest on a third-party or ticketing source.
  if (
    (row.acquisition_readiness === "READY_FIRST_PARTY" ||
      row.acquisition_readiness === "READY_OPERATOR_LEVEL") &&
    !FIRST_PARTY_CALENDAR_SOURCE_KINDS.includes(row.calendar_source_kind)
  ) {
    errors.push(
      `acquisition_readiness "${row.acquisition_readiness}" requires a first-party calendar_source_kind (got "${row.calendar_source_kind}")`,
    );
  }
  if (
    row.acquisition_readiness === "READY_THIRD_PARTY_ONLY" &&
    FIRST_PARTY_CALENDAR_SOURCE_KINDS.includes(row.calendar_source_kind)
  ) {
    errors.push(
      `acquisition_readiness READY_THIRD_PARTY_ONLY contradicts first-party calendar_source_kind "${row.calendar_source_kind}"`,
    );
  }
  if (
    row.acquisition_readiness === "READY_SPORTS_FIXTURE_SOURCE" &&
    !SPORTS_VENUE_CLASSES.includes(row.venue_class)
  ) {
    errors.push(
      `acquisition_readiness READY_SPORTS_FIXTURE_SOURCE is not valid for venue_class "${row.venue_class}"`,
    );
  }
  if (
    row.acquisition_readiness === "ACCESS_RESTRICTED" &&
    row.calendar_state !== "CALENDAR_ACCESS_RESTRICTED" &&
    row.acquisition_shape !== "ACCESS_RESTRICTED"
  ) {
    errors.push(
      "acquisition_readiness ACCESS_RESTRICTED must be reflected in calendar_state or acquisition_shape",
    );
  }

  // A platform_family asserted with nothing behind it is a guess. The
  // policy is explicit that UNKNOWN is a valid, respected answer.
  if (row.platform_family !== null && row.platform_evidence === null) {
    errors.push(
      `platform_family "${row.platform_family}" is claimed with no platform_evidence — do not guess platform family, use null`,
    );
  }

  return errors;
}

/**
 * Validate a whole census: every row, plus the cross-row invariants a
 * single row cannot see (today: research_id uniqueness).
 * Returns an array of human-readable error strings.
 */
export function validateCensus(rows) {
  if (!Array.isArray(rows)) return ["census must be an array of rows"];

  const errors = [];
  const seen = new Map();

  rows.forEach((row, index) => {
    for (const error of validateCensusRow(row)) {
      errors.push(`row[${index}] (${row?.research_id ?? "no id"}): ${error}`);
    }
    const id = row?.research_id;
    if (isNonEmptyString(id)) {
      if (seen.has(id)) {
        errors.push(`duplicate research_id "${id}" at rows ${seen.get(id)} and ${index}`);
      } else {
        seen.set(id, index);
      }
    }
  });

  return errors;
}
