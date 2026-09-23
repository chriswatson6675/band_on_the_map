// UK high-value venue estate census — completion corpus contract
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06).
//
// Package 05 (research/high-value-venue-estate/uk-1000plus-05/) produced a
// working national estate but terminated UK_HIGH_VALUE_VENUE_CENSUS_PARTIAL
// because material research coverage was incomplete. This package closes
// those gaps and produces a superseding corpus.
//
// Package 05 is an IMMUTABLE PREDECESSOR SNAPSHOT. This module and its
// builder read it and never write to it.
//
// WHAT CHANGED FROM 05
// --------------------
// 1. Capacity state and PERMANENCE are now separate axes. Package 05 counted
//    ten open-air sites (public parks, a castle esplanade, bandstands) inside
//    its confirmed total and flagged them for review. "Permanent venue" is
//    part of the inclusion rule, so it is now a first-class, evidenced field
//    rather than a caveat attached to a number.
// 2. capacity_state gains CONFIRMED_BELOW_THRESHOLD, NOT_A_PERMANENT_VENUE,
//    IDENTITY_REVIEW and RESEARCH_BLOCKED as explicit terminal dispositions,
//    so every row has a disposition and nothing sits in an implied residue.
// 3. Every row carries predecessor_research_id, so the corpus can prove that
//    each of Package 05's rows was carried forward, resolved or superseded —
//    never silently dropped.
//
// The honesty rules from Package 05's contract are retained in full and
// extended; see ingestion/high-value-venue-census/contract.mjs for the
// predecessor. The two failure modes this guards against are unchanged:
// an unevidenced number presented as fact, and tool exhaustion recorded as
// a negative finding.
//
// Dependency-free, venue-agnostic, no I/O, no network.

export const CENSUS_06_FRAMEWORK_VERSION = "BOTM-UK-HIGH-VALUE-VENUE-CENSUS-v2.0";

export const PREDECESSOR_PACKAGE = "BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05";
export const PREDECESSOR_MAIN_SHA = "2d5d43b8ea78f9e47d01e039af4f8a612105cb9e";
export const PREDECESSOR_CENSUS_DIR = "research/high-value-venue-estate/uk-1000plus-05";

export const HIGH_VALUE_CAPACITY_THRESHOLD = 1000;

// --- capacity / disposition -------------------------------------------
// Every row resolves to exactly one of these. There is no implied residue.
export const CAPACITY_STATES = Object.freeze([
  "CONFIRMED_1000_PLUS",
  "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
  "CONFIRMED_BELOW_THRESHOLD",
  "NOT_A_PERMANENT_VENUE",
  "IDENTITY_REVIEW",
  "RESEARCH_BLOCKED",
]);

// The states that constitute the high-value estate. A venue excluded for
// permanence, proven below threshold, or unresolved for identity is NOT
// part of it — but its row is retained as audit evidence.
export const HIGH_VALUE_STATES = Object.freeze([
  "CONFIRMED_1000_PLUS",
  "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
]);

// --- permanence --------------------------------------------------------
// The inclusion rule says PERMANENT venue. These record what a row actually
// is, on evidence.
export const PERMANENCE_CLASSES = Object.freeze([
  "PERMANENT_PURPOSE_BUILT_VENUE",
  "PERMANENT_RECURRING_EVENT_VENUE",
  "PERMANENT_SPORTING_GROUND",
  "OPEN_AIR_SITE_WITH_STABLE_VENUE_IDENTITY",
  "TEMPORARY_EVENT_SITE",
  "PUBLIC_SPACE_NOT_A_VENUE",
  "AMBIGUOUS",
]);

// Permanence classes compatible with membership of the high-value estate.
// An open-air site with its own stable venue identity, fixed infrastructure
// and a recurring programme is a legitimate permanent venue. A public space
// that merely hosts occasional temporary events is not.
export const PERMANENT_CLASSES = Object.freeze([
  "PERMANENT_PURPOSE_BUILT_VENUE",
  "PERMANENT_RECURRING_EVENT_VENUE",
  "PERMANENT_SPORTING_GROUND",
  "OPEN_AIR_SITE_WITH_STABLE_VENUE_IDENTITY",
]);

export const NON_PERMANENT_CLASSES = Object.freeze([
  "TEMPORARY_EVENT_SITE",
  "PUBLIC_SPACE_NOT_A_VENUE",
]);

// --- carried vocabularies (unchanged from Package 05) -------------------
export const VENUE_CLASSES = Object.freeze([
  "ARENA", "STADIUM", "THEATRE", "CONCERT_HALL", "CIVIC_HALL", "EVENT_HALL",
  "CONFERENCE_CENTRE", "CONVENTION_CENTRE", "EXHIBITION_CENTRE",
  "MAJOR_HOTEL_EVENT_VENUE", "UNIVERSITY_EVENT_VENUE", "RACECOURSE",
  "FOOTBALL_GROUND", "RUGBY_UNION_GROUND", "RUGBY_LEAGUE_GROUND",
  "CRICKET_GROUND", "ATHLETICS_STADIUM", "MOTORSPORT_VENUE",
  "ICE_HOCKEY_ARENA", "BASKETBALL_ARENA", "MULTI_SPORT_ARENA",
  "OTHER_PERMANENT_SPECTATOR_SPORT", "MULTI_PURPOSE_VENUE",
]);

export const SPORTS_VENUE_CLASSES = Object.freeze([
  "STADIUM", "RACECOURSE", "FOOTBALL_GROUND", "RUGBY_UNION_GROUND",
  "RUGBY_LEAGUE_GROUND", "CRICKET_GROUND", "ATHLETICS_STADIUM",
  "MOTORSPORT_VENUE", "ICE_HOCKEY_ARENA", "BASKETBALL_ARENA",
  "MULTI_SPORT_ARENA", "OTHER_PERMANENT_SPECTATOR_SPORT",
]);

export const CONFERENCE_VENUE_CLASSES = Object.freeze([
  "CONFERENCE_CENTRE", "CONVENTION_CENTRE", "EXHIBITION_CENTRE",
  "MAJOR_HOTEL_EVENT_VENUE", "UNIVERSITY_EVENT_VENUE",
]);

// Every venue class belongs to exactly one strategic segment. Checked by a
// test, so a new class cannot silently fall outside the cross-tabs.
export const ARTS_VENUE_CLASSES = Object.freeze([
  "ARENA", "THEATRE", "CONCERT_HALL", "CIVIC_HALL", "EVENT_HALL",
  "MULTI_PURPOSE_VENUE",
]);

export const STRATEGIC_SEGMENTS = Object.freeze([
  "ARTS_MUSIC_GENERAL",
  "SPORT",
  "CONFERENCE_EXHIBITION",
]);

export function segmentFor(venueClass) {
  if (SPORTS_VENUE_CLASSES.includes(venueClass)) return "SPORT";
  if (CONFERENCE_VENUE_CLASSES.includes(venueClass)) return "CONFERENCE_EXHIBITION";
  if (ARTS_VENUE_CLASSES.includes(venueClass)) return "ARTS_MUSIC_GENERAL";
  return null;
}

export const NATIONS = Object.freeze([
  "England", "Wales", "Scotland", "Northern Ireland", "UNKNOWN",
]);

export const CAPACITY_KINDS = Object.freeze([
  "STANDING", "SEATED", "FIXED_SEATING", "SPECTATOR", "DELEGATE", "BANQUET",
  "THEATRE_STYLE", "EXHIBITION", "MULTI_CONFIGURATION", "OTHER",
]);

export const CAPACITY_SOURCE_KINDS = Object.freeze([
  "OFFICIAL_VENUE", "OFFICIAL_OPERATOR", "OFFICIAL_GOVERNING_BODY",
  "OFFICIAL_LEAGUE", "OFFICIAL_LOCAL_AUTHORITY", "HIGH_QUALITY_THIRD_PARTY",
  "OTHER",
]);

export const OFFICIAL_CAPACITY_SOURCE_KINDS = Object.freeze([
  "OFFICIAL_VENUE", "OFFICIAL_OPERATOR", "OFFICIAL_GOVERNING_BODY",
  "OFFICIAL_LEAGUE", "OFFICIAL_LOCAL_AUTHORITY",
]);

export const CAPACITY_CONFIDENCES = Object.freeze(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);

export const CANONICAL_MATCH_STATES = Object.freeze([
  "EXISTING_CANONICAL",
  "PROBABLE_EXISTING_CANONICAL",
  "MISSING_FROM_CANON",
  "POSSIBLE_DUPLICATE",
  "AMBIGUOUS_IDENTITY",
  "UNASSESSED",
]);

// Canonical match states that mean "BeatMapped already knows this venue".
export const IN_CANON_STATES = Object.freeze([
  "EXISTING_CANONICAL",
  "PROBABLE_EXISTING_CANONICAL",
]);

export const CALENDAR_SCOPES = Object.freeze([
  "GENERAL", "MUSIC", "THEATRE", "CONFERENCE", "EXHIBITION", "SPORT",
  "MULTI", "NONE", "UNKNOWN",
]);

export const CALENDAR_SOURCE_KINDS = Object.freeze([
  "VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY", "TICKETING",
  "THIRD_PARTY", "NONE", "UNKNOWN",
]);

export const FIRST_PARTY_CALENDAR_SOURCE_KINDS = Object.freeze([
  "VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY",
]);

export const CALENDAR_STATES = Object.freeze([
  "HAS_PUBLIC_EVENT_CALENDAR", "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
  "PRIVATE_BOOKINGS_ONLY", "NO_PUBLIC_CALENDAR_FOUND",
  "CALENDAR_ACCESS_RESTRICTED", "UNKNOWN",
]);

export const POSITIVE_CALENDAR_STATES = Object.freeze([
  "HAS_PUBLIC_EVENT_CALENDAR", "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
]);

export const NEGATIVE_CALENDAR_STATES = Object.freeze([
  "NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY",
]);

export const ACQUISITION_SHAPES = Object.freeze([
  "SERVER_RENDERED_HTML", "JSON_LD", "PUBLIC_JSON_API", "GRAPHQL",
  "WORDPRESS_REST", "EMBEDDED_WIDGET", "CLIENT_RENDERED", "IFRAME",
  "TICKETING_STOREFRONT", "DOWNLOADABLE_FIXTURE_FILE", "ICS",
  "ACCESS_RESTRICTED", "UNKNOWN",
]);

export const EVIDENCE_KINDS = Object.freeze([
  "FETCHED_URL", "SEARCH_RESULT", "COMMITTED_RESEARCH_ARTIFACT",
  "CANONICAL_REGISTRY", "DETERMINISTIC_DERIVATION", "PREDECESSOR_CENSUS",
]);

// --- coverage ----------------------------------------------------------
export const PREDECESSOR_COVERAGE_STATES = Object.freeze([
  "FULL", "PARTIAL", "CARRIED", "UNRESEARCHED",
]);

export const FINAL_COVERAGE_STATES = Object.freeze([
  "COMPLETE", "MATERIAL_COMPLETE", "PARTIAL", "BLOCKED",
]);

// Coverage states that permit an overall COMPLETE verdict. MATERIAL_COMPLETE
// is deliberately included: it means every nationally material discoverable
// source estate for that class was checked and the residual gap is bounded.
export const COMPLETE_ENOUGH_COVERAGE_STATES = Object.freeze([
  "COMPLETE", "MATERIAL_COMPLETE",
]);

// Phrases indicating the CLAIMED FIGURE is one the venue was intended to
// reach, rather than one it has. Deliberately phrase-based and applied to
// the capacity EVIDENCE note, not the free-text context: a context that
// merely mentions a future extension alongside a valid current figure
// must not be caught, while a figure whose own source says "plan for the
// venue to have" must be.
//
// "record attendance" is deliberately absent: a record attendance is
// genuine evidence the venue held that many at least once, which is a
// legitimate floor for a capacity claim. A plan is not.
export const PROSPECTIVE_CAPACITY_LANGUAGE =
  /(plan(?:s|ned)?\s+for\s+the\s+venue|planned\s+capacity|proposed\s+capacity|projected\s+capacity|intended\s+capacity|will\s+have\s+a\s+capacity|due\s+to\s+have|upon\s+completion|once\s+complete)/i;

const RESEARCH_ID_PATTERN = /^hv06-[a-z0-9-]+$/;
const PREDECESSOR_ID_PATTERN = /^hv05-[a-z0-9-]+$/;

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
    if (!isValidUrl(item.url)) errors.push(`${where}.url must be an http(s) URL`);
    if (!EVIDENCE_KINDS.includes(item.kind)) {
      errors.push(`${where}.kind "${item.kind}" is not a known evidence kind`);
    }
    if (!isNonEmptyString(item.note)) {
      errors.push(`${where}.note must be a non-empty string saying what this evidence actually showed`);
    }
  });
}

const REQUIRED_KEYS = Object.freeze([
  "research_id", "predecessor_research_id", "canonical_venue_id",
  "canonical_match_state", "name", "aliases", "venue_class", "locality",
  "nation", "postcode", "operator_name", "capacity_max", "capacity_kind",
  "capacity_context", "capacity_source_url", "capacity_source_kind",
  "capacity_confidence", "capacity_state", "permanence_class",
  "official_website_url", "general_programme_url", "conference_calendar_url",
  "sports_calendar_url", "ticketing_url", "calendar_scope",
  "calendar_source_kind", "calendar_state", "platform_family",
  "platform_evidence", "acquisition_shape", "identity_evidence",
  "capacity_evidence", "calendar_evidence", "permanence_evidence",
  "provenance", "notes",
]);

const URL_KEYS = Object.freeze([
  "capacity_source_url", "official_website_url", "general_programme_url",
  "conference_calendar_url", "sports_calendar_url", "ticketing_url",
]);

const NULLABLE_TEXT_KEYS = Object.freeze([
  "locality", "postcode", "operator_name", "capacity_context",
  "platform_family", "platform_evidence",
]);

export const PROVENANCE_VALUES = Object.freeze([
  "PREDECESSOR_CARRIED_UNCHANGED",
  "PREDECESSOR_RESOLVED_BY_06",
  "PACKAGE_06_NEW_RESEARCH",
]);

/**
 * Validate one Package 06 census row.
 * Returns human-readable error strings; empty means valid. Never throws and
 * never performs I/O, so it can be run over untrusted researcher output.
 */
export function validateCensus06Row(row) {
  const errors = [];
  if (!isPlainObject(row)) return ["census row must be an object"];

  for (const key of REQUIRED_KEYS) {
    if (!hasOwn(row, key)) errors.push(`missing required key "${key}"`);
  }
  if (errors.length > 0) return errors;

  // --- identity --------------------------------------------------------
  if (!isNonEmptyString(row.research_id)) {
    errors.push("research_id must be a non-empty string");
  } else if (!RESEARCH_ID_PATTERN.test(row.research_id)) {
    errors.push(`research_id "${row.research_id}" must match ${RESEARCH_ID_PATTERN}`);
  }
  if (row.predecessor_research_id !== null) {
    if (!isNonEmptyString(row.predecessor_research_id)) {
      errors.push("predecessor_research_id must be a non-empty string or null");
    } else if (!PREDECESSOR_ID_PATTERN.test(row.predecessor_research_id)) {
      errors.push(
        `predecessor_research_id "${row.predecessor_research_id}" must match ${PREDECESSOR_ID_PATTERN}`,
      );
    }
  }
  if (!isNonEmptyString(row.name)) errors.push("name must be a non-empty string");
  if (!Array.isArray(row.aliases)) {
    errors.push("aliases must be an array");
  } else if (row.aliases.some((a) => !isNonEmptyString(a))) {
    errors.push("aliases entries must be non-empty strings");
  }

  // --- controlled vocabularies ------------------------------------------
  if (!VENUE_CLASSES.includes(row.venue_class)) {
    errors.push(`venue_class "${row.venue_class}" is not a known venue class`);
  }
  if (!NATIONS.includes(row.nation)) {
    errors.push(`nation "${row.nation}" is not a known nation value`);
  }
  if (!CANONICAL_MATCH_STATES.includes(row.canonical_match_state)) {
    errors.push(`canonical_match_state "${row.canonical_match_state}" is not a known state`);
  }
  if (!CAPACITY_STATES.includes(row.capacity_state)) {
    errors.push(`capacity_state "${row.capacity_state}" is not a known state`);
  }
  if (row.permanence_class !== null && !PERMANENCE_CLASSES.includes(row.permanence_class)) {
    errors.push(`permanence_class "${row.permanence_class}" is not a known permanence class`);
  }
  if (!PROVENANCE_VALUES.includes(row.provenance)) {
    errors.push(`provenance "${row.provenance}" is not a known provenance value`);
  }
  if (row.capacity_kind !== null && !CAPACITY_KINDS.includes(row.capacity_kind)) {
    errors.push(`capacity_kind "${row.capacity_kind}" is not a known capacity kind`);
  }
  if (row.capacity_source_kind !== null && !CAPACITY_SOURCE_KINDS.includes(row.capacity_source_kind)) {
    errors.push(`capacity_source_kind "${row.capacity_source_kind}" is not known`);
  }
  if (!CAPACITY_CONFIDENCES.includes(row.capacity_confidence)) {
    errors.push(`capacity_confidence "${row.capacity_confidence}" is not a known confidence`);
  }
  if (!CALENDAR_SCOPES.includes(row.calendar_scope)) {
    errors.push(`calendar_scope "${row.calendar_scope}" is not a known scope`);
  }
  if (!CALENDAR_SOURCE_KINDS.includes(row.calendar_source_kind)) {
    errors.push(`calendar_source_kind "${row.calendar_source_kind}" is not known`);
  }
  if (!CALENDAR_STATES.includes(row.calendar_state)) {
    errors.push(`calendar_state "${row.calendar_state}" is not a known calendar state`);
  }
  if (row.acquisition_shape !== null && !ACQUISITION_SHAPES.includes(row.acquisition_shape)) {
    errors.push(`acquisition_shape "${row.acquisition_shape}" is not known`);
  }
  if (row.canonical_venue_id !== null && !isNonEmptyString(row.canonical_venue_id)) {
    errors.push("canonical_venue_id must be a non-empty string or null");
  }
  for (const key of NULLABLE_TEXT_KEYS) {
    if (row[key] !== null && !isNonEmptyString(row[key])) {
      errors.push(`${key} must be a non-empty string or null`);
    }
  }
  if (typeof row.notes !== "string") errors.push("notes must be a string");
  for (const key of URL_KEYS) {
    if (row[key] !== null && !isValidUrl(row[key])) {
      errors.push(`${key} must be an http(s) URL or null`);
    }
  }
  if (typeof row.capacity_max !== "number" || !Number.isInteger(row.capacity_max) || row.capacity_max < 0) {
    errors.push("capacity_max must be a non-negative integer");
  }

  validateEvidenceArray(row.identity_evidence, "identity_evidence", errors);
  validateEvidenceArray(row.capacity_evidence, "capacity_evidence", errors);
  validateEvidenceArray(row.calendar_evidence, "calendar_evidence", errors);
  validateEvidenceArray(row.permanence_evidence, "permanence_evidence", errors);

  if (errors.length > 0) return errors;

  const identityEvidence = row.identity_evidence;
  const capacityEvidence = row.capacity_evidence;
  const calendarEvidence = row.calendar_evidence;
  const permanenceEvidence = row.permanence_evidence;
  const blocked = row.capacity_state === "RESEARCH_BLOCKED";

  // Every row asserts a venue exists. That is a claim.
  if (identityEvidence.length === 0) {
    errors.push("identity_evidence must be non-empty — asserting a venue exists is a claim that needs support");
  }

  // --- rule 1: a confirmed capacity needs a citable source --------------
  if (row.capacity_state === "CONFIRMED_1000_PLUS") {
    if (capacityEvidence.length === 0) {
      errors.push("capacity_state CONFIRMED_1000_PLUS requires non-empty capacity_evidence");
    }
    if (row.capacity_source_url === null) {
      errors.push("capacity_state CONFIRMED_1000_PLUS requires a capacity_source_url");
    }
    if (row.capacity_source_kind === null) {
      errors.push("capacity_state CONFIRMED_1000_PLUS requires a capacity_source_kind");
    }
    if (row.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(
        `capacity_state CONFIRMED_1000_PLUS requires capacity_max >= ${HIGH_VALUE_CAPACITY_THRESHOLD} (got ${row.capacity_max})`,
      );
    }
    if (row.capacity_confidence === "UNKNOWN") {
      errors.push("capacity_state CONFIRMED_1000_PLUS cannot carry capacity_confidence UNKNOWN");
    }
    // A PLANNED capacity is not a capacity. A figure someone intended the
    // venue to have is not evidence of what it actually holds, and must
    // not be laundered into a confirmed fact.
    //
    // This is a best-effort mechanical backstop on the context text, in
    // the same spirit as the plausibility-language check in
    // ingestion/source-investigation/contract.mjs: it catches the stated
    // case, it cannot catch a figure whose prose hides the same reliance,
    // and the researcher's own discipline remains load-bearing.
    const prospective = capacityEvidence.find(
      (item) => isNonEmptyString(item?.note) && PROSPECTIVE_CAPACITY_LANGUAGE.test(item.note),
    );
    if (prospective) {
      errors.push(
        `capacity_state CONFIRMED_1000_PLUS cannot rest on a prospective capacity — its evidence reads "${prospective.note.slice(0, 140)}". A planned or proposed figure is not evidence of current capacity.`,
      );
    }
    // --- rule 2 (new in 06): the estate is of PERMANENT venues ----------
    if (row.permanence_class === null) {
      errors.push("capacity_state CONFIRMED_1000_PLUS requires a permanence_class");
    } else if (!PERMANENT_CLASSES.includes(row.permanence_class)) {
      errors.push(
        `capacity_state CONFIRMED_1000_PLUS is not valid with permanence_class "${row.permanence_class}" — the estate is of permanent venues`,
      );
    }
  }

  // --- rule 3: a negative capacity claim is a finding --------------------
  if (row.capacity_state === "CONFIRMED_BELOW_THRESHOLD") {
    if (capacityEvidence.length === 0) {
      errors.push("capacity_state CONFIRMED_BELOW_THRESHOLD is a negative claim and requires non-empty capacity_evidence");
    }
    if (row.capacity_max >= HIGH_VALUE_CAPACITY_THRESHOLD) {
      errors.push(`capacity_state CONFIRMED_BELOW_THRESHOLD contradicts capacity_max ${row.capacity_max}`);
    }
  }

  // --- rule 4: excluding a venue for permanence is a finding ------------
  if (row.capacity_state === "NOT_A_PERMANENT_VENUE") {
    if (row.permanence_class === null) {
      errors.push("capacity_state NOT_A_PERMANENT_VENUE requires a permanence_class");
    } else if (!NON_PERMANENT_CLASSES.includes(row.permanence_class)) {
      errors.push(
        `capacity_state NOT_A_PERMANENT_VENUE requires a non-permanent permanence_class (got "${row.permanence_class}")`,
      );
    }
    if (permanenceEvidence.length === 0) {
      errors.push("capacity_state NOT_A_PERMANENT_VENUE is a negative claim and requires non-empty permanence_evidence");
    }
  }

  // A row excluded on permanence must not also be presented as permanent.
  if (row.permanence_class !== null && NON_PERMANENT_CLASSES.includes(row.permanence_class)) {
    if (HIGH_VALUE_STATES.includes(row.capacity_state)) {
      errors.push(
        `permanence_class "${row.permanence_class}" cannot carry high-value capacity_state "${row.capacity_state}"`,
      );
    }
  }

  // --- rule 5: an unevidenced capacity figure ---------------------------
  if (row.capacity_max > 0 && capacityEvidence.length === 0) {
    errors.push(`capacity_max ${row.capacity_max} is claimed with no capacity_evidence`);
  }
  if (row.capacity_max > 0 && row.capacity_source_url === null) {
    errors.push(`capacity_max ${row.capacity_max} is claimed with no capacity_source_url`);
  }
  if (row.capacity_max === 0 && row.capacity_source_url !== null) {
    errors.push("capacity_source_url is set but capacity_max is 0 — an unestablished capacity cannot have a source");
  }
  if (OFFICIAL_CAPACITY_SOURCE_KINDS.includes(row.capacity_source_kind) && capacityEvidence.length === 0) {
    errors.push(
      `capacity_source_kind "${row.capacity_source_kind}" claims official authority with no capacity_evidence`,
    );
  }

  // --- rule 6: negative calendar claims need evidence -------------------
  if (NEGATIVE_CALENDAR_STATES.includes(row.calendar_state) && calendarEvidence.length === 0) {
    errors.push(`calendar_state "${row.calendar_state}" is a negative claim and requires non-empty calendar_evidence`);
  }
  if (POSITIVE_CALENDAR_STATES.includes(row.calendar_state)) {
    if (calendarEvidence.length === 0) {
      errors.push(`calendar_state "${row.calendar_state}" requires non-empty calendar_evidence`);
    }
    const anyCalendarUrl =
      row.general_programme_url !== null || row.conference_calendar_url !== null ||
      row.sports_calendar_url !== null || row.ticketing_url !== null;
    if (!anyCalendarUrl) {
      errors.push(`calendar_state "${row.calendar_state}" claims a calendar exists but no calendar URL is recorded`);
    }
    if (row.calendar_scope === "NONE") {
      errors.push(`calendar_state "${row.calendar_state}" contradicts calendar_scope NONE`);
    }
  }

  // --- rule 7: absence of research is never evidence of absence ---------
  if (blocked) {
    if (NEGATIVE_CALENDAR_STATES.includes(row.calendar_state)) {
      errors.push(
        `capacity_state RESEARCH_BLOCKED cannot carry negative calendar_state "${row.calendar_state}" — absence of research is not evidence of absence`,
      );
    }
    if (row.canonical_match_state === "MISSING_FROM_CANON") {
      errors.push("capacity_state RESEARCH_BLOCKED cannot assert MISSING_FROM_CANON — identity was never established");
    }
  }

  // --- rule 8: a missing-from-canon claim is an identity claim ----------
  if (row.canonical_match_state === "MISSING_FROM_CANON" && identityEvidence.length === 0) {
    errors.push("canonical_match_state MISSING_FROM_CANON requires non-empty identity_evidence");
  }
  if (IN_CANON_STATES.includes(row.canonical_match_state) && row.canonical_venue_id === null) {
    errors.push(`canonical_match_state ${row.canonical_match_state} requires a canonical_venue_id`);
  }
  if (row.canonical_match_state === "MISSING_FROM_CANON" && row.canonical_venue_id !== null) {
    errors.push("canonical_match_state MISSING_FROM_CANON cannot carry a canonical_venue_id");
  }

  // --- rule 9: platform family is never guessed -------------------------
  if (row.platform_family !== null && row.platform_evidence === null) {
    errors.push(
      `platform_family "${row.platform_family}" is claimed with no platform_evidence — do not guess platform family, use null`,
    );
  }

  // --- rule 10: provenance must match the predecessor link --------------
  if (row.provenance === "PACKAGE_06_NEW_RESEARCH" && row.predecessor_research_id !== null) {
    errors.push("provenance PACKAGE_06_NEW_RESEARCH cannot carry a predecessor_research_id");
  }
  if (row.provenance !== "PACKAGE_06_NEW_RESEARCH" && row.predecessor_research_id === null) {
    errors.push(`provenance ${row.provenance} requires a predecessor_research_id`);
  }

  return errors;
}

/**
 * Validate a whole Package 06 corpus: every row, plus the cross-row
 * invariants a single row cannot see — research_id uniqueness and
 * predecessor_research_id uniqueness (a predecessor row must map to exactly
 * one successor, never be silently duplicated).
 */
export function validateCensus06(rows) {
  if (!Array.isArray(rows)) return ["census must be an array of rows"];

  const errors = [];
  const seen = new Map();
  const seenPredecessor = new Map();

  rows.forEach((row, index) => {
    for (const error of validateCensus06Row(row)) {
      errors.push(`row[${index}] (${row?.research_id ?? "no id"}): ${error}`);
    }
    const id = row?.research_id;
    if (isNonEmptyString(id)) {
      if (seen.has(id)) errors.push(`duplicate research_id "${id}" at rows ${seen.get(id)} and ${index}`);
      else seen.set(id, index);
    }
    const pid = row?.predecessor_research_id;
    if (isNonEmptyString(pid)) {
      if (seenPredecessor.has(pid)) {
        errors.push(
          `predecessor_research_id "${pid}" is claimed by more than one Package 06 row (rows ${seenPredecessor.get(pid)} and ${index})`,
        );
      } else {
        seenPredecessor.set(pid, index);
      }
    }
  });

  return errors;
}

/**
 * Prove every predecessor row has exactly one disposition in this corpus.
 * A predecessor row that is silently dropped is the failure this guards
 * against: the estate must be explainable against what came before it.
 */
export function reconcileAgainstPredecessor(predecessorRows, rows) {
  const errors = [];
  const claimed = new Set(
    rows.map((r) => r.predecessor_research_id).filter((v) => typeof v === "string" && v.length > 0),
  );
  const predecessorIds = new Set(predecessorRows.map((r) => r.research_id));

  const missing = [...predecessorIds].filter((id) => !claimed.has(id));
  for (const id of missing.slice(0, 25)) {
    errors.push(`predecessor row "${id}" has no disposition in the Package 06 corpus`);
  }
  if (missing.length > 25) {
    errors.push(`... and ${missing.length - 25} further predecessor rows with no disposition`);
  }

  const unknown = [...claimed].filter((id) => !predecessorIds.has(id));
  for (const id of unknown.slice(0, 25)) {
    errors.push(`Package 06 row claims predecessor "${id}" which does not exist in Package 05`);
  }

  return errors;
}

/**
 * Decide whether the corpus may claim an overall COMPLETE verdict.
 *
 * Deliberately conservative, and deliberately NOT satisfiable merely by
 * every row having a state — that is the exact shortcut the package brief
 * forbids. An entire material source family left unexplored makes the
 * census partial; a small bounded number of genuinely unverifiable
 * capacities does not.
 */
export function assessCompleteness(coverageMatrix) {
  const blocking = [];
  if (!Array.isArray(coverageMatrix)) return { verdict: "PARTIAL", blocking: ["no coverage matrix"] };

  for (const entry of coverageMatrix) {
    if (!COMPLETE_ENOUGH_COVERAGE_STATES.includes(entry?.final_coverage)) {
      blocking.push(
        `venue class ${entry?.venue_class ?? "(unnamed)"} is ${entry?.final_coverage ?? "unrecorded"}`,
      );
    }
  }

  return { verdict: blocking.length === 0 ? "COMPLETE" : "PARTIAL", blocking };
}
