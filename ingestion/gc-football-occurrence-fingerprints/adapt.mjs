// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-IDENTITY-ARCHITECTURE-CONFORMANCE-01
// — the football adapter onto the generic derived occurrence fingerprint
// core.
//
// This is the ONLY football-aware part of the fingerprint layer. It
// translates one reconciled fixture group into the domain-neutral anchor
// the core understands, decides eligibility, and assembles the derived
// occurrence record. The core
// (ingestion/derived-occurrence-fingerprint/contract.mjs) never learns
// what a fixture, a club or a competition is.
//
// NO BEATMAPPED EVENT IS CREATED HERE — AND NONE IS DENIED EITHER.
//
// This layer answers exactly one question: what occurrence evidence do we
// have? It does not answer whether the application has admitted a
// canonical Event for that evidence, and a record here states nothing
// either way.
//
// That restraint is deliberate and load-bearing. A record that said
// "not admitted" would be a claim about the CURRENT contents of
// events/event-state.json, and it would silently become false the moment
// a later package admits one — forcing this reproducible evidence
// artifact to be regenerated because downstream application state
// changed, which is precisely backwards. Evidence is what the sources
// said; it does not move when the application makes a decision about it.
//
// So the dependency runs one way only:
//
//   fingerprint evidence  ->  may later be consumed by Event admission
//
// and never the reverse. This module reads no Event state, imports no
// Event module, and would derive byte-identical output against an empty
// registry and a fully-admitted one alike.
//
// THE LINKAGE LIVES DOWNSTREAM.
//
// The one authoritative statement of "which canonical Event, if any, this
// fingerprint belongs to" is events/event-state.json's
// `event_occurrence_mappings`, where a mapping carries the fingerprint as
// evidence alongside an application-issued event_id. Ask that file, never
// this one.
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
  FINGERPRINT_SCHEME,
  FINGERPRINT_VERSION,
  deriveOccurrenceFingerprint,
  normaliseOccurrenceInstant,
} from "../derived-occurrence-fingerprint/contract.mjs";

/** The provider namespace these fixtures were acquired from. */
export const PROVIDER_NAMESPACE = "GC_FOOTBALL";

/** What kind of occurrence a record in this layer describes. */
export const OCCURRENCE_TYPE = "FOOTBALL_FIXTURE";

/**
 * What KIND of thing a record in this layer is — permanently.
 *
 * It says: this record is a derived evidence anchor, not a canonical
 * Event entity. That is a fact about the record's own nature and is true
 * forever, before any admission and after every admission.
 *
 * It does NOT mean "no canonical Event exists for this occurrence". A
 * fingerprint that has been admitted, attached to, superseded or merged
 * downstream is still a derived evidence anchor and still carries this
 * exact value. Nothing downstream can falsify it, which is why it is safe
 * to store here.
 */
export const LIFECYCLE_STATE = "DERIVED_EVIDENCE_ANCHOR_NOT_AN_ENTITY";

/**
 * How a fingerprinted occurrence is supported by its sources. A FACT about where
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
 * Why a reconciled group received no fingerprint. Every group ends at
 * exactly one fingerprint state — established, or withheld with one of
 * these reasons. Nothing is dropped silently.
 */
export const WITHHELD_REASONS = new Set([
  "NOT_RECONCILED_MULTI_SOURCE",
  "INSUFFICIENT_SOURCE_MULTIPLICITY",
  "MISSING_PLATFORM_MATCH_ID",
  "MISSING_OR_INVALID_KICKOFF",
  "FINGERPRINT_CONFLICT_MATCH_ID_KICKOFF",
  "FINGERPRINT_CONFLICT_RESOLVED_VENUE",
  "UPSTREAM_FACTUAL_CONFLICT",
]);

/** Every group ends at exactly one of these. */
export const FINGERPRINT_STATES = new Set([
  "OCCURRENCE_FINGERPRINT_ESTABLISHED",
  "OCCURRENCE_FINGERPRINT_WITHHELD",
]);

/** Refusal causes the core can report, mapped to this domain's vocabulary. */
const CAUSE_TO_REASON = {
  MISSING_PROVIDER_EVENT_KEY: "MISSING_PLATFORM_MATCH_ID",
  MISSING_PROVIDER_NAMESPACE: "MISSING_PLATFORM_MATCH_ID",
  MISSING_OCCURRENCE_INSTANT: "MISSING_OR_INVALID_KICKOFF",
  INVALID_OCCURRENCE_INSTANT: "MISSING_OR_INVALID_KICKOFF",
  CONFLICTING_OCCURRENCE_INSTANTS: "FINGERPRINT_CONFLICT_MATCH_ID_KICKOFF",
};

const withheld = (group, reason, detail = null) => ({
  fingerprint_state: "OCCURRENCE_FINGERPRINT_WITHHELD",
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
 * Is this reconciled group eligible for a derived occurrence fingerprint?
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
    return { eligible: false, reason: "FINGERPRINT_CONFLICT_RESOLVED_VENUE" };
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
 * Turn one reconciled fixture group into a derived occurrence record, or
 * withhold a fingerprint with a stated reason.
 *
 * Pure: it reads the group and returns a new object. The input group is
 * never mutated, and nothing outside this function's return value is
 * touched.
 */
export function fingerprintGroup(group) {
  const eligible = eligibility(group);
  if (!eligible.eligible) return withheld(group, eligible.reason);

  const minted = deriveOccurrenceFingerprint({
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
    fingerprint_state: "OCCURRENCE_FINGERPRINT_ESTABLISHED",

    /* ---- fingerprint: derived from the anchor, and nothing else ----
     *
     * A provider-scoped evidence anchor, never the application's
     * canonical entity id (rule 6). There is deliberately no slot here
     * for an event id or an admission state: a record must not carry a
     * field whose truth depends on what events/event-state.json happens
     * to contain right now. See this module's header.
     */
    occurrence_fingerprint: minted.occurrence_fingerprint,
    occurrence_type: OCCURRENCE_TYPE,
    fingerprint_scheme: minted.fingerprint_scheme,
    fingerprint_version: minted.fingerprint_version,
    fingerprint_anchor: minted.anchor,
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
 * are sorted by occurrence fingerprint so the artifact is stable regardless
 * of input ordering.
 */
export function fingerprintAll(groups) {
  const snapshot = JSON.stringify(groups);
  const established = [];
  const refused = [];

  for (const group of groups) {
    const result = fingerprintGroup(group);
    if (result.fingerprint_state === "OCCURRENCE_FINGERPRINT_ESTABLISHED") established.push(result);
    else refused.push(result);
  }

  if (JSON.stringify(groups) !== snapshot) {
    throw new Error("STOP: the reconciliation groups were mutated");
  }

  established.sort((a, b) => a.occurrence_fingerprint.localeCompare(b.occurrence_fingerprint));
  refused.sort((a, b) => String(a.reconciliation_group_id).localeCompare(String(b.reconciliation_group_id)));

  return { established, withheld: refused };
}

export { FINGERPRINT_SCHEME, FINGERPRINT_VERSION, normaliseOccurrenceInstant };
