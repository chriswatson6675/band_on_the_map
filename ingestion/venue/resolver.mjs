// Deterministic Source -> canonical Venue resolver.
//
// Never mutates the Observation passed in — it is read-only input here.
// Returns a separate resolution result:
//
//   { venue_id, resolution_status, resolution_method }
//
// Uses only explicit, hand-authored mappings from real, retained
// source-specific identifiers/text to a canonical venue_id (see
// venues/lisbon.json) — deliberately no fuzzy name matching. Anything not
// explicitly mapped resolves as UNRESOLVED: per docs/VENUE_RESOLUTION.md,
// an unresolved gig is preferable to a false map pin.
//
// This is Venue reconciliation only. It does not create, merge, or
// deduplicate Events or Observations — a resolved AgendaLX Observation
// and a resolved Hot Clube Observation that happen to share a venue_id
// (see the Capitólio case) remain two separate Observations.

export const RESOLUTION_STATUSES = new Set(["RESOLVED", "UNRESOLVED"]);

// AgendaLX: keyed by the source's own numeric venue_id
// (Observation.source_fields.venue_id from
// ingestion/agendalx/observation-adapter.mjs) — the most stable
// AgendaLX-side key, more robust than venue_slug/venue_name to
// incidental text changes. Only venues actually evidence-resolved in
// venues/lisbon.json appear here; every other AgendaLX venue_id
// encountered in the 10 retained records is deliberately left
// unmapped — see docs/VENUE_RESOLUTION.md for why each one was left
// unresolved (administrative body, outdoor/imprecise place, unverifiable
// or wrong-domain provenance, etc).
const AGENDALX_VENUE_ID_TO_CANONICAL = {
  798: "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado", // "Capitólio"
  4952: "venue-lisboa-igreja-e-convento-da-graca", // "Igreja e Convento da Graça"
  5041: "venue-lisboa-bota-anjos", // "BOTA Anjos"
};

// Hot Clube: the ICS LOCATION field does not expose a separate stable
// venue key (venue_name is deliberately left null for this source — see
// docs/OBSERVATION_PIPELINE.md), so resolution keys on the exact,
// retained location_text string instead. Only the one exact string that
// was actually evidence-matched to a resolved venue is mapped; every
// other retained location_text (including the Jardim do Arco do Cego and
// Muzeu/Praça Municipal 62 strings) is deliberately left unmapped.
const HOT_CLUBE_LOCATION_TEXT_TO_CANONICAL = {
  "Cineteatro Capitólio Parque Mayer": "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
};

function resolved(venueId, method) {
  return { venue_id: venueId, resolution_status: "RESOLVED", resolution_method: method };
}

function unresolved(reason) {
  return { venue_id: null, resolution_status: "UNRESOLVED", resolution_method: reason };
}

export function resolveAgendalxObservation(observation) {
  const venueId = observation?.source_fields?.venue_id;
  const canonicalId = venueId != null ? AGENDALX_VENUE_ID_TO_CANONICAL[venueId] : undefined;
  if (canonicalId) {
    return resolved(canonicalId, "AGENDALX_EXPLICIT_VENUE_ID_MAPPING");
  }
  return unresolved("NO_EXPLICIT_AGENDALX_VENUE_ID_MAPPING");
}

export function resolveHotClubeObservation(observation) {
  const locationText = observation?.location_text;
  const canonicalId = locationText ? HOT_CLUBE_LOCATION_TEXT_TO_CANONICAL[locationText] : undefined;
  if (canonicalId) {
    return resolved(canonicalId, "HOTCLUBE_EXPLICIT_LOCATION_TEXT_MAPPING");
  }
  return unresolved("NO_EXPLICIT_HOTCLUBE_LOCATION_TEXT_MAPPING");
}

/**
 * Dispatch on Observation.source_id to the right explicit resolver. A
 * source with no resolver defined here is always UNRESOLVED, never
 * guessed at generically.
 */
export function resolveObservation(observation) {
  if (observation?.source_id === "agendalx") {
    return resolveAgendalxObservation(observation);
  }
  if (observation?.source_id === "hot-clube-de-portugal") {
    return resolveHotClubeObservation(observation);
  }
  return unresolved("NO_RESOLVER_FOR_SOURCE");
}
