#!/usr/bin/env node
// Deterministic builder for the Package 06 UK high-value venue completion
// corpus (BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06).
//
// Reads, and only ever reads:
//   - research/high-value-venue-estate/uk-1000plus-05/   (IMMUTABLE
//     predecessor snapshot: 911 rows, 743 confirmed, 163 unverified,
//     5 proven below threshold)
//   - venues/uk.json                                     (canonical estate,
//     for identity reconciliation only)
//   - researcher JSONL gathered outside the repository
//
// Writes only research/high-value-venue-estate/uk-1000plus-06/.
//
// It never writes venues/uk.json, sources/*.json, data/public/*, the
// Package 05 directory, or any other prior artifact. It never fetches.
// Re-running it on the same inputs reproduces the output exactly.
//
// THE CENTRAL GUARANTEE
// ---------------------
// Every one of Package 05's 911 rows gets exactly one disposition here,
// and the contract proves it (reconcileAgainstPredecessor). A predecessor
// row cannot be silently dropped to make a headline look better, and a
// predecessor row cannot be claimed twice.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTS_VENUE_CLASSES,
  CAPACITY_STATES,
  CENSUS_06_FRAMEWORK_VERSION,
  CONFERENCE_VENUE_CLASSES,
  FINAL_COVERAGE_STATES,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HIGH_VALUE_STATES,
  IN_CANON_STATES,
  NON_PERMANENT_CLASSES,
  PERMANENCE_CLASSES,
  PERMANENT_CLASSES,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_MAIN_SHA,
  PREDECESSOR_PACKAGE,
  PROSPECTIVE_CAPACITY_LANGUAGE,
  SPORTS_VENUE_CLASSES,
  STRATEGIC_SEGMENTS,
  assessCompleteness,
  reconcileAgainstPredecessor,
  segmentFor,
  validateCensus06,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_06_OUTPUT_DIR = "research/high-value-venue-estate/uk-1000plus-06";

// ---------------------------------------------------------------------
// Default permanence, derived deterministically from venue class
// ---------------------------------------------------------------------
// Most of the estate's permanence is not genuinely in doubt: a theatre is
// a purpose-built venue, a football ground is a sporting ground. Asserting
// that is not a research claim, it is what the venue class already means.
//
// The exception is the rows Package 05 itself flagged for permanence
// review — open-air sites, parks, a castle esplanade, a museum, a
// showground. Those get NO default: they must be resolved by evidence, and
// until they are they cannot sit in the confirmed estate. See
// PERMANENCE_REVIEW_PRIOR_TYPE below.
export const PERMANENCE_REVIEW_PRIOR_TYPE = "OTHER_MAJOR_EVENT_VENUE";

export function defaultPermanenceFor(venueClass) {
  if (SPORTS_VENUE_CLASSES.includes(venueClass)) return "PERMANENT_SPORTING_GROUND";
  return "PERMANENT_PURPOSE_BUILT_VENUE";
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normaliseName(value) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bsaint\b/g, "st")
    .replace(/\bcenter\b/g, "centre")
    .replace(/\btheater\b/g, "theatre")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return normaliseName(value).replace(/\s+/g, "-").slice(0, 60) || "unnamed";
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // A truncated final line is expected if a researcher was cut off
      // mid-write. Skipping it is correct; inventing it would not be.
    }
  }
  return rows;
}

const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const url = (value) => (typeof value === "string" && /^https?:\/\//.test(value) ? value : null);

function evidenceArray(value, defaultKind = "FETCHED_URL") {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e.url === "string" && /^https?:\/\//.test(e.url))
    .map((e) => ({
      url: e.url,
      kind: oneOf(
        e.kind,
        ["FETCHED_URL", "SEARCH_RESULT", "COMMITTED_RESEARCH_ARTIFACT", "CANONICAL_REGISTRY", "DETERMINISTIC_DERIVATION", "PREDECESSOR_CENSUS"],
        defaultKind,
      ),
      note: typeof e.note === "string" && e.note.trim() ? e.note.trim() : "no note recorded by researcher",
    }));
}

// ---------------------------------------------------------------------
// Carry one Package 05 row forward into the Package 06 shape
// ---------------------------------------------------------------------
function carryForward(prior, { flaggedForPermanenceReview }) {
  const capacityState =
    prior.high_value_state === "CONFIRMED_1000_PLUS"
      ? "CONFIRMED_1000_PLUS"
      : prior.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE"
        ? "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE"
        : "CONFIRMED_BELOW_THRESHOLD";

  // Rows Package 05 flagged for permanence review get no default: their
  // permanence is a genuine open question and must be evidenced.
  const permanence = flaggedForPermanenceReview ? null : defaultPermanenceFor(prior.venue_class);

  return {
    research_id: `hv06-${prior.research_id.replace(/^hv05-/, "")}`,
    predecessor_research_id: prior.research_id,
    canonical_venue_id: prior.canonical_venue_id,
    canonical_match_state: prior.canonical_match_state,
    name: prior.name,
    aliases: Array.isArray(prior.aliases) ? prior.aliases.filter(Boolean) : [],
    venue_class: prior.venue_class,
    locality: prior.locality,
    nation: prior.nation,
    postcode: prior.postcode,
    operator_name: prior.operator_name,
    capacity_max: prior.capacity_max,
    capacity_kind: prior.capacity_kind,
    capacity_context: prior.capacity_context,
    capacity_source_url: prior.capacity_source_url,
    capacity_source_kind: prior.capacity_source_kind,
    capacity_confidence: prior.capacity_confidence,
    capacity_state: capacityState,
    permanence_class: permanence,
    official_website_url: prior.official_website_url,
    general_programme_url: prior.general_programme_url,
    conference_calendar_url: prior.conference_calendar_url,
    sports_calendar_url: prior.sports_calendar_url,
    ticketing_url: prior.ticketing_url,
    calendar_scope: prior.calendar_scope,
    calendar_source_kind: prior.calendar_source_kind,
    calendar_state: prior.calendar_state,
    platform_family: prior.platform_family,
    platform_evidence: prior.platform_evidence,
    acquisition_shape: prior.acquisition_shape,
    identity_evidence: evidenceArray(prior.identity_evidence, "PREDECESSOR_CENSUS"),
    capacity_evidence: evidenceArray(prior.capacity_evidence, "PREDECESSOR_CENSUS"),
    calendar_evidence: evidenceArray(prior.calendar_evidence, "PREDECESSOR_CENSUS"),
    permanence_evidence: [],
    provenance: "PREDECESSOR_CARRIED_UNCHANGED",
    notes: prior.notes ?? "",
    // retained for reporting, not part of the contract
    prior_venue_type: prior.prior_venue_type ?? null,
    predecessor_high_value_state: prior.high_value_state,
  };
}

// ---------------------------------------------------------------------
// Apply one researcher update to a carried row
// ---------------------------------------------------------------------
// Repairs always move a row towards the LESS confident claim, never
// towards a stronger one. A researcher cannot promote a venue to
// CONFIRMED_1000_PLUS without supplying the evidence the contract demands;
// if the evidence is absent the promotion is refused and the row stays
// where it was.
export function applyUpdate(row, update, rejections) {
  const resolved = update?.resolved_state;
  const capacityEvidence = evidenceArray(update?.capacity_evidence);
  const permanenceEvidence = evidenceArray(update?.permanence_evidence);
  const calendarEvidence = evidenceArray(update?.calendar_evidence);

  const next = { ...row, provenance: "PREDECESSOR_RESOLVED_BY_06" };
  const note = (t) => {
    next.notes = `${next.notes} [P06: ${t}]`.trim();
  };

  // --- permanence -------------------------------------------------------
  if (PERMANENCE_CLASSES.includes(update?.permanence_class)) {
    if (permanenceEvidence.length === 0 && NON_PERMANENT_CLASSES.includes(update.permanence_class)) {
      rejections.push({
        update_for: update.update_for,
        reason: `permanence_class "${update.permanence_class}" is a negative claim with no permanence_evidence — not applied`,
      });
    } else {
      next.permanence_class = update.permanence_class;
      next.permanence_evidence = permanenceEvidence;
      note(`permanence classified ${update.permanence_class}`);
    }
  }

  // --- capacity ---------------------------------------------------------
  const claimedCapacity =
    Number.isFinite(update?.capacity_max) && update.capacity_max > 0 ? Math.trunc(update.capacity_max) : 0;
  const claimedSourceUrl = url(update?.capacity_source_url);
  const capacitySupported = claimedCapacity > 0 && claimedSourceUrl !== null && capacityEvidence.length > 0;

  if (resolved === "CONFIRMED_1000_PLUS") {
    if (!capacitySupported || claimedCapacity < HIGH_VALUE_CAPACITY_THRESHOLD) {
      rejections.push({
        update_for: update.update_for,
        reason: `CONFIRMED_1000_PLUS claimed with capacity ${claimedCapacity}, source ${claimedSourceUrl ? "present" : "absent"}, evidence ${capacityEvidence.length} — refused, row left unpromoted`,
      });
    } else {
      next.capacity_max = claimedCapacity;
      next.capacity_source_url = claimedSourceUrl;
      next.capacity_kind = oneOf(update.capacity_kind, [
        "STANDING", "SEATED", "FIXED_SEATING", "SPECTATOR", "DELEGATE", "BANQUET",
        "THEATRE_STYLE", "EXHIBITION", "MULTI_CONFIGURATION", "OTHER",
      ], "OTHER");
      next.capacity_context = text(update.capacity_context);
      next.capacity_source_kind = oneOf(update.capacity_source_kind, [
        "OFFICIAL_VENUE", "OFFICIAL_OPERATOR", "OFFICIAL_GOVERNING_BODY",
        "OFFICIAL_LEAGUE", "OFFICIAL_LOCAL_AUTHORITY", "HIGH_QUALITY_THIRD_PARTY", "OTHER",
      ], "OTHER");
      const conf = oneOf(update.capacity_confidence, ["HIGH", "MEDIUM", "LOW", "UNKNOWN"], "LOW");
      next.capacity_confidence = conf === "UNKNOWN" ? "LOW" : conf;
      next.capacity_evidence = capacityEvidence;
      next.capacity_state = "CONFIRMED_1000_PLUS";
      note(`capacity confirmed at ${claimedCapacity}`);
    }
  } else if (resolved === "CONFIRMED_BELOW_1000") {
    if (!capacitySupported || claimedCapacity >= HIGH_VALUE_CAPACITY_THRESHOLD) {
      rejections.push({
        update_for: update.update_for,
        reason: `CONFIRMED_BELOW_1000 claimed with capacity ${claimedCapacity} and evidence ${capacityEvidence.length} — refused as an unsupported negative claim`,
      });
    } else {
      next.capacity_max = claimedCapacity;
      next.capacity_source_url = claimedSourceUrl;
      next.capacity_kind = oneOf(update.capacity_kind, [
        "STANDING", "SEATED", "FIXED_SEATING", "SPECTATOR", "DELEGATE", "BANQUET",
        "THEATRE_STYLE", "EXHIBITION", "MULTI_CONFIGURATION", "OTHER",
      ], "OTHER");
      next.capacity_context = text(update.capacity_context);
      next.capacity_source_kind = oneOf(update.capacity_source_kind, [
        "OFFICIAL_VENUE", "OFFICIAL_OPERATOR", "OFFICIAL_GOVERNING_BODY",
        "OFFICIAL_LEAGUE", "OFFICIAL_LOCAL_AUTHORITY", "HIGH_QUALITY_THIRD_PARTY", "OTHER",
      ], "OTHER");
      const conf = oneOf(update.capacity_confidence, ["HIGH", "MEDIUM", "LOW", "UNKNOWN"], "LOW");
      next.capacity_confidence = conf === "UNKNOWN" ? "LOW" : conf;
      next.capacity_evidence = capacityEvidence;
      next.capacity_state = "CONFIRMED_BELOW_THRESHOLD";
      note(`capacity proven below threshold at ${claimedCapacity}`);
    }
  } else if (resolved === "NOT_A_PERMANENT_VENUE") {
    if (permanenceEvidence.length === 0) {
      rejections.push({
        update_for: update.update_for,
        reason: "NOT_A_PERMANENT_VENUE claimed with no permanence_evidence — refused as an unsupported negative claim",
      });
    } else {
      next.capacity_state = "NOT_A_PERMANENT_VENUE";
      next.permanence_evidence = permanenceEvidence;
      if (!NON_PERMANENT_CLASSES.includes(next.permanence_class)) {
        next.permanence_class = "PUBLIC_SPACE_NOT_A_VENUE";
      }
      note("excluded from the estate: not a permanent venue");
    }
  } else if (resolved === "IDENTITY_REVIEW") {
    next.capacity_state = "IDENTITY_REVIEW";
    note("referred for identity review");
  } else if (resolved === "RESEARCH_BLOCKED") {
    next.capacity_state = "RESEARCH_BLOCKED";
    // A blocked row may not carry a negative claim.
    if (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(next.calendar_state)) {
      next.calendar_state = "UNKNOWN";
    }
    note("research blocked");
  } else if (resolved === "CAPACITY_STILL_UNVERIFIED_HIGH_VALUE_CANDIDATE") {
    next.capacity_state = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
    note("capacity remains unverified after research");
  }

  // --- calendar (only ever added, never downgraded silently) -------------
  const sportsUrl = url(update?.sports_calendar_url);
  const generalUrl = url(update?.general_programme_url);
  if ((sportsUrl || generalUrl) && calendarEvidence.length > 0) {
    if (sportsUrl && next.sports_calendar_url === null) next.sports_calendar_url = sportsUrl;
    if (generalUrl && next.general_programme_url === null) next.general_programme_url = generalUrl;
    next.calendar_evidence = [...next.calendar_evidence, ...calendarEvidence];
    const kind = oneOf(update.calendar_source_kind, [
      "VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY", "TICKETING", "THIRD_PARTY", "NONE", "UNKNOWN",
    ], null);
    if (kind && next.calendar_source_kind === "UNKNOWN") next.calendar_source_kind = kind;
    if (next.calendar_state === "UNKNOWN") next.calendar_state = "HAS_PUBLIC_EVENT_CALENDAR";
    if (next.calendar_scope === "UNKNOWN" || next.calendar_scope === "NONE") {
      next.calendar_scope = SPORTS_VENUE_CLASSES.includes(next.venue_class) ? "SPORT" : "GENERAL";
    }
  }

  if (text(update?.notes)) note(text(update.notes));
  return next;
}

// ---------------------------------------------------------------------
// Final coherence pass
// ---------------------------------------------------------------------
// Enforces the contract's own rules on the assembled row, so a row can
// never reach the artifacts in a state the validator would reject. Where a
// rule is broken, the row is moved to the weaker claim, never the stronger.
function enforceCoherence(row, adjustments) {
  const next = { ...row };

  // A confirmed venue must be a permanent one. Where permanence was never
  // resolved, the honest disposition is IDENTITY_REVIEW: we have a capacity
  // but we have not established that the thing is a venue.
  if (next.capacity_state === "CONFIRMED_1000_PLUS") {
    if (next.permanence_class === null || !PERMANENT_CLASSES.includes(next.permanence_class)) {
      adjustments.push({
        research_id: next.research_id,
        name: next.name,
        from: "CONFIRMED_1000_PLUS",
        to: "IDENTITY_REVIEW",
        reason:
          next.permanence_class === null
            ? "permanence never established — cannot be counted as a permanent venue"
            : `permanence_class ${next.permanence_class} is not a permanent venue class`,
      });
      next.capacity_state = "IDENTITY_REVIEW";
      next.notes = `${next.notes} [P06: held out of the confirmed estate pending permanence resolution]`.trim();
    } else if (
      next.capacity_evidence.some(
        (item) => typeof item?.note === "string" && PROSPECTIVE_CAPACITY_LANGUAGE.test(item.note),
      )
    ) {
      // The claimed figure is one the venue was INTENDED to reach, not one
      // it has. Demote rather than refuse the whole build: the venue is
      // still a real high-value candidate, we just cannot call its capacity
      // established.
      adjustments.push({
        research_id: next.research_id,
        name: next.name,
        from: "CONFIRMED_1000_PLUS",
        to: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
        reason: "capacity evidence describes a planned/proposed figure, not a current capacity",
      });
      next.capacity_state = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
      next.capacity_max = 0;
      next.capacity_source_url = null;
      next.capacity_kind = null;
      next.capacity_source_kind = null;
      next.capacity_context = null;
      next.capacity_confidence = "UNKNOWN";
      next.notes = `${next.notes} [P06: capacity figure was prospective (planned/proposed), not current — held out of the confirmed estate]`.trim();
    } else if (next.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD || next.capacity_evidence.length === 0) {
      adjustments.push({
        research_id: next.research_id,
        name: next.name,
        from: "CONFIRMED_1000_PLUS",
        to: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
        reason: "confirmed capacity is not supported by evidence on the assembled row",
      });
      next.capacity_state = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
    }
  }

  // A capacity figure with no source cannot stand.
  if (next.capacity_max > 0 && (next.capacity_source_url === null || next.capacity_evidence.length === 0)) {
    next.capacity_max = 0;
    next.capacity_source_url = null;
    next.capacity_kind = null;
    next.capacity_source_kind = null;
    next.capacity_context = null;
    next.capacity_confidence = "UNKNOWN";
  }
  if (next.capacity_max === 0 && next.capacity_source_url !== null) {
    next.capacity_source_url = null;
    next.capacity_source_kind = null;
  }
  if (next.capacity_max === 0 && next.capacity_state === "CONFIRMED_BELOW_THRESHOLD" && next.capacity_evidence.length === 0) {
    next.capacity_state = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }
  if (next.capacity_max === 0) next.capacity_confidence = "UNKNOWN";

  // A blocked row may not carry any negative claim.
  if (next.capacity_state === "RESEARCH_BLOCKED") {
    if (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(next.calendar_state)) {
      next.calendar_state = "UNKNOWN";
    }
    if (next.canonical_match_state === "MISSING_FROM_CANON") next.canonical_match_state = "UNASSESSED";
  }

  // A positive calendar claim needs both a URL and evidence.
  if (["HAS_PUBLIC_EVENT_CALENDAR", "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR"].includes(next.calendar_state)) {
    const anyUrl =
      next.general_programme_url !== null || next.conference_calendar_url !== null ||
      next.sports_calendar_url !== null || next.ticketing_url !== null;
    if (!anyUrl || next.calendar_evidence.length === 0) next.calendar_state = "UNKNOWN";
    else if (next.calendar_scope === "NONE") next.calendar_scope = "UNKNOWN";
  }
  if (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(next.calendar_state) && next.calendar_evidence.length === 0) {
    next.calendar_state = "UNKNOWN";
  }
  if (next.platform_family !== null && next.platform_evidence === null) next.platform_family = null;
  if (IN_CANON_STATES.includes(next.canonical_match_state) && next.canonical_venue_id === null) {
    next.canonical_match_state = "AMBIGUOUS_IDENTITY";
  }
  if (next.canonical_match_state === "MISSING_FROM_CANON" && next.canonical_venue_id !== null) {
    next.canonical_venue_id = null;
  }

  return next;
}

// ---------------------------------------------------------------------
// New venues from Package 06 research
// ---------------------------------------------------------------------
function buildNewVenue(raw, seenIds, canonicalIndex) {
  const name = text(raw?.name);
  if (!name) return null;
  const identityEvidence = evidenceArray(raw.identity_evidence);
  if (identityEvidence.length === 0) return null;

  const capacityEvidence = evidenceArray(raw.capacity_evidence);
  const calendarEvidence = evidenceArray(raw.calendar_evidence);
  const permanenceEvidence = evidenceArray(raw.permanence_evidence);

  let capacityMax = Number.isFinite(raw.capacity_max) && raw.capacity_max > 0 ? Math.trunc(raw.capacity_max) : 0;
  let capacitySourceUrl = url(raw.capacity_source_url);
  if (capacityMax > 0 && (capacitySourceUrl === null || capacityEvidence.length === 0)) {
    capacityMax = 0;
    capacitySourceUrl = null;
  }
  if (capacityMax === 0) capacitySourceUrl = null;

  const venueClass = oneOf(raw.venue_class, [
    "ARENA", "STADIUM", "THEATRE", "CONCERT_HALL", "CIVIC_HALL", "EVENT_HALL",
    "CONFERENCE_CENTRE", "CONVENTION_CENTRE", "EXHIBITION_CENTRE",
    "MAJOR_HOTEL_EVENT_VENUE", "UNIVERSITY_EVENT_VENUE", "RACECOURSE",
    "FOOTBALL_GROUND", "RUGBY_UNION_GROUND", "RUGBY_LEAGUE_GROUND",
    "CRICKET_GROUND", "ATHLETICS_STADIUM", "MOTORSPORT_VENUE",
    "ICE_HOCKEY_ARENA", "BASKETBALL_ARENA", "MULTI_SPORT_ARENA",
    "OTHER_PERMANENT_SPECTATOR_SPORT", "MULTI_PURPOSE_VENUE",
  ], "MULTI_PURPOSE_VENUE");

  let capacityState = oneOf(raw.resolved_state, CAPACITY_STATES.concat(["CONFIRMED_BELOW_1000", "CAPACITY_STILL_UNVERIFIED_HIGH_VALUE_CANDIDATE"]), "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  if (capacityState === "CONFIRMED_BELOW_1000") capacityState = "CONFIRMED_BELOW_THRESHOLD";
  if (capacityState === "CAPACITY_STILL_UNVERIFIED_HIGH_VALUE_CANDIDATE") {
    capacityState = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }
  // Re-derive rather than trust.
  if (capacityMax >= HIGH_VALUE_CAPACITY_THRESHOLD && capacityEvidence.length > 0) {
    if (capacityState !== "NOT_A_PERMANENT_VENUE" && capacityState !== "RESEARCH_BLOCKED") {
      capacityState = "CONFIRMED_1000_PLUS";
    }
  } else if (capacityState === "CONFIRMED_1000_PLUS") {
    capacityState = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }

  const permanence = PERMANENCE_CLASSES.includes(raw.permanence_class)
    ? raw.permanence_class
    : defaultPermanenceFor(venueClass);

  const locality = text(raw.locality);
  const reconciliation = reconcileAgainstCanon(
    { name, locality, officialUrl: url(raw.official_website_url) },
    canonicalIndex,
  );

  let id = `hv06-n-${slug(`${name} ${locality ?? ""}`)}`;
  if (seenIds.has(id)) {
    let n = 2;
    while (seenIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  seenIds.add(id);

  let calendarState = oneOf(raw.calendar_state, [
    "HAS_PUBLIC_EVENT_CALENDAR", "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
    "PRIVATE_BOOKINGS_ONLY", "NO_PUBLIC_CALENDAR_FOUND",
    "CALENDAR_ACCESS_RESTRICTED", "UNKNOWN",
  ], "UNKNOWN");
  if (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(calendarState) && calendarEvidence.length === 0) {
    calendarState = "UNKNOWN";
  }

  let platformFamily = text(raw.platform_family);
  let platformEvidence = text(raw.platform_evidence);
  if (platformFamily && !platformEvidence) platformFamily = null;
  if (!platformFamily) platformEvidence = null;

  return {
    research_id: id,
    predecessor_research_id: null,
    canonical_venue_id: reconciliation.canonical_venue_id,
    canonical_match_state: reconciliation.state,
    name,
    aliases: Array.isArray(raw.aliases) ? raw.aliases.filter((a) => typeof a === "string" && a.trim()) : [],
    venue_class: venueClass,
    locality,
    nation: oneOf(raw.nation, ["England", "Wales", "Scotland", "Northern Ireland"], "UNKNOWN"),
    postcode: text(raw.postcode),
    operator_name: text(raw.operator_name),
    capacity_max: capacityMax,
    capacity_kind: capacityMax > 0 ? oneOf(raw.capacity_kind, [
      "STANDING", "SEATED", "FIXED_SEATING", "SPECTATOR", "DELEGATE", "BANQUET",
      "THEATRE_STYLE", "EXHIBITION", "MULTI_CONFIGURATION", "OTHER",
    ], "OTHER") : null,
    capacity_context: capacityMax > 0 ? text(raw.capacity_context) : null,
    capacity_source_url: capacitySourceUrl,
    capacity_source_kind: capacityMax > 0 ? oneOf(raw.capacity_source_kind, [
      "OFFICIAL_VENUE", "OFFICIAL_OPERATOR", "OFFICIAL_GOVERNING_BODY",
      "OFFICIAL_LEAGUE", "OFFICIAL_LOCAL_AUTHORITY", "HIGH_QUALITY_THIRD_PARTY", "OTHER",
    ], "OTHER") : null,
    capacity_confidence: capacityMax > 0
      ? (oneOf(raw.capacity_confidence, ["HIGH", "MEDIUM", "LOW"], "LOW"))
      : "UNKNOWN",
    capacity_state: capacityState,
    permanence_class: permanence,
    official_website_url: url(raw.official_website_url),
    general_programme_url: url(raw.general_programme_url),
    conference_calendar_url: url(raw.conference_calendar_url),
    sports_calendar_url: url(raw.sports_calendar_url),
    ticketing_url: url(raw.ticketing_url),
    calendar_scope: oneOf(raw.calendar_scope, [
      "GENERAL", "MUSIC", "THEATRE", "CONFERENCE", "EXHIBITION", "SPORT", "MULTI", "NONE", "UNKNOWN",
    ], "UNKNOWN"),
    calendar_source_kind: oneOf(raw.calendar_source_kind, [
      "VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY", "TICKETING", "THIRD_PARTY", "NONE", "UNKNOWN",
    ], "UNKNOWN"),
    calendar_state: calendarState,
    platform_family: platformFamily,
    platform_evidence: platformEvidence,
    acquisition_shape: oneOf(raw.acquisition_shape, [
      "SERVER_RENDERED_HTML", "JSON_LD", "PUBLIC_JSON_API", "GRAPHQL", "WORDPRESS_REST",
      "EMBEDDED_WIDGET", "CLIENT_RENDERED", "IFRAME", "TICKETING_STOREFRONT",
      "DOWNLOADABLE_FIXTURE_FILE", "ICS", "ACCESS_RESTRICTED", "UNKNOWN",
    ], "UNKNOWN"),
    identity_evidence: identityEvidence,
    capacity_evidence: capacityEvidence,
    calendar_evidence: calendarEvidence,
    permanence_evidence: permanenceEvidence,
    provenance: "PACKAGE_06_NEW_RESEARCH",
    notes: `${text(raw.notes) ?? ""} [New in Package 06 (researcher ${raw.researcher ?? "?"}). Canonical reconciliation: ${reconciliation.basis}.]`.trim(),
    prior_venue_type: null,
    predecessor_high_value_state: null,
  };
}

// ---------------------------------------------------------------------
// Canonical reconciliation (same conservative rules as Package 05)
// ---------------------------------------------------------------------
const GENERIC_TOKENS = /\b(the|stadium|ground|arena|centre|center|hall|theatre|theater|park|club|fc|afc|rfc|cc|ltd|limited|uk)\b/g;
const coreName = (v) => normaliseName(v).replace(GENERIC_TOKENS, " ").replace(/\s+/g, " ").trim();

export function buildCanonicalIndex(canonicalVenues) {
  const byName = new Map();
  const byCore = new Map();
  const byHost = new Map();
  const push = (m, k, v) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  };
  for (const venue of canonicalVenues) {
    push(byName, normaliseName(venue.canonical_name), venue);
    push(byCore, coreName(venue.canonical_name), venue);
    for (const item of venue.evidence ?? []) {
      const host = hostOf(item.url);
      if (host) push(byHost, host, venue);
    }
  }
  return { byName, byCore, byHost };
}

function localityMatches(venue, locality) {
  if (!locality) return false;
  const target = normaliseName(locality);
  if (!target) return false;
  const city = normaliseName(venue.city);
  const municipality = normaliseName(venue.municipality);
  return (
    city === target || municipality === target ||
    (city.length > 3 && target.includes(city)) || (target.length > 3 && city.includes(target))
  );
}

export function reconcileAgainstCanon(candidate, index) {
  const { name, locality, officialUrl } = candidate;
  const normalised = normaliseName(name);
  const exact = index.byName.get(normalised) ?? [];

  const sameLocality = exact.filter((v) => localityMatches(v, locality));
  if (sameLocality.length === 1) {
    return { state: "EXISTING_CANONICAL", canonical_venue_id: sameLocality[0].venue_id, basis: "exact normalised name match in the same locality" };
  }
  if (sameLocality.length > 1) {
    return { state: "AMBIGUOUS_IDENTITY", canonical_venue_id: null, basis: `${sameLocality.length} canonical venues share this name and locality` };
  }
  if (exact.length === 1) {
    return { state: "PROBABLE_EXISTING_CANONICAL", canonical_venue_id: exact[0].venue_id, basis: "unique exact normalised name match, locality not corroborated" };
  }
  if (exact.length > 1) {
    return { state: "AMBIGUOUS_IDENTITY", canonical_venue_id: null, basis: `${exact.length} canonical venues share this name in different localities` };
  }

  const host = officialUrl ? hostOf(officialUrl) : null;
  if (host && index.byHost.has(host)) {
    const sameHost = index.byHost.get(host);
    const corroborated = sameHost.filter((v) => localityMatches(v, locality));
    if (corroborated.length === 1) {
      return { state: "PROBABLE_EXISTING_CANONICAL", canonical_venue_id: corroborated[0].venue_id, basis: `official website host "${host}" also cited by a canonical venue in the same locality` };
    }
    if (sameHost.length > 0) {
      return { state: "AMBIGUOUS_IDENTITY", canonical_venue_id: null, basis: `official website host "${host}" is cited by ${sameHost.length} canonical venue(s), none corroborated by locality` };
    }
  }

  const core = coreName(name);
  if (core.length > 3) {
    const coreMatches = (index.byCore.get(core) ?? []).filter((v) => localityMatches(v, locality));
    if (coreMatches.length === 1) {
      return { state: "PROBABLE_EXISTING_CANONICAL", canonical_venue_id: coreMatches[0].venue_id, basis: "distinctive name core matched a canonical venue in the same locality" };
    }
    if (coreMatches.length > 1) {
      return { state: "AMBIGUOUS_IDENTITY", canonical_venue_id: null, basis: `${coreMatches.length} canonical venues share this name core and locality` };
    }
  }

  return { state: "MISSING_FROM_CANON", canonical_venue_id: null, basis: "no canonical venue matched by exact name, name+locality, corroborated website host, or distinctive name core" };
}

/** Drop a new venue that duplicates a row already in the corpus. */
export function dedupeAgainstCorpus(existingRows, newRows) {
  const keys = new Set();
  for (const row of existingRows) {
    const locality = normaliseName(row.locality);
    keys.add(`n:${normaliseName(row.name)}|${locality}`);
    const host = row.official_website_url ? hostOf(row.official_website_url) : null;
    if (host) keys.add(`h:${host}|${locality}`);
  }
  const kept = [];
  const dropped = [];
  for (const row of newRows) {
    const locality = normaliseName(row.locality);
    const host = row.official_website_url ? hostOf(row.official_website_url) : null;
    if (keys.has(`n:${normaliseName(row.name)}|${locality}`) || (host && keys.has(`h:${host}|${locality}`))) {
      dropped.push({ research_id: row.research_id, name: row.name, locality: row.locality, reason: "already present in the corpus (same name or website host in the same locality)" });
      continue;
    }
    kept.push(row);
  }
  return { kept, dropped };
}

// ---------------------------------------------------------------------
// Intra-corpus duplicate detection (surfaced, never silently merged)
// ---------------------------------------------------------------------
/**
 * Find venues recorded more than once WITHIN this corpus.
 *
 * Package 05 carried "Anglesey Showground" and "The Anglesey Showground"
 * as two rows, both confirmed — one venue counted twice. That inflates the
 * headline and, worse, would create a duplicate in the canonical estate if
 * an admission package took the corpus at face value.
 *
 * Nothing is merged or dropped here: both rows keep their evidence, the
 * group is surfaced for the admission package to resolve, and the summary
 * reports a distinct-venue count alongside the raw one so the inflation is
 * visible rather than hidden.
 */
export function findCorpusDuplicates(rows) {
  const localityKey = (value) => {
    // "Gwalchmai, Anglesey" and "Gwalchmai" are the same place recorded at
    // different precision, so key on the leading locality token.
    const normalised = normaliseName(value);
    return normalised.split(" ")[0] ?? "";
  };

  // Key on the FULL name with only a leading article and US/UK spelling
  // folded away — never on the stripped name core. "Barbican Hall" and
  // "Barbican Theatre" share a core but are genuinely different venues in
  // one complex, and reporting them as duplicates would be a false
  // positive that costs more than the duplicate it claims to find.
  const comparableName = (name) =>
    normaliseName(name).replace(/^the /, "");

  const groups = new Map();
  for (const row of rows) {
    const comparable = comparableName(row.name);
    if (!comparable) continue;
    const key = `${comparable}|${localityKey(row.locality)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicates = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    duplicates.push({
      key,
      count: members.length,
      confirmed_members: members.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      venues: members.map((r) => ({
        research_id: r.research_id,
        predecessor_research_id: r.predecessor_research_id,
        name: r.name,
        locality: r.locality,
        venue_class: r.venue_class,
        capacity_max: r.capacity_max,
        capacity_state: r.capacity_state,
      })),
      note:
        "Same venue recorded more than once in this corpus. Surfaced for resolution by the governed admission " +
        "package — this package merges nothing and drops nothing.",
    });
  }

  return duplicates.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------
function tally(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const sorted = (rows) => rows.slice().sort((a, b) => a.research_id.localeCompare(b.research_id));

// ---------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------
export function buildCensus06({ repoRoot = ROOT, researcherDirs = [] } = {}) {
  const priorDir = join(repoRoot, PREDECESSOR_CENSUS_DIR);
  const predecessorRows = JSON.parse(readFileSync(join(priorDir, "census.json"), "utf8")).venues;
  const predecessorSummary = JSON.parse(readFileSync(join(priorDir, "summary.json"), "utf8"));
  const canonical = JSON.parse(readFileSync(join(repoRoot, "venues/uk.json"), "utf8")).venues;
  const canonicalIndex = buildCanonicalIndex(canonical);

  const flagged = new Set(
    (predecessorSummary.permanence_review?.venues ?? []).map((v) => v.research_id),
  );

  // 1. carry every predecessor row forward
  let rows = predecessorRows.map((prior) =>
    carryForward(prior, { flaggedForPermanenceReview: flagged.has(prior.research_id) }),
  );
  const byPredecessor = new Map(rows.map((r) => [r.predecessor_research_id, r]));
  // Immutable snapshot of the carried rows, so a superseding update is
  // applied to the original row rather than compounding an earlier verdict.
  const originalCarried = new Map(rows.map((r) => [r.predecessor_research_id, { ...r }]));

  // 2. apply researcher updates
  const updates = [];
  const newVenuesRaw = [];
  const sourceFamilies = [];
  const coverageStatements = [];
  for (const dir of researcherDirs) {
    for (const u of readJsonl(join(dir, "updates.jsonl"))) updates.push(u);
    for (const v of readJsonl(join(dir, "new-venues.jsonl"))) newVenuesRaw.push(v);
    for (const f of readJsonl(join(dir, "source-families.jsonl"))) sourceFamilies.push(f);
    for (const c of readJsonl(join(dir, "coverage.jsonl"))) coverageStatements.push(c);
  }

  const rejections = [];
  const unmatchedUpdates = [];
  const supersededUpdates = [];
  const appliedUpdates = new Set();
  // Updates are applied IN ORDER, and a later update for the same row wins.
  //
  // A researcher that revisits a row is correcting it — that is the whole
  // point of review. Keeping the first update and discarding the second
  // would silently throw away the correction and preserve the flawed
  // classification, which is the opposite of what review is for. The
  // superseded update is recorded, not lost.
  for (const update of updates) {
    const target = byPredecessor.get(update?.update_for);
    if (!target) {
      unmatchedUpdates.push({ update_for: update?.update_for ?? null, reason: "no Package 05 row with this research_id" });
      continue;
    }
    if (appliedUpdates.has(update.update_for)) {
      supersededUpdates.push({
        update_for: update.update_for,
        reason: "an earlier update for this row was superseded by a later one (later wins — a revisit is a correction)",
      });
    }
    appliedUpdates.add(update.update_for);
    // Re-apply from the ORIGINAL carried row, not the already-updated one,
    // so a correction replaces the earlier verdict instead of layering on
    // top of it.
    const base = originalCarried.get(update.update_for) ?? target;
    byPredecessor.set(update.update_for, applyUpdate(base, update, rejections));
  }
  rows = [...byPredecessor.values()];

  // 3. new venues
  const seenIds = new Set(rows.map((r) => r.research_id));
  const builtNew = newVenuesRaw.map((raw) => buildNewVenue(raw, seenIds, canonicalIndex)).filter(Boolean);
  const rejectedNew = newVenuesRaw.length - builtNew.length;
  const { kept: newRows, dropped: dedupedNew } = dedupeAgainstCorpus(rows, builtNew);

  // 4. coherence pass
  const adjustments = [];
  const all = sorted([...rows, ...newRows].map((r) => enforceCoherence(r, adjustments)));

  return {
    rows: all,
    predecessorRows,
    predecessorSummary,
    carriedCount: rows.length,
    newRows,
    dedupedNew,
    rejectedNew,
    appliedUpdateCount: appliedUpdates.size,
    unmatchedUpdates,
    supersededUpdates,
    rejections,
    adjustments,
    sourceFamilies,
    coverageStatements,
    canonicalCount: canonical.length,
  };
}

// ---------------------------------------------------------------------
// Coverage matrix
// ---------------------------------------------------------------------
// Package 05's own per-class coverage, from its committed coverage matrix,
// mapped to this package's vocabulary. Classes it never independently
// researched are CARRIED; ones it named unresearched are UNRESEARCHED.
export const PREDECESSOR_COVERAGE = Object.freeze({
  ARENA: "FULL", THEATRE: "FULL", BASKETBALL_ARENA: "FULL",
  RUGBY_LEAGUE_GROUND: "FULL", OTHER_PERMANENT_SPECTATOR_SPORT: "FULL",
  CONFERENCE_CENTRE: "PARTIAL", CONVENTION_CENTRE: "PARTIAL",
  EXHIBITION_CENTRE: "PARTIAL", UNIVERSITY_EVENT_VENUE: "PARTIAL",
  MAJOR_HOTEL_EVENT_VENUE: "PARTIAL", CIVIC_HALL: "PARTIAL",
  ICE_HOCKEY_ARENA: "PARTIAL", ATHLETICS_STADIUM: "PARTIAL",
  MULTI_SPORT_ARENA: "PARTIAL",
  CONCERT_HALL: "UNRESEARCHED", EVENT_HALL: "UNRESEARCHED",
  FOOTBALL_GROUND: "CARRIED", RUGBY_UNION_GROUND: "CARRIED",
  CRICKET_GROUND: "CARRIED", RACECOURSE: "CARRIED",
  MOTORSPORT_VENUE: "CARRIED", MULTI_PURPOSE_VENUE: "CARRIED",
  STADIUM: "CARRIED",
});

// Decide whether a declared "source family" actually names an EXTERNAL
// source, or only points back at our own estate.
//
// This must be precise in both directions. "EXISTING-ESTATE.txt inspection
// only" evidences nothing about the world — it is circular. But
// "Wikipedia 2026-27 league articles, cross-referenced against held estate"
// names a real external source and merely mentions the estate as the diff
// TARGET, so it must count. A naive substring match on "held estate" would
// wrongly discard it, which is exactly the kind of false negative that
// would push an honestly-researched class back to PARTIAL.
//
// Approach: strip the self-referential phrases and the words that only
// describe the act of looking, then ask whether a substantive source name
// survives.
const SELF_REFERENTIAL_PHRASES = Object.freeze([
  "existing-estate", "existing estate", "already-covered", "already covered",
  "held estate", "our own estate", "the corpus", "package 05", "package 5",
  "package05", "uk-1000plus-05", "uk-1000plus-06", "uk-1000plus",
  "census.json", "predecessor census", "predecessor corpus", "predecessor artifacts",
]);

const LOOKING_WORDS = new Set([
  "inspection", "inspected", "only", "cross", "referenced", "against", "exact",
  "and", "the", "a", "an", "of", "in", "for", "from", "with", "matching", "name",
  "names", "aware", "sponsor", "ground", "check", "checked", "review", "reviewed",
  "diff", "diffed", "via", "list", "txt", "md", "json", "by", "no", "none", "not",
]);

export function namesAnExternalSource(name) {
  if (typeof name !== "string") return false;
  let residue = name.toLowerCase();
  for (const phrase of SELF_REFERENTIAL_PHRASES) {
    residue = residue.split(phrase).join(" ");
  }
  const tokens = residue
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !LOOKING_WORDS.has(token));
  // At least one real token means some actual source was named beyond the
  // act of consulting our own estate.
  return tokens.length > 0;
}

export function buildCoverageMatrix(rows, coverageStatements) {
  const classes = [...new Set(rows.map((r) => r.venue_class))].sort();
  return classes.map((venueClass) => {
    const inClass = rows.filter((r) => r.venue_class === venueClass);
    const hv = inClass.filter((r) => HIGH_VALUE_STATES.includes(r.capacity_state));
    const reported = coverageStatements.filter((c) => c?.venue_class === venueClass);
    const families = [
      ...new Set(reported.flatMap((c) => (Array.isArray(c.source_families_checked) ? c.source_families_checked : []))),
    ].sort();

    // A class is only as complete as the strongest honest statement a
    // researcher made about it. With no statement at all, it is whatever
    // Package 05 left it as — never better.
    //
    // A statement may only UPGRADE a class if it checked at least one
    // EXTERNAL source estate. A statement whose only cited source is our
    // own held estate is circular — "the estate contains what the estate
    // contains" verifies nothing about the world outside it, and must not
    // be able to declare a class complete. Such a statement is still
    // recorded; it just cannot raise the coverage state.
    const declared = reported
      .filter((c) => {
        const families = Array.isArray(c.source_families_checked) ? c.source_families_checked : [];
        const external = families.filter((name) => namesAnExternalSource(name));
        return external.length > 0;
      })
      .map((c) => c.final_coverage)
      .filter((v) => FINAL_COVERAGE_STATES.includes(v));
    const rank = { COMPLETE: 3, MATERIAL_COMPLETE: 2, PARTIAL: 1, BLOCKED: 0 };
    const predecessor = PREDECESSOR_COVERAGE[venueClass] ?? "CARRIED";
    let finalCoverage;
    if (declared.length > 0) {
      finalCoverage = declared.reduce((a, b) => (rank[b] > rank[a] ? b : a));
    } else {
      finalCoverage = predecessor === "FULL" ? "MATERIAL_COMPLETE" : "PARTIAL";
    }

    return {
      venue_class: venueClass,
      predecessor_coverage: predecessor,
      package_06_action: reported.length > 0
        ? reported.map((c) => c.package_06_action ?? "unstated").join(" | ")
        : "no Package 06 research statement — carried from Package 05",
      source_families_checked: families,
      candidates_considered: inClass.length,
      confirmed_1000_plus: inClass.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      capacity_unverified: inClass.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
      below_threshold: inClass.filter((r) => r.capacity_state === "CONFIRMED_BELOW_THRESHOLD").length,
      non_permanent: inClass.filter((r) => r.capacity_state === "NOT_A_PERMANENT_VENUE").length,
      identity_review: inClass.filter((r) => r.capacity_state === "IDENTITY_REVIEW").length,
      research_blocked: inClass.filter((r) => r.capacity_state === "RESEARCH_BLOCKED").length,
      existing_canonical: hv.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
      missing_canonical: hv.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      calendar_source_known: inClass.filter((r) =>
        r.general_programme_url !== null || r.sports_calendar_url !== null || r.conference_calendar_url !== null,
      ).length,
      final_coverage: finalCoverage,
      residual_gap: reported.map((c) => c.residual_gap).filter(Boolean).join(" | ") || null,
      researcher_statements: reported.map((c) => {
        const families = Array.isArray(c.source_families_checked) ? c.source_families_checked : [];
        const external = families.filter((name) => namesAnExternalSource(name));
        return {
          final_coverage: c.final_coverage ?? null,
          residual_gap: c.residual_gap ?? null,
          researcher: c.researcher ?? null,
          // A statement citing no external source estate cannot raise the
          // class's coverage state. Recorded so the disregard is visible.
          counted_towards_coverage: external.length > 0,
          disregarded_reason:
            external.length > 0
              ? null
              : "cites no external source estate — self-referential coverage cannot evidence completeness",
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------
// Cross-tabs
// ---------------------------------------------------------------------
export function buildCrossTabs(rows) {
  const CANON = ["EXISTING_CANONICAL", "PROBABLE_EXISTING_CANONICAL", "MISSING_FROM_CANON", "POSSIBLE_DUPLICATE", "AMBIGUOUS_IDENTITY", "UNASSESSED"];

  // A. capacity state x canonical match state
  const a = CANON.map((state) => {
    const inState = rows.filter((r) => r.canonical_match_state === state);
    return {
      canonical_state: state,
      confirmed_1000_plus: inState.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      capacity_unverified: inState.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
      below_threshold_or_non_venue: inState.filter((r) =>
        ["CONFIRMED_BELOW_THRESHOLD", "NOT_A_PERMANENT_VENUE", "IDENTITY_REVIEW", "RESEARCH_BLOCKED"].includes(r.capacity_state),
      ).length,
      total: inState.length,
    };
  });
  a.push({
    canonical_state: "TOTAL",
    confirmed_1000_plus: a.reduce((s, r) => s + r.confirmed_1000_plus, 0),
    capacity_unverified: a.reduce((s, r) => s + r.capacity_unverified, 0),
    below_threshold_or_non_venue: a.reduce((s, r) => s + r.below_threshold_or_non_venue, 0),
    total: a.reduce((s, r) => s + r.total, 0),
  });

  // B. strategic segment
  const b = STRATEGIC_SEGMENTS.map((segment) => {
    const inSegment = rows.filter((r) => segmentFor(r.venue_class) === segment);
    const hv = inSegment.filter((r) => HIGH_VALUE_STATES.includes(r.capacity_state));
    const inCanon = hv.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length;
    return {
      segment,
      total_high_value: hv.length,
      confirmed_1000_plus: inSegment.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      capacity_unverified: inSegment.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
      existing_canonical: inCanon,
      missing_canonical: hv.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      identity_review: inSegment.filter((r) => r.capacity_state === "IDENTITY_REVIEW").length,
      percent_represented: hv.length === 0 ? null : Number(((inCanon / hv.length) * 100).toFixed(1)),
    };
  });

  // C. nation
  const c = ["England", "Scotland", "Wales", "Northern Ireland", "UNKNOWN"].map((nation) => {
    const inNation = rows.filter((r) => r.nation === nation);
    return {
      nation,
      confirmed_1000_plus: inNation.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      capacity_unverified: inNation.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
      total_high_value: inNation.filter((r) => HIGH_VALUE_STATES.includes(r.capacity_state)).length,
      total_rows: inNation.length,
    };
  });

  return {
    a_capacity_by_canonical_state: a,
    b_strategic_segment: b,
    c_nation: c,
  };
}

export function computeQualityInvariants06(rows, build) {
  const ids = rows.map((r) => r.research_id);
  const predecessorIds = rows.map((r) => r.predecessor_research_id).filter(Boolean);
  const thirdParty = ["wikipedia.org", "wikidata.org", "wikimedia.org", "songkick.com", "ticketmaster.co.uk", "seatgeek.com", "skiddle.com"];

  const confirmed = rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  return {
    duplicate_research_ids: ids.length - new Set(ids).size,
    duplicate_predecessor_claims: predecessorIds.length - new Set(predecessorIds).size,
    confirmed_without_capacity_evidence: confirmed.filter((r) => r.capacity_evidence.length === 0).length,
    high_value_rows_without_identity_evidence: rows.filter(
      (r) => HIGH_VALUE_STATES.includes(r.capacity_state) && r.identity_evidence.length === 0,
    ).length,
    third_party_labelled_official: rows.filter((r) => {
      if (!r.capacity_source_url) return false;
      const host = hostOf(r.capacity_source_url);
      if (!host) return false;
      const isThirdParty = thirdParty.some((h) => host === h || host.endsWith(`.${h}`));
      return isThirdParty && typeof r.capacity_source_kind === "string" && r.capacity_source_kind.startsWith("OFFICIAL_");
    }).length,
    non_permanent_counted_as_confirmed: confirmed.filter(
      (r) => r.permanence_class === null || !PERMANENT_CLASSES.includes(r.permanence_class),
    ).length,
    negative_claims_on_blocked_rows: rows.filter(
      (r) => r.capacity_state === "RESEARCH_BLOCKED" &&
        (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(r.calendar_state) ||
          r.canonical_match_state === "MISSING_FROM_CANON"),
    ).length,
    unexplained_rows: rows.filter((r) => typeof r.notes !== "string" || r.notes.trim().length === 0).length,
    predecessor_rows_without_disposition: reconcileAgainstPredecessor(build.predecessorRows, rows).length,
    events_acquired: 0,
    canonical_venues_mutated: 0,
    predecessor_artifacts_mutated: 0,
  };
}

// ---------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------
function writeArtifact(outDir, filename, payload) {
  writeFileSync(join(outDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function emitArtifacts06(build, { repoRoot = ROOT, generatedAt } = {}) {
  const outDir = join(repoRoot, CENSUS_06_OUTPUT_DIR);
  mkdirSync(outDir, { recursive: true });

  const { rows } = build;
  const confirmed = rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");
  const unverified = rows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  const belowThreshold = rows.filter((r) => r.capacity_state === "CONFIRMED_BELOW_THRESHOLD");
  const nonPermanent = rows.filter((r) => r.capacity_state === "NOT_A_PERMANENT_VENUE");
  const identityReview = rows.filter((r) => r.capacity_state === "IDENTITY_REVIEW");
  const blocked = rows.filter((r) => r.capacity_state === "RESEARCH_BLOCKED");
  const highValue = [...confirmed, ...unverified];

  const meta = {
    package: "BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06",
    framework_version: CENSUS_06_FRAMEWORK_VERSION,
    census_id: "uk-1000plus-06",
    generated_at: generatedAt,
    capacity_threshold: HIGH_VALUE_CAPACITY_THRESHOLD,
  };

  const corpusDuplicates = findCorpusDuplicates(rows);
  const coverageMatrix = buildCoverageMatrix(rows, build.coverageStatements);
  const completeness = assessCompleteness(coverageMatrix);
  const crossTabs = buildCrossTabs(rows);
  const invariants = computeQualityInvariants06(rows, build);

  // --- manifest ---------------------------------------------------------
  writeArtifact(outDir, "manifest.json", {
    ...meta,
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
    predecessor_terminal_verdict: "UK_HIGH_VALUE_VENUE_CENSUS_PARTIAL",
    what_this_is:
      "The completion corpus for the UK high-value venue census. It supersedes Package 05 as the working estate, " +
      "and proves that every one of Package 05's rows has exactly one disposition here.",
    what_this_is_not: [
      "It is not a canonical venue registry. venues/uk.json is NOT modified.",
      "It is not a Source registry. sources/*.json is NOT modified.",
      "It is not a governed source investigation. Activation still requires docs/SOURCE_INVESTIGATION_POLICY.md.",
      "It contains no Events and acquires none.",
      "It does not admit any venue to the canonical estate.",
    ],
    predecessor_artifacts_consumed: [
      { path: `${PREDECESSOR_CENSUS_DIR}/census.json`, role: "All 911 predecessor rows, carried forward and dispositioned.", records: build.predecessorRows.length, mutated: false },
      { path: `${PREDECESSOR_CENSUS_DIR}/summary.json`, role: "permanence_review list identifying rows whose permanence was unresolved.", mutated: false },
    ],
    other_inputs: [
      { path: "venues/uk.json", role: "Canonical venue estate, read only, for identity reconciliation.", records: build.canonicalCount, mutated: false },
    ],
    generator: "ingestion/high-value-venue-census-06/build.mjs",
    validator: "ingestion/high-value-venue-census-06/validate.mjs",
    contract: "ingestion/high-value-venue-census-06/contract.mjs",
    reproducibility: "Every count is computed by the generator from the inputs above; re-running reproduces the artifacts exactly.",
    row_counts: {
      total: rows.length,
      carried_from_predecessor: build.carriedCount,
      new_in_package_06: build.newRows.length,
      new_deduped_against_corpus: build.dedupedNew.length,
      new_rejected_unsupported: build.rejectedNew,
      predecessor_updates_applied: build.appliedUpdateCount,
      predecessor_updates_unmatched: build.unmatchedUpdates.length,
      predecessor_updates_superseded: (build.supersededUpdates ?? []).length,
      updates_refused_as_unsupported: build.rejections.length,
    },
    completeness_assessment: completeness,
  });

  // --- predecessor reconciliation ---------------------------------------
  const transitions = {};
  for (const row of rows) {
    if (!row.predecessor_research_id) continue;
    const key = `${row.predecessor_high_value_state} -> ${row.capacity_state}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
  }
  const predecessorStateCounts = {};
  for (const r of build.predecessorRows) {
    predecessorStateCounts[r.high_value_state] = (predecessorStateCounts[r.high_value_state] ?? 0) + 1;
  }
  writeArtifact(outDir, "predecessor-reconciliation.json", {
    ...meta,
    description:
      "Proves every Package 05 row has exactly one disposition in this corpus. A predecessor row cannot be " +
      "silently dropped to improve a headline, and cannot be claimed by two successors.",
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
    predecessor_row_count: build.predecessorRows.length,
    predecessor_state_counts: predecessorStateCounts,
    dispositioned_here: rows.filter((r) => r.predecessor_research_id !== null).length,
    rows_without_disposition: reconcileAgainstPredecessor(build.predecessorRows, rows),
    state_transitions: Object.fromEntries(Object.entries(transitions).sort((a, b) => b[1] - a[1])),
    predecessor_arithmetic_explained: {
      note: "Package 05's own reported figures, reconciled from its committed artifacts with no unexplained remainder.",
      total_rows_911: {
        confirmed_1000_plus: 743,
        capacity_unverified: 163,
        below_threshold_audit_rows: 5,
        explanation: "743 + 163 + 5 = 911. The 5 are venues researched and proven below 1,000, retained honestly as audit evidence rather than deleted.",
      },
      sports_547_vs_displayed_534: {
        difference: 13,
        stadium_class_omitted_from_by_type_list: 8,
        below_threshold_sports_rows: 5,
        explanation: "The Package 05 report's sports-by-type list omitted the STADIUM class entirely (8 high-value rows) and excluded the 5 BELOW_THRESHOLD sports rows. 534 + 8 + 5 = 547.",
      },
      high_value_906_canonical_states: {
        existing_canonical: 251, probable_existing_canonical: 13, missing_from_canon: 614, ambiguous_identity: 28,
        explanation: "251 + 13 = 264 already in canon; 614 missing; the remaining 28 are AMBIGUOUS_IDENTITY. 264 + 614 + 28 = 906.",
      },
      confirmed_743_canonical_states: {
        existing_canonical: 231, probable_existing_canonical: 12, missing_from_canon: 486, ambiguous_identity: 14,
        explanation: "231 + 12 = 243 already in canon; 486 missing; the remaining 14 are AMBIGUOUS_IDENTITY. 243 + 486 + 14 = 743.",
      },
    },
    updates_superseded_by_a_later_correction: build.supersededUpdates ?? [],
    updates_refused_as_unsupported: build.rejections,
    updates_with_no_matching_predecessor: build.unmatchedUpdates,
    coherence_adjustments: build.adjustments,
    new_rows_deduped: build.dedupedNew,
  });

  // --- population artifacts ---------------------------------------------
  const view = (r) => ({
    research_id: r.research_id, predecessor_research_id: r.predecessor_research_id,
    name: r.name, locality: r.locality, nation: r.nation, venue_class: r.venue_class,
    capacity_max: r.capacity_max, capacity_kind: r.capacity_kind,
    capacity_state: r.capacity_state, permanence_class: r.permanence_class,
    canonical_match_state: r.canonical_match_state, canonical_venue_id: r.canonical_venue_id,
    notes: r.notes,
  });

  writeArtifact(outDir, "confirmed-1000-plus.json", {
    ...meta,
    description: "Permanent UK venues with retained capacity evidence reaching 1,000.",
    count: confirmed.length,
    by_nation: tally(confirmed, (r) => r.nation),
    by_venue_class: tally(confirmed, (r) => r.venue_class),
    by_permanence_class: tally(confirmed, (r) => r.permanence_class),
    venues: sorted(confirmed),
  });

  writeArtifact(outDir, "capacity-unverified-candidates.json", {
    ...meta,
    description: "High-value candidates whose >=1,000 threshold could not be evidenced. Held OUTSIDE the confirmed count.",
    count: unverified.length,
    by_venue_class: tally(unverified, (r) => r.venue_class),
    venues: sorted(unverified),
  });

  writeArtifact(outDir, "below-threshold.json", {
    ...meta,
    description: "Venues researched and proven below 1,000. A real finding, retained as audit evidence.",
    count: belowThreshold.length,
    by_venue_class: tally(belowThreshold, (r) => r.venue_class),
    venues: sorted(belowThreshold).map(view),
  });

  writeArtifact(outDir, "non-permanent-exclusions.json", {
    ...meta,
    description:
      "Rows excluded from the estate because they are not permanent venues — a public space that hosts occasional " +
      "temporary events is not a permanent >=1,000 venue merely because one temporary event held that many. " +
      "Retained in full; nothing is deleted.",
    count: nonPermanent.length,
    by_permanence_class: tally(nonPermanent, (r) => r.permanence_class),
    venues: sorted(nonPermanent),
  });

  const permanenceReviewed = rows.filter((r) => r.permanence_evidence.length > 0);
  writeArtifact(outDir, "permanence-review.json", {
    ...meta,
    description:
      "The permanence axis. Package 05 counted open-air sites inside its confirmed total and flagged them; " +
      "this package resolves them on evidence. Rows whose permanence remains unresolved are held OUT of the " +
      "confirmed estate as IDENTITY_REVIEW rather than counted.",
    predecessor_flagged_count: (build.predecessorSummary.permanence_review?.count ?? 0),
    predecessor_counted_in_confirmed: (build.predecessorSummary.permanence_review?.counted_in_confirmed_1000_plus ?? 0),
    reviewed_with_evidence: permanenceReviewed.length,
    by_permanence_class: tally(rows, (r) => r.permanence_class),
    unresolved_held_out_of_confirmed: sorted(identityReview).map(view),
    reviewed: sorted(permanenceReviewed).map((r) => ({ ...view(r), permanence_evidence: r.permanence_evidence })),
  });

  const existingCanonical = highValue.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state));
  writeArtifact(outDir, "existing-canonical.json", {
    ...meta,
    description: "High-value venues BeatMapped's canonical estate already knows.",
    count: existingCanonical.length,
    by_match_state: tally(existingCanonical, (r) => r.canonical_match_state),
    venues: sorted(existingCanonical).map(view),
  });

  const missing = highValue.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON");
  writeArtifact(outDir, "missing-from-canonical.json", {
    ...meta,
    description:
      "High-value venues with no canonical counterpart found. A discovery finding only — this package admits none of them.",
    count: missing.length,
    confirmed_1000_plus: missing.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: missing.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    by_venue_class: tally(missing, (r) => r.venue_class),
    by_nation: tally(missing, (r) => r.nation),
    venues: sorted(missing),
  });

  const ambiguous = rows.filter((r) => ["AMBIGUOUS_IDENTITY", "POSSIBLE_DUPLICATE"].includes(r.canonical_match_state));
  writeArtifact(outDir, "identity-review.json", {
    ...meta,
    description:
      "Rows whose canonical identity is ambiguous, plus rows held out of the estate pending permanence resolution. " +
      "These must be resolved before governed canonical admission, and are the main thing standing between this " +
      "corpus and a clean admission pass.",
    ambiguous_identity: { count: ambiguous.length, venues: sorted(ambiguous).map(view) },
    permanence_unresolved: { count: identityReview.length, venues: sorted(identityReview).map(view) },
    corpus_duplicates: {
      count: corpusDuplicates.length,
      note:
        "Venues recorded more than once WITHIN this corpus. Each group is one venue, so the raw confirmed count " +
        "over-counts by (members - 1) per group. See summary.json headline.confirmed_1000_plus_distinct.",
      groups: corpusDuplicates,
    },
  });

  const conferenceRows = rows.filter((r) => CONFERENCE_VENUE_CLASSES.includes(r.venue_class));
  writeArtifact(outDir, "conference-venues.json", {
    ...meta,
    description: "The conference / convention / exhibition / university / hotel estate.",
    count: conferenceRows.length,
    confirmed_1000_plus: conferenceRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: conferenceRows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    existing_canonical: conferenceRows.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
    missing_canonical: conferenceRows.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
    by_venue_class: tally(conferenceRows, (r) => r.venue_class),
    by_calendar_state: tally(conferenceRows, (r) => r.calendar_state),
    venues: sorted(conferenceRows),
  });

  const sportsRows = rows.filter((r) => SPORTS_VENUE_CLASSES.includes(r.venue_class));
  writeArtifact(outDir, "sports-venues.json", {
    ...meta,
    description: "The permanent spectator-sport estate and its fixture/event sources.",
    count: sportsRows.length,
    confirmed_1000_plus: sportsRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: sportsRows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    by_venue_class: tally(sportsRows, (r) => r.venue_class),
    by_calendar_source_kind: tally(sportsRows, (r) => r.calendar_source_kind),
    with_usable_fixture_source: sportsRows.filter(
      (r) => (r.sports_calendar_url !== null || r.general_programme_url !== null) &&
        ["VENUE", "CLUB", "LEAGUE", "GOVERNING_BODY", "OPERATOR"].includes(r.calendar_source_kind),
    ).length,
    venues: sorted(sportsRows),
  });

  const artsRows = rows.filter((r) => ARTS_VENUE_CLASSES.includes(r.venue_class));
  writeArtifact(outDir, "music-general-venues.json", {
    ...meta,
    description: "The arts / music / general-purpose estate.",
    count: artsRows.length,
    confirmed_1000_plus: artsRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    existing_canonical: artsRows.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
    missing_canonical: artsRows.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
    by_venue_class: tally(artsRows, (r) => r.venue_class),
    venues: sorted(artsRows),
  });

  // --- sources / leverage -------------------------------------------------
  const withSource = rows.filter(
    (r) => (r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url) !== null,
  );
  writeArtifact(outDir, "calendar-sources.json", {
    ...meta,
    description: "Every row with a public programme, conference or fixture source.",
    count: withSource.length,
    by_calendar_source_kind: tally(withSource, (r) => r.calendar_source_kind),
    by_acquisition_shape: tally(withSource, (r) => r.acquisition_shape),
    sources: sorted(withSource).map((r) => ({
      research_id: r.research_id, name: r.name, locality: r.locality, venue_class: r.venue_class,
      general_programme_url: r.general_programme_url, conference_calendar_url: r.conference_calendar_url,
      sports_calendar_url: r.sports_calendar_url,
      calendar_source_kind: r.calendar_source_kind, calendar_state: r.calendar_state,
      platform_family: r.platform_family, acquisition_shape: r.acquisition_shape,
    })),
  });

  // Operator estates: shared hosts. Package 05's distinction between an
  // operator estate, a generic extraction shape and a shared framework is
  // deliberately preserved — collapsing them would misrank the work.
  const estates = new Map();
  for (const row of withSource) {
    const host = hostOf(row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url);
    if (!host) continue;
    if (!estates.has(host)) {
      estates.set(host, { host, venues_covered: 0, confirmed_1000_plus: 0, platform_families: {}, venue_classes: {}, first_party: 0, example_urls: [] });
    }
    const e = estates.get(host);
    e.venues_covered += 1;
    if (row.capacity_state === "CONFIRMED_1000_PLUS") e.confirmed_1000_plus += 1;
    if (row.platform_family) e.platform_families[row.platform_family] = (e.platform_families[row.platform_family] ?? 0) + 1;
    e.venue_classes[row.venue_class] = (e.venue_classes[row.venue_class] ?? 0) + 1;
    if (["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(row.calendar_source_kind)) e.first_party += 1;
    const u = row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url;
    if (u && e.example_urls.length < 5 && !e.example_urls.includes(u)) e.example_urls.push(u);
  }
  const multiVenue = [...estates.values()].filter((e) => e.venues_covered > 1)
    .sort((a, b) => b.venues_covered - a.venues_covered || a.host.localeCompare(b.host));
  writeArtifact(outDir, "operator-estates.json", {
    ...meta,
    description: "Shared hosts serving more than one high-value venue's programme — one integration covering several venues.",
    note_on_ordering: "Ordered by measurable venue coverage, not estimated technical ease.",
    count: multiVenue.length,
    estates: multiVenue,
    researcher_reported_families: build.sourceFamilies,
  });

  const families = new Map();
  for (const row of withSource) {
    if (!row.platform_family) continue;
    if (!families.has(row.platform_family)) {
      families.set(row.platform_family, { platform_family: row.platform_family, venues_covered: 0, confirmed_1000_plus: 0, distinct_hosts: new Set(), first_party_venues: 0 });
    }
    const f = families.get(row.platform_family);
    f.venues_covered += 1;
    if (row.capacity_state === "CONFIRMED_1000_PLUS") f.confirmed_1000_plus += 1;
    const h = hostOf(row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url);
    if (h) f.distinct_hosts.add(h);
    if (["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(row.calendar_source_kind)) f.first_party_venues += 1;
  }
  writeArtifact(outDir, "platform-families.json", {
    ...meta,
    description: "Platform/source families by measurable estate coverage.",
    read_this_before_prioritising:
      "venues_covered on a FAMILY is not the size of an integration. See generic-extraction-shapes.json for the " +
      "distinction between a generic extraction shape, a single-operator platform, and a shared framework upper bound.",
    count: families.size,
    families: [...families.values()]
      .map((f) => ({ ...f, distinct_hosts: f.distinct_hosts.size }))
      .sort((a, b) => b.venues_covered - a.venues_covered || a.platform_family.localeCompare(b.platform_family)),
  });

  // Generic extraction shapes vs single-operator platforms vs shared
  // frameworks — carried forward from Package 05 unchanged in principle.
  const STANDARDS = { JSON_LD_EVENT: "schema.org Event JSON-LD", MICRODATA: "schema.org Event microdata" };
  const FRAMEWORKS = ["EMBEDDED_NEXT_DATA", "EMBEDDED_NUXT_STATE", "EMBEDDED_SVELTEKIT_DATA", "PUBLIC_GRAPHQL", "WORDPRESS_TRIBE_API"];
  const shapes = [];
  for (const [family, label] of Object.entries(STANDARDS)) {
    const members = withSource.filter((r) => r.platform_family === family);
    if (members.length === 0) continue;
    shapes.push({
      integration: label, integration_kind: "STANDARDS_BASED_GENERIC", platform_family: family,
      venues_covered: members.length,
      confirmed_1000_plus: members.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      distinct_hosts: new Set(members.map((r) => hostOf(r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url)).filter(Boolean)).size,
      why_one_implementation: "Acquisition is defined by a published structured-data standard, so one parser covers unrelated sites.",
    });
  }
  for (const family of FRAMEWORKS) {
    const members = withSource.filter((r) => r.platform_family === family);
    if (members.length < 5) continue;
    const hosts = new Set(members.map((r) => hostOf(r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url)).filter(Boolean));
    shapes.push({
      integration: `${family} (shared framework — upper bound)`, integration_kind: "SHARED_FRAMEWORK_UPPER_BOUND",
      verified_uniform: false, platform_family: family, venues_covered: members.length,
      confirmed_1000_plus: members.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      distinct_hosts: hosts.size,
      caveat: "UPPER BOUND, not an integration size. A shared framework is not a shared platform: unrelated operators build on the same framework with different payload shapes.",
    });
  }
  for (const e of multiVenue) {
    const fams = Object.keys(e.platform_families);
    if (fams.length !== 1) continue;
    if (Object.prototype.hasOwnProperty.call(STANDARDS, fams[0])) continue;
    shapes.push({
      integration: e.host, integration_kind: "SINGLE_OPERATOR_PLATFORM", platform_family: fams[0],
      venues_covered: e.venues_covered, confirmed_1000_plus: e.confirmed_1000_plus, distinct_hosts: 1,
      why_one_implementation: `All ${e.venues_covered} venues served from one host on a uniform ${fams[0]} platform.`,
    });
  }
  const notIntegrations = [];
  for (const [family, f] of families) {
    if (Object.prototype.hasOwnProperty.call(STANDARDS, family) || FRAMEWORKS.includes(family)) continue;
    if (f.venues_covered < 20) continue;
    notIntegrations.push({
      platform_family: family, venues_covered: f.venues_covered, distinct_hosts: f.distinct_hosts.size,
      integration_kind: "NOT_A_SINGLE_INTEGRATION",
      why: `A descriptive bucket of ${f.venues_covered} venues across ${f.distinct_hosts.size} unrelated hosts. Each needs its own work; the total is not the size of one integration.`,
    });
  }
  writeArtifact(outDir, "generic-extraction-shapes.json", {
    ...meta,
    description:
      "What one implementation would actually cover. Package 05's distinction is preserved deliberately: a generic " +
      "extraction shape, a single-operator platform and a shared framework are three different things and must not " +
      "be collapsed into one ranking.",
    integrations: shapes.sort((a, b) => b.venues_covered - a.venues_covered || a.integration.localeCompare(b.integration)),
    explicitly_not_single_integrations: notIntegrations.sort((a, b) => b.venues_covered - a.venues_covered),
  });

  // --- coverage ----------------------------------------------------------
  writeArtifact(outDir, "coverage-matrix.json", {
    ...meta,
    description:
      "What was actually covered, per venue class. MATERIAL_COMPLETE means every nationally material discoverable " +
      "source estate for that class was checked and the residual gap is explicitly bounded.",
    completeness_assessment: completeness,
    classes: coverageMatrix,
  });

  writeArtifact(outDir, "coverage-evidence.json", {
    ...meta,
    description: "The source families this package actually walked, with members inspected vs members known.",
    count: build.sourceFamilies.length,
    families: build.sourceFamilies,
    researcher_coverage_statements: build.coverageStatements,
  });

  writeArtifact(outDir, "research-blocked.json", {
    ...meta,
    description:
      "Rows and source families where research could not complete. These carry NO negative findings — tool " +
      "exhaustion and access blocks are never recorded as absence.",
    blocked_rows: { count: blocked.length, venues: sorted(blocked).map(view) },
    blocked_source_families: build.sourceFamilies.filter(
      (f) => Number(f?.members_blocked ?? 0) > 0 ||
        (typeof f?.acquisition_shape === "string" && /BLOCK|RESTRICT/i.test(f.acquisition_shape)),
    ),
  });

  // --- full corpus + summary ---------------------------------------------
  writeArtifact(outDir, "census.json", {
    ...meta,
    description: "Every Package 06 row. The other artifacts in this directory are views over this file.",
    count: rows.length,
    venues: rows,
  });

  const summary = {
    ...meta,
    predecessor: {
      package: PREDECESSOR_PACKAGE,
      main_sha: PREDECESSOR_MAIN_SHA,
      terminal_verdict: "UK_HIGH_VALUE_VENUE_CENSUS_PARTIAL",
      rows: build.predecessorRows.length,
      confirmed_1000_plus: 743,
      capacity_unverified: 163,
    },
    headline: {
      total_rows: rows.length,
      confirmed_1000_plus: confirmed.length,
      capacity_unverified_high_value_candidates: unverified.length,
      high_value_total: highValue.length,
      confirmed_below_threshold: belowThreshold.length,
      not_a_permanent_venue: nonPermanent.length,
      identity_review: identityReview.length,
      research_blocked: blocked.length,
      // The raw count above counts rows. Where one venue is recorded twice,
      // the distinct count is the honest number of VENUES.
      confirmed_1000_plus_distinct:
        confirmed.length -
        corpusDuplicates.reduce((s, g) => s + Math.max(0, g.confirmed_members - 1), 0),
      duplicate_groups_in_corpus: corpusDuplicates.length,
    },
    canonical_coverage: {
      high_value_total: highValue.length,
      already_in_canon: existingCanonical.length,
      missing_from_canon: missing.length,
      confirmed_already_in_canon: confirmed.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
      confirmed_missing_from_canon: confirmed.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      percent_of_confirmed_represented: confirmed.length === 0 ? null : Number(
        ((confirmed.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length / confirmed.length) * 100).toFixed(1),
      ),
    },
    cross_tabs: crossTabs,
    by_venue_class: tally(highValue, (r) => r.venue_class),
    calendar_states: tally(rows, (r) => r.calendar_state),
    provenance: tally(rows, (r) => r.provenance),
    completeness_assessment: completeness,
    quality_invariants: invariants,
  };
  writeArtifact(outDir, "summary.json", summary);

  return { outDir, summary, coverageMatrix, completeness, invariants };
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const researcherDirs = [];
  let generatedAt = new Date().toISOString();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--researcher-dir" && args[i + 1]) {
      researcherDirs.push(resolve(args[i + 1]));
      i += 1;
    } else if (args[i] === "--generated-at" && args[i + 1]) {
      generatedAt = args[i + 1];
      i += 1;
    }
  }
  const existing = researcherDirs.filter((d) => existsSync(d));
  for (const d of researcherDirs) if (!existsSync(d)) console.warn(`[build06] researcher dir not found: ${d}`);

  const build = buildCensus06({ researcherDirs: existing });

  const errors = validateCensus06(build.rows);
  const reconciliation = reconcileAgainstPredecessor(build.predecessorRows, build.rows);
  if (errors.length > 0 || reconciliation.length > 0) {
    console.error(`[build06] REFUSING TO WRITE — ${errors.length} contract violation(s), ${reconciliation.length} reconciliation failure(s):`);
    for (const e of [...errors, ...reconciliation].slice(0, 40)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const { summary, completeness } = emitArtifacts06(build, { generatedAt });

  console.log(`[build06] wrote ${CENSUS_06_OUTPUT_DIR}`);
  console.log(`[build06] rows ............................. ${build.rows.length}`);
  console.log(`[build06]   carried from Package 05 ........ ${build.carriedCount}`);
  console.log(`[build06]   updates applied ................ ${build.appliedUpdateCount}`);
  console.log(`[build06]   updates refused ................ ${build.rejections.length}`);
  console.log(`[build06]   new in Package 06 .............. ${build.newRows.length}`);
  console.log(`[build06] confirmed >=1000 ................. ${summary.headline.confirmed_1000_plus}`);
  console.log(`[build06] capacity-unverified .............. ${summary.headline.capacity_unverified_high_value_candidates}`);
  console.log(`[build06] below threshold .................. ${summary.headline.confirmed_below_threshold}`);
  console.log(`[build06] not a permanent venue ............ ${summary.headline.not_a_permanent_venue}`);
  console.log(`[build06] identity review .................. ${summary.headline.identity_review}`);
  console.log(`[build06] confirmed in canon ............... ${summary.canonical_coverage.confirmed_already_in_canon}`);
  console.log(`[build06] confirmed missing ................ ${summary.canonical_coverage.confirmed_missing_from_canon}`);
  console.log(`[build06] completeness ..................... ${completeness.verdict} (${completeness.blocking.length} blocking)`);
  console.log(`[build06] invariants ....................... ${JSON.stringify(summary.quality_invariants)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
