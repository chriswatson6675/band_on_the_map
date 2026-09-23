#!/usr/bin/env node
// Deterministic builder for the UK high-value venue estate census
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05).
//
// Reads, and only ever reads:
//   - research/major-event-venues/uk-major-event-census-01/   (committed
//     evidence: 855 UK venues already researched at the same >=1,000
//     capacity threshold, with capacity evidence and calendar sources)
//   - venues/uk.json                                          (the 3,537
//     canonical venues, for identity reconciliation only)
//   - an optional directory of researcher JSONL rows (this package's own
//     new national research, gathered outside the repository)
//
// Writes only research/high-value-venue-estate/uk-1000plus-05/.
//
// It NEVER writes venues/uk.json, sources/*.json, data/public/*, or any
// prior research artifact. It never fetches anything. Re-running it on
// the same inputs produces byte-identical output, which is what makes the
// numbers in the final report checkable rather than assertions.
//
// WHY A BUILDER AND NOT A WRITTEN-UP ANALYSIS
// -------------------------------------------
// The previous national package produced a headline number ("2,014 UK
// venues have no website") that was false, because it was computed one
// way and described another. Every count this census publishes is
// therefore derived here, in code, from cited inputs — so the count and
// its definition cannot drift apart.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CENSUS_FRAMEWORK_VERSION,
  CONFERENCE_VENUE_CLASSES,
  HIGH_VALUE_CAPACITY_THRESHOLD,
  SPORTS_VENUE_CLASSES,
  validateCensus,
} from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_OUTPUT_DIR = "research/high-value-venue-estate/uk-1000plus-05";
const PRIOR_CENSUS_DIR = "research/major-event-venues/uk-major-event-census-01";

// ---------------------------------------------------------------------
// Deterministic mapping from the prior census's venue_type vocabulary to
// this package's venue_class vocabulary.
//
// This is a documented, mechanical table, not a per-venue judgement. The
// prior census's own type is preserved on every row (prior_venue_type and
// in notes) so nothing is lost and the mapping stays auditable.
//
// RUGBY_STADIUM is deliberately absent: the prior census does not record
// union/league, but its calendar sources DO carry an explicit `sport`
// field, so that one split is derived from retained evidence instead of
// assumed. See classifyRugby() below.
// ---------------------------------------------------------------------
export const PRIOR_TYPE_TO_VENUE_CLASS = Object.freeze({
  FOOTBALL_STADIUM: "FOOTBALL_GROUND",
  RACECOURSE: "RACECOURSE",
  CRICKET_GROUND: "CRICKET_GROUND",
  MOTORSPORT_CIRCUIT: "MOTORSPORT_VENUE",
  GREYHOUND_STADIUM: "OTHER_PERMANENT_SPECTATOR_SPORT",
  OTHER_SPORTS_VENUE: "OTHER_PERMANENT_SPECTATOR_SPORT",
  INDOOR_ARENA: "ARENA",
  THEATRE: "THEATRE",
  CONCERT_HALL: "CONCERT_HALL",
  // The prior census's catch-all for large permanent performance/event
  // halls that are neither a theatre nor a dedicated concert hall
  // (civic auditoria, pavilions, academy-style music halls).
  AUDITORIUM: "EVENT_HALL",
  MULTI_PURPOSE_EVENT_COMPLEX: "MULTI_PURPOSE_VENUE",
  OTHER_MAJOR_EVENT_VENUE: "MULTI_PURPOSE_VENUE",
  EXHIBITION_CENTRE: "EXHIBITION_CENTRE",
  CONFERENCE_CENTRE: "CONFERENCE_CENTRE",
  CONVENTION_CENTRE: "CONVENTION_CENTRE",
  CONFERENCE_EXHIBITION_COMPLEX: "CONVENTION_CENTRE",
});

// Prior-census capacity authority grades -> this census's source kinds.
// GRADE_A/B/C are the prior census's own provenance grades; the mapping
// below is conservative, and anything not explicitly first-party is
// treated as a third-party lead (honesty rule 4).
function capacitySourceKindFor(url, authority) {
  if (typeof url !== "string" || url.length === 0) return null;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "OTHER";
  }
  // Explicitly third-party reference works and aggregators. These are
  // legitimate DISCOVERY leads and legitimate capacity corroboration,
  // but they are never "official" — see docs/SOURCE_INVESTIGATION_POLICY.md.
  const THIRD_PARTY_HOSTS = [
    "wikipedia.org",
    "wikidata.org",
    "wikimedia.org",
    "dbpedia.org",
    "songkick.com",
    "ticketmaster.co.uk",
    "seatgeek.com",
    "skiddle.com",
  ];
  if (THIRD_PARTY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return "HIGH_QUALITY_THIRD_PARTY";
  }
  if (host.endsWith(".gov.uk") || host.endsWith(".gov.scot") || host.endsWith(".gov.wales")) {
    return "OFFICIAL_LOCAL_AUTHORITY";
  }
  // GRADE_A in the prior census means the venue's/operator's own
  // published figure. Anything less confident stays OTHER rather than
  // being promoted to official.
  if (authority === "GRADE_A") return "OFFICIAL_VENUE";
  if (authority === "GRADE_B") return "OFFICIAL_OPERATOR";
  return "OTHER";
}

// Prior-census capacity_type -> this census's capacity_kind.
const PRIOR_CAPACITY_TYPE_TO_KIND = Object.freeze({
  SPECTATOR: "SPECTATOR",
  SEATED: "SEATED",
  STANDING: "STANDING",
  CONCERT: "STANDING",
  AUDITORIUM: "SEATED",
  THEATRE_STYLE: "THEATRE_STYLE",
  DELEGATE: "DELEGATE",
  BANQUET: "BANQUET",
  LARGEST_ROOM: "OTHER",
  GRANDSTAND: "SPECTATOR",
  RECORDED_ATTENDANCE: "SPECTATOR",
  SITE_EVENT_CAPACITY: "OTHER",
  OTHER_EXPLICIT: "OTHER",
});

const PRIOR_SOURCE_TYPE_TO_SCOPE = Object.freeze({
  SPORT_FIXTURES: "SPORT",
  CONCERTS: "MUSIC",
  PERFORMING_ARTS: "THEATRE",
  EXHIBITIONS: "EXHIBITION",
  CONFERENCES: "CONFERENCE",
  PUBLIC_SHOWS: "GENERAL",
  OTHER_MAJOR_EVENTS: "GENERAL",
});

// Prior-census source_family -> this census's acquisition_shape.
const PRIOR_FAMILY_TO_SHAPE = Object.freeze({
  JSON_LD_EVENT: "JSON_LD",
  MICRODATA: "SERVER_RENDERED_HTML",
  STATIC_HTML_CARDS: "SERVER_RENDERED_HTML",
  EMBEDDED_NEXT_DATA: "CLIENT_RENDERED",
  EMBEDDED_NUXT_STATE: "CLIENT_RENDERED",
  EMBEDDED_SVELTEKIT_DATA: "CLIENT_RENDERED",
  OTHER_EMBEDDED_APP_STATE: "CLIENT_RENDERED",
  CLIENT_RENDERED_UNKNOWN: "CLIENT_RENDERED",
  PUBLIC_GRAPHQL: "GRAPHQL",
  WORDPRESS_TRIBE_API: "WORDPRESS_REST",
  SQUARESPACE_CALENDAR: "EMBEDDED_WIDGET",
  WEBFLOW: "SERVER_RENDERED_HTML",
  ACCESS_BLOCKED: "ACCESS_RESTRICTED",
  FINGERPRINT_FETCH_FAILED: "UNKNOWN",
  NOT_YET_FINGERPRINTED: "UNKNOWN",
  NO_CURRENT_PROGRAMME_FOUND: "UNKNOWN",
  OTHER: "UNKNOWN",
});

// ---------------------------------------------------------------------
// Name normalisation for canonical reconciliation
// ---------------------------------------------------------------------
const GENERIC_TOKENS =
  /\b(the|stadium|ground|arena|centre|center|hall|theatre|theater|park|club|fc|afc|rfc|cc|ltd|limited|uk)\b/g;

export function normaliseName(value) {
  return (
    (value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Fold the spelling variants that otherwise produce false
      // "missing from canon" claims. The canonical estate records
      // "Saint David's Hall" where this census's source says
      // "St David's Hall" — without this, a venue BeatMapped already
      // knows would be reported as a gap, inflating the headline.
      .replace(/\bsaint\b/g, "st")
      .replace(/\bcenter\b/g, "centre")
      .replace(/\btheater\b/g, "theatre")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function coreName(value) {
  return normaliseName(value).replace(GENERIC_TOKENS, " ").replace(/\s+/g, " ").trim();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function slug(value) {
  return normaliseName(value).replace(/\s+/g, "-").slice(0, 60) || "unnamed";
}

function pushUnique(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

// ---------------------------------------------------------------------
// Canonical index
// ---------------------------------------------------------------------
export function buildCanonicalIndex(canonicalVenues) {
  const byExplicitCensusId = new Map();
  const byName = new Map();
  const byCore = new Map();
  const byHost = new Map();

  for (const venue of canonicalVenues) {
    for (const item of venue.evidence ?? []) {
      const match = /venue_census_id="([^"]+)"/.exec(item.note ?? "");
      if (match && !byExplicitCensusId.has(match[1])) {
        byExplicitCensusId.set(match[1], venue);
      }
      const host = hostOf(item.url);
      if (host) pushUnique(byHost, host, venue);
    }
    pushUnique(byName, normaliseName(venue.canonical_name), venue);
    pushUnique(byCore, coreName(venue.canonical_name), venue);
  }

  return { byExplicitCensusId, byName, byCore, byHost };
}

function localityMatches(canonicalVenue, locality) {
  if (!locality) return false;
  const target = normaliseName(locality);
  if (!target) return false;
  const city = normaliseName(canonicalVenue.city);
  const municipality = normaliseName(canonicalVenue.municipality);
  // The prior census sometimes records a compound locality such as
  // "Anfield, Liverpool" or "Andover, Hampshire"; canonical records carry
  // a single value. Treat containment in either direction as a match.
  return (
    city === target ||
    municipality === target ||
    (city.length > 3 && target.includes(city)) ||
    (target.length > 3 && city.includes(target))
  );
}

/**
 * Reconcile one candidate against the canonical estate.
 *
 * Returns { state, canonical_venue_id, basis } where `basis` states, in
 * plain words, exactly which rule fired — so a MISSING_FROM_CANON claim
 * is always traceable to the specific check that failed to find a match,
 * not to an opaque "no match".
 *
 * Deliberately conservative: anything short of a strong match is reported
 * as PROBABLE / AMBIGUOUS rather than being asserted as missing, because
 * over-reporting "missing" would inflate the headline gap.
 */
export function reconcileAgainstCanon(candidate, index) {
  const { name, locality, priorCensusId, officialUrl } = candidate;

  if (priorCensusId && index.byExplicitCensusId.has(priorCensusId)) {
    const venue = index.byExplicitCensusId.get(priorCensusId);
    return {
      state: "EXISTING_CANONICAL",
      canonical_venue_id: venue.venue_id,
      basis: `canonical venue record cites venue_census_id="${priorCensusId}"`,
    };
  }

  const normalised = normaliseName(name);
  const exact = index.byName.get(normalised) ?? [];

  const exactSameLocality = exact.filter((v) => localityMatches(v, locality));
  if (exactSameLocality.length === 1) {
    return {
      state: "EXISTING_CANONICAL",
      canonical_venue_id: exactSameLocality[0].venue_id,
      basis: "exact normalised name match in the same locality",
    };
  }
  if (exactSameLocality.length > 1) {
    return {
      state: "AMBIGUOUS_IDENTITY",
      canonical_venue_id: null,
      basis: `${exactSameLocality.length} canonical venues share this normalised name and locality`,
    };
  }
  if (exact.length === 1) {
    return {
      state: "PROBABLE_EXISTING_CANONICAL",
      canonical_venue_id: exact[0].venue_id,
      basis: "unique exact normalised name match, locality not corroborated",
    };
  }
  if (exact.length > 1) {
    return {
      state: "AMBIGUOUS_IDENTITY",
      canonical_venue_id: null,
      basis: `${exact.length} canonical venues share this normalised name in different localities`,
    };
  }

  // Official-website host match, but only when the locality corroborates
  // it. A club domain can legitimately front more than one venue, so a
  // bare host match is not treated as identity on its own.
  const host = officialUrl ? hostOf(officialUrl) : null;
  if (host && index.byHost.has(host)) {
    const sameHost = index.byHost.get(host);
    const corroborated = sameHost.filter((v) => localityMatches(v, locality));
    if (corroborated.length === 1) {
      return {
        state: "PROBABLE_EXISTING_CANONICAL",
        canonical_venue_id: corroborated[0].venue_id,
        basis: `official website host "${host}" also cited by a canonical venue in the same locality`,
      };
    }
    if (sameHost.length > 0) {
      return {
        state: "AMBIGUOUS_IDENTITY",
        canonical_venue_id: null,
        basis: `official website host "${host}" is cited by ${sameHost.length} canonical venue(s), none corroborated by locality`,
      };
    }
  }

  const core = coreName(name);
  if (core.length > 3) {
    const coreMatches = (index.byCore.get(core) ?? []).filter((v) =>
      localityMatches(v, locality),
    );
    if (coreMatches.length === 1) {
      return {
        state: "PROBABLE_EXISTING_CANONICAL",
        canonical_venue_id: coreMatches[0].venue_id,
        basis: "distinctive name core matched a canonical venue in the same locality",
      };
    }
    if (coreMatches.length > 1) {
      return {
        state: "AMBIGUOUS_IDENTITY",
        canonical_venue_id: null,
        basis: `${coreMatches.length} canonical venues share this name core and locality`,
      };
    }
  }

  return {
    state: "MISSING_FROM_CANON",
    canonical_venue_id: null,
    basis:
      "no canonical venue matched by census id, exact name, name+locality, corroborated website host, or distinctive name core",
  };
}

// ---------------------------------------------------------------------
// Rugby union/league split, derived from retained calendar-source `sport`
// ---------------------------------------------------------------------
function classifyRugby(sports) {
  const union = sports.has("rugby_union");
  const league = sports.has("rugby_league");
  if (union && league) return "MULTI_SPORT_ARENA";
  if (union) return "RUGBY_UNION_GROUND";
  if (league) return "RUGBY_LEAGUE_GROUND";
  // No retained source names the code played here. "STADIUM" is the
  // honest generic — inventing union or league would be a guess.
  return "STADIUM";
}

// ---------------------------------------------------------------------
// Build one census row from the prior census's retained evidence
// ---------------------------------------------------------------------
function buildRowFromPriorCensus(venue, context) {
  const { capacityByVenue, calendarsByVenue, index } = context;

  const capacities = capacityByVenue.get(venue.venue_census_id) ?? [];
  const principal =
    capacities.find((c) => c.is_principal) ??
    capacities.slice().sort((a, b) => (b.capacity_value ?? 0) - (a.capacity_value ?? 0))[0] ??
    null;

  const calendars = calendarsByVenue.get(venue.venue_census_id) ?? [];
  const sports = new Set(calendars.map((c) => c.sport).filter(Boolean));

  const venueClass =
    venue.venue_type === "RUGBY_STADIUM"
      ? classifyRugby(sports)
      : (PRIOR_TYPE_TO_VENUE_CLASS[venue.venue_type] ?? "MULTI_PURPOSE_VENUE");

  // --- capacity ------------------------------------------------------
  // The prior census sometimes recorded a capacity whose "source" is prose
  // rather than a retained URL — e.g. "WebSearch result summary citing
  // <site> (page not directly fetched)", or an explicit statement that the
  // figure was never established. It recorded those honestly, and this
  // census must not launder them into confirmed facts: a capacity with no
  // citable source URL is NOT treated as established. The prose is kept in
  // the row's notes so the reason survives rather than disappearing.
  const priorSource =
    typeof principal?.capacity_source === "string" ? principal.capacity_source.trim() : "";
  const priorSourceIsUrl = /^https?:\/\//.test(priorSource);
  const capacityValue =
    principal && Number.isFinite(principal.capacity_value) && principal.capacity_value > 0 && priorSourceIsUrl
      ? Math.trunc(principal.capacity_value)
      : 0;
  const capacitySourceUrl = capacityValue > 0 ? priorSource : null;
  // Why a figure the prior census DID record is not carried as established.
  const unciteableCapacityNote =
    principal && Number.isFinite(principal.capacity_value) && principal.capacity_value > 0 && !priorSourceIsUrl
      ? ` Prior census recorded capacity ${Math.trunc(principal.capacity_value)} but its source is not a retained URL (${priorSource || "no source recorded"}), so this census does not treat that figure as established.`
      : "";
  const capacityEvidence = [];
  if (capacityValue > 0 && capacitySourceUrl) {
    const others = capacities.filter((c) => c !== principal && c.capacity_value > 0);
    capacityEvidence.push({
      url: capacitySourceUrl,
      kind: "COMMITTED_RESEARCH_ARTIFACT",
      note:
        `Prior governed census uk-major-event-census-01 recorded capacity ${capacityValue} ` +
        `(${principal.capacity_type ?? "unspecified type"}, authority ${principal.capacity_source_authority ?? "none"}, ` +
        `confidence ${principal.capacity_confidence ?? "unrecorded"}, observed ${principal.capacity_observed_at ?? "date unrecorded"}) ` +
        `for venue_census_id="${venue.venue_census_id}" from this source.` +
        (others.length > 0
          ? ` ${others.length} further configuration(s) also retained: ${others
              .map((c) => `${c.capacity_value} ${c.capacity_type ?? "?"}`)
              .join(", ")}.`
          : ""),
    });
  }

  const capacityConfidence =
    capacityValue === 0
      ? "UNKNOWN"
      : principal.capacity_confidence === "HIGH"
        ? "HIGH"
        : principal.capacity_confidence === "MEDIUM"
          ? "MEDIUM"
          : principal.capacity_confidence === "LOW"
            ? "LOW"
            : "UNKNOWN";

  // A capacity figure whose own confidence the prior census could not
  // establish cannot carry this census's CONFIRMED state.
  let highValueState;
  if (capacityValue >= HIGH_VALUE_CAPACITY_THRESHOLD && capacityEvidence.length > 0 && capacityConfidence !== "UNKNOWN") {
    highValueState = "CONFIRMED_1000_PLUS";
  } else if (capacityValue > 0 && capacityValue < HIGH_VALUE_CAPACITY_THRESHOLD && capacityEvidence.length > 0) {
    highValueState = "BELOW_THRESHOLD";
  } else {
    // The prior census admitted this venue on MAJOR_SPORTING_INFRASTRUCTURE
    // or MAJOR_CONVENTION_EXHIBITION_INFRASTRUCTURE grounds, or flagged it
    // CAPACITY_REVIEW_REQUIRED. It is a high-value candidate we cannot yet
    // evidence at >=1,000 — which is exactly what this state is for.
    highValueState = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }

  // --- calendars -----------------------------------------------------
  const usable = calendars.filter((c) => c.publicly_accessible !== false);
  const sportCalendars = usable.filter((c) => c.source_type === "SPORT_FIXTURES");
  const conferenceCalendars = usable.filter(
    (c) => c.source_type === "CONFERENCES" || c.source_type === "EXHIBITIONS",
  );
  const generalCalendars = usable.filter(
    (c) => c.source_type !== "SPORT_FIXTURES" && c.source_type !== "CONFERENCES" && c.source_type !== "EXHIBITIONS",
  );

  const pick = (list) => (list.length > 0 ? list[0] : null);
  const sportsCalendar = pick(sportCalendars);
  const conferenceCalendar = pick(conferenceCalendars);
  const generalCalendar = pick(generalCalendars);
  const primary = generalCalendar ?? sportsCalendar ?? conferenceCalendar;

  const calendarEvidence = [];
  for (const calendar of [generalCalendar, sportsCalendar, conferenceCalendar]) {
    if (!calendar) continue;
    calendarEvidence.push({
      url: calendar.source_url,
      kind: "COMMITTED_RESEARCH_ARTIFACT",
      note:
        `Prior governed census uk-major-event-census-01 retained this ${calendar.source_type} calendar source ` +
        `(first_party=${calendar.first_party}, publicly_accessible=${calendar.publicly_accessible}, ` +
        `events_currently_present=${calendar.events_currently_present}, source_family=${calendar.source_family}, ` +
        `http_status=${calendar.http_status ?? "unrecorded"}, last_checked=${calendar.last_checked ?? "unrecorded"}).`,
    });
  }

  const blocked = calendars.length > 0 && calendars.every((c) => c.source_family === "ACCESS_BLOCKED");

  let calendarState;
  if (calendars.length === 0) {
    // The prior census researched this venue and retained no calendar.
    // That is a researched negative only because the prior census's own
    // completeness audit covered it; it is recorded as such, with the
    // venue's official site as the evidence that a look happened.
    calendarState = "NO_PUBLIC_CALENDAR_FOUND";
  } else if (blocked) {
    calendarState = "CALENDAR_ACCESS_RESTRICTED";
  } else if (conferenceCalendar && !generalCalendar && !sportsCalendar) {
    calendarState = "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR";
  } else {
    calendarState = "HAS_PUBLIC_EVENT_CALENDAR";
  }

  // A NO_PUBLIC_CALENDAR_FOUND claim needs evidence that somebody looked.
  // The prior census's own official-URL verification is that evidence.
  if (calendarState === "NO_PUBLIC_CALENDAR_FOUND") {
    if (venue.official_url) {
      calendarEvidence.push({
        url: venue.official_url,
        kind: "COMMITTED_RESEARCH_ARTIFACT",
        note:
          `Prior governed census uk-major-event-census-01 verified this official URL ` +
          `(official_url_status=${venue.official_url_status}) and retained NO calendar source for ` +
          `venue_census_id="${venue.venue_census_id}" — a researched negative, not an unresearched gap.`,
      });
    } else {
      // No official URL was ever established, so "no calendar" would be
      // an unsupported negative. Report it as unresolved instead.
      calendarState = "UNKNOWN";
    }
  }

  const calendarScope = (() => {
    const scopes = new Set(
      usable.map((c) => PRIOR_SOURCE_TYPE_TO_SCOPE[c.source_type]).filter(Boolean),
    );
    if (scopes.size === 0) return calendarState === "UNKNOWN" ? "UNKNOWN" : "NONE";
    if (scopes.size > 1) return "MULTI";
    return [...scopes][0];
  })();

  const calendarSourceKind = (() => {
    if (!primary) return calendarState === "UNKNOWN" ? "UNKNOWN" : "NONE";
    if (primary.first_party === false) return "THIRD_PARTY";
    if (primary.source_type === "SPORT_FIXTURES") return "CLUB";
    return "VENUE";
  })();

  const acquisitionShape = primary
    ? (PRIOR_FAMILY_TO_SHAPE[primary.source_family] ?? "UNKNOWN")
    : blocked
      ? "ACCESS_RESTRICTED"
      : "UNKNOWN";

  // --- readiness -----------------------------------------------------
  const isSportsClass = SPORTS_VENUE_CLASSES.includes(venueClass);
  let readiness;
  if (calendarState === "CALENDAR_ACCESS_RESTRICTED") {
    readiness = "ACCESS_RESTRICTED";
  } else if (calendarState === "UNKNOWN") {
    readiness = "IDENTITY_OR_CAPACITY_REVIEW";
  } else if (calendarState === "NO_PUBLIC_CALENDAR_FOUND") {
    readiness = "PUBLIC_CALENDAR_NOT_FOUND";
  } else if (primary && primary.first_party === false) {
    readiness = "READY_THIRD_PARTY_ONLY";
  } else if (isSportsClass && sportsCalendar && !generalCalendar) {
    readiness = "READY_SPORTS_FIXTURE_SOURCE";
  } else if (
    primary &&
    ["JSON_LD_EVENT", "MICRODATA", "STATIC_HTML_CARDS", "WORDPRESS_TRIBE_API", "WEBFLOW"].includes(
      primary.source_family,
    )
  ) {
    // A server-rendered or structured-data source is directly usable.
    readiness = "READY_FIRST_PARTY";
  } else {
    // Client-rendered / embedded app state: a real source exists and was
    // fingerprinted, but an adapter still has to be researched for it.
    readiness = "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH";
  }

  // --- identity ------------------------------------------------------
  const identityEvidence = [];
  if (venue.official_url) {
    identityEvidence.push({
      url: venue.official_url,
      kind: "COMMITTED_RESEARCH_ARTIFACT",
      note:
        `Prior governed census uk-major-event-census-01 established this venue's identity ` +
        `(venue_census_id="${venue.venue_census_id}", venue_type=${venue.venue_type}, ` +
        `operator=${venue.operator ?? "unrecorded"}, nation=${venue.nation ?? "unrecorded"}) ` +
        `with official_url_status=${venue.official_url_status}.`,
    });
  }
  for (const item of venue.provenance?.evidence ?? []) {
    if (identityEvidence.length >= 4) break;
    if (typeof item.value !== "string" || !/^https?:\/\//.test(item.value)) continue;
    if (identityEvidence.some((e) => e.url === item.value)) continue;
    identityEvidence.push({
      url: item.value,
      kind: "COMMITTED_RESEARCH_ARTIFACT",
      note: `Prior census provenance (workstream ${venue.provenance?.workstream ?? "unrecorded"}): ${item.note ?? "no note recorded"}`,
    });
  }

  const reconciliation = reconcileAgainstCanon(
    {
      name: venue.canonical_name,
      locality: venue.city,
      priorCensusId: venue.venue_census_id,
      officialUrl: venue.official_url,
    },
    index,
  );

  // An identity the prior census itself flagged for review must not be
  // silently asserted as missing from canon.
  const matchState =
    venue.identity_review && reconciliation.state === "MISSING_FROM_CANON"
      ? "AMBIGUOUS_IDENTITY"
      : reconciliation.state;
  const canonicalVenueId =
    matchState === reconciliation.state ? reconciliation.canonical_venue_id : null;

  const researchStatus =
    identityEvidence.length === 0
      ? "REVIEW_REQUIRED"
      : matchState === "AMBIGUOUS_IDENTITY" || highValueState === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE"
        ? "REVIEW_REQUIRED"
        : "COMPLETE";

  return {
    research_id: `hv05-p-${slug(venue.venue_census_id.replace(/^ukmec-/, ""))}`,
    canonical_venue_id: canonicalVenueId,
    canonical_match_state: matchState,
    name: venue.canonical_name,
    aliases: Array.isArray(venue.alternative_names) ? venue.alternative_names.filter(Boolean) : [],
    venue_class: venueClass,
    locality: venue.city ?? null,
    nation: ["England", "Wales", "Scotland", "Northern Ireland"].includes(venue.nation)
      ? venue.nation
      : "UNKNOWN",
    postcode: venue.postcode ?? null,
    operator_name: venue.operator ?? null,
    capacity_max: capacityValue,
    capacity_kind:
      capacityValue > 0
        ? (PRIOR_CAPACITY_TYPE_TO_KIND[principal.capacity_type] ?? "OTHER")
        : null,
    capacity_context:
      capacityValue > 0
        ? `${principal.capacity_type ?? "unspecified"}${principal.capacity_configuration ? ` — ${principal.capacity_configuration}` : ""}${capacities.length > 1 ? ` (1 of ${capacities.length} retained configurations)` : ""}`
        : null,
    capacity_source_url: capacitySourceUrl,
    capacity_source_kind:
      capacityValue > 0
        ? capacitySourceKindFor(capacitySourceUrl, principal.capacity_source_authority)
        : null,
    capacity_confidence: capacityConfidence,
    high_value_state: highValueState,
    official_website_url: venue.official_url ?? null,
    general_programme_url: generalCalendar?.source_url ?? null,
    conference_calendar_url: conferenceCalendar?.source_url ?? null,
    sports_calendar_url: sportsCalendar?.source_url ?? null,
    ticketing_url: null,
    calendar_scope: calendarScope,
    calendar_source_kind: calendarSourceKind,
    calendar_state: calendarState,
    platform_family: primary ? primary.source_family : null,
    platform_evidence: primary
      ? `Prior census fingerprinted ${primary.source_url} as ${primary.source_family}${
          Array.isArray(primary.source_family_signals) && primary.source_family_signals.length > 0
            ? ` on signals: ${primary.source_family_signals.join("; ")}`
            : ""
        }.`
      : null,
    acquisition_shape: acquisitionShape,
    acquisition_readiness: readiness,
    identity_evidence: identityEvidence,
    capacity_evidence: capacityEvidence,
    calendar_evidence: calendarEvidence,
    research_status: researchStatus,
    notes:
      `Carried forward from committed census uk-major-event-census-01 ` +
      `(prior venue_type=${venue.venue_type}, inclusion_basis=${venue.inclusion_basis}). ` +
      `Canonical reconciliation: ${reconciliation.basis}.` +
      (venue.identity_review
        ? ` Prior census flagged identity_review: ${venue.identity_review_reason ?? "no reason recorded"}.`
        : "") +
      (venue.venue_type === "RUGBY_STADIUM"
        ? ` Rugby code derived from retained calendar-source sport values: ${[...sports].join(", ") || "none recorded"}.`
        : "") +
      unciteableCapacityNote,
    provenance: "PRIOR_COMMITTED_CENSUS",
    prior_venue_type: venue.venue_type,
    prior_census_id: venue.venue_census_id,
  };
}

// ---------------------------------------------------------------------
// Researcher JSONL ingestion
// ---------------------------------------------------------------------
function readJsonl(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // A truncated final line is expected when a researcher was cut off
      // mid-write. Skipping it is correct; inventing it would not be.
    }
  }
  return rows;
}

/**
 * Normalise a researcher row into a full census row, reconcile it against
 * canon, and repair the small number of internally-inconsistent states a
 * researcher can honestly produce (e.g. claiming a readiness that its own
 * evidence does not support). Repairs always move a row towards the LESS
 * confident claim, never towards a stronger one.
 */
function normaliseResearcherRow(raw, index, seenIds) {
  const name = typeof raw?.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const asArray = (value) =>
    Array.isArray(value)
      ? value
          .filter((e) => e && typeof e.url === "string" && /^https?:\/\//.test(e.url))
          .map((e) => ({
            url: e.url,
            kind: ["FETCHED_URL", "SEARCH_RESULT", "COMMITTED_RESEARCH_ARTIFACT", "CANONICAL_REGISTRY", "DETERMINISTIC_DERIVATION"].includes(e.kind)
              ? e.kind
              : "SEARCH_RESULT",
            note: typeof e.note === "string" && e.note.trim() ? e.note.trim() : "no note recorded by researcher",
          }))
      : [];

  const identityEvidence = asArray(raw.identity_evidence);
  if (identityEvidence.length === 0) return null; // unsupported assertion

  const capacityEvidence = asArray(raw.capacity_evidence);
  const calendarEvidence = asArray(raw.calendar_evidence);

  const url = (value) => (typeof value === "string" && /^https?:\/\//.test(value) ? value : null);
  const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);

  let capacityMax =
    Number.isFinite(raw.capacity_max) && raw.capacity_max > 0 ? Math.trunc(raw.capacity_max) : 0;
  let capacitySourceUrl = url(raw.capacity_source_url);
  // An unsupported capacity number is dropped, not trusted.
  if (capacityMax > 0 && (capacityEvidence.length === 0 || !capacitySourceUrl)) {
    capacityMax = 0;
    capacitySourceUrl = null;
  }
  if (capacityMax === 0) capacitySourceUrl = null;

  let capacityConfidence = oneOf(raw.capacity_confidence, ["HIGH", "MEDIUM", "LOW", "UNKNOWN"], "UNKNOWN");
  if (capacityMax === 0) capacityConfidence = "UNKNOWN";
  else if (capacityConfidence === "UNKNOWN") capacityConfidence = "LOW";

  let researchStatus = oneOf(
    raw.research_status,
    ["COMPLETE", "NOT_YET_RESEARCHED", "RESEARCH_BLOCKED", "REVIEW_REQUIRED"],
    "REVIEW_REQUIRED",
  );
  const unresearched = researchStatus === "NOT_YET_RESEARCHED" || researchStatus === "RESEARCH_BLOCKED";

  let highValueState = oneOf(
    raw.high_value_state,
    ["CONFIRMED_1000_PLUS", "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE", "BELOW_THRESHOLD", "UNRESOLVED"],
    "UNRESOLVED",
  );
  // Re-derive rather than trust: the state must follow from the evidence
  // that survived normalisation above.
  if (capacityMax >= HIGH_VALUE_CAPACITY_THRESHOLD && capacityEvidence.length > 0) {
    highValueState = "CONFIRMED_1000_PLUS";
  } else if (capacityMax > 0 && capacityMax < HIGH_VALUE_CAPACITY_THRESHOLD) {
    highValueState = unresearched ? "UNRESOLVED" : "BELOW_THRESHOLD";
  } else if (highValueState === "CONFIRMED_1000_PLUS" || highValueState === "BELOW_THRESHOLD") {
    // Claimed a capacity verdict but lost its supporting capacity.
    highValueState = "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE";
  }

  let calendarState = oneOf(
    raw.calendar_state,
    [
      "HAS_PUBLIC_EVENT_CALENDAR",
      "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR",
      "PRIVATE_BOOKINGS_ONLY",
      "NO_PUBLIC_CALENDAR_FOUND",
      "CALENDAR_ACCESS_RESTRICTED",
      "UNKNOWN",
    ],
    "UNKNOWN",
  );
  // Honesty rules 2 and 3: a negative calendar claim needs evidence, and
  // an unresearched row may not make one at all.
  if (
    (calendarState === "NO_PUBLIC_CALENDAR_FOUND" || calendarState === "PRIVATE_BOOKINGS_ONLY") &&
    (calendarEvidence.length === 0 || unresearched)
  ) {
    calendarState = "UNKNOWN";
  }

  const generalUrl = url(raw.general_programme_url);
  const conferenceUrl = url(raw.conference_calendar_url);
  const sportsUrl = url(raw.sports_calendar_url);
  const ticketingUrl = url(raw.ticketing_url);
  const anySourceUrl = Boolean(generalUrl || conferenceUrl || sportsUrl || ticketingUrl);

  if (
    (calendarState === "HAS_PUBLIC_EVENT_CALENDAR" || calendarState === "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR") &&
    (!anySourceUrl || calendarEvidence.length === 0)
  ) {
    calendarState = "UNKNOWN";
  }

  const venueClass = oneOf(
    raw.venue_class,
    [
      "ARENA", "STADIUM", "THEATRE", "CONCERT_HALL", "CIVIC_HALL", "EVENT_HALL",
      "CONFERENCE_CENTRE", "CONVENTION_CENTRE", "EXHIBITION_CENTRE",
      "MAJOR_HOTEL_EVENT_VENUE", "UNIVERSITY_EVENT_VENUE", "RACECOURSE",
      "FOOTBALL_GROUND", "RUGBY_UNION_GROUND", "RUGBY_LEAGUE_GROUND",
      "CRICKET_GROUND", "ATHLETICS_STADIUM", "MOTORSPORT_VENUE",
      "ICE_HOCKEY_ARENA", "BASKETBALL_ARENA", "MULTI_SPORT_ARENA",
      "OTHER_PERMANENT_SPECTATOR_SPORT", "MULTI_PURPOSE_VENUE",
    ],
    "MULTI_PURPOSE_VENUE",
  );

  let calendarSourceKind = oneOf(
    raw.calendar_source_kind,
    ["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY", "TICKETING", "THIRD_PARTY", "NONE", "UNKNOWN"],
    "UNKNOWN",
  );

  let readiness = oneOf(
    raw.acquisition_readiness,
    [
      "READY_FIRST_PARTY", "READY_OPERATOR_LEVEL", "READY_SPORTS_FIXTURE_SOURCE",
      "READY_THIRD_PARTY_ONLY", "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
      "PUBLIC_CALENDAR_NOT_FOUND", "ACCESS_RESTRICTED", "IDENTITY_OR_CAPACITY_REVIEW",
      "NOT_YET_RESEARCHED",
    ],
    "NOT_YET_RESEARCHED",
  );
  const READY = [
    "READY_FIRST_PARTY", "READY_OPERATOR_LEVEL", "READY_SPORTS_FIXTURE_SOURCE",
    "READY_THIRD_PARTY_ONLY", "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
  ];
  const FIRST_PARTY_KINDS = ["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"];

  // Downgrade any readiness claim its own evidence does not support.
  if (READY.includes(readiness) && (!anySourceUrl || calendarEvidence.length === 0 || unresearched)) {
    readiness = unresearched ? "NOT_YET_RESEARCHED" : "IDENTITY_OR_CAPACITY_REVIEW";
  }
  if (readiness === "PUBLIC_CALENDAR_NOT_FOUND" && (calendarEvidence.length === 0 || unresearched)) {
    readiness = unresearched ? "NOT_YET_RESEARCHED" : "IDENTITY_OR_CAPACITY_REVIEW";
  }
  if (
    (readiness === "READY_FIRST_PARTY" || readiness === "READY_OPERATOR_LEVEL") &&
    !FIRST_PARTY_KINDS.includes(calendarSourceKind)
  ) {
    // The claim is first-party but the cited source is not.
    readiness = calendarSourceKind === "NONE" || calendarSourceKind === "UNKNOWN"
      ? "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH"
      : "READY_THIRD_PARTY_ONLY";
  }
  if (readiness === "READY_THIRD_PARTY_ONLY" && FIRST_PARTY_KINDS.includes(calendarSourceKind)) {
    readiness = "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH";
  }
  if (readiness === "READY_SPORTS_FIXTURE_SOURCE" && !SPORTS_VENUE_CLASSES.includes(venueClass)) {
    readiness = "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH";
  }
  let acquisitionShape = oneOf(
    raw.acquisition_shape,
    [
      "SERVER_RENDERED_HTML", "JSON_LD", "PUBLIC_JSON_API", "GRAPHQL", "WORDPRESS_REST",
      "EMBEDDED_WIDGET", "CLIENT_RENDERED", "IFRAME", "TICKETING_STOREFRONT",
      "DOWNLOADABLE_FIXTURE_FILE", "ICS", "ACCESS_RESTRICTED", "UNKNOWN",
    ],
    "UNKNOWN",
  );
  if (readiness === "ACCESS_RESTRICTED" && calendarState !== "CALENDAR_ACCESS_RESTRICTED") {
    acquisitionShape = "ACCESS_RESTRICTED";
  }

  // platform_family without evidence is a guess; drop it (policy: UNKNOWN
  // is a valid, respected answer).
  let platformFamily = text(raw.platform_family);
  let platformEvidence = text(raw.platform_evidence);
  if (platformFamily && !platformEvidence) platformFamily = null;
  if (!platformFamily) platformEvidence = null;

  let calendarScope = oneOf(
    raw.calendar_scope,
    ["GENERAL", "MUSIC", "THEATRE", "CONFERENCE", "EXHIBITION", "SPORT", "MULTI", "NONE", "UNKNOWN"],
    "UNKNOWN",
  );
  if (
    (calendarState === "HAS_PUBLIC_EVENT_CALENDAR" || calendarState === "HAS_CONFERENCE_OR_EXHIBITION_CALENDAR") &&
    calendarScope === "NONE"
  ) {
    calendarScope = "UNKNOWN";
  }

  const locality = text(raw.locality);
  const reconciliation = reconcileAgainstCanon(
    { name, locality, priorCensusId: null, officialUrl: url(raw.official_website_url) },
    index,
  );
  let matchState = reconciliation.state;
  let canonicalVenueId = reconciliation.canonical_venue_id;
  if (unresearched && matchState === "MISSING_FROM_CANON") {
    matchState = "UNASSESSED";
    canonicalVenueId = null;
  }

  // Stable, collision-free research id.
  const researcher = raw.researcher === "b" ? "b" : "a";
  let id = `hv05-${researcher}-${slug(`${name} ${locality ?? ""}`)}`;
  if (seenIds.has(id)) {
    let n = 2;
    while (seenIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  seenIds.add(id);

  return {
    research_id: id,
    canonical_venue_id: canonicalVenueId,
    canonical_match_state: matchState,
    name,
    aliases: Array.isArray(raw.aliases) ? raw.aliases.filter((a) => typeof a === "string" && a.trim()) : [],
    venue_class: venueClass,
    locality,
    nation: oneOf(raw.nation, ["England", "Wales", "Scotland", "Northern Ireland"], "UNKNOWN"),
    postcode: text(raw.postcode),
    operator_name: text(raw.operator_name),
    capacity_max: capacityMax,
    capacity_kind:
      capacityMax > 0
        ? oneOf(
            raw.capacity_kind,
            ["STANDING", "SEATED", "FIXED_SEATING", "SPECTATOR", "DELEGATE", "BANQUET", "THEATRE_STYLE", "EXHIBITION", "MULTI_CONFIGURATION", "OTHER"],
            "OTHER",
          )
        : null,
    capacity_context: capacityMax > 0 ? text(raw.capacity_context) : null,
    capacity_source_url: capacitySourceUrl,
    capacity_source_kind:
      capacityMax > 0
        ? oneOf(
            raw.capacity_source_kind,
            ["OFFICIAL_VENUE", "OFFICIAL_OPERATOR", "OFFICIAL_GOVERNING_BODY", "OFFICIAL_LEAGUE", "OFFICIAL_LOCAL_AUTHORITY", "HIGH_QUALITY_THIRD_PARTY", "OTHER"],
            "OTHER",
          )
        : null,
    capacity_confidence: capacityConfidence,
    high_value_state: highValueState,
    official_website_url: url(raw.official_website_url),
    general_programme_url: generalUrl,
    conference_calendar_url: conferenceUrl,
    sports_calendar_url: sportsUrl,
    ticketing_url: ticketingUrl,
    calendar_scope: calendarScope,
    calendar_source_kind: calendarSourceKind,
    calendar_state: calendarState,
    platform_family: platformFamily,
    platform_evidence: platformEvidence,
    acquisition_shape: acquisitionShape,
    acquisition_readiness: readiness,
    identity_evidence: identityEvidence,
    capacity_evidence: capacityMax > 0 ? capacityEvidence : capacityEvidence,
    calendar_evidence: calendarEvidence,
    research_status: researchStatus,
    notes:
      (text(raw.notes) ?? "") +
      ` [New national research by this package (researcher ${researcher}). Canonical reconciliation: ${reconciliation.basis}.]`,
    provenance: "PACKAGE_05_NEW_RESEARCH",
    prior_venue_type: null,
    prior_census_id: null,
  };
}

// ---------------------------------------------------------------------
// Cross-source deduplication
// ---------------------------------------------------------------------
/**
 * Drop a researcher row that describes a venue the prior census already
 * carries. Keyed on normalised name + locality, and on official website
 * host + locality. Returns { kept, dropped }.
 *
 * The prior census row is preferred because it carries retained capacity
 * and calendar evidence from a completed, audited package.
 */
export function dedupeAgainstPrior(priorRows, researcherRows) {
  const priorKeys = new Set();
  for (const row of priorRows) {
    const locality = normaliseName(row.locality);
    priorKeys.add(`n:${normaliseName(row.name)}|${locality}`);
    const host = row.official_website_url ? hostOf(row.official_website_url) : null;
    if (host) priorKeys.add(`h:${host}|${locality}`);
  }

  const kept = [];
  const dropped = [];
  for (const row of researcherRows) {
    const locality = normaliseName(row.locality);
    const host = row.official_website_url ? hostOf(row.official_website_url) : null;
    const nameKey = `n:${normaliseName(row.name)}|${locality}`;
    const hostKey = host ? `h:${host}|${locality}` : null;
    if (priorKeys.has(nameKey) || (hostKey && priorKeys.has(hostKey))) {
      dropped.push({
        research_id: row.research_id,
        name: row.name,
        locality: row.locality,
        reason: "already carried by committed census uk-major-event-census-01 (same name or website host in the same locality)",
      });
      continue;
    }
    kept.push(row);
  }
  return { kept, dropped };
}

// ---------------------------------------------------------------------
// Aggregation helpers
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

function sortedRows(rows) {
  return rows.slice().sort((a, b) => a.research_id.localeCompare(b.research_id));
}

// ---------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------
export function buildCensus({ repoRoot = ROOT, researcherDirs = [] } = {}) {
  const priorDir = join(repoRoot, PRIOR_CENSUS_DIR);
  const priorVenues = JSON.parse(readFileSync(join(priorDir, "venues.json"), "utf8")).venues;
  const priorCapacity = JSON.parse(readFileSync(join(priorDir, "capacity-evidence.json"), "utf8"))
    .capacity_evidence;
  const priorCalendars = JSON.parse(readFileSync(join(priorDir, "calendar-sources.json"), "utf8"))
    .calendar_sources;
  const canonical = JSON.parse(readFileSync(join(repoRoot, "venues/uk.json"), "utf8")).venues;

  const capacityByVenue = new Map();
  for (const record of priorCapacity) {
    if (!capacityByVenue.has(record.venue_census_id)) capacityByVenue.set(record.venue_census_id, []);
    capacityByVenue.get(record.venue_census_id).push(record);
  }
  const calendarsByVenue = new Map();
  for (const record of priorCalendars) {
    if (!calendarsByVenue.has(record.venue_census_id)) calendarsByVenue.set(record.venue_census_id, []);
    calendarsByVenue.get(record.venue_census_id).push(record);
  }

  const index = buildCanonicalIndex(canonical);
  const context = { capacityByVenue, calendarsByVenue, index };

  const priorRows = priorVenues.map((venue) => buildRowFromPriorCensus(venue, context));

  // --- researcher rows ------------------------------------------------
  const seenIds = new Set(priorRows.map((r) => r.research_id));
  const rawResearcherRows = [];
  const researcherFamilies = [];
  const researcherCoverage = [];
  let rejectedResearcherRows = 0;

  for (const dir of researcherDirs) {
    for (const raw of readJsonl(join(dir, "rows.jsonl"))) {
      const row = normaliseResearcherRow(raw, index, seenIds);
      if (row) rawResearcherRows.push(row);
      else rejectedResearcherRows += 1;
    }
    for (const family of readJsonl(join(dir, "source-families.jsonl"))) researcherFamilies.push(family);
    for (const coverage of readJsonl(join(dir, "coverage.jsonl"))) researcherCoverage.push(coverage);
  }

  const { kept: researcherRows, dropped: dedupedResearcherRows } = dedupeAgainstPrior(
    priorRows,
    rawResearcherRows,
  );

  const rows = sortedRows([...priorRows, ...researcherRows]);

  return {
    rows,
    priorRows,
    researcherRows,
    dedupedResearcherRows,
    rejectedResearcherRows,
    researcherFamilies,
    researcherCoverage,
    canonicalCount: canonical.length,
    priorVenueCount: priorVenues.length,
  };
}

// ---------------------------------------------------------------------
// Artifact emission
// ---------------------------------------------------------------------
function writeArtifact(outDir, filename, payload) {
  writeFileSync(join(outDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function emitArtifacts(build, { repoRoot = ROOT, generatedAt } = {}) {
  const outDir = join(repoRoot, CENSUS_OUTPUT_DIR);
  mkdirSync(outDir, { recursive: true });

  const { rows } = build;
  const confirmed = rows.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS");
  const unverified = rows.filter(
    (r) => r.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
  );
  const belowThreshold = rows.filter((r) => r.high_value_state === "BELOW_THRESHOLD");
  const highValue = [...confirmed, ...unverified];

  const existingCanonical = highValue.filter(
    (r) => r.canonical_match_state === "EXISTING_CANONICAL" || r.canonical_match_state === "PROBABLE_EXISTING_CANONICAL",
  );
  const missingFromCanon = highValue.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON");
  const ambiguous = highValue.filter((r) => r.canonical_match_state === "AMBIGUOUS_IDENTITY");

  const conferenceVenues = rows.filter((r) => CONFERENCE_VENUE_CLASSES.includes(r.venue_class));
  const sportsVenues = rows.filter((r) => SPORTS_VENUE_CLASSES.includes(r.venue_class));

  const meta = {
    package: "BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05",
    framework_version: CENSUS_FRAMEWORK_VERSION,
    census_id: "uk-1000plus-05",
    generated_at: generatedAt,
    capacity_threshold: HIGH_VALUE_CAPACITY_THRESHOLD,
  };

  // --- manifest -------------------------------------------------------
  writeArtifact(outDir, "manifest.json", {
    ...meta,
    what_this_is:
      "A discovery census of permanent UK venues with a credible maximum public capacity of at least 1,000, " +
      "together with the programme/calendar source that would serve each one. Research only.",
    what_this_is_not: [
      "It is not a canonical venue registry. venues/uk.json is NOT modified by this package.",
      "It is not a Source registry. sources/*.json is NOT modified by this package.",
      "It is not a governed source investigation. A row reaching READY_FIRST_PARTY still requires a full investigation under docs/SOURCE_INVESTIGATION_POLICY.md before any source may be activated.",
      "It contains no Events and acquires none.",
    ],
    inputs: [
      {
        path: `${PRIOR_CENSUS_DIR}/venues.json`,
        role: "Primary committed evidence base: UK venues already researched at the same >=1,000 threshold.",
        records: build.priorVenueCount,
        mutated: false,
      },
      {
        path: `${PRIOR_CENSUS_DIR}/capacity-evidence.json`,
        role: "Retained capacity figures and their source authority/confidence.",
        mutated: false,
      },
      {
        path: `${PRIOR_CENSUS_DIR}/calendar-sources.json`,
        role: "Retained, fingerprinted programme/fixture calendar sources.",
        mutated: false,
      },
      {
        path: "venues/uk.json",
        role: "Canonical venue estate, read only, for identity reconciliation.",
        records: build.canonicalCount,
        mutated: false,
      },
    ],
    generator: "ingestion/high-value-venue-census/build.mjs",
    validator: "ingestion/high-value-venue-census/validate.mjs",
    contract: "ingestion/high-value-venue-census/contract.mjs",
    reproducibility:
      "Every count published by this census is computed by the generator from the inputs above. " +
      "Re-running the generator on the same inputs reproduces the artifacts exactly.",
    artifact_counts: {
      census_rows: rows.length,
      carried_from_prior_census: build.priorRows.length,
      new_research_rows: build.researcherRows.length,
      new_research_rows_deduped_against_prior: build.dedupedResearcherRows.length,
      new_research_rows_rejected_unsupported: build.rejectedResearcherRows,
    },
  });

  // --- population artifacts -------------------------------------------
  writeArtifact(outDir, "confirmed-1000-plus.json", {
    ...meta,
    description:
      "Venues with retained capacity evidence showing a maximum normal public capacity of at least 1,000.",
    count: confirmed.length,
    by_nation: tally(confirmed, (r) => r.nation),
    by_venue_class: tally(confirmed, (r) => r.venue_class),
    venues: sortedRows(confirmed),
  });

  writeArtifact(outDir, "capacity-unverified-candidates.json", {
    ...meta,
    description:
      "Venues strongly likely to belong in the >=1,000 cohort whose capacity this census could not evidence. " +
      "Deliberately excluded from the confirmed count.",
    count: unverified.length,
    by_venue_class: tally(unverified, (r) => r.venue_class),
    venues: sortedRows(unverified),
  });

  writeArtifact(outDir, "existing-canonical.json", {
    ...meta,
    description:
      "High-value venues BeatMapped's canonical estate already knows, with the reconciliation rule that matched each one.",
    count: existingCanonical.length,
    by_match_state: tally(existingCanonical, (r) => r.canonical_match_state),
    venues: sortedRows(existingCanonical).map((r) => ({
      research_id: r.research_id,
      canonical_venue_id: r.canonical_venue_id,
      canonical_match_state: r.canonical_match_state,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      high_value_state: r.high_value_state,
      notes: r.notes,
    })),
  });

  writeArtifact(outDir, "missing-from-canonical.json", {
    ...meta,
    description:
      "High-value venues with NO canonical counterpart found. This is a discovery finding only — " +
      "this package does not admit them to venues/uk.json. Governed canonical admission is separate, later work.",
    count: missingFromCanon.length,
    confirmed_1000_plus: missingFromCanon.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
    capacity_unverified: missingFromCanon.filter(
      (r) => r.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    ).length,
    by_venue_class: tally(missingFromCanon, (r) => r.venue_class),
    by_nation: tally(missingFromCanon, (r) => r.nation),
    venues: sortedRows(missingFromCanon),
  });

  writeArtifact(outDir, "possible-duplicates.json", {
    ...meta,
    description:
      "Identity ambiguities surfaced by reconciliation, plus near-duplicate pairs detected WITHIN the canonical " +
      "estate. Surfaced for review only. This package repairs nothing and mutates no canonical record.",
    ambiguous_census_identities: {
      count: ambiguous.length,
      venues: sortedRows(ambiguous).map((r) => ({
        research_id: r.research_id,
        name: r.name,
        locality: r.locality,
        venue_class: r.venue_class,
        notes: r.notes,
      })),
    },
    canonical_internal_near_duplicates: build.canonicalNearDuplicates ?? [],
  });

  writeArtifact(outDir, "conference-venues.json", {
    ...meta,
    description:
      "The conference / convention / exhibition / university / hotel event estate.",
    count: conferenceVenues.length,
    confirmed_1000_plus: conferenceVenues.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
    by_venue_class: tally(conferenceVenues, (r) => r.venue_class),
    by_calendar_state: tally(conferenceVenues, (r) => r.calendar_state),
    venues: sortedRows(conferenceVenues),
  });

  writeArtifact(outDir, "sports-venues.json", {
    ...meta,
    description: "The permanent spectator-sport estate and its fixture/event sources.",
    count: sportsVenues.length,
    confirmed_1000_plus: sportsVenues.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
    by_venue_class: tally(sportsVenues, (r) => r.venue_class),
    by_calendar_source_kind: tally(sportsVenues, (r) => r.calendar_source_kind),
    by_acquisition_readiness: tally(sportsVenues, (r) => r.acquisition_readiness),
    venues: sortedRows(sportsVenues),
  });

  // --- source artifacts -------------------------------------------------
  const generalSources = rows.filter((r) => r.general_programme_url !== null);
  writeArtifact(outDir, "general-programme-sources.json", {
    ...meta,
    description: "Venues with a general (music / theatre / multi-purpose) public programme source.",
    count: generalSources.length,
    by_acquisition_shape: tally(generalSources, (r) => r.acquisition_shape),
    by_calendar_source_kind: tally(generalSources, (r) => r.calendar_source_kind),
    sources: sortedRows(generalSources).map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      url: r.general_programme_url,
      calendar_source_kind: r.calendar_source_kind,
      platform_family: r.platform_family,
      acquisition_shape: r.acquisition_shape,
      acquisition_readiness: r.acquisition_readiness,
    })),
  });

  const conferenceSources = rows.filter((r) => r.conference_calendar_url !== null);
  writeArtifact(outDir, "conference-calendar-sources.json", {
    ...meta,
    description: "Venues with a public conference or exhibition calendar source.",
    count: conferenceSources.length,
    by_acquisition_shape: tally(conferenceSources, (r) => r.acquisition_shape),
    sources: sortedRows(conferenceSources).map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      url: r.conference_calendar_url,
      calendar_source_kind: r.calendar_source_kind,
      platform_family: r.platform_family,
      acquisition_shape: r.acquisition_shape,
      acquisition_readiness: r.acquisition_readiness,
    })),
  });

  const sportsSources = rows.filter((r) => r.sports_calendar_url !== null);
  writeArtifact(outDir, "sports-calendar-sources.json", {
    ...meta,
    description:
      "Venues with a public fixture/event source. The source may legitimately be a club, league or " +
      "governing-body fixture list rather than a venue what's-on page.",
    count: sportsSources.length,
    by_calendar_source_kind: tally(sportsSources, (r) => r.calendar_source_kind),
    by_acquisition_shape: tally(sportsSources, (r) => r.acquisition_shape),
    sources: sortedRows(sportsSources).map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      url: r.sports_calendar_url,
      calendar_source_kind: r.calendar_source_kind,
      platform_family: r.platform_family,
      acquisition_shape: r.acquisition_shape,
      acquisition_readiness: r.acquisition_readiness,
    })),
  });

  // --- platform / operator leverage --------------------------------------
  const platformFamilies = new Map();
  for (const row of rows) {
    if (!row.platform_family) continue;
    if (!platformFamilies.has(row.platform_family)) {
      platformFamilies.set(row.platform_family, {
        platform_family: row.platform_family,
        venues_covered: 0,
        confirmed_1000_plus: 0,
        calendar_scopes: {},
        acquisition_shapes: {},
        first_party_venues: 0,
        example_urls: [],
      });
    }
    const entry = platformFamilies.get(row.platform_family);
    entry.venues_covered += 1;
    if (row.high_value_state === "CONFIRMED_1000_PLUS") entry.confirmed_1000_plus += 1;
    entry.calendar_scopes[row.calendar_scope] = (entry.calendar_scopes[row.calendar_scope] ?? 0) + 1;
    if (row.acquisition_shape) {
      entry.acquisition_shapes[row.acquisition_shape] =
        (entry.acquisition_shapes[row.acquisition_shape] ?? 0) + 1;
    }
    if (["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(row.calendar_source_kind)) {
      entry.first_party_venues += 1;
    }
    const url = row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url;
    if (url && entry.example_urls.length < 5 && !entry.example_urls.includes(url)) {
      entry.example_urls.push(url);
    }
  }
  // --- reusable integrations -------------------------------------------
  // A platform FAMILY is not the same thing as an INTEGRATION, and
  // conflating the two would badly mislead prioritisation. A family like
  // OTHER_EMBEDDED_APP_STATE covers hundreds of venues but is a
  // descriptive bucket of unrelated bespoke sites — it is not one adapter.
  // What follows separates the families that genuinely are ONE
  // implementation from the ones that are not.
  const reusableIntegrations = computeReusableIntegrations(rows);

  writeArtifact(outDir, "platform-families.json", {
    ...meta,
    description:
      "Platform/source families ordered by measurable estate coverage. Ordering is by venue count only — " +
      "technical ease is recorded separately and never used to reorder this list.",
    read_this_before_prioritising:
      "venues_covered on a FAMILY is not the size of an integration. A family may be a descriptive bucket of " +
      "unrelated bespoke sites (each needing its own work) or a single shared platform (one implementation " +
      "covering the estate). The reusable_integrations block below makes that distinction explicitly; rank " +
      "work from there, not from the families list.",
    count: platformFamilies.size,
    families: [...platformFamilies.values()].sort(
      (a, b) => b.venues_covered - a.venues_covered || a.platform_family.localeCompare(b.platform_family),
    ),
    reusable_integrations: reusableIntegrations,
  });

  // Operator estates: by official-website host, which is what an
  // integration would actually key on.
  const operatorEstates = new Map();
  for (const row of rows) {
    const url = row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url;
    const host = url ? hostOf(url) : null;
    if (!host) continue;
    if (!operatorEstates.has(host)) {
      operatorEstates.set(host, {
        host,
        venues_covered: 0,
        confirmed_1000_plus: 0,
        platform_families: {},
        venue_classes: {},
        first_party: 0,
        example_urls: [],
      });
    }
    const entry = operatorEstates.get(host);
    entry.venues_covered += 1;
    if (row.high_value_state === "CONFIRMED_1000_PLUS") entry.confirmed_1000_plus += 1;
    if (row.platform_family) {
      entry.platform_families[row.platform_family] =
        (entry.platform_families[row.platform_family] ?? 0) + 1;
    }
    entry.venue_classes[row.venue_class] = (entry.venue_classes[row.venue_class] ?? 0) + 1;
    if (["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(row.calendar_source_kind)) {
      entry.first_party += 1;
    }
    if (entry.example_urls.length < 5 && !entry.example_urls.includes(url)) entry.example_urls.push(url);
  }
  const multiVenueEstates = [...operatorEstates.values()]
    .filter((e) => e.venues_covered > 1)
    .sort((a, b) => b.venues_covered - a.venues_covered || a.host.localeCompare(b.host));
  writeArtifact(outDir, "operator-estates.json", {
    ...meta,
    description:
      "Shared hosts serving more than one high-value venue's programme — i.e. a single integration that " +
      "would cover multiple venues. A uniform platform_family means one adapter plausibly covers the estate; " +
      "a mixed one means it does not.",
    count: multiVenueEstates.length,
    note_on_ordering: "Ordered by measurable venue coverage, not by estimated technical ease.",
    estates: multiVenueEstates,
    // Where this package's own fetches contradict the classification the
    // prior census retained, say so loudly. A stale source URL or a
    // wrongly-blocking classification silently carried forward would cost
    // a future acquisition package real time — that is exactly the kind
    // of finding that must not stay buried in a researcher's notes.
    source_classification_updates: computeClassificationUpdates(rows, build.researcherFamilies),
    researcher_reported_families: build.researcherFamilies,
  });

  writeArtifact(outDir, "acquisition-readiness.json", {
    ...meta,
    description:
      "Research classification only. No source is activated by this package, and no row here authorises acquisition.",
    total_rows: rows.length,
    by_readiness: tally(rows, (r) => r.acquisition_readiness),
    high_value_by_readiness: tally(highValue, (r) => r.acquisition_readiness),
    confirmed_1000_plus_by_readiness: tally(confirmed, (r) => r.acquisition_readiness),
    venues: sortedRows(rows).map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      high_value_state: r.high_value_state,
      acquisition_readiness: r.acquisition_readiness,
      calendar_state: r.calendar_state,
      calendar_source_kind: r.calendar_source_kind,
      acquisition_shape: r.acquisition_shape,
    })),
  });

  // --- coverage matrix ---------------------------------------------------
  const classes = [...new Set(rows.map((r) => r.venue_class))].sort();
  const coverageMatrix = classes.map((venueClass) => {
    const inClass = rows.filter((r) => r.venue_class === venueClass);
    const inClassHighValue = inClass.filter(
      (r) => r.high_value_state === "CONFIRMED_1000_PLUS" || r.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
    );
    const reported = build.researcherCoverage.filter((c) => c?.venue_class === venueClass);
    const sourceFamilies = [
      ...new Set([
        ...inClass.map((r) => r.platform_family).filter(Boolean),
        ...reported.flatMap((c) => (Array.isArray(c.source_families_checked) ? c.source_families_checked : [])),
      ]),
    ].sort();
    return {
      venue_class: venueClass,
      source_families_checked: sourceFamilies,
      candidates_found: inClass.length,
      confirmed_1000_plus: inClass.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
      capacity_unknown: inClass.filter(
        (r) => r.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
      ).length,
      existing_canonical: inClassHighValue.filter(
        (r) => r.canonical_match_state === "EXISTING_CANONICAL" || r.canonical_match_state === "PROBABLE_EXISTING_CANONICAL",
      ).length,
      missing_from_canon: inClassHighValue.filter((r) => r.canonical_match_state === "MISSING_FROM_CANON").length,
      calendar_source_found: inClass.filter(
        (r) => r.general_programme_url !== null || r.sports_calendar_url !== null || r.conference_calendar_url !== null,
      ).length,
      unresolved: inClass.filter((r) => r.research_status === "REVIEW_REQUIRED").length,
      research_blocked: inClass.filter((r) => r.research_status === "RESEARCH_BLOCKED").length,
      not_yet_researched: inClass.filter((r) => r.research_status === "NOT_YET_RESEARCHED").length,
      researcher_coverage_statements: reported.map((c) => ({
        coverage_state: c.coverage_state ?? "UNKNOWN",
        why: c.why ?? null,
        researcher: c.researcher ?? null,
      })),
    };
  });
  writeArtifact(outDir, "coverage-matrix.json", {
    ...meta,
    description:
      "What was actually covered, per venue class. A class with no researcher coverage statement and no new " +
      "research rows was carried entirely from the prior census and was NOT independently re-researched here.",
    classes: coverageMatrix,
  });

  const unresolved = rows.filter((r) => r.research_status === "REVIEW_REQUIRED");
  writeArtifact(outDir, "unresolved.json", {
    ...meta,
    description:
      "Rows needing human review: identity ambiguity, or a high-value venue whose capacity could not be evidenced.",
    count: unresolved.length,
    by_reason: {
      ambiguous_identity: unresolved.filter((r) => r.canonical_match_state === "AMBIGUOUS_IDENTITY").length,
      capacity_unverified: unresolved.filter(
        (r) => r.high_value_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
      ).length,
    },
    venues: sortedRows(unresolved).map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      canonical_match_state: r.canonical_match_state,
      high_value_state: r.high_value_state,
      notes: r.notes,
    })),
  });

  const blocked = rows.filter(
    (r) => r.research_status === "RESEARCH_BLOCKED" || r.research_status === "NOT_YET_RESEARCHED",
  );
  writeArtifact(outDir, "research-blocked.json", {
    ...meta,
    description:
      "Rows where research did not complete. These carry NO negative findings — absence of research is " +
      "never recorded as absence of a venue, a capacity or a calendar.",
    count: blocked.length,
    by_status: tally(blocked, (r) => r.research_status),
    by_venue_class: tally(blocked, (r) => r.venue_class),
    venues: sortedRows(blocked).map((r) => ({
      research_id: r.research_id,
      name: r.name,
      locality: r.locality,
      venue_class: r.venue_class,
      research_status: r.research_status,
      notes: r.notes,
    })),
  });

  // --- full census + summary ---------------------------------------------
  writeArtifact(outDir, "census.json", {
    ...meta,
    description: "Every census row. The other artifacts in this directory are views over this file.",
    count: rows.length,
    venues: rows,
  });

  // Open-air / civic event sites carried from the prior census's
  // OTHER_MAJOR_EVENT_VENUE bucket — see permanence_review below.
  const openAirSites = rows.filter((r) => r.prior_venue_type === "OTHER_MAJOR_EVENT_VENUE");

  const summary = {
    ...meta,
    headline: {
      confirmed_1000_plus: confirmed.length,
      capacity_unverified_high_value_candidates: unverified.length,
      below_threshold: belowThreshold.length,
      total_rows: rows.length,
    },
    by_nation: tally(highValue, (r) => r.nation),
    by_venue_class: tally(highValue, (r) => r.venue_class),
    canonical_coverage: {
      high_value_total: highValue.length,
      already_in_canon: existingCanonical.length,
      missing_from_canon: missingFromCanon.length,
      ambiguous_identity: ambiguous.length,
      percentage_represented:
        highValue.length === 0
          ? null
          : Number(((existingCanonical.length / highValue.length) * 100).toFixed(1)),
      confirmed_1000_plus_already_in_canon: confirmed.filter(
        (r) => r.canonical_match_state === "EXISTING_CANONICAL" || r.canonical_match_state === "PROBABLE_EXISTING_CANONICAL",
      ).length,
      confirmed_1000_plus_missing_from_canon: confirmed.filter(
        (r) => r.canonical_match_state === "MISSING_FROM_CANON",
      ).length,
    },
    programme_sources: {
      with_general_programme_source: generalSources.length,
      with_conference_calendar_source: conferenceSources.length,
      with_sports_calendar_source: sportsSources.length,
      with_any_source: rows.filter(
        (r) => r.general_programme_url !== null || r.sports_calendar_url !== null || r.conference_calendar_url !== null,
      ).length,
    },
    acquisition_readiness: tally(rows, (r) => r.acquisition_readiness),
    calendar_states: tally(rows, (r) => r.calendar_state),
    provenance: tally(rows, (r) => r.provenance),
    // The inclusion rule says PERMANENT venue. The prior census's
    // OTHER_MAJOR_EVENT_VENUE bucket contains established, licensed,
    // recurring event SITES — city parks, a castle esplanade, showgrounds —
    // which are a defensible part of a high-value estate but are not
    // permanent venues in the sense an arena or theatre is. They are
    // counted, and flagged here, rather than silently included or silently
    // dropped: which way they should go is a founder decision, not one to
    // bury in a mapping table.
    permanence_review: {
      note:
        "Open-air / civic event SITES counted in the headline. Each has retained capacity evidence, but " +
        "'permanent venue' is arguable for them. Listed so the headline can be adjusted deliberately.",
      count: openAirSites.length,
      counted_in_confirmed_1000_plus: openAirSites.filter(
        (r) => r.high_value_state === "CONFIRMED_1000_PLUS",
      ).length,
      venues: openAirSites.map((r) => ({
        research_id: r.research_id,
        name: r.name,
        locality: r.locality,
        high_value_state: r.high_value_state,
      })),
    },
    quality_invariants: build.qualityInvariants ?? null,
  };
  writeArtifact(outDir, "summary.json", summary);

  return { outDir, summary, rows };
}

// ---------------------------------------------------------------------
// Where this package's fetches supersede the prior census's classification
// ---------------------------------------------------------------------
/**
 * Match each researcher-reported source family to the census rows served
 * by the same host, and report where the newly-observed acquisition shape
 * contradicts the shape the prior census retained.
 *
 * Deliberately reports the DISAGREEMENT rather than rewriting the rows:
 * the prior census's fingerprint is retained evidence from a completed
 * package, and silently overwriting it would destroy the audit trail that
 * makes either classification checkable. A future acquisition package
 * should re-verify before acting — which is exactly what this block says.
 */
export function computeClassificationUpdates(rows, researcherFamilies) {
  const updates = [];
  if (!Array.isArray(researcherFamilies)) return updates;

  for (const family of researcherFamilies) {
    const shape = typeof family?.acquisition_shape === "string" ? family.acquisition_shape : "";
    if (!shape || shape === "UNKNOWN") continue;

    // Every host this family names, from its root URL and its evidence.
    const hosts = new Set(
      [family.root_url, ...(Array.isArray(family.evidence) ? family.evidence.map((e) => e?.url) : [])]
        .filter((u) => typeof u === "string")
        .map(hostOf)
        .filter(Boolean),
    );
    if (hosts.size === 0) continue;

    const affected = rows.filter((row) => {
      const url = row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url;
      const host = url ? hostOf(url) : null;
      return host !== null && hosts.has(host);
    });
    if (affected.length === 0) continue;

    const priorFamilies = [...new Set(affected.map((r) => r.platform_family).filter(Boolean))];
    updates.push({
      family: family.family ?? "(unnamed family)",
      root_url: family.root_url ?? null,
      venues_affected: affected.length,
      prior_census_platform_families: priorFamilies,
      newly_observed_shape: shape,
      observed_by: `researcher ${family.researcher ?? "?"} of this package`,
      evidence: Array.isArray(family.evidence) ? family.evidence : [],
      notes: family.notes ?? null,
      action:
        "Re-verify before building a collector. This package did NOT rewrite the prior census's retained " +
        "fingerprint — both observations are kept so either can be checked.",
    });
  }

  return updates.sort((a, b) => b.venues_affected - a.venues_affected);
}

// ---------------------------------------------------------------------
// Reusable integrations — what one implementation would actually cover
// ---------------------------------------------------------------------
// Families whose acquisition is defined by a published standard, so a
// single generic adapter genuinely covers every member regardless of who
// operates the site.
const STANDARDS_BASED_FAMILIES = Object.freeze({
  JSON_LD_EVENT: "schema.org Event JSON-LD",
  MICRODATA: "schema.org Event microdata",
});

/**
 * Identify the integrations that would actually cover multiple high-value
 * venues, and say honestly which kind each is:
 *
 *   STANDARDS_BASED_GENERIC   one adapter, works across unrelated sites
 *   SHARED_WHITELABEL_PLATFORM one implementation, many operator domains
 *   SINGLE_OPERATOR_PLATFORM  one operator, one domain, uniform platform
 *
 * A heterogeneous family is deliberately NOT reported here as an
 * integration, because it is not one.
 */
export function computeReusableIntegrations(rows) {
  const withSource = rows.filter(
    (row) =>
      row.platform_family !== null &&
      (row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url) !== null,
  );

  const integrations = [];

  // 1. Standards-based generic adapters.
  for (const [family, label] of Object.entries(STANDARDS_BASED_FAMILIES)) {
    const members = withSource.filter((row) => row.platform_family === family);
    if (members.length === 0) continue;
    integrations.push({
      integration: label,
      integration_kind: "STANDARDS_BASED_GENERIC",
      platform_family: family,
      venues_covered: members.length,
      confirmed_1000_plus: members.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
      distinct_hosts: new Set(
        members
          .map((r) => hostOf(r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url))
          .filter(Boolean),
      ).size,
      first_party: members.every((r) =>
        ["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(r.calendar_source_kind),
      ),
      why_one_implementation:
        "Acquisition is defined by a published structured-data standard, so one parser covers unrelated sites.",
      example_urls: members
        .slice(0, 5)
        .map((r) => r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url),
    });
  }

  // 2. Shared white-label platforms: one platform family spread across
  //    many operator domains (the pattern the prior census documented for
  //    the football club-site platform, which a host-based view cannot see).
  const byFamily = new Map();
  for (const row of withSource) {
    if (Object.prototype.hasOwnProperty.call(STANDARDS_BASED_FAMILIES, row.platform_family)) continue;
    if (!byFamily.has(row.platform_family)) byFamily.set(row.platform_family, []);
    byFamily.get(row.platform_family).push(row);
  }
  for (const [family, members] of byFamily) {
    const hosts = new Set(
      members
        .map((r) => hostOf(r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url))
        .filter(Boolean),
    );
    // A family spread thinly over almost as many hosts as venues, and
    // named specifically enough to be one framework's fingerprint, is a
    // shared platform. A generic "unknown"/"other" bucket never is.
    const isNamedFramework = !["CLIENT_RENDERED_UNKNOWN", "OTHER_EMBEDDED_APP_STATE", "OTHER", "UNKNOWN", "ACCESS_BLOCKED", "FINGERPRINT_FETCH_FAILED", "NOT_YET_FINGERPRINTED", "NO_CURRENT_PROGRAMME_FOUND", "STATIC_HTML_CARDS"].includes(family);
    if (!isNamedFramework || hosts.size < 5 || members.length < 5) continue;
    // IMPORTANT: a framework fingerprint (Next.js, Nuxt, SvelteKit,
    // GraphQL) is NOT by itself proof of one shared platform. Several
    // unrelated operators commonly build on the same framework, and their
    // hydration payload SHAPES differ — the prior census documented
    // exactly this, with ATG, Academy Music Group and Trafalgar all
    // fingerprinting EMBEDDED_NEXT_DATA while being three separate
    // estates. So this is reported as an UPPER BOUND on what one adapter
    // might cover, never as an established integration size.
    integrations.push({
      integration: `${family} (shared framework — upper bound)`,
      integration_kind: "SHARED_FRAMEWORK_UPPER_BOUND",
      verified_uniform: false,
      platform_family: family,
      venues_covered: members.length,
      confirmed_1000_plus: members.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
      distinct_hosts: hosts.size,
      first_party: members.every((r) =>
        ["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(r.calendar_source_kind),
      ),
      why_one_implementation:
        `${members.length} venues across ${hosts.size} domains share the ${family} framework fingerprint. ` +
        "Where they also share ONE white-label platform, a single implementation keyed on that platform's own " +
        "markers can cover the estate.",
      caveat:
        "UPPER BOUND, not an integration size. A shared framework is not a shared platform: unrelated operators " +
        "build on the same framework with different payload shapes. Treat the single-operator entries below as the " +
        "established estates, and prove payload uniformity before counting this whole number as one adapter.",
      example_urls: members
        .slice(0, 5)
        .map((r) => r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url),
    });
  }

  // 3. Single-operator platforms: one domain, one uniform platform family.
  const byHost = new Map();
  for (const row of withSource) {
    const host = hostOf(row.general_programme_url ?? row.sports_calendar_url ?? row.conference_calendar_url);
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(row);
  }
  for (const [host, members] of byHost) {
    if (members.length < 2) continue;
    const families = new Set(members.map((r) => r.platform_family));
    if (families.size !== 1) continue; // mixed estate: not one integration
    const family = [...families][0];
    if (Object.prototype.hasOwnProperty.call(STANDARDS_BASED_FAMILIES, family)) continue;
    integrations.push({
      integration: host,
      integration_kind: "SINGLE_OPERATOR_PLATFORM",
      platform_family: family,
      venues_covered: members.length,
      confirmed_1000_plus: members.filter((r) => r.high_value_state === "CONFIRMED_1000_PLUS").length,
      distinct_hosts: 1,
      first_party: members.every((r) =>
        ["VENUE", "OPERATOR", "CLUB", "LEAGUE", "GOVERNING_BODY"].includes(r.calendar_source_kind),
      ),
      why_one_implementation: `All ${members.length} venues served from one host on a uniform ${family} platform.`,
      example_urls: members
        .slice(0, 5)
        .map((r) => r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url),
    });
  }

  // Families explicitly recorded as NOT one integration, so the large
  // numbers in platform-families.json cannot be misread as opportunities.
  const notIntegrations = [];
  for (const [family, members] of byFamily) {
    const hosts = new Set(
      members
        .map((r) => hostOf(r.general_programme_url ?? r.sports_calendar_url ?? r.conference_calendar_url))
        .filter(Boolean),
    );
    if (integrations.some((i) => i.platform_family === family && i.integration_kind === "SHARED_WHITELABEL_PLATFORM")) {
      continue;
    }
    if (members.length < 20) continue;
    notIntegrations.push({
      platform_family: family,
      venues_covered: members.length,
      distinct_hosts: hosts.size,
      integration_kind: "NOT_A_SINGLE_INTEGRATION",
      why:
        family === "ACCESS_BLOCKED"
          ? "These sources blocked a plain fetch. That is an access question, not an acquisition pattern — it is not an integration."
          : `A descriptive bucket of ${members.length} venues across ${hosts.size} unrelated hosts. Each needs its own work; the total is not the size of one integration.`,
    });
  }

  return {
    note:
      "Ranked by measurable venue coverage. Technical ease is described per entry and never used to reorder. Read integration_kind before using any number: STANDARDS_BASED_GENERIC and SINGLE_OPERATOR_PLATFORM are established estates one implementation covers; SHARED_FRAMEWORK_UPPER_BOUND is an upper bound on what one adapter MIGHT cover and is not proven uniform.",
    integrations: integrations.sort(
      (a, b) => b.venues_covered - a.venues_covered || a.integration.localeCompare(b.integration),
    ),
    explicitly_not_single_integrations: notIntegrations.sort((a, b) => b.venues_covered - a.venues_covered),
  };
}

// ---------------------------------------------------------------------
// Near-duplicate detection WITHIN the canonical estate (surfaced only)
// ---------------------------------------------------------------------
export function findCanonicalNearDuplicates(canonicalVenues) {
  const groups = new Map();
  for (const venue of canonicalVenues) {
    const core = coreName(venue.canonical_name);
    if (!core) continue;
    const key = `${core}|${normaliseName(venue.city)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(venue);
  }

  const pairs = [];
  for (const [key, venues] of groups) {
    if (venues.length < 2) continue;

    // Distinguish a strong duplicate signal from a weak one. Two venues in
    // the same city whose names differ ONLY by a leading article or
    // punctuation ("Bridgewater Hall" / "The Bridgewater Hall") are very
    // likely one venue recorded twice. Two venues sharing only a name
    // CORE but carrying different venue-type words ("Barbican Hall" /
    // "Barbican Theatre", "Derby Arena" / "Derby Theatre") are usually
    // genuinely distinct venues on one site, and presenting them as
    // duplicates would be a false positive.
    // Compare names with leading articles removed and US/UK spelling
    // variants of the same type word folded together, so that
    // "Battersea Arts Center" / "Battersea Arts Centre" is recognised as
    // one venue spelled two ways rather than two different venues.
    const comparableName = (name) =>
      normaliseName(name)
        .replace(/^the /, "")
        .replace(/\bcenter\b/g, "centre")
        .replace(/\btheater\b/g, "theatre");
    const normalisedNames = new Set(venues.map((v) => comparableName(v.canonical_name)));
    const strength =
      normalisedNames.size === 1
        ? "NAME_DIFFERS_ONLY_BY_ARTICLE_OR_PUNCTUATION"
        : "SHARES_NAME_CORE_ONLY_DIFFERENT_TYPE_WORD";

    pairs.push({
      key,
      count: venues.length,
      signal_strength: strength,
      venues: venues.map((v) => ({
        venue_id: v.venue_id,
        canonical_name: v.canonical_name,
        city: v.city,
      })),
      note:
        strength === "NAME_DIFFERS_ONLY_BY_ARTICLE_OR_PUNCTUATION"
          ? "Strong duplicate signal: same city, names identical apart from a leading article or punctuation. Surfaced for review only — this package does not merge, rename or otherwise mutate canonical venues."
          : "Weak signal only: these share a name core but carry different venue-type words, so they are frequently DISTINCT venues on one site (e.g. a hall and a theatre in the same complex). Listed for completeness, not asserted as duplicates.",
    });
  }

  return pairs.sort(
    (a, b) =>
      // Strong signals first, then larger groups, then stable by key.
      (a.signal_strength === b.signal_strength ? 0 : a.signal_strength === "NAME_DIFFERS_ONLY_BY_ARTICLE_OR_PUNCTUATION" ? -1 : 1) ||
      b.count - a.count ||
      a.key.localeCompare(b.key),
  );
}

// ---------------------------------------------------------------------
// Quality invariants — the package's own machine-readable self-check
// ---------------------------------------------------------------------
export function computeQualityInvariants(rows) {
  const ids = rows.map((r) => r.research_id);
  const duplicateIds = ids.length - new Set(ids).size;

  return {
    duplicate_research_ids: duplicateIds,
    confirmed_1000_plus_without_capacity_evidence: rows.filter(
      (r) => r.high_value_state === "CONFIRMED_1000_PLUS" && r.capacity_evidence.length === 0,
    ).length,
    negative_calendar_claims_without_evidence: rows.filter(
      (r) =>
        ["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(r.calendar_state) &&
        r.calendar_evidence.length === 0,
    ).length,
    missing_from_canon_without_identity_evidence: rows.filter(
      (r) => r.canonical_match_state === "MISSING_FROM_CANON" && r.identity_evidence.length === 0,
    ).length,
    third_party_sources_labelled_official: rows.filter((r) => {
      if (!r.capacity_source_url) return false;
      const host = hostOf(r.capacity_source_url);
      if (!host) return false;
      const thirdParty = ["wikipedia.org", "wikidata.org", "wikimedia.org", "songkick.com", "ticketmaster.co.uk", "seatgeek.com", "skiddle.com"];
      const isThirdParty = thirdParty.some((h) => host === h || host.endsWith(`.${h}`));
      const claimsOfficial = typeof r.capacity_source_kind === "string" && r.capacity_source_kind.startsWith("OFFICIAL_");
      return isThirdParty && claimsOfficial;
    }).length,
    negative_claims_on_unresearched_rows: rows.filter(
      (r) =>
        ["NOT_YET_RESEARCHED", "RESEARCH_BLOCKED"].includes(r.research_status) &&
        (["NO_PUBLIC_CALENDAR_FOUND", "PRIVATE_BOOKINGS_ONLY"].includes(r.calendar_state) ||
          r.high_value_state === "BELOW_THRESHOLD" ||
          r.canonical_match_state === "MISSING_FROM_CANON"),
    ).length,
    unexplained_rows: rows.filter((r) => typeof r.notes !== "string" || r.notes.trim().length === 0).length,
    events_created: 0,
    canonical_venues_mutated: 0,
  };
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

  const existing = researcherDirs.filter((dir) => existsSync(dir));
  for (const dir of researcherDirs) {
    if (!existsSync(dir)) console.warn(`[build] researcher dir not found, skipping: ${dir}`);
  }

  const build = buildCensus({ researcherDirs: existing });
  const canonical = JSON.parse(readFileSync(join(ROOT, "venues/uk.json"), "utf8")).venues;
  build.canonicalNearDuplicates = findCanonicalNearDuplicates(canonical);
  build.qualityInvariants = computeQualityInvariants(build.rows);

  const errors = validateCensus(build.rows);
  if (errors.length > 0) {
    console.error(`[build] REFUSING TO WRITE — ${errors.length} contract violation(s):`);
    for (const error of errors.slice(0, 40)) console.error(`  - ${error}`);
    if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
    process.exitCode = 1;
    return;
  }

  const { outDir, summary } = emitArtifacts(build, { generatedAt });

  console.log(`[build] wrote ${CENSUS_OUTPUT_DIR}`);
  console.log(`[build] rows ................................ ${build.rows.length}`);
  console.log(`[build]   carried from prior census ......... ${build.priorRows.length}`);
  console.log(`[build]   new research (kept) ............... ${build.researcherRows.length}`);
  console.log(`[build]   new research (deduped) ........... ${build.dedupedResearcherRows.length}`);
  console.log(`[build]   new research (rejected) .......... ${build.rejectedResearcherRows}`);
  console.log(`[build] confirmed >=1000 .................... ${summary.headline.confirmed_1000_plus}`);
  console.log(`[build] capacity-unverified candidates ...... ${summary.headline.capacity_unverified_high_value_candidates}`);
  console.log(`[build] already in canon .................... ${summary.canonical_coverage.already_in_canon}`);
  console.log(`[build] missing from canon .................. ${summary.canonical_coverage.missing_from_canon}`);
  console.log(`[build] quality invariants .................. ${JSON.stringify(build.qualityInvariants)}`);
  void outDir;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
