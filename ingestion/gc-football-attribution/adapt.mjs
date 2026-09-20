// BEATMAPPED-UK-GC-FOOTBALL-VENUE-ATTRIBUTION-01 — resolver adapter.
//
// This package deliberately contains NO venue-matching logic. Matching is
// done entirely by the existing generic resolver in
// ingestion/major-event-attribution/, unchanged.
//
// The only thing needed here is shape. The generic resolver reads a
// source's census provenance from `source_fields` (venue_census_id,
// census_venue_name, calendar_source_id, event_domain), because the
// Tier-1 acquisition wrote those onto its Observations. The gc football
// acquisition deliberately did NOT: it refused to carry any census venue
// on an Observation, so that acquisition could never pre-judge where an
// event happens.
//
// So this module supplies that provenance to the resolver from the
// registry join, on a COPY. The retained Observations are never mutated.
//
// Note what this does and does not give the resolver: it passes the
// source's OWN census venue purely so the resolver can report whether a
// match is the source's venue or a different one. The resolver never uses
// it to resolve — a fact this package's tests assert.

const FOOTBALL_EVENT_DOMAIN = "SPORT_FIXTURES";

/**
 * Build the resolver-shaped input for one Observation.
 *
 * Returns a NEW object. The input Observation is not touched, and the
 * returned copy carries the source's own venue_name and location_text
 * verbatim — the only venue evidence the resolver is allowed to use.
 */
export function adaptForResolver(observation, source) {
  return {
    ...observation,
    source_fields: {
      ...observation.source_fields,
      // Provenance of the CALENDAR the record was fetched from. Never a
      // statement about where the fixture is played.
      venue_census_id: source?.census_venue_id ?? null,
      census_venue_name: source?.census_venue_name ?? null,
      calendar_source_id: observation.source_id,
      event_domain: FOOTBALL_EVENT_DOMAIN,
    },
  };
}

/** Adapt a whole dataset, preserving order. */
export function adaptAll(observations, sourcesById) {
  return observations.map((observation) => adaptForResolver(observation, sourcesById.get(observation.source_id)));
}

/**
 * Deep structural equality against the original, used by tests and by the
 * runner's own guard to prove adaptation copied rather than mutated.
 */
export function isUnmutated(original, snapshot) {
  return JSON.stringify(original) === snapshot;
}
