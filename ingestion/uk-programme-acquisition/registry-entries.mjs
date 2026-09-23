// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — builds and
// updates sources/uk.json entries (sources/registry.schema.json shape),
// reusing the existing registry's own vocabulary unchanged. Pure module —
// no network, no filesystem; callers persist whatever this returns.

export const RESEARCH_ID = "BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01";

/** sources/registry.schema.json's `id` pattern requires lowercase-hyphen-only; venue_id already matches that shape (createVenueId()'s own contract), just re-prefixed for readability/namespacing. */
export function deriveSourceId(venueId) {
  const stripped = venueId.replace(/^venue-/, "");
  return `uk-prog-${stripped}`;
}

/**
 * Build the INITIAL registry entry for a candidate website, before any
 * acquisition attempt — every enum defaults to its honest "not yet
 * determined" value (never guessed at this stage; see
 * updateEntryFromAcquisition() below for what a real fetch legitimately
 * proves).
 */
export function buildInitialEntry({ venue, website, evidenceKind, today }) {
  return {
    id: deriveSourceId(venue.venue_id),
    name: venue.canonical_name,
    source_type: "VENUE",
    country_code: "GB",
    city: venue.city ?? "",
    municipality: venue.municipality ?? null,
    neighbourhood: null,
    physical_address: venue.address ?? null,
    official_website: website,
    events_url: null,
    source_priority: "P2",
    scale: "UNKNOWN",
    genres: null,
    acquisition_method: "UNKNOWN",
    acquisition_path_detail: null,
    monitoring_status: "READY_FOR_TECHNICAL_PROOF",
    rights_status: "UNKNOWN",
    rights_notes: null,
    rights_evidence_url: null,
    regular_future_listings: "UNCLEAR",
    active_status: "ACTIVE",
    overlap_notes: null,
    research_notes: `Candidate website extracted from venue's own retained evidence (${evidenceKind}); not yet technically reviewed.`,
    detailed_source_ref: null,
    lifecycle_status: "DISCOVERED",
    discovered_at: today,
    last_reviewed_at: today,
    research_provenance: {
      research_id: RESEARCH_ID,
      review_date: today,
      note: `Candidate source for canonical UK venue ${venue.venue_id}, discovered from ${evidenceKind}.`,
    },
  };
}

// acquireSource()'s own collector/fingerprint mechanism names ->
// sources/registry.schema.json's acquisition_method enum. Deliberately a
// simple, total, documented mapping table — never inferred ad hoc per
// entry, so every entry sharing a mechanism gets the identical
// classification.
// The FULL "real collecting" TECHNICAL_MECHANISMS set — see
// investigation-writer.mjs's own identical-purpose table for why
// completeness matters (an unmapped real mechanism silently suppresses a
// genuinely proven acquisition rather than failing loudly).
const MECHANISM_TO_ACQUISITION_METHOD = new Map([
  ["JSON_LD_EVENT", "JSON_LD_EVENT"],
  ["ICS_OR_ICAL", "ICS_CALENDAR"],
  ["PER_EVENT_ICS", "ICS_CALENDAR"],
  ["WORDPRESS_TRIBE_API", "API_JSON"],
  ["WORDPRESS_OTHER_API", "API_JSON"],
  ["PUBLIC_REST_JSON", "API_JSON"],
  ["PUBLIC_GRAPHQL", "API_JSON"],
  ["STATIC_HTML_CARDS", "STABLE_EVENT_PAGE"],
  ["LIST_TO_DETAIL_HTML", "STABLE_EVENT_PAGE"],
  ["EMBEDDED_NEXT_DATA", "EMBEDDED_JSON"],
  ["EMBEDDED_NUXT_STATE", "EMBEDDED_JSON"],
  ["EMBEDDED_SVELTEKIT_DATA", "EMBEDDED_JSON"],
  ["OTHER_EMBEDDED_APP_STATE", "EMBEDDED_JSON"],
  ["PUBLIC_BROWSER_XHR", "API_JSON"],
  ["WEBFLOW", "STABLE_EVENT_PAGE"],
  ["MICRODATA", "STABLE_EVENT_PAGE"],
  ["WIX_OR_FOURVENUES", "TICKETING_WIDGET"],
  ["SQUARESPACE_CALENDAR", "STABLE_EVENT_PAGE"],
]);

/** Residue/terminal acquireSource() `state` -> monitoring_status. Never guessed — every branch maps a real, distinguishable outcome. */
function monitoringStatusFor(state) {
  if (state === "ACQUISITION_PROVEN") return "TECHNICAL_PATH_PROVEN";
  if (state === "ACCESS_BLOCKED") return "BLOCKED";
  if (["BROWSER_REQUIRED", "SOCIAL_FIRST_PROGRAMME", "IMAGE_OR_POSTER_ONLY", "SOURCE_FINGERPRINT_UNSUPPORTED"].includes(state)) {
    return "UNSUITABLE_AUTOMATION";
  }
  return "NEEDS_TECHNICAL_REVIEW";
}

/**
 * Update a previously-built entry with what a REAL acquireSource() run
 * genuinely proved — every field here traces to that result's own output,
 * never invented. `provenEventCount`/`hasFutureDatedEvent` are computed by
 * the caller from the result's own `observations` (this module stays
 * acquisition-result-shaped, not Observation-shaped, to avoid a second,
 * drifting date-parsing implementation here).
 */
export function updateEntryFromAcquisition(entry, { result, today, hasFutureDatedEvent }) {
  const mechanism = result.collector ?? null;
  const acquisitionMethod = mechanism && MECHANISM_TO_ACQUISITION_METHOD.has(mechanism)
    ? MECHANISM_TO_ACQUISITION_METHOD.get(mechanism)
    : result.state === "SOCIAL_FIRST_PROGRAMME"
      ? "SOCIAL_ONLY"
      : result.state === "PROGRAMME_EMPTY"
        ? "NO_USEFUL_PUBLIC_SCHEDULE"
        : "UNKNOWN";

  return {
    ...entry,
    events_url: result.programme_url ?? entry.events_url,
    acquisition_method: acquisitionMethod,
    acquisition_path_detail: mechanism ? `Fingerprinted as ${mechanism} by ingestion/programme-acquisition/orchestrator.mjs; collected via the existing generic collector for that mechanism.` : entry.acquisition_path_detail,
    monitoring_status: monitoringStatusFor(result.state),
    regular_future_listings: result.state === "ACQUISITION_PROVEN" ? (hasFutureDatedEvent ? "YES" : "UNCLEAR") : result.state === "PROGRAMME_EMPTY" ? "NO" : "UNCLEAR",
    research_notes: `${result.state}: ${result.proven_event_count ?? 0} proven observation(s) from ${result.normalized_event_count ?? 0} normalized record(s) at acquisition time.`,
    detailed_source_ref: `research/source-investigations/${entry.id}/`,
    lifecycle_status: result.state === "ACQUISITION_PROVEN" ? "TECHNICALLY_REVIEWED" : entry.lifecycle_status,
    last_reviewed_at: today,
  };
}
