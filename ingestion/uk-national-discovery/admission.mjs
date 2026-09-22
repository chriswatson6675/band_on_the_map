// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01 — deterministic
// admission decisions for a national discovery campaign, mirroring
// ingestion/venue-onboarding/admission.mjs's ADMISSION_STATUSES shape
// (evidence-gated, city-agnostic, no live network) but adapted for
// OSM-tag-evidenced auto-admission rather than a pre-existing manual
// research ledger (venues/candidate-research.json is Lisbon/Porto-
// specific and does not apply here).
//
// Safety comes from QUERY-TIME category selection
// (ingestion/uk-national-discovery/overpass-bbox-query.mjs's TAG_CLAUSES)
// plus THIS module's own category gate — never from a downstream
// probabilistic filter. A "noisy" category (this package's brief:
// pubs/bars/community centres/etc.) is only ever queried, and only ever
// admitted, alongside its own explicit live-event tag
// (live_music=yes/music_venue=yes) on the SAME OSM element — category
// membership alone is never sufficient, matching this package's brief
// exactly ("Do not admit merely because a building theoretically can
// host events").
//
// Pure module — no network, no filesystem.

export const DISCOVERY_ADMISSION_STATUSES = new Set([
  "ALREADY_CANONICAL",
  "AUTO_ADMIT_HIGH_CONFIDENCE",
  "DUPLICATE_EXISTING",
  "DUPLICATE_CANDIDATE",
  "NOT_LIVE_EVENT_VENUE",
  "SPORT_ONLY",
  "CLOSED_OR_INACTIVE",
  "INSUFFICIENT_EVIDENCE",
  "IDENTITY_CONFLICT",
  "GEOCODING_FAILED",
  "RESEARCH_FAILED",
  "REVIEW_REQUIRED",
]);

// Every OSM tag-clause signal this campaign's Overpass sweep queries for
// (ingestion/uk-national-discovery/overpass-bbox-query.mjs), and whether
// that signal alone is strong enough to auto-admit. amenity=community_centre
// is deliberately the one bare category NOT in this set — this package's
// brief lists it among the categories requiring EXPLICIT live-event
// relevance, never mere category membership; it is still discovered
// (broad net, useful for long-tail leads) but never auto-admitted from
// the tag alone.
//
// Exported (not just module-private) so BEATMAPPED-UK-NATIONAL-VENUE-
// BULK-OSM-COMPLETION-02's bulk-OSM pre-candidacy filter
// (ingestion/uk-national-bulk-osm/candidate-eligibility.mjs) can reuse
// this EXACT set as its own "directly eligible for the main candidate
// census" gate, applied BEFORE a raw OSM element ever becomes a
// VenueDiscoveryCandidate — at national bulk scale, a bare noisy category
// like community_centre is common enough (thousands of village/church
// halls) that letting it reach candidate construction at all, only to be
// rejected later by classifyDiscoveryGroup() below, floods the campaign's
// own candidate/review counts with non-event leads. Never a second,
// independently-drifting copy of this set.
export const AUTO_ADMIT_ELIGIBLE_SIGNALS = new Set([
  "amenity=nightclub",
  "amenity=theatre",
  "amenity=arts_centre",
  "live_music=yes",
  "music_venue=yes",
  "amenity=pub;live_music=yes",
  "amenity=bar;live_music=yes",
]);

/** A known OSM convention marking a feature as no longer operating (e.g. `disused:amenity=theatre`) — never admitted, regardless of category. */
function hasDisusedTag(tags) {
  return Object.keys(tags ?? {}).some((key) => key === "disused" || key.startsWith("disused:"));
}

function parseOsmTagsEvidence(observation) {
  const entry = (observation.discovery_evidence ?? []).find((item) => item.kind === "OSM_TAGS");
  if (!entry) return {};
  try {
    return JSON.parse(entry.value) ?? {};
  } catch {
    return {};
  }
}

/**
 * Which auto-admit-eligible signal(s) this one OSM element's own tags
 * satisfy, as the exact "key=value" strings AUTO_ADMIT_ELIGIBLE_SIGNALS
 * uses — never a fuzzy match, only the tags actually present.
 */
export function deriveAdmitSignals(tags) {
  const signals = [];
  if (tags.amenity === "nightclub") signals.push("amenity=nightclub");
  if (tags.amenity === "theatre") signals.push("amenity=theatre");
  if (tags.amenity === "arts_centre") signals.push("amenity=arts_centre");
  if (tags.live_music === "yes") signals.push("live_music=yes");
  if (tags.music_venue === "yes") signals.push("music_venue=yes");
  if (tags.amenity === "pub" && tags.live_music === "yes") signals.push("amenity=pub;live_music=yes");
  if (tags.amenity === "bar" && tags.live_music === "yes") signals.push("amenity=bar;live_music=yes");
  return signals;
}

/**
 * Classify one reconciled OSM discovery group (post
 * ingestion/venue-discovery/reconcile.mjs +
 * ingestion/venue-discovery/existing-registry.mjs) into exactly one
 * DISCOVERY_ADMISSION_STATUSES value. Never throws; always returns a
 * status this campaign's own accounting can close against (this
 * package's brief: "no candidate disappears").
 */
export function classifyDiscoveryGroup(group) {
  const registryStatus = group.existing_registry_reconciliation?.status;
  if (registryStatus === "ALREADY_ACQUIRED" || registryStatus === "KNOWN_VENUE_NO_SOURCE" || registryStatus === "KNOWN_SOURCE_NOT_ACTIVE") {
    return { status: "ALREADY_CANONICAL", reason: `matches existing registry (${registryStatus})`, signals: [] };
  }
  if (registryStatus === "POSSIBLE_EXISTING_MATCH_REVIEW") {
    return { status: "REVIEW_REQUIRED", reason: "possible match against an existing venue/source — not safe to auto-decide", signals: [] };
  }
  if (group.reconciliation_status === "POSSIBLE_DUPLICATE_REVIEW") {
    return { status: "REVIEW_REQUIRED", reason: "possible duplicate of another discovery candidate in this same run — not safe to auto-merge", signals: [] };
  }

  const allTags = group.observations.map(parseOsmTagsEvidence);
  if (allTags.some(hasDisusedTag)) {
    return { status: "CLOSED_OR_INACTIVE", reason: "an underlying OSM element carries a disused:* tag", signals: [] };
  }

  const signals = [...new Set(allTags.flatMap(deriveAdmitSignals))];
  const eligible = signals.some((signal) => AUTO_ADMIT_ELIGIBLE_SIGNALS.has(signal));
  if (eligible) {
    return { status: "AUTO_ADMIT_HIGH_CONFIDENCE", reason: `evidenced by ${signals.join(", ")}`, signals };
  }

  // Reaches here only for a group whose every observation's ONLY matched
  // tag was the bare, non-eligible amenity=community_centre — discovered
  // (a genuine long-tail lead) but never auto-admitted without explicit
  // live-event evidence.
  return { status: "INSUFFICIENT_EVIDENCE", reason: "only bare amenity=community_centre evidence — no explicit live-event tag", signals: [] };
}
