// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-EVENT-IDENTITY-01 — the generic
// canonical occurrence identity core.
//
// WHAT THIS ANSWERS, AND WHAT IT DOES NOT.
//
// docs/ARCHITECTURE.md defines an Event as "a canonical live music
// occurrence, resolved from one or more observations". Until now nothing
// in BeatMapped minted that identity: the reconciliation layer explicitly
// states it is "a precursor to canonical identity, not the thing itself",
// and docs/OBSERVATION_PIPELINE.md forbids an Observation from ever
// carrying `event_id`/`canonical_event_id`. This module is the first
// mechanism that mints one.
//
// It answers exactly one question:
//
//   Are these source records observations of the same underlying
//   occurrence?
//
// It does NOT answer "what is the one canonical spelling of every
// participant, competition or venue label?". Identity and enrichment are
// separate concerns, and conflating them is what makes an identity layer
// unstable: a corrected team name or an improved venue attribution would
// silently re-mint every id that depended on it.
//
// DOMAIN-NEUTRAL BY CONSTRUCTION.
//
// Nothing here knows about football. The anchor is (provider namespace,
// provider event key, occurrence instant) — a shape any major-event
// domain can supply. Football vocabulary lives entirely in
// ingestion/gc-football-canonical-events/.
//
// ON ARCHITECTURAL RULE 6.
//
// docs/ARCHITECTURE.md rule 6 says "Source-specific identifiers must
// never become the application's canonical identity scheme". A provider
// event key is a source-specific identifier, so the boundary matters and
// is drawn deliberately:
//
//   - The provider key is an INPUT to the derivation, never the identity.
//     No id this module mints is a source identifier, or contains one.
//   - The id is BeatMapped's own: its namespace and scheme version are
//     stated in the id itself, so the application owns the scheme and can
//     version it without any source's permission.
//   - The occurrence instant is carried alongside the key precisely so a
//     provider re-using or re-issuing a key is DETECTED as a conflict and
//     refused, rather than silently absorbed — which is the failure mode
//     rule 6 exists to prevent.
//
// What the rule does forbid, and what this module does not do, is publish
// the source's identifier as the application's identity. What it cannot
// forbid is deriving identity from retained evidence: the alternative is
// to invent identity from nothing, and this project forbids that harder.

import { createHash } from "node:crypto";

/**
 * The identity scheme version. It is part of the anchor AND of the id
 * prefix, so ids minted under a future scheme can never be mistaken for
 * these, and a scheme change is visible by inspection.
 */
export const IDENTITY_VERSION = "cev1";
export const IDENTITY_SCHEME = "CANONICAL_OCCURRENCE_ANCHOR_V1";

/**
 * Exactly what the identity is derived from. Stated here so the contract
 * is readable without reading the algorithm.
 */
export const IDENTITY_INPUTS = Object.freeze([
  "identity_version",
  "provider_namespace",
  "provider_event_key",
  "occurrence_instant_utc",
]);

/**
 * Deliberately excluded. Every one of these is mutable evidence or
 * enrichment: it can be corrected, improved or added to after an id
 * exists, and the id must not move when it is.
 */
export const IDENTITY_EXCLUSIONS = Object.freeze([
  "participant names and spellings",
  "competition name and spelling",
  "source venue text",
  "governed venue id",
  "venue evidence state",
  "source count",
  "publisher count",
  "publisher domains",
  "source urls",
  "member count and member ordering",
  "evidence class",
  "home/away labels",
  "research and generation timestamps",
]);

/** Why the core refused to mint an identity. Domain-neutral causes. */
export const IDENTITY_REFUSAL_CAUSES = new Set([
  "MISSING_PROVIDER_NAMESPACE",
  "MISSING_PROVIDER_EVENT_KEY",
  "MISSING_OCCURRENCE_INSTANT",
  "INVALID_OCCURRENCE_INSTANT",
  "CONFLICTING_OCCURRENCE_INSTANTS",
  "UPSTREAM_FACTUAL_CONFLICT",
  "INSUFFICIENT_CORROBORATION",
]);

/**
 * Normalise an occurrence instant to a single canonical UTC rendering.
 *
 * The same instant written with different equivalent offsets
 * ("2026-11-04T14:00:00Z", "2026-11-04T15:00:00+01:00") is ONE instant
 * and must yield ONE identity. Date parsing does that collapsing; this
 * function exists so the rule is stated in one place and tested
 * directly. It is the same normalisation the reconciliation layer
 * already applies, so the two layers agree on what "same kickoff" means.
 *
 * Returns null for anything that is not a usable instant. A null is a
 * refusal, never a substituted default — an unknown time is never
 * invented.
 */
export function normaliseOccurrenceInstant(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** The compact, stable rendering used in the readable part of an id. */
export function instantStamp(normalisedInstant) {
  return normalisedInstant.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Escape one anchor component so that joining components with "|" is
 * injective. Without this, a provider key containing a separator could
 * make two different anchors serialise identically — precisely the
 * silent aliasing this layer exists to prevent.
 */
function escapeComponent(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** A readable, stable slug for a provider namespace. */
export function providerSlug(providerNamespace) {
  return String(providerNamespace)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the identity anchor, or refuse with a stated cause.
 *
 * `occurrenceInstants` is a collection because real input arrives as
 * several source records: if they do not agree on the instant, this is
 * not one occurrence and no identity may be minted. That refusal is the
 * whole point of carrying the instant in the key — the provider key
 * alone would absorb the disagreement silently.
 */
export function buildIdentityAnchor({ providerNamespace, providerEventKey, occurrenceInstants }) {
  if (typeof providerNamespace !== "string" || providerNamespace.trim() === "") {
    return { ok: false, cause: "MISSING_PROVIDER_NAMESPACE" };
  }
  if (typeof providerEventKey !== "string" || providerEventKey.trim() === "") {
    return { ok: false, cause: "MISSING_PROVIDER_EVENT_KEY" };
  }

  const raw = Array.isArray(occurrenceInstants) ? occurrenceInstants : [occurrenceInstants];
  const present = raw.filter((value) => typeof value === "string" && value.trim() !== "");
  if (present.length === 0) return { ok: false, cause: "MISSING_OCCURRENCE_INSTANT" };
  if (present.length !== raw.length) return { ok: false, cause: "MISSING_OCCURRENCE_INSTANT" };

  const normalised = present.map(normaliseOccurrenceInstant);
  if (normalised.some((value) => value === null)) return { ok: false, cause: "INVALID_OCCURRENCE_INSTANT" };

  // Set membership, not array order: the same instants in any order are
  // the same agreement.
  const distinct = [...new Set(normalised)].sort();
  if (distinct.length > 1) {
    return { ok: false, cause: "CONFLICTING_OCCURRENCE_INSTANTS", conflicting_instants: distinct };
  }

  return {
    ok: true,
    anchor: {
      identity_version: IDENTITY_VERSION,
      provider_namespace: providerNamespace,
      provider_event_key: providerEventKey,
      occurrence_instant_utc: distinct[0],
    },
  };
}

/**
 * The exact string the id digests. Serialised explicitly rather than via
 * JSON.stringify so the identity can never drift with an object's key
 * insertion order.
 */
export function anchorString(anchor) {
  return [
    anchor.identity_version,
    anchor.provider_namespace,
    anchor.provider_event_key,
    anchor.occurrence_instant_utc,
  ]
    .map(escapeComponent)
    .join("|");
}

/**
 * The canonical event id.
 *
 *   cev1-<provider slug>-<instant stamp>-<96-bit digest of the anchor>
 *
 * Readable enough to diagnose at a glance — scheme version, provider and
 * occurrence instant are all visible, matching the repository's existing
 * preference for legible derived ids (`gcf-<match id>-<stamp>`) — while
 * the digest keeps the id collision-resistant for a provider key of any
 * shape or length.
 *
 * Deterministic in the strict sense: a pure function of the anchor, with
 * no counter, no ordering input and no wall clock.
 */
export function canonicalEventId(anchor) {
  const digest = createHash("sha256").update(anchorString(anchor), "utf8").digest("hex").slice(0, 24);
  const slug = providerSlug(anchor.provider_namespace);
  return `${anchor.identity_version}-${slug}-${instantStamp(anchor.occurrence_instant_utc)}-${digest}`;
}

/**
 * Mint an identity from raw inputs, or refuse. The single entry point a
 * domain adapter should use.
 */
export function mintCanonicalEventIdentity(inputs) {
  const built = buildIdentityAnchor(inputs);
  if (!built.ok) return built;
  return {
    ok: true,
    anchor: built.anchor,
    canonical_event_id: canonicalEventId(built.anchor),
    identity_scheme: IDENTITY_SCHEME,
    identity_version: IDENTITY_VERSION,
  };
}
