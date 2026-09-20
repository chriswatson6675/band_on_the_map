// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — source record model.
//
// Maps ONE gc platform match record to ONE Observation.
//
// Three rules this module exists to enforce:
//
//  1. VENUE IS THE SOURCE'S OWN `venue` STRING — never the club whose
//     calendar it came from. The platform publishes a club's full fixture
//     list, so roughly half of every source's records are AWAY fixtures
//     staged at the opponent's ground. Attributing these to the source's
//     own venue would place them at a stadium hundreds of miles away.
//
//  2. `homeOrAway === "Home"` DOES NOT MEAN THE CLUB'S OWN GROUND. It is
//     retained as source evidence only, never as venue identity. Observed
//     live: a club's "Home" pre-season fixtures were staged at Yankee
//     Stadium, Raymond James Stadium and Helsinki Olympic Stadium.
//
//  3. Non-venue sentinels are not venues. The platform writes operational
//     placeholders into the same field; these become an absent venue, not
//     a venue with a silly name.
//
// Contains no club, domain or stadium constant.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

/**
 * Operational placeholders the platform writes into `venue`. These are
 * statements that the venue is unknown/not applicable — never a place.
 */
export const NON_VENUE_SENTINELS = new Set([
  "unavailable",
  "behind closed doors",
  "tbc",
  "tbd",
  "to be confirmed",
  "n/a",
  "na",
  "none",
  "-",
]);

const text = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Decide whether the platform's `venue` string names a real place.
 * Returns { venue_name, venue_text_state }.
 */
export function classifyVenueText(raw) {
  const value = text(raw);
  if (value === null) return { venue_name: null, venue_text_state: "ABSENT" };
  if (NON_VENUE_SENTINELS.has(value.toLowerCase())) {
    return { venue_name: null, venue_text_state: "NON_VENUE_SENTINEL" };
  }
  return { venue_name: value, venue_text_state: "NAMED" };
}

/**
 * Build the Observation `start` from the platform's kickoff fields.
 *
 * `kickOffUTC` is a genuine UTC instant: observed values convert real UK
 * kickoff times correctly across the BST/GMT boundary (a 15:00 local
 * Saturday kickoff appears as 14:00Z in autumn and 15:00Z in winter), so
 * it is not a fixed placeholder. It is therefore recorded as
 * UTC_INSTANT. When it is absent nothing is invented.
 */
export function kickoffDateTime(record) {
  const raw = text(record?.kickOffUTC);
  const stamp = typeof record?.kickOffUTCTimestamp === "number" ? record.kickOffUTCTimestamp : null;

  const iso = raw ?? (stamp !== null ? new Date(stamp).toISOString() : null);
  if (iso === null) return emptyDateTime();

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { ...emptyDateTime(), raw: raw ?? String(stamp), certainty: "TEXT_ONLY" };
  }

  return {
    raw: raw ?? String(stamp),
    date: parsed.toISOString().slice(0, 10),
    iso: parsed.toISOString(),
    is_utc: true,
    tzid: null,
    certainty: "UTC_INSTANT",
  };
}

/** The two competing sides, in the platform's own words. */
export function teamNames(record) {
  return (Array.isArray(record?.teamData) ? record.teamData : [])
    .map((team) => text(team?.teamName))
    .filter(Boolean);
}

/**
 * A human title built ONLY from names the record itself supplies. If the
 * platform gave fewer than two sides, the title stays partial rather than
 * inventing an opponent.
 */
export function fixtureTitle(record) {
  const names = teamNames(record);
  if (names.length >= 2) return `${names[0]} v ${names[1]}`;
  if (names.length === 1) return names[0];
  return text(record?.competitionName);
}

/** The platform's stable record identifier. */
export function recordId(record) {
  return text(record?.matchID);
}

/**
 * Map one platform match record to one Observation.
 *
 * `sourceContext` carries only provenance — which registered source and
 * which retrieval this came from. It never supplies a venue.
 */
export function toObservation(record, sourceContext) {
  const id = recordId(record);
  if (!id) return null;

  const venue = classifyVenueText(record?.venue);
  const names = teamNames(record);

  return createObservation({
    source_id: sourceContext.source_id,
    source_record_id: id,
    retrieved_at: sourceContext.retrieved_at,
    source_url: sourceContext.source_url,
    content_type: "application/json",

    title: fixtureTitle(record),
    description: null,
    start: kickoffDateTime(record),

    // The source's own venue words — NOT the source's registered venue.
    venue_name: venue.venue_name,
    location_text: null,

    event_url: null,

    source_fields: {
      platform: "GC_FOOTBALL",
      match_id: id,
      // Retained as source evidence about the fixture, NEVER as venue identity.
      home_or_away: text(record?.homeOrAway),
      venue_text_state: venue.venue_text_state,
      venue_text_raw: text(record?.venue),
      competition_name: text(record?.competitionName),
      season_id: text(record?.seasonID),
      season_slug: text(record?.seasonSlug),
      team_id: text(record?.teamID),
      team_names: names,
      published: record?.published ?? null,
      // Which club calendar supplied the record — provenance, not location.
      source_team_label: sourceContext.team_label ?? null,
    },

    raw_evidence: {
      fixture_path: sourceContext.fixture_path ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false,
    },
  });
}
