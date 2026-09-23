// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — builds a
// venues/source-venue-mappings.json-shaped entry for one acquired UK
// source, so ingestion/venue/resolver.mjs's resolveObservation() resolves
// every Observation this source produces straight to the canonical UK
// venue it was derived FROM — never a fuzzy/best-guess match, and never a
// risk of attaching an event to the wrong venue (this package's own
// brief, Phase 8: "fail closed at the record level rather than attach
// events to the wrong venue").
//
// Reuses deriveCandidateKey() from ingestion/venue-onboarding/
// candidates.mjs UNCHANGED — the exact same function
// ingestion/venue-onboarding/data-driven-resolver.mjs's resolveFromMappings()
// calls when resolving a real Observation. Computing the mapping's own
// source_key_type/source_key from that SAME function (applied to one of
// this source's own real, proven Observations) — rather than assuming
// SOURCE_ID is always the resolvable key — guarantees the mapping this
// module writes is the exact one the resolver will actually look up,
// never a second, independently-drifting key-derivation guess.

import { deriveCandidateKey } from "../venue-onboarding/candidates.mjs";

/**
 * Build one mapping entry from a source's own real, proven Observations
 * (result.observations from a successful acquireSource() call) to the
 * canonical venue it was acquired for. Returns null if there are no
 * proven observations to derive a key from (nothing to map yet).
 */
export function buildVenueMappingEntry({ sourceId, venue, observations, officialUrl, today }) {
  if (!observations || observations.length === 0) return null;
  const derived = deriveCandidateKey(observations[0]);
  if (!derived) return null;

  return {
    source_id: sourceId,
    source_key_type: derived.key_type,
    source_key: derived.key,
    venue_id: venue.venue_id,
    method: "BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: this source was constructed FROM this exact canonical venue's own official website — a 1:1, by-construction mapping, never a fuzzy match against an independently-discovered source.",
    evidence: [
      {
        url: officialUrl,
        kind: "OFFICIAL_VENUE_WEBSITE",
        note: `Acquired directly from ${venue.canonical_name}'s own official website (venue_id=${venue.venue_id}); the source registry entry ${sourceId} was created specifically for this one venue.`,
      },
    ],
    created_at: today,
    retrieved_at: today,
  };
}
