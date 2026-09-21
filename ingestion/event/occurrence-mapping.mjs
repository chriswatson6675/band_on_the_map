// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — the evidence-bearing
// Event-to-occurrence mapping.
//
// docs/ARCHITECTURE.md rule 7: "An Observation never carries an Event
// identity: the Event-to-Observation relationship is recorded outside the
// Observation, in an evidence-bearing mapping." This module is that
// mapping.
//
// It follows the repository's established precedent exactly.
// venues/source-venue-mappings.json maps AgendaLX's own "3780" TO
// venue-lisboa-casa-capitao — explicit, non-fuzzy, evidence-carrying, and
// keeping the provider's identifier OUT of the canonical id.
// artists/event-artist-links.json does the same for artists. This is the
// third instance of that pattern, not a new idea.
//
// WHAT A BASIS IS, AND IS NOT.
//
// A basis states WHAT evidence linked this Event. It does NOT state that
// the evidence was sufficient. Whether two publishers are needed, whether
// a single trusted venue calendar is enough, whether same-publisher
// duplicates count — all of that is admission POLICY, decided by the
// caller in a later package. Encoding a threshold here would bake one
// domain's answer into a domain-neutral foundation.

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/**
 * What kind of evidence links an Event to the occurrence records that
 * describe it. Only the three the current architecture genuinely needs:
 *
 *   PROVIDER_FINGERPRINT - a derived occurrence fingerprint over a
 *                          provider's own event key (the football estate's
 *                          dof1-… anchors).
 *   MUSIC_ASSOCIATION    - several Observations associated as one
 *                          occurrence with no provider key at all, which
 *                          is the only shape music evidence has.
 *   SINGLE_OBSERVATION   - exactly one Observation.
 */
export const BASIS_KINDS = new Set([
  "PROVIDER_FINGERPRINT",
  "MUSIC_ASSOCIATION",
  "SINGLE_OBSERVATION",
]);

/**
 * ACTIVE evidence is the current linkage and is what conflict checks
 * consider. SUPERSEDED evidence is retained, never deleted: it is how a
 * fixture's pre-postponement fingerprint stays traceable after the
 * occurrence moves.
 */
export const MAPPING_LIFECYCLES = new Set(["ACTIVE", "SUPERSEDED"]);

const EVENT_ID_PATTERN =
  /^event-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A stable reference to one source Observation. */
export function observationRef(sourceId, sourceRecordId) {
  return { source_id: sourceId, source_record_id: sourceRecordId };
}

const refKey = (ref) => `${ref.source_id}||${ref.source_record_id}`;

/**
 * The idempotency key for one mapping — what makes a replay recognisable
 * as the same linkage rather than a second one.
 *
 * It is derived entirely from the CALLER'S OWN evidence association. This
 * foundation performs no fuzzy matching and invents no similarity rule:
 * if the caller says these records are that occurrence, that statement is
 * the key.
 */
export function mappingIdentityKey(mapping) {
  if (mapping?.basis_kind === "PROVIDER_FINGERPRINT") {
    return `PROVIDER_FINGERPRINT::${mapping.fingerprint}`;
  }
  const refs = (mapping?.observations ?? []).map(refKey).sort();
  return `${mapping?.basis_kind}::${refs.join("|")}`;
}

/** Build one mapping record. Throws if it fails validateOccurrenceMapping(). */
export function createOccurrenceMapping(fields) {
  const mapping = {
    event_id: fields.event_id ?? null,
    basis_kind: fields.basis_kind ?? null,
    fingerprint: fields.fingerprint ?? null,
    observations: fields.observations ?? [],
    method: fields.method ?? null,
    evidence: fields.evidence ?? [],
    decided_at: fields.decided_at ?? null,
    lifecycle: fields.lifecycle ?? "ACTIVE",
    superseded_reason: fields.superseded_reason ?? null,
  };

  const errors = validateOccurrenceMapping(mapping);
  if (errors.length > 0) {
    throw new Error(`Invalid occurrence mapping: ${errors.join("; ")}`);
  }

  return mapping;
}

/** Return an array of validation error strings (empty if valid). */
export function validateOccurrenceMapping(mapping) {
  const errors = [];

  // An event_id must LOOK like an application-issued Event id. This is
  // the mechanical guard behind rule 6: a provider's own identifier or a
  // dof1-… fingerprint can never be written here as the Event identity,
  // because neither matches the pattern.
  if (typeof mapping?.event_id !== "string" || !EVENT_ID_PATTERN.test(mapping.event_id)) {
    errors.push("event_id must be an application-issued Event id (a provider id or fingerprint is never an Event id)");
  }

  if (!BASIS_KINDS.has(mapping?.basis_kind)) {
    errors.push(`basis_kind must be one of ${[...BASIS_KINDS].join(", ")}`);
  }

  if (!Array.isArray(mapping?.observations)) {
    errors.push("observations must be an array");
  } else {
    mapping.observations.forEach((ref, index) => {
      if (!isNonEmptyString(ref?.source_id)) errors.push(`observations[${index}].source_id is required`);
      if (!isNonEmptyString(ref?.source_record_id)) errors.push(`observations[${index}].source_record_id is required`);
    });

    const seen = new Set();
    for (const ref of mapping.observations) {
      if (!isNonEmptyString(ref?.source_id) || !isNonEmptyString(ref?.source_record_id)) continue;
      const key = refKey(ref);
      if (seen.has(key)) errors.push(`observations contains "${key}" more than once`);
      seen.add(key);
    }
  }

  const refCount = Array.isArray(mapping?.observations) ? mapping.observations.length : 0;

  if (mapping?.basis_kind === "PROVIDER_FINGERPRINT" && !isNonEmptyString(mapping?.fingerprint)) {
    errors.push("a PROVIDER_FINGERPRINT mapping requires a non-empty fingerprint");
  }

  // A music association has no provider key — that is the whole reason
  // the basis exists — so a fingerprint is not required. What IS required
  // is that it actually associates: a single record is SINGLE_OBSERVATION.
  // This is a structural rule about what the word means, not an evidence
  // threshold.
  if (mapping?.basis_kind === "MUSIC_ASSOCIATION" && refCount < 2) {
    errors.push("a MUSIC_ASSOCIATION maps two or more Observations (use SINGLE_OBSERVATION for one)");
  }

  if (mapping?.basis_kind === "SINGLE_OBSERVATION" && refCount !== 1) {
    errors.push("a SINGLE_OBSERVATION maps exactly one Observation");
  }

  if (mapping?.fingerprint !== null && !isNonEmptyString(mapping?.fingerprint)) {
    errors.push("fingerprint must be a non-empty string or null");
  }

  if (!isNonEmptyString(mapping?.method)) errors.push("method is required");
  if (!Array.isArray(mapping?.evidence)) errors.push("evidence must be an array");
  if (!isNonEmptyString(mapping?.decided_at)) errors.push("decided_at is required");

  if (!MAPPING_LIFECYCLES.has(mapping?.lifecycle)) {
    errors.push(`lifecycle must be one of ${[...MAPPING_LIFECYCLES].join(", ")}`);
  }

  // Superseded evidence keeps its provenance AND says why it was
  // superseded. Retiring evidence without a reason destroys the audit
  // trail that makes a bad merge correctable.
  if (mapping?.lifecycle === "SUPERSEDED" && !isNonEmptyString(mapping?.superseded_reason)) {
    errors.push("a SUPERSEDED mapping must state superseded_reason");
  }
  if (mapping?.lifecycle === "ACTIVE" && mapping?.superseded_reason !== null) {
    errors.push("an ACTIVE mapping must not carry superseded_reason");
  }

  return errors;
}

/** The currently-active mappings, which are the reviewable linkage. */
export function activeMappings(mappings) {
  return (mappings ?? []).filter((mapping) => mapping?.lifecycle === "ACTIVE");
}

/** The active mapping matching an idempotency key, if any. */
export function findActiveByIdentityKey(mappings, key) {
  return activeMappings(mappings).find((mapping) => mappingIdentityKey(mapping) === key) ?? null;
}

/**
 * Validate a whole mapping registry, including the invariant that one
 * piece of active evidence never points at two different Events. That is
 * the condition under which an id would silently split an occurrence in
 * two, so it is a registry-level error rather than a caller's problem.
 */
export function validateOccurrenceMappingRegistry(mappings, { knownEventIds = null } = {}) {
  const errors = [];

  if (!Array.isArray(mappings)) return ["mappings must be an array"];

  mappings.forEach((mapping, index) => {
    for (const error of validateOccurrenceMapping(mapping)) errors.push(`mappings[${index}]: ${error}`);
  });

  if (knownEventIds) {
    mappings.forEach((mapping, index) => {
      if (typeof mapping?.event_id !== "string") return;
      if (!knownEventIds.has(mapping.event_id)) {
        errors.push(`mappings[${index}]: event_id "${mapping.event_id}" does not reference a known Event`);
      }
    });
  }

  const activeByKey = new Map();
  mappings.forEach((mapping, index) => {
    if (mapping?.lifecycle !== "ACTIVE") return;
    if (validateOccurrenceMapping(mapping).length > 0) return;
    const key = mappingIdentityKey(mapping);
    const previous = activeByKey.get(key);
    if (previous && previous.event_id !== mapping.event_id) {
      errors.push(
        `mappings[${index}]: active evidence "${key}" maps to "${mapping.event_id}" but mappings[${previous.index}] maps the same evidence to "${previous.event_id}"`,
      );
    } else if (previous) {
      errors.push(`mappings[${index}]: duplicate active evidence "${key}" (first seen at mappings[${previous.index}])`);
    } else {
      activeByKey.set(key, { index, event_id: mapping.event_id });
    }
  });

  return errors;
}
