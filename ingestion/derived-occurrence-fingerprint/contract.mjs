// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-IDENTITY-ARCHITECTURE-CONFORMANCE-01
// — the generic derived occurrence fingerprint core.
//
// WHAT THIS IS, STATED PLAINLY.
//
// It answers exactly one question:
//
//   Are these source records observations of the same underlying
//   occurrence, according to the provider that published them?
//
// The answer is a DERIVED OCCURRENCE FINGERPRINT: a deterministic,
// evidence-derived, collision-audited anchor over retained source
// evidence. It is NOT the application's canonical entity identity, and
// this module mints no Event.
//
// WHY IT IS NOT CANONICAL ENTITY IDENTITY — RULE 6.
//
// docs/ARCHITECTURE.md rule 6: "Source-specific identifiers must never
// become the application's canonical identity scheme."
//
// The fingerprint is a pure function of
// (scheme version, provider namespace, provider event key, instant).
// The provider event key is a source-specific identifier, and the
// dependency is real and unhidden: change the provider key and the
// fingerprint changes. Digesting the anchor hides the key from view; it
// does not remove the functional dependency, and this module does not
// pretend otherwise. An identity that re-mints because a provider
// renumbered its own records is not an identity the application owns.
//
// That is measurably unlike how BeatMapped mints canonical identity
// everywhere else. createVenueId() (ingestion/venue/contract.mjs) derives
// "venue-<city>-<name>" from the venue's OWN attributes;
// createArtistId() derives "artist-<name>" the same way; a Source id is
// an application slug the registry schema calls "independent of its
// URL". Provider keys are kept OUT of those ids and live in an
// evidence-bearing lookup table (venues/source-venue-mappings.json maps
// AgendaLX's own "3780" TO venue-lisboa-casa-capitao). If AgendaLX
// renumbered 3780, the canonical venue id would not move. That is what
// rule 6 protects, and a provider-keyed digest cannot offer it.
//
// So the fingerprint stays what the evidence supports: a reconciliation
// anchor, useful precisely because it is stable against enrichment, and
// honest about being provider-scoped.
//
// WHAT IT IS STILL GOOD FOR.
//
// It is stable under everything mutable — a later source joining the
// group, a corrected team spelling, an improved venue attribution, a
// reordering of members. That property is what a later, governed
// canonical-entity admission step will need as INPUT. Identity and
// enrichment stay separate concerns here, which is the reason this layer
// is worth keeping.
//
// DOMAIN-NEUTRAL BY CONSTRUCTION.
//
// Nothing here knows about football. The anchor is (provider namespace,
// provider event key, occurrence instant) — a shape any domain can
// supply. Football vocabulary lives entirely in
// ingestion/gc-football-occurrence-fingerprints/.
//
// POSTPONEMENT.
//
// The instant is part of the anchor, so a fixture that moves produces a
// DIFFERENT fingerprint. Under this terminology that is correct and not
// a defect: a changed occurrence instant is a changed occurrence
// fingerprint. It is emphatically NOT permanent entity identity across
// postponement, and no supersession is implemented here. Carrying an
// entity across a rescheduled kickoff is a requirement for the later
// canonical-entity package, recorded and deliberately not faked.

import { createHash } from "node:crypto";

/**
 * The fingerprint scheme version. It is part of the anchor AND of the
 * value's prefix, so fingerprints derived under a future scheme can never
 * be mistaken for these, and a scheme change is visible by inspection.
 */
export const FINGERPRINT_VERSION = "dof1";
export const FINGERPRINT_SCHEME = "DERIVED_OCCURRENCE_FINGERPRINT_V1";

/**
 * Exactly what the fingerprint is derived from. Stated here so the
 * contract is readable without reading the algorithm. Note the third
 * entry: the dependency on a provider-specific key is declared, not
 * buried.
 */
export const FINGERPRINT_INPUTS = Object.freeze([
  "fingerprint_version",
  "provider_namespace",
  "provider_event_key",
  "occurrence_instant_utc",
]);

/**
 * Deliberately excluded. Every one of these is mutable evidence or
 * enrichment: it can be corrected, improved or added to after a
 * fingerprint exists, and the fingerprint must not move when it is.
 */
export const FINGERPRINT_EXCLUSIONS = Object.freeze([
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
export const FINGERPRINT_REFUSAL_CAUSES = new Set([
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
 * Build the fingerprint anchor, or refuse with a stated cause.
 *
 * `occurrenceInstants` is a collection because real input arrives as
 * several source records: if they do not agree on the instant, this is
 * not one occurrence and no identity may be minted. That refusal is the
 * whole point of carrying the instant in the key — the provider key
 * alone would absorb the disagreement silently.
 */
export function buildFingerprintAnchor({ providerNamespace, providerEventKey, occurrenceInstants }) {
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
      fingerprint_version: FINGERPRINT_VERSION,
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
    anchor.fingerprint_version,
    anchor.provider_namespace,
    anchor.provider_event_key,
    anchor.occurrence_instant_utc,
  ]
    .map(escapeComponent)
    .join("|");
}

/**
 * The derived occurrence fingerprint.
 *
 *   dof1-<provider slug>-<instant stamp>-<96-bit digest of the anchor>
 *
 * Readable enough to diagnose at a glance — scheme version, provider and
 * occurrence instant are all visible, matching the repository's existing
 * preference for legible derived values (`gcf-<match id>-<stamp>`) —
 * while the digest keeps it collision-resistant for a provider key of any
 * shape or length. The digest is for collision resistance and legibility,
 * NOT a claim that the provider dependency has been removed.
 *
 * Deterministic in the strict sense: a pure function of the anchor, with
 * no counter, no ordering input and no wall clock.
 */
export function occurrenceFingerprint(anchor) {
  const digest = createHash("sha256").update(anchorString(anchor), "utf8").digest("hex").slice(0, 24);
  const slug = providerSlug(anchor.provider_namespace);
  return `${anchor.fingerprint_version}-${slug}-${instantStamp(anchor.occurrence_instant_utc)}-${digest}`;
}

/**
 * Derive a fingerprint from raw inputs, or refuse with a stated cause.
 * The single entry point a domain adapter should use. It returns no
 * application entity id, because this layer establishes none.
 */
export function deriveOccurrenceFingerprint(inputs) {
  const built = buildFingerprintAnchor(inputs);
  if (!built.ok) return built;
  return {
    ok: true,
    anchor: built.anchor,
    occurrence_fingerprint: occurrenceFingerprint(built.anchor),
    fingerprint_scheme: FINGERPRINT_SCHEME,
    fingerprint_version: FINGERPRINT_VERSION,
  };
}
