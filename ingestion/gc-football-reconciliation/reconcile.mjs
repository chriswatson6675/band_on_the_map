// BEATMAPPED-UK-GC-FOOTBALL-MULTISOURCE-FIXTURE-RECONCILIATION-01 — engine.
//
// Pure and offline. Given the football Observations and their derived
// venue attributions, it groups the records that provably describe one
// underlying fixture, and refuses to group the ones that do not.
//
// It never mutates its inputs, never mints canonical Event identity, and
// never uses a name of any kind as a key.

import {
  RECONCILIATION_STATES,
  compareRefs,
  normaliseKickoff,
  observationRef,
  reconciliationGroupId,
  variantsOf,
} from "./contract.mjs";

/**
 * Build the per-member view used for grouping. Joins one Observation to
 * its attribution record; both are read-only.
 */
/** The publishing host a record came from, derived from its own source_url. */
export function publisherDomain(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function memberOf(observation, attribution) {
  return {
    source_id: observation.source_id,
    source_record_id: observation.source_record_id,
    publisher_domain: publisherDomain(observation.source_url),
    platform_match_id: observation.source_fields?.match_id ?? null,
    kickoff_raw: observation.start?.iso ?? null,
    kickoff: normaliseKickoff(observation.start?.iso),

    // Raw source values, retained verbatim. None is ever a key, and none
    // is ever overwritten with a "canonical" spelling: this package
    // reconciles fixture occurrence, not vocabulary.
    home_team_raw: observation.source_fields?.team_names?.[0] ?? null,
    away_team_raw: observation.source_fields?.team_names?.[1] ?? null,
    competition_raw: observation.source_fields?.competition_name ?? null,
    source_venue_text_raw: observation.venue_name ?? null,
    home_or_away_raw: observation.source_fields?.home_or_away ?? null,

    // Venue attribution, as decided by the existing governed resolver.
    source_census_venue_id: attribution?.source_census_venue_id ?? null,
    source_census_venue_name: attribution?.source_census_venue_name ?? null,
    attribution_state: attribution?.attribution_state ?? null,
    resolved_venue_census_id: attribution?.resolved_venue_census_id ?? null,
    resolved_venue_name: attribution?.resolved_venue_name ?? null,
    resolved_venue_city: attribution?.resolved_venue_city ?? null,
    resolved_venue_nation: attribution?.resolved_venue_nation ?? null,
    is_future: attribution?.is_future ?? null,
  };
}

/**
 * Decide the venue standing of a group.
 *
 * A member that resolved nothing is ABSENT EVIDENCE, not contradiction —
 * it does not veto a venue that another member positively established.
 * Two members that resolved DIFFERENT governed venues is a real conflict,
 * and neither is chosen.
 */
export function venueEvidence(members) {
  const resolved = members.filter((member) => member.resolved_venue_census_id);
  const distinct = [...new Set(resolved.map((member) => member.resolved_venue_census_id))];

  if (distinct.length === 0) {
    return {
      venue_evidence_state: "NO_MEMBER_RESOLVED",
      reconciled_venue_census_id: null,
      reconciled_venue_name: null,
      reconciled_venue_city: null,
      reconciled_venue_nation: null,
      venue_supported_by: [],
      venue_candidates: [],
    };
  }

  if (distinct.length > 1) {
    return {
      venue_evidence_state: "CONFLICTING_RESOLVED_VENUES",
      reconciled_venue_census_id: null,
      reconciled_venue_name: null,
      reconciled_venue_city: null,
      reconciled_venue_nation: null,
      venue_supported_by: [],
      venue_candidates: distinct.map((id) => {
        const example = resolved.find((member) => member.resolved_venue_census_id === id);
        return {
          venue_census_id: id,
          venue_name: example.resolved_venue_name,
          supported_by: resolved.filter((m) => m.resolved_venue_census_id === id).map(observationRef).sort(compareRefs),
        };
      }),
    };
  }

  const [only] = distinct;
  const supporters = resolved.filter((member) => member.resolved_venue_census_id === only);
  return {
    venue_evidence_state: "AGREED_BY_ALL_RESOLVED_MEMBERS",
    reconciled_venue_census_id: only,
    reconciled_venue_name: supporters[0].resolved_venue_name,
    reconciled_venue_city: supporters[0].resolved_venue_city,
    reconciled_venue_nation: supporters[0].resolved_venue_nation,
    // Exactly which Observations independently established this venue.
    venue_supported_by: supporters.map(observationRef).sort(compareRefs),
    venue_candidates: [],
  };
}

/**
 * Detect a factual contradiction that is NOT a naming variant.
 *
 * Deliberately narrow. Differing team spellings, competition labels and
 * source venue text are expected between club feeds and are NOT
 * conflicts. Nor is one feed saying "Home" while the other says "Away" —
 * that is exactly what two clubs should say about one fixture.
 *
 * What IS a contradiction: the same calendar publishing the same match id
 * twice. Within one source a platform match id is that source's own
 * record identity, so two members from one source cannot be one fixture
 * seen from two places.
 */
export function otherFactualConflict(members) {
  const bySource = new Map();
  for (const member of members) bySource.set(member.source_id, (bySource.get(member.source_id) ?? 0) + 1);
  const repeated = [...bySource.entries()].filter(([, n]) => n > 1);
  if (repeated.length === 0) return null;
  return {
    kind: "SAME_SOURCE_PUBLISHED_MATCH_ID_MORE_THAN_ONCE",
    sources: repeated.map(([source_id, count]) => ({ source_id, count })),
  };
}

/**
 * Reconcile the whole corpus.
 *
 * @param observations the retained source Observations (not mutated)
 * @param attributions the derived venue attributions (not mutated)
 */
export function reconcileAll(observations, attributions) {
  const attributionByRef = new Map(
    attributions.map((record) => [`${record.source_id}||${record.source_record_id}`, record]),
  );

  // Group strictly by platform match id first, so that an id appearing
  // with two different kickoffs is SEEN rather than silently split into
  // two tidy groups.
  const byMatchId = new Map();
  const withoutKey = [];

  for (const observation of observations) {
    const member = memberOf(observation, attributionByRef.get(`${observation.source_id}||${observation.source_record_id}`));
    if (!member.platform_match_id || !member.kickoff) {
      withoutKey.push(member);
      continue;
    }
    if (!byMatchId.has(member.platform_match_id)) byMatchId.set(member.platform_match_id, []);
    byMatchId.get(member.platform_match_id).push(member);
  }

  const groups = [];

  for (const [platformMatchId, rawMembers] of byMatchId) {
    const members = [...rawMembers].sort(compareRefs);
    const kickoffs = [...new Set(members.map((member) => member.kickoff))].sort();

    const base = {
      platform_match_id: platformMatchId,
      member_count: members.length,
      source_count: new Set(members.map((member) => member.source_id)).size,
      source_ids: [...new Set(members.map((member) => member.source_id))].sort(),

      // A registered calendar source is NOT the same thing as an
      // independent publisher. Several clubs register more than one
      // calendar URL (a /matches page and a /tickets page), and one club
      // registers two census venues. Two such members corroborate each
      // other far more weakly than two genuinely different clubs do, so
      // the publishing host is recorded separately and never conflated
      // with source_count. No score is attached to this here.
      publisher_domains: [...new Set(members.map((member) => member.publisher_domain).filter(Boolean))].sort(),
      publisher_domain_count: new Set(members.map((member) => member.publisher_domain).filter(Boolean)).size,
      members: members.map(observationRef).sort(compareRefs),
      // Every raw variant observed, retained and never collapsed.
      home_team_variants: variantsOf(members, (m) => m.home_team_raw),
      away_team_variants: variantsOf(members, (m) => m.away_team_raw),
      competition_variants: variantsOf(members, (m) => m.competition_raw),
      source_venue_text_variants: variantsOf(members, (m) => m.source_venue_text_raw),
      home_or_away_variants: variantsOf(members, (m) => m.home_or_away_raw),
      member_detail: members.map((member) => ({
        source_id: member.source_id,
        source_record_id: member.source_record_id,
        source_census_venue_id: member.source_census_venue_id,
        source_census_venue_name: member.source_census_venue_name,
        home_or_away: member.home_or_away_raw,
        home_team_raw: member.home_team_raw,
        away_team_raw: member.away_team_raw,
        competition_raw: member.competition_raw,
        source_venue_text_raw: member.source_venue_text_raw,
        attribution_state: member.attribution_state,
        resolved_venue_census_id: member.resolved_venue_census_id,
        resolved_venue_name: member.resolved_venue_name,
      })),
    };

    // --- the hard control: one match id must mean one kickoff ---------
    if (kickoffs.length > 1) {
      groups.push({
        ...base,
        reconciliation_group_id: null,
        kickoff_utc: null,
        kickoff_variants: kickoffs,
        reconciliation_state: "CONFLICT_MATCH_ID_KICKOFF",
        venue_evidence_state: null,
        reconciled_venue_census_id: null,
        reconciled_venue_name: null,
        reconciled_venue_city: null,
        reconciled_venue_nation: null,
        venue_supported_by: [],
        venue_candidates: [],
        conflict: {
          kind: "MATCH_ID_KICKOFF_CONFLICT",
          detail: "one platform match id was published with more than one kickoff instant; neither was chosen",
          kickoffs,
        },
        is_future: null,
      });
      continue;
    }

    const [kickoff] = kickoffs;
    const groupId = reconciliationGroupId(platformMatchId, kickoff);
    const isFuture = members.some((member) => member.is_future === true)
      ? members.every((member) => member.is_future === true) ? true : null
      : members.every((member) => member.is_future === false) ? false : null;

    const common = {
      ...base,
      reconciliation_group_id: groupId,
      kickoff_utc: kickoff,
      kickoff_variants: kickoffs,
      is_future: isFuture,
    };

    // A factual contradiction is checked BEFORE the scope gate. One
    // calendar publishing the same match id twice must surface as the
    // anomaly it is, not be quietly filed as "single source, out of
    // scope" — which is what happens if the scope gate runs first,
    // because such a group has a source_count of 1.
    const factual = otherFactualConflict(members);
    if (factual) {
      groups.push({
        ...common,
        reconciliation_state: "CONFLICT_OTHER_FACTUAL",
        venue_evidence_state: null,
        reconciled_venue_census_id: null,
        reconciled_venue_name: null,
        reconciled_venue_city: null,
        reconciled_venue_nation: null,
        venue_supported_by: [],
        venue_candidates: [],
        conflict: factual,
      });
      continue;
    }

    // Single-source ids are OUT OF SCOPE, not failures. No group is
    // manufactured for them and no identity is invented.
    if (common.source_count < 2) {
      groups.push({
        ...common,
        reconciliation_state: "SINGLE_SOURCE_NOT_IN_SCOPE",
        venue_evidence_state: null,
        reconciled_venue_census_id: null,
        reconciled_venue_name: null,
        reconciled_venue_city: null,
        reconciled_venue_nation: null,
        venue_supported_by: [],
        venue_candidates: [],
        conflict: null,
      });
      continue;
    }

    const venue = venueEvidence(members);
    const conflictingVenue = venue.venue_evidence_state === "CONFLICTING_RESOLVED_VENUES";

    groups.push({
      ...common,
      ...venue,
      reconciliation_state: conflictingVenue ? "CONFLICT_RESOLVED_VENUE" : "RECONCILED_MULTI_SOURCE",
      conflict: conflictingVenue
        ? { kind: "RESOLVED_VENUE_CONFLICT", detail: "members resolved to different governed census venues; neither was chosen", candidates: venue.venue_candidates }
        : null,
    });
  }

  // Deterministic file ordering, independent of input order.
  groups.sort((a, b) => a.platform_match_id.localeCompare(b.platform_match_id));

  for (const group of groups) {
    if (!RECONCILIATION_STATES.has(group.reconciliation_state)) {
      throw new Error(`non-canonical reconciliation state: ${group.reconciliation_state}`);
    }
  }

  return { groups, without_key: withoutKey.map(observationRef).sort(compareRefs) };
}
