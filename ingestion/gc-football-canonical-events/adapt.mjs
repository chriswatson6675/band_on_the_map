// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-EVENT-IDENTITY-01 — the football
// adapter onto the generic canonical occurrence identity core.
//
// This is the ONLY football-aware part of the canonical identity layer.
// It translates one reconciled fixture group into the domain-neutral
// anchor the core understands, decides eligibility, and assembles the
// derived canonical event record. The core
// (ingestion/canonical-event-identity/contract.mjs) never learns what a
// fixture, a club or a competition is.
//
// IDENTITY AND ENRICHMENT ARE SEPARATE.
//
// Everything this module puts on a record other than the anchor is
// evidence or enrichment, retained verbatim with its provenance and
// deliberately NOT fed back into the id. Team spellings, competition
// labels, venue text, the governed venue, the publisher evidence class
// and the member list can all change without moving a single id — which
// is the property that makes the identity usable by a later package.

import {
  IDENTITY_SCHEME,
  IDENTITY_VERSION,
  mintCanonicalEventIdentity,
  normaliseOccurrenceInstant,
} from "../canonical-event-identity/contract.mjs";

/** The provider namespace these fixtures were acquired from. */
export const PROVIDER_NAMESPACE = "GC_FOOTBALL";

/** What kind of occurrence a record in this layer describes. */
export const EVENT_TYPE = "FOOTBALL_FIXTURE";

/**
 * This layer is derived governed identity. It is not a production Event
 * store and nothing here is published; the lifecycle says so on every
 * record so the distinction cannot be lost downstream.
 */
export const LIFECYCLE_STATE = "DERIVED_GOVERNED_IDENTITY_NOT_PUBLISHED";

/**
 * How a canonical event is supported by its sources. A FACT about where
 * the corroborating records came from — NOT a score, not a ranking, and
 * never an input to identity.
 *
 * The predecessor measured 674 groups corroborated across two publishing
 * domains and 224 whose members all come from one club's own site (a
 * /matches page and a /tickets page, say). Both are correctly collapsed
 * into one occurrence, but only the first is independent corroboration,
 * and describing all 898 as "independently corroborated" would be false.
 * Keeping the class explicit on every record is what stops that claim
 * being made by accident later.
 */
export const EVIDENCE_CLASSES = new Set([
  "CROSS_PUBLISHER_CORROBORATED",
  "SAME_PUBLISHER_MULTI_SOURCE",
]);

/**
 * Why a reconciled group received no canonical identity. Every group
 * ends at exactly one canonical state — established, or withheld with
 * one of these reasons. Nothing is dropped silently.
 */
export const WITHHELD_REASONS = new Set([
  "NOT_RECONCILED_MULTI_SOURCE",
  "INSUFFICIENT_SOURCE_MULTIPLICITY",
  "MISSING_PLATFORM_MATCH_ID",
  "MISSING_OR_INVALID_KICKOFF",
  "CANONICAL_IDENTITY_CONFLICT_MATCH_ID_KICKOFF",
  "CANONICAL_IDENTITY_CONFLICT_RESOLVED_VENUE",
  "UPSTREAM_FACTUAL_CONFLICT",
]);

/** Every group ends at exactly one of these. */
export const CANONICAL_STATES = new Set([
  "CANONICAL_EVENT_ESTABLISHED",
  "CANONICAL_IDENTITY_WITHHELD",
]);

/** Refusal causes the core can report, mapped to this domain's vocabulary. */
const CAUSE_TO_REASON = {
  MISSING_PROVIDER_EVENT_KEY: "MISSING_PLATFORM_MATCH_ID",
  MISSING_PROVIDER_NAMESPACE: "MISSING_PLATFORM_MATCH_ID",
  MISSING_OCCURRENCE_INSTANT: "MISSING_OR_INVALID_KICKOFF",
  INVALID_OCCURRENCE_INSTANT: "MISSING_OR_INVALID_KICKOFF",
  CONFLICTING_OCCURRENCE_INSTANTS: "CANONICAL_IDENTITY_CONFLICT_MATCH_ID_KICKOFF",
};

const withheld = (group, reason, detail = null) => ({
  canonical_state: "CANONICAL_IDENTITY_WITHHELD",
  reconciliation_group_id: group.reconciliation_group_id ?? null,
  platform_match_id: group.platform_match_id ?? null,
  withheld_reason: reason,
  detail,
});

/** Stable member ordering. Identity never depends on it; output does. */
const compareRefs = (a, b) =>
  a.source_id.localeCompare(b.source_id) || a.source_record_id.localeCompare(b.source_record_id);

const sortedCopy = (values) => [...values].sort((a, b) => String(a).localeCompare(String(b)));

/**
 * The publisher evidence class for a group, from its own measured
 * publishing domains.
 */
export function evidenceClass(group) {
  const count = group.publisher_domain_count ?? (group.publisher_domains ?? []).length;
  return count > 1 ? "CROSS_PUBLISHER_CORROBORATED" : "SAME_PUBLISHER_MULTI_SOURCE";
}

/**
 * Is this reconciled group eligible for canonical occurrence identity?
 *
 * Eligibility is deliberately narrow. A single-source fixture is not
 * eligible in this package — one calendar asserting a fixture is not the
 * same evidential position as two agreeing, and the 3,239 single-source
 * match ids stay entirely outside this layer.
 */
export function eligibility(group) {
  if (group.reconciliation_state !== "RECONCILED_MULTI_SOURCE") {
    return { eligible: false, reason: "NOT_RECONCILED_MULTI_SOURCE" };
  }
  if (group.conflict != null) {
    return { eligible: false, reason: "UPSTREAM_FACTUAL_CONFLICT" };
  }
  const sourceCount = group.source_count ?? (group.source_ids ?? []).length;
  if (!(sourceCount >= 2)) {
    return { eligible: false, reason: "INSUFFICIENT_SOURCE_MULTIPLICITY" };
  }
  if (typeof group.platform_match_id !== "string" || group.platform_match_id.trim() === "") {
    return { eligible: false, reason: "MISSING_PLATFORM_MATCH_ID" };
  }
  // A venue disagreement is a disagreement about where the occurrence
  // happened. This layer does not pick a winner, and it will not assert
  // one occurrence over an unresolved factual contradiction.
  if (group.venue_evidence_state === "CONFLICTING_RESOLVED_VENUES") {
    return { eligible: false, reason: "CANONICAL_IDENTITY_CONFLICT_RESOLVED_VENUE" };
  }
  return { eligible: true };
}

/**
 * The instants this group's members assert. Taken from the retained
 * variants when present so that a disagreement is visible to the core
 * rather than pre-collapsed here.
 */
function occurrenceInstants(group) {
  const variants = Array.isArray(group.kickoff_variants) ? group.kickoff_variants : null;
  if (variants && variants.length > 0) return variants;
  return group.kickoff_utc == null ? [] : [group.kickoff_utc];
}

/**
 * Turn one reconciled fixture group into a canonical event record, or
 * withhold identity with a stated reason.
 *
 * Pure: it reads the group and returns a new object. The input group is
 * never mutated, and nothing outside this function's return value is
 * touched.
 */
export function canonicaliseGroup(group) {
  const eligible = eligibility(group);
  if (!eligible.eligible) return withheld(group, eligible.reason);

  const minted = mintCanonicalEventIdentity({
    providerNamespace: PROVIDER_NAMESPACE,
    providerEventKey: group.platform_match_id,
    occurrenceInstants: occurrenceInstants(group),
  });

  if (!minted.ok) {
    const reason = CAUSE_TO_REASON[minted.cause] ?? "UPSTREAM_FACTUAL_CONFLICT";
    return withheld(group, reason, minted.conflicting_instants ? { conflicting_instants: minted.conflicting_instants } : null);
  }

  const members = [...(group.members ?? [])].sort(compareRefs);
  const detail = [...(group.member_detail ?? [])].sort(compareRefs);
  const hasVenue = group.venue_evidence_state === "AGREED_BY_ALL_RESOLVED_MEMBERS" && group.reconciled_venue_census_id != null;

  return {
    canonical_state: "CANONICAL_EVENT_ESTABLISHED",

    /* ---- identity: derived from the anchor, and from nothing else ---- */
    canonical_event_id: minted.canonical_event_id,
    event_type: EVENT_TYPE,
    identity_scheme: minted.identity_scheme,
    identity_version: minted.identity_version,
    identity_anchor: minted.anchor,
    provider_namespace: PROVIDER_NAMESPACE,
    platform_match_id: group.platform_match_id,
    occurrence_instant_utc: minted.anchor.occurrence_instant_utc,
    is_future: group.is_future ?? null,

    /* ---- provenance: how this identity is supported ---- */
    reconciliation_group_id: group.reconciliation_group_id,
    reconciliation_state: group.reconciliation_state,
    source_observations: members,
    source_ids: sortedCopy(group.source_ids ?? []),
    publisher_domains: sortedCopy(group.publisher_domains ?? []),
    source_count: group.source_count ?? (group.source_ids ?? []).length,
    publisher_domain_count: group.publisher_domain_count ?? (group.publisher_domains ?? []).length,
    member_count: group.member_count ?? members.length,

    // A fact about the sources, not a confidence score.
    evidence_class: evidenceClass(group),

    /* ---- venue: enrichment, never identity ---- */
    venue_evidence_state: group.venue_evidence_state,
    governed_venue_census_id: hasVenue ? group.reconciled_venue_census_id : null,
    governed_venue_name: hasVenue ? group.reconciled_venue_name : null,
    governed_venue_city: hasVenue ? group.reconciled_venue_city : null,
    governed_venue_nation: hasVenue ? group.reconciled_venue_nation : null,
    venue_supported_by: [...(group.venue_supported_by ?? [])].sort(compareRefs),

    /* ---- participants and competition: retained, NOT canonicalised ----
     *
     * This package establishes occurrence identity only. It introduces no
     * club registry and no competition registry, and it chooses no
     * canonical spelling — not by majority vote, not by fuzzy matching,
     * not at all. Every spelling the sources published is kept verbatim
     * alongside the member that published it, and the canonical slots
     * below stay null because no governed identity for them exists in
     * this repository to link to.
     */
    home_team_variants: [...(group.home_team_variants ?? [])],
    away_team_variants: [...(group.away_team_variants ?? [])],
    competition_variants: [...(group.competition_variants ?? [])],
    source_venue_text_variants: [...(group.source_venue_text_variants ?? [])],
    home_or_away_variants: [...(group.home_or_away_variants ?? [])],
    canonical_home_club_id: null,
    canonical_away_club_id: null,
    canonical_competition_id: null,
    participant_identity_state: "UNRESOLVED_NO_GOVERNED_CLUB_IDENTITY",
    competition_identity_state: "UNRESOLVED_NO_GOVERNED_COMPETITION_IDENTITY",

    /* ---- per-member detail, so no claim is unattributable ---- */
    member_detail: detail,

    lifecycle_state: LIFECYCLE_STATE,
  };
}

/**
 * Canonicalise every reconciled group. Returns both outcomes separately
 * so that the accounting can prove each input ended at exactly one.
 *
 * Order in equals order out for the withheld list; established records
 * are sorted by canonical event id so the artifact is stable regardless
 * of input ordering.
 */
export function canonicaliseAll(groups) {
  const snapshot = JSON.stringify(groups);
  const established = [];
  const refused = [];

  for (const group of groups) {
    const result = canonicaliseGroup(group);
    if (result.canonical_state === "CANONICAL_EVENT_ESTABLISHED") established.push(result);
    else refused.push(result);
  }

  if (JSON.stringify(groups) !== snapshot) {
    throw new Error("STOP: the reconciliation groups were mutated");
  }

  established.sort((a, b) => a.canonical_event_id.localeCompare(b.canonical_event_id));
  refused.sort((a, b) => String(a.reconciliation_group_id).localeCompare(String(b.reconciliation_group_id)));

  return { established, withheld: refused };
}

export { IDENTITY_SCHEME, IDENTITY_VERSION, normaliseOccurrenceInstant };
