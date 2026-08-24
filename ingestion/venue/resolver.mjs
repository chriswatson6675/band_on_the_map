// Deterministic Source -> canonical Venue resolver.
//
// Never mutates the Observation passed in — it is read-only input here.
// Returns a separate resolution result:
//
//   { venue_id, resolution_status, resolution_method }
//
// Uses explicit, hand-authored mappings from real, retained
// source-specific identifiers/text to a canonical venue_id (see
// venues/lisbon.json and, since LISBON-PORTO-OVERNIGHT-COVERAGE-01,
// venues/porto.json) — deliberately no fuzzy name matching. Anything not
// explicitly mapped resolves as UNRESOLVED: per docs/VENUE_RESOLUTION.md,
// an unresolved gig is preferable to a false map pin. This module stays
// one shared, city-agnostic dispatcher (matching getMarkersForCountry()'s
// existing country-level, not city-level, scoping in
// ingestion/map/projection.mjs) rather than being split per city.
//
// VENUE-AUTO-ONBOARDING-01: resolveObservation() below now ALSO checks a
// second, DATA-DRIVEN mapping table (venues/source-venue-mappings.json,
// via ingestion/venue-onboarding/data-driven-resolver.mjs) whenever the
// per-source hardcoded functions below leave an Observation unresolved.
// This is deliberate: every hardcoded table in this file is frozen as
// historical record (migrating it is unnecessary regression risk — see
// that task's brief), but a NEW venue never needs a new hardcoded
// function or if/else branch here — it is onboarded purely by adding a
// mapping entry to that JSON file (see `npm run onboard:venues`,
// ingestion/venue-onboarding/run.mjs). The data-driven layer uses the
// exact same "no fuzzy fallback" rule as every table below: an exact
// (source_id, key_type, key) match or nothing.
//
// This is Venue reconciliation only. It does not create, merge, or
// deduplicate Events or Observations — a resolved AgendaLX Observation
// and a resolved Hot Clube Observation that happen to share a venue_id
// (see the Capitólio case) remain two separate Observations.

import sourceVenueMappings from "../../venues/source-venue-mappings.json" with { type: "json" };
import { resolveFromMappings } from "../venue-onboarding/data-driven-resolver.mjs";

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

// Teatro Variedades & Capitólio (BOTM-MULTISOURCE-LINKS-01): the venue's
// own event pages describe their sub-location as "Terraço do Capitólio"
// (the venue's rooftop terrace) — a different exact string from Hot
// Clube's "Cineteatro Capitólio Parque Mayer", but the same real building
// this source's own official_website belongs to, so both retained exact
// strings map to the SAME canonical venue_id. One retained record (Marta
// Garrett) carries an additional weather-driven room-change note in the
// same field; that exact string is mapped too rather than silently
// normalised away.
const CAPITOLIO_LOCATION_TEXT_TO_CANONICAL = {
  "Terraço do Capitólio": "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
  "Terraço do Capitólio (por razões meteorológicas, o concerto acontece na sala do Capitólio)":
    "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
};

// BOTA (LISBON-AUTOMATIC-SUBSET-01): every retained live sample's ICS
// LOCATION carries this exact, consistent single-venue address string
// (confirmed identical across multiple distinct events) — the same
// exact-string-match convention as Hot Clube above, and deliberately NOT
// the same ICS's own GEO property, which this task's live proof found to
// be genuinely wrong (resolves outside Lisbon) — see
// ingestion/bota/observation-adapter.mjs. Maps to the SAME venue already
// evidence-resolved in venues/lisbon.json under BOTM-VENUE-01 (ADDRESS_ONLY,
// no coordinates) — this task does not upgrade that entry. Note the exact
// string genuinely has no accent on "Barbara" here — the calendar export
// spells it plainly ASCII, unlike venues/lisbon.json's own canonical_name
// evidence ("Bárbara", from the venue's official website); this mapping
// key is deliberately the ICS's own exact text, not the accented form,
// since exact-string matching means exact.
const BOTA_LOCATION_TEXT_TO_CANONICAL = {
  "BOTA, Largo de Santa Barbara, 3D, Lisboa, Portugal": "venue-lisboa-bota-anjos",
};

// Odivelas (LISBON-AUTOMATIC-SUBSET-01): unlike the single-venue sources
// above, this is a municipal CITY_FEED whose items span many different
// council venues/departments (see ingestion/odivelas/observation-
// adapter.mjs) — there is no one fixed venue to resolve every Observation
// to. This table starts deliberately EMPTY: no first-party, evidence-
// backed Venue was resolved for any of the "Contacto:" text genuinely
// observed in this task's live run (see the run report) — per
// docs/VENUE_RESOLUTION.md, an unresolved gig is preferable to a false
// map marker. A future task may add explicit entries here once a
// specific Odivelas-referenced venue (e.g. Centro Cultural Malaposta) is
// independently evidence-resolved the same way Capitólio/BOTA were.
const ODIVELAS_LOCATION_TEXT_TO_CANONICAL = {};

// Village Underground Lisboa and MEO Arena (LISBON-AUTOMATIC-SUBSET-01):
// both sources are registered as a single fixed-address VENUE
// (sources/lisbon.json's own source_type), and neither source's own
// acquired records expose a usable per-event location field to key an
// exact-text mapping on the way Hot Clube/BOTA do (Village Underground's
// ICS carries no LOCATION property at all; MEO Arena's bounded agenda
// listing does not repeat a per-card venue name — see each adapter's own
// doc comment for the live evidence). Resolving every Observation from
// one of these two sources to its one fixed, evidence-backed Venue
// (venues/lisbon.json) is therefore keyed on source_id itself, not a
// per-Observation field. This is still a small, explicit, non-fuzzy 1:1
// mapping — never a guess about which venue an event happened at — the
// dispatch below on Observation.source_id already does exactly this for
// every other source; keying resolution on that same already-trusted
// field for a source whose real-world identity IS one physical place is
// not a lower evidentiary bar, and it never touches the Observation's own
// (honestly null) venue_name/location_text fields.
const SOURCE_ID_TO_FIXED_CANONICAL_VENUE = {
  "village-underground-lisboa": "venue-lisboa-village-underground-lisboa",
  "meo-arena": "venue-lisboa-meo-arena",
  // Casa da Música (LISBON-PORTO-OVERNIGHT-COVERAGE-01): every session on
  // its /agenda/ listing happens inside the one building — see
  // ingestion/casa-da-musica/observation-adapter.mjs's doc comment for why
  // a per-card room/auditorium sub-location does not change that.
  "casa-da-musica": "venue-porto-casa-da-musica",
};

// Teatro Municipal do Porto (LISBON-PORTO-OVERNIGHT-COVERAGE-01): unlike
// Casa da Música, this feed is genuinely multi-venue (Rivoli / Campo
// Alegre / off-site locations such as libraries) — see
// ingestion/teatro-municipal-porto/observation-adapter.mjs. Only the exact
// retained venue_name string "Rivoli" is mapped, matching this project's
// exact-string, non-fuzzy convention (Hot Clube/BOTA/Capitólio). Off-site
// locations (e.g. "Biblioteca Municipal Almeida Garrett") and "Campo
// Alegre" (not yet independently address-evidenced in venues/porto.json)
// are deliberately left unmapped.
const TEATRO_MUNICIPAL_PORTO_VENUE_NAME_TO_CANONICAL = {
  Rivoli: "venue-porto-teatro-rivoli",
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

export function resolveCapitolioObservation(observation) {
  const locationText = observation?.location_text;
  const canonicalId = locationText ? CAPITOLIO_LOCATION_TEXT_TO_CANONICAL[locationText] : undefined;
  if (canonicalId) {
    return resolved(canonicalId, "CAPITOLIO_EXPLICIT_LOCATION_TEXT_MAPPING");
  }
  return unresolved("NO_EXPLICIT_CAPITOLIO_LOCATION_TEXT_MAPPING");
}

export function resolveBotaObservation(observation) {
  const locationText = observation?.location_text;
  const canonicalId = locationText ? BOTA_LOCATION_TEXT_TO_CANONICAL[locationText] : undefined;
  if (canonicalId) {
    return resolved(canonicalId, "BOTA_EXPLICIT_LOCATION_TEXT_MAPPING");
  }
  return unresolved("NO_EXPLICIT_BOTA_LOCATION_TEXT_MAPPING");
}

export function resolveOdivelasObservation(observation) {
  const locationText = observation?.location_text;
  const canonicalId = locationText ? ODIVELAS_LOCATION_TEXT_TO_CANONICAL[locationText] : undefined;
  if (canonicalId) {
    return resolved(canonicalId, "ODIVELAS_EXPLICIT_LOCATION_TEXT_MAPPING");
  }
  return unresolved("NO_EXPLICIT_ODIVELAS_LOCATION_TEXT_MAPPING");
}

/**
 * Shared by resolveVillageUndergroundObservation()/resolveMeoArenaObservation()
 * — see SOURCE_ID_TO_FIXED_CANONICAL_VENUE's doc comment above for why a
 * fixed-venue source is deliberately resolved by source_id rather than a
 * per-Observation field.
 */
function resolveFixedVenueSource(observation, method) {
  const canonicalId = SOURCE_ID_TO_FIXED_CANONICAL_VENUE[observation?.source_id];
  if (canonicalId) {
    return resolved(canonicalId, method);
  }
  return unresolved("NO_FIXED_VENUE_MAPPING_FOR_SOURCE");
}

export function resolveVillageUndergroundObservation(observation) {
  return resolveFixedVenueSource(observation, "VILLAGE_UNDERGROUND_FIXED_SINGLE_VENUE_SOURCE");
}

export function resolveMeoArenaObservation(observation) {
  return resolveFixedVenueSource(observation, "MEO_ARENA_FIXED_SINGLE_VENUE_SOURCE");
}

export function resolveCasaDaMusicaObservation(observation) {
  return resolveFixedVenueSource(observation, "CASA_DA_MUSICA_FIXED_SINGLE_VENUE_SOURCE");
}

export function resolveTeatroMunicipalPortoObservation(observation) {
  const venueName = observation?.venue_name;
  const canonicalId = venueName ? TEATRO_MUNICIPAL_PORTO_VENUE_NAME_TO_CANONICAL[venueName] : undefined;
  if (canonicalId) {
    return resolved(canonicalId, "TEATRO_MUNICIPAL_PORTO_EXPLICIT_VENUE_NAME_MAPPING");
  }
  return unresolved("NO_EXPLICIT_TEATRO_MUNICIPAL_PORTO_VENUE_NAME_MAPPING");
}

/**
 * Dispatch on Observation.source_id to the right explicit, hardcoded
 * resolver. A source with no resolver defined here is always
 * UNRESOLVED here — never guessed at generically. This is the layer
 * every table above this function feeds; VENUE-AUTO-ONBOARDING-01 never
 * adds a new branch here for a new venue (see resolveObservation below).
 */
// Exported (VENUE-AUTO-ONBOARDING-01) so ingestion/venue-onboarding/run.mjs
// can compute a resolution against a FRESHLY-built mappings array (its
// own just-admitted, still-in-memory entries) rather than the
// process-start-frozen `sourceVenueMappings` JSON import above — a
// static ESM JSON import cannot hot-reload mid-process. Behaviour of
// resolveObservation() below (the normal, real entry point every other
// caller uses) is completely unaffected by this export.
export function resolveViaExplicitMappings(observation) {
  if (observation?.source_id === "agendalx") {
    return resolveAgendalxObservation(observation);
  }
  if (observation?.source_id === "hot-clube-de-portugal") {
    return resolveHotClubeObservation(observation);
  }
  if (observation?.source_id === "teatro-variedades-capitolio") {
    return resolveCapitolioObservation(observation);
  }
  if (observation?.source_id === "bota-anjos") {
    return resolveBotaObservation(observation);
  }
  if (observation?.source_id === "cm-odivelas-agenda-cultura") {
    return resolveOdivelasObservation(observation);
  }
  if (observation?.source_id === "village-underground-lisboa") {
    return resolveVillageUndergroundObservation(observation);
  }
  if (observation?.source_id === "meo-arena") {
    return resolveMeoArenaObservation(observation);
  }
  if (observation?.source_id === "casa-da-musica") {
    return resolveCasaDaMusicaObservation(observation);
  }
  if (observation?.source_id === "teatro-municipal-do-porto") {
    return resolveTeatroMunicipalPortoObservation(observation);
  }
  return unresolved("NO_RESOLVER_FOR_SOURCE");
}

/**
 * Resolve one Observation to a canonical venue_id.
 *
 * VENUE-AUTO-ONBOARDING-01: tries every existing hardcoded mapping
 * first (resolveViaExplicitMappings, completely unchanged behaviour —
 * every existing test asserting a specific hardcoded outcome keeps
 * passing); only when that leaves an Observation UNRESOLVED does this
 * also try the data-driven mapping table
 * (venues/source-venue-mappings.json, via
 * ingestion/venue-onboarding/data-driven-resolver.mjs). Either path can
 * resolve an Observation; neither can override the other, and a
 * mapping entry can never resolve something the hardcoded tables above
 * already claimed (explicit mappings always take priority, matching
 * this file's existing "first, most-trusted table wins" convention).
 */
export function resolveObservation(observation) {
  const explicit = resolveViaExplicitMappings(observation);
  if (explicit.resolution_status === "RESOLVED") {
    return explicit;
  }
  const dataDriven = resolveFromMappings(observation, sourceVenueMappings.mappings);
  if (dataDriven.resolution_status === "RESOLVED") {
    return dataDriven;
  }
  return explicit;
}
