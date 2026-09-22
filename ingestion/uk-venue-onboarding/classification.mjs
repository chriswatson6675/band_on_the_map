// BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01 — deterministic
// scope classification for the UK major-event venue census
// (research/major-event-venues/uk-major-event-census-01/venues.json).
//
// Every one of the census's 855 venues is classified into EXACTLY ONE of
// SCOPE_CLASSIFICATIONS below, purely from already-retained census fields
// (venue_type, operational_status, identity_review) plus already-retained
// calendar-source evidence (calendar-sources.json) — never from live
// research, never by AI judgement of "this venue seems musical". This
// module makes no live network calls and mutates nothing.
//
// Football/rugby/cricket/racecourse/motorsport/greyhound venue TYPES are
// never automatically in-scope merely by type (this package's brief) — a
// stadium/outdoor-sport venue enters the in-scope estate only when at
// least one first-party, publicly-accessible calendar source already on
// record for it (calendar-sources.json) is itself typed CONCERTS or
// PERFORMING_ARTS AND currently shows events. This is a genuine,
// retained, already-collected evidence citation — never a new live
// investigation, never a guess.

export const SCOPE_CLASSIFICATIONS = new Set([
  "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE",
  "SPORT_ONLY",
  "OUTDOOR_SPORT_ONLY",
  "NON_PUBLIC",
  "CLOSED",
  "AMBIGUOUS",
  "OTHER_NOT_IN_SCOPE",
]);

// Types that ARE performance venues by definition (this package's brief,
// "In-scope types should include where evidence supports them") — always
// IN_SCOPE regardless of calendar evidence. The census never uses
// MUSIC_VENUE/ARTS_CENTRE/CLUB literally (see venues.json's own
// counts.by_venue_type) — those remain named here for forward
// compatibility with a future census revision that does.
const AUTO_IN_SCOPE_TYPES = new Set([
  "MUSIC_VENUE",
  "CONCERT_HALL",
  "THEATRE",
  "AUDITORIUM",
  "INDOOR_ARENA",
  "ARTS_CENTRE",
  "CLUB",
  "NIGHTCLUB",
]);

// Enclosed-bowl/pitch sport-stadium types — a real sport venue is never
// "a music venue that happens to have football", so these default
// SPORT_ONLY and escalate only with genuine, retained non-sport evidence.
const SPORT_ONLY_DEFAULT_TYPES = new Set(["FOOTBALL_STADIUM", "RUGBY_STADIUM", "OTHER_SPORTS_VENUE"]);

// Fully open-air/outdoor-format sport venue types — same rule, kept as its
// own bucket per this package's brief distinguishing SPORT_ONLY from
// OUTDOOR_SPORT_ONLY.
const OUTDOOR_SPORT_ONLY_DEFAULT_TYPES = new Set([
  "RACECOURSE",
  "MOTORSPORT_CIRCUIT",
  "CRICKET_GROUND",
  "GREYHOUND_STADIUM",
]);

// Exhibition/conference-purpose types — not performance venues by primary
// purpose, but occasionally host large concerts (e.g. an exhibition
// centre's main hall) — default OTHER_NOT_IN_SCOPE, escalate with evidence.
const OTHER_NOT_IN_SCOPE_DEFAULT_TYPES = new Set([
  "EXHIBITION_CENTRE",
  "CONFERENCE_CENTRE",
  "CONVENTION_CENTRE",
  "CONFERENCE_EXHIBITION_COMPLEX",
]);

// Genuinely ambiguous-by-name types — the census's own type name does not
// say what the venue actually is; never guessed either way without
// evidence.
const AMBIGUOUS_DEFAULT_TYPES = new Set(["MULTI_PURPOSE_EVENT_COMPLEX", "OTHER_MAJOR_EVENT_VENUE"]);

const NON_SPORT_PERFORMANCE_SOURCE_TYPES = new Set(["CONCERTS", "PERFORMING_ARTS"]);

/**
 * Group calendar-sources.json's flat `calendar_sources` array by
 * venue_census_id for O(1) lookup during classification.
 */
export function indexCalendarSourcesByVenue(calendarSources) {
  const byVenueId = new Map();
  for (const source of calendarSources ?? []) {
    const key = source.venue_census_id;
    if (!byVenueId.has(key)) byVenueId.set(key, []);
    byVenueId.get(key).push(source);
  }
  return byVenueId;
}

/**
 * The genuine, retained, already-collected calendar-source records that
 * evidence a real non-sport (CONCERTS/PERFORMING_ARTS) live-event
 * programme at this venue: first-party, publicly accessible, and
 * currently showing events — never a stale/dead/paywalled/third-party
 * listing.
 */
function genuineNonSportEvidence(venueCensusId, calendarSourcesByVenueId) {
  const sources = calendarSourcesByVenueId.get(venueCensusId) ?? [];
  return sources.filter(
    (source) =>
      NON_SPORT_PERFORMANCE_SOURCE_TYPES.has(source.source_type) &&
      source.first_party === true &&
      source.publicly_accessible === true &&
      source.events_currently_present === true,
  );
}

function citeEvidence(sources) {
  return sources.map((source) => ({
    calendar_source_id: source.calendar_source_id,
    source_url: source.source_url,
    source_type: source.source_type,
  }));
}

/**
 * Classify ONE census venue. Returns
 * `{ classification, reason, evidence }` — `evidence` is a citable array
 * (empty unless a sport-typed venue was escalated by genuine calendar
 * evidence). Every branch returns a value from SCOPE_CLASSIFICATIONS —
 * this function can never produce "unexplained".
 */
export function classifyVenue(venue, calendarSourcesByVenueId) {
  // Priority overrides — operational/identity uncertainty is never
  // resolved by guessing; it is surfaced as AMBIGUOUS regardless of type.
  if (venue.operational_status !== "OPERATIONAL") {
    return {
      classification: "AMBIGUOUS",
      reason: `operational_status is "${venue.operational_status}", not OPERATIONAL — scope cannot be safely decided`,
      evidence: [],
    };
  }
  if (venue.identity_review === true) {
    return {
      classification: "AMBIGUOUS",
      reason: `identity_review is flagged${venue.identity_review_reason ? ` (${venue.identity_review_reason})` : " (no reason recorded)"} — this venue's own identity is not yet settled`,
      evidence: [],
    };
  }

  const type = venue.venue_type;
  const escalationEvidence = genuineNonSportEvidence(venue.venue_census_id, calendarSourcesByVenueId);
  const hasEvidence = escalationEvidence.length > 0;

  if (AUTO_IN_SCOPE_TYPES.has(type)) {
    return {
      classification: "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE",
      reason: `venue_type ${type} is a performance venue type by definition`,
      evidence: [],
    };
  }

  if (SPORT_ONLY_DEFAULT_TYPES.has(type)) {
    return hasEvidence
      ? {
          classification: "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE",
          reason: `venue_type ${type}, but escalated: ${escalationEvidence.length} retained first-party CONCERTS/PERFORMING_ARTS calendar source(s) with events currently present`,
          evidence: citeEvidence(escalationEvidence),
        }
      : {
          classification: "SPORT_ONLY",
          reason: `venue_type ${type}, no retained evidence of a genuine non-sport live-event programme`,
          evidence: [],
        };
  }

  if (OUTDOOR_SPORT_ONLY_DEFAULT_TYPES.has(type)) {
    return hasEvidence
      ? {
          classification: "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE",
          reason: `venue_type ${type}, but escalated: ${escalationEvidence.length} retained first-party CONCERTS/PERFORMING_ARTS calendar source(s) with events currently present`,
          evidence: citeEvidence(escalationEvidence),
        }
      : {
          classification: "OUTDOOR_SPORT_ONLY",
          reason: `venue_type ${type}, no retained evidence of a genuine non-sport live-event programme`,
          evidence: [],
        };
  }

  if (OTHER_NOT_IN_SCOPE_DEFAULT_TYPES.has(type)) {
    return hasEvidence
      ? {
          classification: "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE",
          reason: `venue_type ${type}, but escalated: ${escalationEvidence.length} retained first-party CONCERTS/PERFORMING_ARTS calendar source(s) with events currently present`,
          evidence: citeEvidence(escalationEvidence),
        }
      : {
          classification: "OTHER_NOT_IN_SCOPE",
          reason: `venue_type ${type} is not a performance venue by primary purpose, no retained non-sport programme evidence`,
          evidence: [],
        };
  }

  if (AMBIGUOUS_DEFAULT_TYPES.has(type)) {
    return hasEvidence
      ? {
          classification: "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE",
          reason: `venue_type ${type}, evidenced: ${escalationEvidence.length} retained first-party CONCERTS/PERFORMING_ARTS calendar source(s) with events currently present`,
          evidence: citeEvidence(escalationEvidence),
        }
      : {
          classification: "AMBIGUOUS",
          reason: `venue_type ${type} does not itself say what this venue's real primary use is, and no retained calendar evidence resolves it`,
          evidence: [],
        };
  }

  // A venue_type this module has no rule for at all is never silently
  // dropped into OTHER_NOT_IN_SCOPE — it is surfaced as AMBIGUOUS so
  // accounting stays honest rather than hiding a genuinely unhandled case.
  return {
    classification: "AMBIGUOUS",
    reason: `unrecognised venue_type "${type}" — no classification rule covers it`,
    evidence: [],
  };
}

/**
 * Classify every venue in the census. Returns one entry per venue:
 * `{ venue, classification, reason, evidence }`.
 */
export function classifyAllVenues(venues, calendarSources) {
  const calendarSourcesByVenueId = indexCalendarSourcesByVenue(calendarSources);
  return (venues ?? []).map((venue) => ({ venue, ...classifyVenue(venue, calendarSourcesByVenueId) }));
}

/**
 * Roll up classifyAllVenues() output into per-bucket counts — the exact
 * numbers this package's FINAL REPORT cites. `unexplained` is always 0
 * (every branch of classifyVenue() returns a value from
 * SCOPE_CLASSIFICATIONS) — kept here as an explicit, checkable field
 * rather than an implicit assumption.
 */
export function summariseClassification(classified) {
  const counts = {};
  for (const classification of SCOPE_CLASSIFICATIONS) counts[classification] = 0;
  let unexplained = 0;
  for (const entry of classified) {
    if (SCOPE_CLASSIFICATIONS.has(entry.classification)) {
      counts[entry.classification] += 1;
    } else {
      unexplained += 1;
    }
  }
  return { total: classified.length, counts, unexplained };
}
