#!/usr/bin/env node
// Deterministic builder for the Package 07 final-closure corpus
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07).
//
// Reads, and only ever reads:
//   - research/high-value-venue-estate/uk-1000plus-06/  (IMMUTABLE predecessor)
//   - research/high-value-venue-estate/uk-1000plus-05/  (IMMUTABLE original)
//   - venues/uk.json                                    (canonical, read only)
//   - researcher JSONL gathered outside the repository
//
// Writes only research/high-value-venue-estate/uk-1000plus-07/.
//
// WHAT THIS PACKAGE IS
// --------------------
// Package 06 left one class PARTIAL — STADIUM — because two source-family
// sweeps were never run: RFL Championship/League 1, and national athletics.
// Three of its 8 STADIUM rows were consequently uncovered.
//
// This builder is surgical. It carries Package 06 forward unchanged except
// where the two new sweeps genuinely change something, and it proves
// mechanically that the sweeps ran and that all 8 STADIUM rows are now
// accounted for. It cannot emit COMPLETE otherwise.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CENSUS_07_FRAMEWORK_VERSION,
  FINAL_COVERAGE_STATES,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  HIGH_VALUE_STATES,
  IN_CANON_STATES,
  ORIGINAL_CENSUS_DIR,
  PERMANENCE_CLASSES,
  PERMANENT_CLASSES,
  PREDECESSOR_CENSUS_DIR,
  PREDECESSOR_MAIN_SHA,
  PREDECESSOR_PACKAGE,
  PREDECESSOR_STADIUM_ROWS,
  PREVIOUSLY_UNCOVERED_STADIUM_ROWS,
  REQUIRED_SOURCE_FAMILY_SWEEPS,
  SPORTS_VENUE_CLASSES,
  STRATEGIC_SEGMENTS,
  assessFinalCompleteness,
  reconcileAgainstPredecessor,
  segmentFor,
  validateCensus07,
  validateStadiumAudit,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_07_OUTPUT_DIR = "research/high-value-venue-estate/uk-1000plus-07";

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

const GENERIC_TOKENS =
  /\b(the|stadium|ground|arena|centre|center|hall|theatre|theater|park|club|fc|afc|rfc|cc|ltd|limited|uk)\b/g;
const coreName = (v) => normaliseName(v).replace(GENERIC_TOKENS, " ").replace(/\s+/g, " ").trim();

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

const EVIDENCE_KIND_VALUES = [
  "FETCHED_URL", "SEARCH_RESULT", "COMMITTED_RESEARCH_ARTIFACT",
  "CANONICAL_REGISTRY", "DETERMINISTIC_DERIVATION", "PREDECESSOR_CENSUS",
];

function evidenceArray(value, defaultKind = "FETCHED_URL") {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e.url === "string" && /^https?:\/\//.test(e.url))
    .map((e) => ({
      url: e.url,
      kind: oneOf(e.kind, EVIDENCE_KIND_VALUES, defaultKind),
      note: typeof e.note === "string" && e.note.trim() ? e.note.trim() : "no note recorded by researcher",
    }));
}

// ---------------------------------------------------------------------
// Carry a Package 06 row forward
// ---------------------------------------------------------------------
function carryForward(prior) {
  return {
    ...prior,
    research_id: `hv07-${prior.research_id.replace(/^hv06-/, "")}`,
    predecessor_research_id: prior.research_id,
    provenance: "PREDECESSOR_CARRIED_UNCHANGED",
    discovered_by_source_family: null,
    predecessor_capacity_state: prior.capacity_state,
  };
}

// ---------------------------------------------------------------------
// Apply a researcher disposition to one of the three target rows
// ---------------------------------------------------------------------
// A disposition may report a capacity finding. It may only ever move a row
// towards the WEAKER claim: this package exists to close a coverage gap,
// not to promote venues on thin evidence at the last moment.
export function applyRowDisposition(row, disposition, adjustments) {
  const next = { ...row, provenance: "PREDECESSOR_RESOLVED_BY_07" };
  const evidence = evidenceArray(disposition?.evidence);
  const note = (t) => {
    next.notes = `${next.notes} [P07: ${t}]`.trim();
  };

  if (text(disposition?.sport_or_family)) {
    note(`source family: ${text(disposition.sport_or_family)}`);
  }
  if (text(disposition?.current_tenant_status)) {
    note(text(disposition.current_tenant_status));
  }

  const finding = disposition?.capacity_finding;
  if (finding === "SHOULD_BE_DOWNGRADED" || finding === "UNVERIFIABLE") {
    if (evidence.length === 0) {
      adjustments.push({
        research_id: next.research_id,
        name: next.name,
        reason: `capacity_finding ${finding} carries no evidence — not applied`,
      });
    } else if (next.capacity_state === "CONFIRMED_1000_PLUS") {
      adjustments.push({
        research_id: next.research_id,
        name: next.name,
        from: "CONFIRMED_1000_PLUS",
        to: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
        reason: `source-family audit found the held capacity ${finding === "UNVERIFIABLE" ? "unverifiable" : "not supportable"}`,
      });
      next.capacity_state = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
      next.capacity_max = 0;
      next.capacity_source_url = null;
      next.capacity_kind = null;
      next.capacity_source_kind = null;
      next.capacity_context = null;
      next.capacity_confidence = "UNKNOWN";
      next.capacity_evidence = [...next.capacity_evidence, ...evidence];
      note(`held capacity withdrawn: ${finding}`);
    }
  }

  // A disposition may also supply a fixture/calendar source the row lacked.
  const fixtureUrl = url(disposition?.sports_calendar_url);
  if (fixtureUrl && next.sports_calendar_url === null && evidence.length > 0) {
    next.sports_calendar_url = fixtureUrl;
    next.calendar_evidence = [...next.calendar_evidence, ...evidence];
    const kind = oneOf(disposition.calendar_source_kind, [
      "VENUE", "CLUB", "LEAGUE", "GOVERNING_BODY", "OPERATOR", "TICKETING", "THIRD_PARTY",
    ], null);
    if (kind && next.calendar_source_kind === "UNKNOWN") next.calendar_source_kind = kind;
    if (next.calendar_state === "UNKNOWN") next.calendar_state = "HAS_PUBLIC_EVENT_CALENDAR";
    if (next.calendar_scope === "UNKNOWN" || next.calendar_scope === "NONE") next.calendar_scope = "SPORT";
    note("fixture source established by the source-family audit");
  }

  if (text(disposition?.notes)) note(text(disposition.notes));
  return next;
}

// ---------------------------------------------------------------------
// Canonical reconciliation (same conservative rules as Packages 05/06)
// ---------------------------------------------------------------------
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
  const exact = index.byName.get(normaliseName(name)) ?? [];

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

// ---------------------------------------------------------------------
// New venues discovered by the sweeps
// ---------------------------------------------------------------------
function buildNewVenue(raw, seenIds, canonicalIndex) {
  const name = text(raw?.name);
  if (!name) return null;
  const identityEvidence = evidenceArray(raw.identity_evidence);
  if (identityEvidence.length === 0) return null;
  const discoveredBy = text(raw?.discovered_by_source_family);
  if (!discoveredBy) return null; // a new venue must name the sweep that found it

  const capacityEvidence = evidenceArray(raw.capacity_evidence);
  const calendarEvidence = evidenceArray(raw.calendar_evidence);

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
  ], "OTHER_PERMANENT_SPECTATOR_SPORT");

  let capacityState = oneOf(raw.resolved_state, [
    "CONFIRMED_1000_PLUS", "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    "CONFIRMED_BELOW_THRESHOLD", "NOT_A_PERMANENT_VENUE", "IDENTITY_REVIEW", "RESEARCH_BLOCKED",
  ], "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE");
  // Re-derive rather than trust the researcher's own label.
  if (capacityMax >= HIGH_VALUE_CAPACITY_THRESHOLD && capacityEvidence.length > 0) {
    if (!["NOT_A_PERMANENT_VENUE", "RESEARCH_BLOCKED", "IDENTITY_REVIEW"].includes(capacityState)) {
      capacityState = "CONFIRMED_1000_PLUS";
    }
  } else if (capacityState === "CONFIRMED_1000_PLUS") {
    capacityState = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }
  if (capacityState === "CONFIRMED_BELOW_THRESHOLD" && capacityEvidence.length === 0) {
    capacityState = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }

  const permanence = PERMANENCE_CLASSES.includes(raw.permanence_class)
    ? raw.permanence_class
    : (SPORTS_VENUE_CLASSES.includes(venueClass) ? "PERMANENT_SPORTING_GROUND" : "PERMANENT_PURPOSE_BUILT_VENUE");

  const locality = text(raw.locality);
  const reconciliation = reconcileAgainstCanon(
    { name, locality, officialUrl: url(raw.official_website_url) },
    canonicalIndex,
  );

  let id = `hv07-n-${slug(`${name} ${locality ?? ""}`)}`;
  if (seenIds.has(id)) {
    let n = 2;
    while (seenIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  seenIds.add(id);

  let calendarState = oneOf(raw.calendar_state, [
    "HAS_PUBLIC_EVENT_CALENDAR", "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
    "PRIVATE_BOOKINGS_ONLY", "NO_PUBLIC_CALENDAR_FOUND", "CALENDAR_ACCESS_RESTRICTED", "UNKNOWN",
  ], "UNKNOWN");
  if (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(calendarState) && calendarEvidence.length === 0) {
    calendarState = "UNKNOWN";
  }

  const sportsUrl = url(raw.sports_calendar_url);
  const generalUrl = url(raw.general_programme_url);
  if (["HAS_PUBLIC_EVENT_CALENDAR"].includes(calendarState) && (!(sportsUrl || generalUrl) || calendarEvidence.length === 0)) {
    calendarState = "UNKNOWN";
  }

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
    capacity_confidence: capacityMax > 0 ? oneOf(raw.capacity_confidence, ["HIGH", "MEDIUM", "LOW"], "LOW") : "UNKNOWN",
    capacity_state: capacityState,
    permanence_class: permanence,
    official_website_url: url(raw.official_website_url),
    general_programme_url: generalUrl,
    conference_calendar_url: null,
    sports_calendar_url: sportsUrl,
    ticketing_url: null,
    calendar_scope: oneOf(raw.calendar_scope, [
      "GENERAL", "MUSIC", "THEATRE", "CONFERENCE", "EXHIBITION", "SPORT", "MULTI", "NONE", "UNKNOWN",
    ], SPORTS_VENUE_CLASSES.includes(venueClass) ? "SPORT" : "UNKNOWN"),
    calendar_source_kind: oneOf(raw.calendar_source_kind, [
      "VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY", "TICKETING", "THIRD_PARTY", "NONE", "UNKNOWN",
    ], "UNKNOWN"),
    calendar_state: calendarState,
    platform_family: null,
    platform_evidence: null,
    acquisition_shape: "UNKNOWN",
    identity_evidence: identityEvidence,
    capacity_evidence: capacityEvidence,
    calendar_evidence: calendarEvidence,
    permanence_evidence: evidenceArray(raw.permanence_evidence),
    provenance: "NEW_IN_PACKAGE_07",
    discovered_by_source_family: discoveredBy,
    notes: `${text(raw.notes) ?? ""} [New in Package 07, discovered by ${discoveredBy} (researcher ${raw.researcher ?? "?"}). Canonical reconciliation: ${reconciliation.basis}.]`.trim(),
    predecessor_capacity_state: null,
  };
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
// Final coherence pass (same direction of travel as Package 06: repairs
// always move a row towards the weaker claim)
// ---------------------------------------------------------------------
function enforceCoherence(row, adjustments) {
  const next = { ...row };

  if (next.capacity_state === "CONFIRMED_1000_PLUS") {
    if (next.permanence_class === null || !PERMANENT_CLASSES.includes(next.permanence_class)) {
      adjustments.push({
        research_id: next.research_id, name: next.name,
        from: "CONFIRMED_1000_PLUS", to: "IDENTITY_REVIEW",
        reason: "permanence not established — cannot be counted as a permanent venue",
      });
      next.capacity_state = "IDENTITY_REVIEW";
    } else if (next.capacity_max < HIGH_VALUE_CAPACITY_THRESHOLD || next.capacity_evidence.length === 0) {
      adjustments.push({
        research_id: next.research_id, name: next.name,
        from: "CONFIRMED_1000_PLUS", to: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
        reason: "confirmed capacity is not supported by evidence on the assembled row",
      });
      next.capacity_state = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
    }
  }

  if (next.capacity_max > 0 && (next.capacity_source_url === null || next.capacity_evidence.length === 0)) {
    next.capacity_max = 0;
    next.capacity_source_url = null;
    next.capacity_kind = null;
    next.capacity_source_kind = null;
    next.capacity_context = null;
    next.capacity_confidence = "UNKNOWN";
  }
  if (next.capacity_max === 0) {
    next.capacity_source_url = null;
    next.capacity_source_kind = null;
    next.capacity_confidence = "UNKNOWN";
  }
  if (next.capacity_state === "RESEARCH_BLOCKED") {
    if (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(next.calendar_state)) next.calendar_state = "UNKNOWN";
    if (next.canonical_match_state === "MISSING_FROM_CANON") next.canonical_match_state = "UNASSESSED";
  }
  if (["HAS_PUBLIC_EVENT_CALENDAR", "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR"].includes(next.calendar_state)) {
    const anyUrl = next.general_programme_url !== null || next.conference_calendar_url !== null ||
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
// The STADIUM source-estate audit
// ---------------------------------------------------------------------
// Package 06 recorded, per stadium row, which league/competition estate
// accounts for it. Five were covered; three were not. This rebuilds that
// audit from Package 06's own statement plus the two new sweeps.
export const PREDECESSOR_STADIUM_COVERAGE = Object.freeze({
  "hv06-p-england-wigan-brick-community-stadium": {
    tenant: "Wigan Athletic", source_family: "EFL League One (audited under FOOTBALL_GROUND)", covered_by_predecessor: true,
  },
  "hv06-p-england-gloucester-kingsholm-stadium": {
    tenant: "Gloucester Rugby", source_family: "PREM Rugby (audited under RUGBY_UNION_GROUND)", covered_by_predecessor: true,
  },
  "hv06-p-england-exeter-sandy-park-stadium": {
    tenant: "Exeter Chiefs", source_family: "PREM Rugby (audited under RUGBY_UNION_GROUND)", covered_by_predecessor: true,
  },
  "hv06-p-england-worcester-sixways-stadium": {
    tenant: "Worcester Warriors", source_family: "RFU Championship (audited under RUGBY_UNION_GROUND)", covered_by_predecessor: true,
  },
  "hv06-p-wales-swansea-swansea-com-stadium": {
    tenant: "Swansea City", source_family: "EFL Championship (audited under FOOTBALL_GROUND)", covered_by_predecessor: true,
  },
  "hv06-p-england-featherstone-post-office-road": {
    tenant: "Featherstone Rovers RLFC", source_family: "RFL Championship / League 1", covered_by_predecessor: false,
  },
  "hv06-p-england-london-white-hart-lane-community-sports-centre": {
    tenant: "London Skolars (rugby league) + athletics club", source_family: "RFL League 1 and national athletics", covered_by_predecessor: false,
  },
  "hv06-p-wales-wrexham-queensway-stadium": {
    tenant: "Wrexham Athletics Club", source_family: "national athletics", covered_by_predecessor: false,
  },
});

export function buildStadiumAudit(rows, dispositions) {
  const byPredecessor = new Map(rows.filter((r) => r.predecessor_research_id).map((r) => [r.predecessor_research_id, r]));
  const dispositionByRow = new Map();
  for (const d of dispositions) {
    if (!d?.target_row) continue;
    // Later dispositions win — a revisit is a correction. Both are kept in
    // the artifact's evidence, only the verdict is superseded.
    const existing = dispositionByRow.get(d.target_row) ?? [];
    dispositionByRow.set(d.target_row, [...existing, d]);
  }

  return PREDECESSOR_STADIUM_ROWS.map((id) => {
    const prior = PREDECESSOR_STADIUM_COVERAGE[id] ?? {};
    const row = byPredecessor.get(id) ?? null;
    const ds = dispositionByRow.get(id) ?? [];
    const coveredNow = ds.some((d) => d.covered_now === true);

    const evidence = ds.flatMap((d) => evidenceArray(d.evidence));
    return {
      predecessor_research_id: id,
      research_id: row?.research_id ?? null,
      name: row?.name ?? null,
      locality: row?.locality ?? null,
      nation: row?.nation ?? null,
      tenant: prior.tenant ?? null,
      source_family: ds.map((d) => text(d.source_family_checked)).filter(Boolean).join(" | ") || prior.source_family || null,
      covered_by_predecessor: prior.covered_by_predecessor === true,
      covered: prior.covered_by_predecessor === true || coveredNow,
      covered_by_package_07_sweep: coveredNow,
      capacity_state: row?.capacity_state ?? null,
      capacity_max: row?.capacity_max ?? null,
      canonical_match_state: row?.canonical_match_state ?? null,
      current_tenant_status: ds.map((d) => text(d.current_tenant_status)).filter(Boolean).join(" | ") || null,
      capacity_finding: ds.map((d) => text(d.capacity_finding)).filter(Boolean).join(" | ") || null,
      evidence: prior.covered_by_predecessor === true && evidence.length === 0
        ? [{
            url: `https://github.com/chriswatson6675/band_on_the_map/blob/${PREDECESSOR_MAIN_SHA}/${PREDECESSOR_CENSUS_DIR}/coverage-matrix.json`,
            kind: "PREDECESSOR_CENSUS",
            note: `Package 06's STADIUM coverage statement records this row as accounted for by ${prior.source_family}.`,
          }]
        : evidence,
      notes: ds.map((d) => text(d.notes)).filter(Boolean).join(" | ") || null,
    };
  });
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

// A coverage statement citing only our own estate is circular and cannot
// raise a class's coverage state. Carried forward from Package 06, where
// this rule was introduced after two classes claimed completeness by
// checking the estate against itself.
const SELF_REFERENTIAL_PHRASES = Object.freeze([
  "existing-estate", "existing estate", "already-covered", "already covered",
  "held estate", "our own estate", "the corpus", "package 06", "package 6",
  "package06", "uk-1000plus-06", "uk-1000plus-07", "uk-1000plus",
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
  for (const phrase of SELF_REFERENTIAL_PHRASES) residue = residue.split(phrase).join(" ");
  return residue
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !LOOKING_WORDS.has(token)).length > 0;
}

// ---------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------
export function buildCensus07({ repoRoot = ROOT, researcherDirs = [] } = {}) {
  const priorDir = join(repoRoot, PREDECESSOR_CENSUS_DIR);
  const predecessorRows = JSON.parse(readFileSync(join(priorDir, "census.json"), "utf8")).venues;
  const predecessorCoverage = JSON.parse(readFileSync(join(priorDir, "coverage-matrix.json"), "utf8"));
  const predecessorSummary = JSON.parse(readFileSync(join(priorDir, "summary.json"), "utf8"));
  const canonical = JSON.parse(readFileSync(join(repoRoot, "venues/uk.json"), "utf8")).venues;
  const canonicalIndex = buildCanonicalIndex(canonical);

  let rows = predecessorRows.map(carryForward);
  const byPredecessor = new Map(rows.map((r) => [r.predecessor_research_id, r]));
  const originalCarried = new Map(rows.map((r) => [r.predecessor_research_id, { ...r }]));

  // --- researcher input -------------------------------------------------
  const dispositions = [];
  const newVenuesRaw = [];
  const sourceFamilies = [];
  const coverageStatements = [];
  for (const dir of researcherDirs) {
    for (const d of readJsonl(join(dir, "row-dispositions.jsonl"))) dispositions.push(d);
    for (const v of readJsonl(join(dir, "new-venues.jsonl"))) newVenuesRaw.push(v);
    for (const f of readJsonl(join(dir, "source-families.jsonl"))) sourceFamilies.push(f);
    for (const c of readJsonl(join(dir, "coverage.jsonl"))) coverageStatements.push(c);
  }

  const adjustments = [];
  const unmatchedDispositions = [];
  const appliedDispositions = new Set();
  for (const d of dispositions) {
    const target = byPredecessor.get(d?.target_row);
    if (!target) {
      unmatchedDispositions.push({ target_row: d?.target_row ?? null, reason: "no Package 06 row with this research_id" });
      continue;
    }
    // Later dispositions win, applied to the original carried row so a
    // correction replaces an earlier verdict rather than compounding it.
    const base = originalCarried.get(d.target_row) ?? target;
    appliedDispositions.add(d.target_row);
    byPredecessor.set(d.target_row, applyRowDisposition(base, d, adjustments));
  }
  rows = [...byPredecessor.values()];

  const seenIds = new Set(rows.map((r) => r.research_id));
  const builtNew = newVenuesRaw.map((raw) => buildNewVenue(raw, seenIds, canonicalIndex)).filter(Boolean);
  const rejectedNew = newVenuesRaw.length - builtNew.length;
  const { kept: newRows, dropped: dedupedNew } = dedupeAgainstCorpus(rows, builtNew);

  const all = sorted([...rows, ...newRows].map((r) => enforceCoherence(r, adjustments)));
  const stadiumAudit = buildStadiumAudit(all, dispositions);

  // Which of the two required sweeps actually ran, judged from the
  // researchers' own source-family records — not from a report.
  const sweepsRun = [];
  const familyText = sourceFamilies.map((f) => `${f?.family ?? ""} ${f?.notes ?? ""}`.toLowerCase()).join(" | ");
  const coverageText = coverageStatements
    .flatMap((c) => (Array.isArray(c?.source_families_checked) ? c.source_families_checked : []))
    .join(" | ").toLowerCase();
  const haystack = `${familyText} | ${coverageText}`;
  if (/rugby league|rfl|championship|league 1|league one|super league/.test(haystack)) {
    sweepsRun.push("RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1");
  }
  if (/athletic/.test(haystack)) sweepsRun.push("NATIONAL_ATHLETICS");

  return {
    rows: all,
    predecessorRows,
    predecessorCoverage,
    predecessorSummary,
    carriedCount: rows.length,
    newRows,
    dedupedNew,
    rejectedNew,
    dispositions,
    appliedDispositionCount: appliedDispositions.size,
    unmatchedDispositions,
    adjustments,
    sourceFamilies,
    coverageStatements,
    stadiumAudit,
    sweepsRun,
    canonicalCount: canonical.length,
  };
}

// ---------------------------------------------------------------------
// Coverage matrix
// ---------------------------------------------------------------------
// Package 06's per-class coverage carries forward unchanged — this package
// re-researched nothing else, so claiming otherwise would be false. Only a
// class a Package 07 researcher actually swept, with an external source,
// may move.
export function buildCoverageMatrix07(rows, coverageStatements, predecessorCoverage) {
  const predecessorByClass = new Map(
    (predecessorCoverage?.classes ?? []).map((c) => [c.venue_class, c]),
  );
  const classes = [...new Set(rows.map((r) => r.venue_class))].sort();

  return classes.map((venueClass) => {
    const inClass = rows.filter((r) => r.venue_class === venueClass);
    const hv = inClass.filter((r) => HIGH_VALUE_STATES.includes(r.capacity_state));
    const prior = predecessorByClass.get(venueClass);
    const reported = coverageStatements.filter((c) => c?.venue_class === venueClass);

    const counted = reported.filter((c) => {
      const families = Array.isArray(c.source_families_checked) ? c.source_families_checked : [];
      return families.some((name) => namesAnExternalSource(name));
    });
    const declared = counted.map((c) => c.final_coverage).filter((v) => FINAL_COVERAGE_STATES.includes(v));

    const rank = { COMPLETE: 3, MATERIAL_COMPLETE: 2, PARTIAL: 1, BLOCKED: 0 };
    const predecessorState = prior?.final_coverage ?? "PARTIAL";
    let finalCoverage = predecessorState;
    if (declared.length > 0) {
      const best = declared.reduce((a, b) => (rank[b] > rank[a] ? b : a));
      if (rank[best] > rank[predecessorState]) finalCoverage = best;
    }

    return {
      venue_class: venueClass,
      package_06_coverage: predecessorState,
      package_07_action: reported.length > 0
        ? reported.map((c) => c.package_07_action ?? "unstated").join(" | ")
        : "not re-researched by Package 07 — Package 06 coverage carried forward unchanged",
      source_families_checked: [
        ...new Set(counted.flatMap((c) => (Array.isArray(c.source_families_checked) ? c.source_families_checked : []))),
      ].sort(),
      candidates_considered: inClass.length,
      confirmed_1000_plus: inClass.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      capacity_unverified: inClass.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
      below_threshold: inClass.filter((r) => r.capacity_state === "CONFIRMED_BELOW_THRESHOLD").length,
      non_permanent: inClass.filter((r) => r.capacity_state === "NOT_A_PERMANENT_VENUE").length,
      identity_review: inClass.filter((r) => r.capacity_state === "IDENTITY_REVIEW").length,
      research_blocked: inClass.filter((r) => r.capacity_state === "RESEARCH_BLOCKED").length,
      existing_canonical: hv.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
      missing_canonical: hv.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      final_coverage: finalCoverage,
      residual_gap: counted.map((c) => c.residual_gap).filter(Boolean).join(" | ") || prior?.residual_gap || null,
      researcher_statements: reported.map((c) => {
        const families = Array.isArray(c.source_families_checked) ? c.source_families_checked : [];
        const external = families.filter((name) => namesAnExternalSource(name));
        return {
          final_coverage: c.final_coverage ?? null,
          residual_gap: c.residual_gap ?? null,
          researcher: c.researcher ?? null,
          counted_towards_coverage: external.length > 0,
          disregarded_reason: external.length > 0 ? null
            : "cites no external source estate — self-referential coverage cannot evidence completeness",
        };
      }),
    };
  });
}

export function buildCrossTabs(rows) {
  const CANON = ["EXISTING_CANONICAL", "PROBABLE_EXISTING_CANONICAL", "MISSING_FROM_CANON", "POSSIBLE_DUPLICATE", "AMBIGUOUS_IDENTITY", "UNASSESSED"];
  const a = CANON.map((state) => {
    const inState = rows.filter((r) => r.canonical_match_state === state);
    return {
      canonical_state: state,
      confirmed_1000_plus: inState.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
      capacity_unverified: inState.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
      other: inState.filter((r) => ["CONFIRMED_BELOW_THRESHOLD", "NOT_A_PERMANENT_VENUE", "IDENTITY_REVIEW", "RESEARCH_BLOCKED"].includes(r.capacity_state)).length,
      total: inState.length,
    };
  });
  a.push({
    canonical_state: "TOTAL",
    confirmed_1000_plus: a.reduce((s, r) => s + r.confirmed_1000_plus, 0),
    capacity_unverified: a.reduce((s, r) => s + r.capacity_unverified, 0),
    other: a.reduce((s, r) => s + r.other, 0),
    total: a.reduce((s, r) => s + r.total, 0),
  });

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
      percent_represented: hv.length === 0 ? null : Number(((inCanon / hv.length) * 100).toFixed(1)),
    };
  });

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

  return { a_capacity_by_canonical_state: a, b_strategic_segment: b, c_nation: c };
}

export function computeQualityInvariants07(rows, build) {
  const ids = rows.map((r) => r.research_id);
  const predecessorIds = rows.map((r) => r.predecessor_research_id).filter(Boolean);
  const thirdParty = ["wikipedia.org", "wikidata.org", "wikimedia.org", "songkick.com", "ticketmaster.co.uk"];
  const confirmed = rows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS");

  const stadiumUncovered = build.stadiumAudit.filter((e) => e.covered !== true).length;
  const sweepsMissing = REQUIRED_SOURCE_FAMILY_SWEEPS.filter((s) => !build.sweepsRun.includes(s.id)).length;

  return {
    duplicate_research_ids: ids.length - new Set(ids).size,
    duplicate_predecessor_claims: predecessorIds.length - new Set(predecessorIds).size,
    confirmed_without_capacity_evidence: confirmed.filter((r) => r.capacity_evidence.length === 0).length,
    non_permanent_counted_as_confirmed: confirmed.filter((r) => !PERMANENT_CLASSES.includes(r.permanence_class)).length,
    third_party_labelled_official: rows.filter((r) => {
      if (!r.capacity_source_url) return false;
      const host = hostOf(r.capacity_source_url);
      if (!host) return false;
      return thirdParty.some((h) => host === h || host.endsWith(`.${h}`)) &&
        typeof r.capacity_source_kind === "string" && r.capacity_source_kind.startsWith("OFFICIAL_");
    }).length,
    negative_claims_on_blocked_rows: rows.filter(
      (r) => r.capacity_state === "RESEARCH_BLOCKED" &&
        (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(r.calendar_state) ||
          r.canonical_match_state === "MISSING_FROM_CANON"),
    ).length,
    unexplained_rows: rows.filter((r) => typeof r.notes !== "string" || r.notes.trim().length === 0).length,
    predecessor_rows_without_disposition: reconcileAgainstPredecessor(build.predecessorRows, rows).length,
    unresearched_known_stadium_rows: stadiumUncovered,
    required_source_family_sweeps_not_run: sweepsMissing,
    new_venues_without_discovering_source_family: rows.filter(
      (r) => r.provenance === "NEW_IN_PACKAGE_07" && !r.discovered_by_source_family,
    ).length,
    events_acquired: 0,
    canonical_venues_mutated: 0,
    package_05_mutations: 0,
    package_06_mutations: 0,
  };
}

// ---------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------
function writeArtifact(outDir, filename, payload) {
  writeFileSync(join(outDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function emitArtifacts07(build, { repoRoot = ROOT, generatedAt } = {}) {
  const outDir = join(repoRoot, CENSUS_07_OUTPUT_DIR);
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
    package: "BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07",
    framework_version: CENSUS_07_FRAMEWORK_VERSION,
    census_id: "uk-1000plus-07",
    generated_at: generatedAt,
    capacity_threshold: HIGH_VALUE_CAPACITY_THRESHOLD,
  };

  const coverageMatrix = buildCoverageMatrix07(rows, build.coverageStatements, build.predecessorCoverage);
  const completeness = assessFinalCompleteness({
    coverageMatrix, sweepsRun: build.sweepsRun, stadiumAudit: build.stadiumAudit,
  });
  const crossTabs = buildCrossTabs(rows);
  const invariants = computeQualityInvariants07(rows, build);

  const view = (r) => ({
    research_id: r.research_id, predecessor_research_id: r.predecessor_research_id,
    name: r.name, locality: r.locality, nation: r.nation, venue_class: r.venue_class,
    capacity_max: r.capacity_max, capacity_state: r.capacity_state,
    permanence_class: r.permanence_class, canonical_match_state: r.canonical_match_state,
    canonical_venue_id: r.canonical_venue_id, provenance: r.provenance,
    discovered_by_source_family: r.discovered_by_source_family, notes: r.notes,
  });

  // --- manifest ---------------------------------------------------------
  writeArtifact(outDir, "manifest.json", {
    ...meta,
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
    predecessor_terminal_verdict: "UK_HIGH_VALUE_VENUE_CENSUS_PARTIAL",
    what_this_is:
      "The final closure corpus. Package 06 left one class PARTIAL — STADIUM — because two source-family sweeps " +
      "were never run. This package runs them, accounts for all 8 STADIUM rows, and freezes the census.",
    why_this_package_exists: {
      package_06_partial_class: "STADIUM",
      stadium_rows: PREDECESSOR_STADIUM_ROWS.length,
      covered_by_package_06: 5,
      uncovered_by_package_06: PREVIOUSLY_UNCOVERED_STADIUM_ROWS,
      required_sweeps: REQUIRED_SOURCE_FAMILY_SWEEPS,
      sweeps_actually_run: build.sweepsRun,
    },
    what_this_is_not: [
      "It is not a canonical venue registry. venues/uk.json is NOT modified.",
      "It does not admit any venue to the canonical estate.",
      "It does not resolve the predecessor's ambiguous canonical identities or the Anglesey duplicate — that is the next package's job.",
      "It contains no Events and acquires none.",
      "It is not a re-opening of the census: classes other than STADIUM were not re-researched.",
    ],
    predecessor_artifacts_consumed: [
      { path: `${PREDECESSOR_CENSUS_DIR}/census.json`, role: "All predecessor rows, carried forward and dispositioned.", records: build.predecessorRows.length, mutated: false },
      { path: `${PREDECESSOR_CENSUS_DIR}/coverage-matrix.json`, role: "Per-class coverage carried forward unchanged except where Package 07 swept.", mutated: false },
      { path: `${PREDECESSOR_CENSUS_DIR}/summary.json`, role: "Predecessor headline counts, for reconciliation.", mutated: false },
      { path: `${ORIGINAL_CENSUS_DIR}/`, role: "Original Package 05 snapshot. Read for lineage only.", mutated: false },
    ],
    other_inputs: [
      { path: "venues/uk.json", role: "Canonical venue estate, read only, for identity reconciliation.", records: build.canonicalCount, mutated: false },
    ],
    generator: "ingestion/high-value-venue-census-07/build.mjs",
    validator: "ingestion/high-value-venue-census-07/validate.mjs",
    contract: "ingestion/high-value-venue-census-07/contract.mjs",
    contract_note:
      "Package 07's row rules delegate to Package 06's own validator, so the two cannot drift. Only the id " +
      "namespaces, the provenance vocabulary and the new-venue source-family requirement are Package 07's own.",
    row_counts: {
      total: rows.length,
      carried_from_predecessor: build.carriedCount,
      new_in_package_07: build.newRows.length,
      new_deduped_against_corpus: build.dedupedNew.length,
      new_rejected_unsupported: build.rejectedNew,
      target_row_dispositions_applied: build.appliedDispositionCount,
      dispositions_unmatched: build.unmatchedDispositions.length,
    },
    completeness_assessment: completeness,
  });

  // --- predecessor reconciliation ---------------------------------------
  const transitions = {};
  for (const row of rows) {
    if (!row.predecessor_research_id) continue;
    const key = `${row.predecessor_capacity_state} -> ${row.capacity_state}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
  }
  writeArtifact(outDir, "predecessor-reconciliation.json", {
    ...meta,
    description:
      "Proves every Package 06 row has exactly one disposition here. A predecessor row cannot be silently dropped " +
      "to improve a headline, nor claimed by two successors.",
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
    predecessor_row_count: build.predecessorRows.length,
    predecessor_headline: build.predecessorSummary.headline ?? null,
    dispositioned_here: rows.filter((r) => r.predecessor_research_id !== null).length,
    rows_without_disposition: reconcileAgainstPredecessor(build.predecessorRows, rows),
    state_transitions: Object.fromEntries(Object.entries(transitions).sort((a, b) => b[1] - a[1])),
    headline_recomputed_not_carried:
      "Every count below is recomputed from the Package 07 rows. None is copied forward from Package 06.",
    coherence_adjustments: build.adjustments,
    dispositions_with_no_matching_row: build.unmatchedDispositions,
    new_rows_deduped: build.dedupedNew,
  });

  // --- the point of the package -----------------------------------------
  writeArtifact(outDir, "stadium-source-estate-audit.json", {
    ...meta,
    description:
      "The audit this package exists to produce: every Package 06 STADIUM row, the source family that accounts " +
      "for it, and whether it is now covered. Five were covered by Package 06; three were not, and are the " +
      "reason the census was still PARTIAL.",
    predecessor_stadium_rows: PREDECESSOR_STADIUM_ROWS.length,
    covered_by_package_06: build.stadiumAudit.filter((e) => e.covered_by_predecessor).length,
    covered_by_package_07_sweep: build.stadiumAudit.filter((e) => e.covered_by_package_07_sweep).length,
    covered_total: build.stadiumAudit.filter((e) => e.covered).length,
    still_uncovered: build.stadiumAudit.filter((e) => !e.covered).map((e) => e.predecessor_research_id),
    audit: build.stadiumAudit,
  });

  const rlFamilies = build.sourceFamilies.filter((f) => /rugby league|rfl|skolars|championship|league 1|league one/i.test(`${f?.family ?? ""} ${f?.notes ?? ""}`));
  const rlRows = rows.filter((r) => r.venue_class === "RUGBY_LEAGUE_GROUND");
  writeArtifact(outDir, "rugby-league-source-estate.json", {
    ...meta,
    description:
      "The RFL Championship / League 1 completeness sweep Package 06 never ran. Its purpose is to prove the " +
      "omitted estate hides no additional material high-value venues — finding none is a successful result.",
    sweep_id: "RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1",
    sweep_run: build.sweepsRun.includes("RUGBY_LEAGUE_CHAMPIONSHIP_AND_LEAGUE_1"),
    source_families: rlFamilies,
    rugby_league_rows_in_corpus: rlRows.length,
    confirmed_1000_plus: rlRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: rlRows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    new_in_package_07: build.newRows.filter((r) => /rugby league|rfl/i.test(r.discovered_by_source_family ?? "")).map(view),
    venues: sorted(rlRows).map(view),
  });

  const athFamilies = build.sourceFamilies.filter((f) => /athletic/i.test(`${f?.family ?? ""} ${f?.notes ?? ""}`));
  const athRows = rows.filter((r) => r.venue_class === "ATHLETICS_STADIUM");
  writeArtifact(outDir, "athletics-source-estate.json", {
    ...meta,
    description:
      "The national athletics completeness sweep Package 06 never ran. Scope is nationally material spectator " +
      "athletics venues that could plausibly reach 1,000+, not every local running track.",
    sweep_id: "NATIONAL_ATHLETICS",
    sweep_run: build.sweepsRun.includes("NATIONAL_ATHLETICS"),
    source_families: athFamilies,
    athletics_rows_in_corpus: athRows.length,
    confirmed_1000_plus: athRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: athRows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    new_in_package_07: build.newRows.filter((r) => /athletic/i.test(r.discovered_by_source_family ?? "")).map(view),
    venues: sorted(athRows).map(view),
  });

  writeArtifact(outDir, "newly-discovered-venues.json", {
    ...meta,
    description:
      "Venues the two Package 07 sweeps surfaced that Package 06 did not hold. Each names the source family that " +
      "found it. Finding few or none is the expected outcome of a closure package.",
    count: build.newRows.length,
    by_source_family: tally(build.newRows, (r) => r.discovered_by_source_family),
    by_capacity_state: tally(build.newRows, (r) => r.capacity_state),
    by_venue_class: tally(build.newRows, (r) => r.venue_class),
    venues: sorted(build.newRows),
  });

  // --- population artifacts ---------------------------------------------
  writeArtifact(outDir, "confirmed-1000-plus.json", {
    ...meta,
    description: "Permanent UK venues with retained capacity evidence reaching 1,000.",
    count: confirmed.length,
    by_nation: tally(confirmed, (r) => r.nation),
    by_venue_class: tally(confirmed, (r) => r.venue_class),
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
    description: "Rows excluded because they are not permanent venues. Retained in full; nothing is deleted.",
    count: nonPermanent.length,
    venues: sorted(nonPermanent).map(view),
  });

  const existingCanonical = highValue.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state));
  const missing = highValue.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON");
  writeArtifact(outDir, "existing-canonical.json", {
    ...meta,
    description: "High-value venues BeatMapped's canonical estate already knows.",
    count: existingCanonical.length,
    by_match_state: tally(existingCanonical, (r) => r.canonical_match_state),
    venues: sorted(existingCanonical).map(view),
  });
  writeArtifact(outDir, "missing-from-canonical.json", {
    ...meta,
    description: "High-value venues with no canonical counterpart found. A discovery finding only — this package admits none of them.",
    count: missing.length,
    confirmed_1000_plus: missing.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    by_venue_class: tally(missing, (r) => r.venue_class),
    by_nation: tally(missing, (r) => r.nation),
    venues: sorted(missing),
  });

  const ambiguous = rows.filter((r) => ["AMBIGUOUS_IDENTITY", "POSSIBLE_DUPLICATE"].includes(r.canonical_match_state));
  writeArtifact(outDir, "identity-review.json", {
    ...meta,
    description:
      "What the NEXT package must resolve before governed canonical admission: ambiguous canonical identities, " +
      "rows held out pending permanence, and the intra-corpus duplicate. This package deliberately resolves none " +
      "of them — admitting a venue whose identity is ambiguous creates a canonical duplicate, which is far harder " +
      "to undo than to avoid.",
    ambiguous_identity: { count: ambiguous.length, venues: sorted(ambiguous).map(view) },
    permanence_unresolved: { count: identityReview.length, venues: sorted(identityReview).map(view) },
    known_intra_corpus_duplicate: {
      note: "Carried forward from Package 06, unresolved by design.",
      group: rows.filter((r) => /anglesey showground/i.test(r.name)).map(view),
    },
  });

  const sportsRows = rows.filter((r) => SPORTS_VENUE_CLASSES.includes(r.venue_class));
  writeArtifact(outDir, "sports-venues.json", {
    ...meta,
    description: "The permanent spectator-sport estate and its fixture/event sources.",
    count: sportsRows.length,
    confirmed_1000_plus: sportsRows.filter((r) => r.capacity_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: sportsRows.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").length,
    by_venue_class: tally(sportsRows, (r) => r.venue_class),
    with_usable_fixture_source: sportsRows.filter(
      (r) => (r.sports_calendar_url !== null || r.general_programme_url !== null) &&
        ["VENUE", "CLUB", "LEAGUE", "GOVERNING_BODY", "OPERATOR"].includes(r.calendar_source_kind),
    ).length,
    venues: sorted(sportsRows),
  });

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
      general_programme_url: r.general_programme_url, sports_calendar_url: r.sports_calendar_url,
      conference_calendar_url: r.conference_calendar_url,
      calendar_source_kind: r.calendar_source_kind, calendar_state: r.calendar_state,
      platform_family: r.platform_family, acquisition_shape: r.acquisition_shape,
    })),
  });

  writeArtifact(outDir, "coverage-matrix.json", {
    ...meta,
    description:
      "Per-class coverage. Package 06's states carry forward unchanged except where a Package 07 researcher " +
      "actually swept the class with an EXTERNAL source — a self-referential statement cannot raise a state.",
    completeness_assessment: completeness,
    required_sweeps: REQUIRED_SOURCE_FAMILY_SWEEPS,
    sweeps_run: build.sweepsRun,
    classes: coverageMatrix,
  });

  writeArtifact(outDir, "coverage-evidence.json", {
    ...meta,
    description: "The source families this package actually walked, with members inspected vs members known.",
    count: build.sourceFamilies.length,
    families: build.sourceFamilies,
    researcher_coverage_statements: build.coverageStatements,
    target_row_dispositions: build.dispositions,
  });

  writeArtifact(outDir, "research-blocked.json", {
    ...meta,
    description:
      "Rows and source families where research could not complete. These carry NO negative findings — tool " +
      "exhaustion and access blocks are never recorded as absence.",
    blocked_rows: { count: blocked.length, venues: sorted(blocked).map(view) },
    blocked_source_families: build.sourceFamilies.filter((f) => Number(f?.members_blocked ?? 0) > 0),
  });

  writeArtifact(outDir, "census.json", {
    ...meta,
    description: "Every Package 07 row. The other artifacts in this directory are views over this file.",
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
      headline: build.predecessorSummary.headline ?? null,
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
    },
    canonical_coverage: {
      high_value_total: highValue.length,
      already_in_canon: existingCanonical.length,
      missing_from_canon: missing.length,
      confirmed_already_in_canon: confirmed.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length,
      confirmed_missing_from_canon: confirmed.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      confirmed_identity_review: confirmed.filter((r) => ["AMBIGUOUS_IDENTITY", "POSSIBLE_DUPLICATE", "UNASSESSED"].includes(r.canonical_match_state)).length,
      percent_of_confirmed_represented: confirmed.length === 0 ? null : Number(
        ((confirmed.filter((r) => IN_CANON_STATES.includes(r.canonical_match_state)).length / confirmed.length) * 100).toFixed(1),
      ),
    },
    stadium_closure: {
      predecessor_stadium_rows: PREDECESSOR_STADIUM_ROWS.length,
      covered_total: build.stadiumAudit.filter((e) => e.covered).length,
      still_uncovered: build.stadiumAudit.filter((e) => !e.covered).length,
      final_coverage: coverageMatrix.find((c) => c.venue_class === "STADIUM")?.final_coverage ?? null,
    },
    cross_tabs: crossTabs,
    by_venue_class: tally(highValue, (r) => r.venue_class),
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
  for (const d of researcherDirs) if (!existsSync(d)) console.warn(`[build07] researcher dir not found: ${d}`);

  const build = buildCensus07({ researcherDirs: existing });

  const errors = validateCensus07(build.rows);
  const reconciliation = reconcileAgainstPredecessor(build.predecessorRows, build.rows);
  const auditErrors = validateStadiumAudit(build.stadiumAudit);
  if (errors.length > 0 || reconciliation.length > 0 || auditErrors.length > 0) {
    console.error(`[build07] REFUSING TO WRITE — ${errors.length} contract, ${reconciliation.length} reconciliation, ${auditErrors.length} audit failure(s):`);
    for (const e of [...errors, ...reconciliation, ...auditErrors].slice(0, 40)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const { summary, completeness } = emitArtifacts07(build, { generatedAt });

  console.log(`[build07] wrote ${CENSUS_07_OUTPUT_DIR}`);
  console.log(`[build07] rows ............................. ${build.rows.length}`);
  console.log(`[build07]   carried from Package 06 ........ ${build.carriedCount}`);
  console.log(`[build07]   target-row dispositions ........ ${build.appliedDispositionCount}`);
  console.log(`[build07]   new in Package 07 .............. ${build.newRows.length}`);
  console.log(`[build07] confirmed >=1000 ................. ${summary.headline.confirmed_1000_plus}`);
  console.log(`[build07] capacity-unverified .............. ${summary.headline.capacity_unverified_high_value_candidates}`);
  console.log(`[build07] confirmed in canon ............... ${summary.canonical_coverage.confirmed_already_in_canon}`);
  console.log(`[build07] confirmed missing ................ ${summary.canonical_coverage.confirmed_missing_from_canon}`);
  console.log(`[build07] confirmed identity review ........ ${summary.canonical_coverage.confirmed_identity_review}`);
  console.log(`[build07] STADIUM covered .................. ${summary.stadium_closure.covered_total}/8 (${summary.stadium_closure.final_coverage})`);
  console.log(`[build07] sweeps run ....................... ${build.sweepsRun.join(", ") || "(none)"}`);
  console.log(`[build07] completeness ..................... ${completeness.verdict} (${completeness.blocking.length} blocking)`);
  console.log(`[build07] invariants ....................... ${JSON.stringify(summary.quality_invariants)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
