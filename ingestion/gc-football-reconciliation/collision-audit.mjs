// BEATMAPPED-UK-GC-FOOTBALL-MULTISOURCE-FIXTURE-RECONCILIATION-01 — audit.
//
// A complete collision audit across the whole corpus, run BEFORE any
// reconciliation is trusted.
//
// The point is adversarial: the reconciliation key is only defensible if
// nothing in the real data contradicts it. So for every platform match id
// this records what actually varies, and flags the two things that would
// invalidate the key outright —
//
//   * one match id published with more than one kickoff instant;
//   * one match id resolving to more than one governed census venue.
//
// If either occurs, the affected group is refused rather than reconciled.
// The key is never weakened to absorb a collision.

import { normaliseKickoff, variantsOf } from "./contract.mjs";

export function auditCollisions(observations, attributions) {
  const attributionByRef = new Map(
    attributions.map((record) => [`${record.source_id}||${record.source_record_id}`, record]),
  );

  const byMatchId = new Map();
  for (const observation of observations) {
    const id = observation.source_fields?.match_id ?? null;
    if (!id) continue;
    const attribution = attributionByRef.get(`${observation.source_id}||${observation.source_record_id}`);
    if (!byMatchId.has(id)) byMatchId.set(id, []);
    byMatchId.get(id).push({ observation, attribution });
  }

  const perMatchId = [];
  let kickoffCollisions = 0;
  let venueCollisions = 0;
  let sameSourceRepeats = 0;
  let missingKickoff = 0;

  for (const [platformMatchId, entries] of byMatchId) {
    const kickoffs = [...new Set(entries.map((e) => normaliseKickoff(e.observation.start?.iso)).filter(Boolean))].sort();
    const resolvedVenues = [...new Set(entries.map((e) => e.attribution?.resolved_venue_census_id).filter(Boolean))].sort();
    const sources = [...new Set(entries.map((e) => e.observation.source_id))].sort();

    const sourceCounts = new Map();
    for (const entry of entries) sourceCounts.set(entry.observation.source_id, (sourceCounts.get(entry.observation.source_id) ?? 0) + 1);
    const repeatedSource = [...sourceCounts.values()].some((n) => n > 1);

    if (kickoffs.length > 1) kickoffCollisions += 1;
    if (resolvedVenues.length > 1) venueCollisions += 1;
    if (repeatedSource) sameSourceRepeats += 1;
    if (kickoffs.length === 0) missingKickoff += 1;

    perMatchId.push({
      platform_match_id: platformMatchId,
      source_observation_count: entries.length,
      distinct_kickoffs: kickoffs.length,
      kickoffs,
      distinct_resolved_venues: resolvedVenues.length,
      resolved_venue_census_ids: resolvedVenues,
      distinct_source_calendars: sources.length,
      source_calendars: sources,
      home_team_variants: variantsOf(entries, (e) => e.observation.source_fields?.team_names?.[0] ?? null),
      away_team_variants: variantsOf(entries, (e) => e.observation.source_fields?.team_names?.[1] ?? null),
      competition_variants: variantsOf(entries, (e) => e.observation.source_fields?.competition_name ?? null),
      venue_text_variants: variantsOf(entries, (e) => e.observation.venue_name ?? null),
      same_source_published_more_than_once: repeatedSource,
      invalidates_key: kickoffs.length > 1 || resolvedVenues.length > 1,
    });
  }

  perMatchId.sort((a, b) => a.platform_match_id.localeCompare(b.platform_match_id));

  const multi = perMatchId.filter((row) => row.source_observation_count > 1);

  return {
    per_match_id: perMatchId,
    summary: {
      distinct_platform_match_ids: perMatchId.length,
      match_ids_with_multiple_observations: multi.length,
      // The two controls that would invalidate the key.
      match_id_kickoff_collisions: kickoffCollisions,
      match_id_resolved_venue_collisions: venueCollisions,
      // Supporting anomaly checks.
      match_ids_repeated_within_one_source: sameSourceRepeats,
      match_ids_without_any_kickoff: missingKickoff,
      // Naming variation, measured but NOT treated as a collision.
      multi_observation_ids_with_home_team_variants: multi.filter((r) => r.home_team_variants.length > 1).length,
      multi_observation_ids_with_away_team_variants: multi.filter((r) => r.away_team_variants.length > 1).length,
      multi_observation_ids_with_competition_variants: multi.filter((r) => r.competition_variants.length > 1).length,
      multi_observation_ids_with_venue_text_variants: multi.filter((r) => r.venue_text_variants.length > 1).length,
    },
  };
}
