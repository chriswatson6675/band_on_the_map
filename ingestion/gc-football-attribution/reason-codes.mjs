// BEATMAPPED-UK-GC-FOOTBALL-VENUE-ATTRIBUTION-01 — unresolved reason codes.
//
// Analytic classification of WHY a record did not resolve. Every code
// here is derived from a fact already established by the resolver or by
// the source record itself. None is a guess.
//
// A NOTE ON "OVERSEAS".
//
// It would be easy to emit an OVERSEAS_VENUE code, and it would be
// wrong. Nothing in the retained evidence states the country of a venue
// that is absent from the census. The census holds UK major venues only,
// so a venue missing from it may be overseas, a smaller UK ground, an
// academy or training ground, a neutral venue, or a UK venue below the
// census threshold — and the record itself says none of those things.
// Inferring a country from a stadium's name, or from the competition it
// sits in, is exactly the plausibility-reasoning this project forbids.
//
// So no code here asserts geography. Out-of-census records are reported
// as NOT_IN_CENSUS, and the source's own competition label is retained
// beside them as CONTEXT ONLY — it describes the competition the source
// named, never the venue's location. Establishing the country of these
// venues is real work for a later package with real evidence.

export const UNRESOLVED_REASONS = new Set([
  "NO_VENUE_EVIDENCE",
  "VENUE_NAME_TOO_WEAK",
  "NOT_IN_CENSUS",
  "AMBIGUOUS_CENSUS_CANDIDATES",
  "CONFLICTING_GEOGRAPHY",
]);

/**
 * Classify one unresolved attribution record.
 *
 * @param record       the resolver's own output for this observation
 * @param observation  the source Observation it was derived from
 */
export function unresolvedReason(record, observation) {
  switch (record.attribution_state) {
    case "AMBIGUOUS_MULTIPLE_CENSUS_MATCHES":
      return "AMBIGUOUS_CENSUS_CANDIDATES";
    case "CONFLICTING_LOCATION_EVIDENCE":
      return "CONFLICTING_GEOGRAPHY";
    case "UNRESOLVED_NO_VENUE_EVIDENCE": {
      // The resolver refuses both an absent venue and a name too short to
      // be usable. The source record says which of those happened.
      const state = observation?.source_fields?.venue_text_state;
      if (state === "ABSENT" || state === "NON_VENUE_SENTINEL") return "NO_VENUE_EVIDENCE";
      return "VENUE_NAME_TOO_WEAK";
    }
    case "UNRESOLVED_NO_CENSUS_MATCH":
      return "NOT_IN_CENSUS";
    default:
      return null;
  }
}

/**
 * The source's own competition label, retained beside an out-of-census
 * record as context. This is NOT a geographic claim: it is the string the
 * source published for that fixture's competition, nothing more.
 */
export function competitionContext(observation) {
  return observation?.source_fields?.competition_name ?? null;
}

/**
 * Why a record has no venue at all, in the source's own terms.
 * "NON_VENUE_SENTINEL" means the platform wrote an operational
 * placeholder ("Unavailable", "Behind closed doors", "TBC") where a
 * venue would go; "ABSENT" means it wrote nothing.
 */
export function noVenueKind(observation) {
  const state = observation?.source_fields?.venue_text_state;
  if (state === "NON_VENUE_SENTINEL") return { kind: "NON_VENUE_SENTINEL", raw: observation.source_fields.venue_text_raw };
  if (state === "ABSENT") return { kind: "ABSENT", raw: null };
  return null;
}
