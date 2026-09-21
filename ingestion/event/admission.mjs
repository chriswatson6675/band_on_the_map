// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — the governed
// admission primitive.
//
// docs/ARCHITECTURE.md rule 1: Observations "may later be admitted to
// canonical Events through a governed, evidence-recorded admission step".
// This is that step, and it is the ONLY place in the repository where an
// Event id is minted.
//
// WHAT THIS DOES NOT DECIDE.
//
// Admission does not judge whether the evidence was good enough. It does
// not know whether two publishers are required, whether a single trusted
// venue calendar suffices, whether the football estate's 674
// cross-publisher groups qualify and its 224 same-publisher ones do not,
// or which music sources may admit on one Observation. Every one of those
// is admission POLICY and belongs to a later, domain-aware package.
//
// The caller arrives having already made that governed decision and says
// so in `method`. This module's job is narrower and entirely mechanical:
// validate the request, mint exactly one id, record the evidence that
// justified it, assert the initial schedule, validate the whole
// prospective state, and persist it atomically — or refuse.
//
// DOMAIN-NEUTRAL BY CONSTRUCTION. Nothing here branches on football or
// music. A SPORT/FOOTBALL_FIXTURE request and a MUSIC/GIG request take
// exactly the same path.

import { createEvent, createEventId, validateAdmissionBasis } from "./contract.mjs";
import {
  createOccurrenceMapping,
  findActiveByIdentityKey,
  mappingIdentityKey,
  validateOccurrenceMapping,
} from "./occurrence-mapping.mjs";
import { createScheduleAssertion } from "./schedule-history.mjs";
import { readValidatedState, writeState } from "./registry.mjs";

/**
 * An admission that found the evidence already linked reports
 * ALREADY_ADMITTED and mints nothing. A replay is not an error — it is
 * the normal outcome of re-running a deterministic pipeline.
 */
export const ADMISSION_OUTCOMES = new Set(["ADMITTED", "ALREADY_ADMITTED"]);
export const ATTACHMENT_OUTCOMES = new Set(["ATTACHED", "ALREADY_ATTACHED"]);

/** Raised when evidence would have to mean two contradictory things at once. */
export class EventAdmissionConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "EventAdmissionConflictError";
    this.details = details;
  }
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Validate the caller's request shape before anything is minted. The
 * Event fields themselves are validated by createEvent() once an id
 * exists; this checks what must be true to get that far.
 */
function validateRequest(request) {
  const errors = [];

  if (request === null || typeof request !== "object") return ["an admission request object is required"];

  if (request.event === null || typeof request.event !== "object") {
    errors.push("request.event is required");
  }
  if (request.basis === null || typeof request.basis !== "object") {
    errors.push("request.basis is required");
  } else {
    // The basis is validated as a full mapping below, once event_id is
    // known; here only what is knowable without one.
    if (!isNonEmptyString(request.basis.method)) errors.push("request.basis.method is required");
    if (!isNonEmptyString(request.basis.basis_kind)) errors.push("request.basis.basis_kind is required");
  }
  if (!isNonEmptyString(request.admitted_at)) {
    errors.push("request.admitted_at is required (the caller supplies the time; this module reads no clock)");
  }
  if (request?.event?.event_id !== undefined && request?.event?.event_id !== null) {
    // Minting is this module's job alone. A caller supplying an id would
    // mean an Event identity came from somewhere ungoverned.
    errors.push("request.event.event_id must not be supplied — admission mints it");
  }

  return errors;
}

/** Build the mapping record for a request, now that an event_id exists. */
function mappingFor(request, eventId) {
  return createOccurrenceMapping({
    event_id: eventId,
    basis_kind: request.basis.basis_kind,
    fingerprint: request.basis.fingerprint ?? null,
    observations: request.basis.observations ?? [],
    method: request.basis.method,
    evidence: request.basis.evidence ?? [],
    decided_at: request.basis.decided_at ?? request.admitted_at,
    lifecycle: "ACTIVE",
  });
}

/**
 * Admit one occurrence to a canonical Event.
 *
 *   request.event        - the Event fields, WITHOUT an event_id
 *   request.basis        - the evidence mapping: basis_kind, method, and
 *                          fingerprint/observations as that kind requires
 *   request.admitted_at  - caller-supplied timestamp
 *
 * Options: `root` (registry location), `uuid` (injectable id generator
 * for deterministic tests).
 *
 * Returns { outcome, event, mapping, schedule_assertion }.
 */
export async function admitEvent(request, { root, uuid } = {}) {
  const requestErrors = validateRequest(request);
  if (requestErrors.length > 0) {
    throw new Error(`Invalid admission request: ${requestErrors.join("; ")}`);
  }

  // Fail-closed (Phase 6): an existing state that does not validate stops
  // here, before any idempotency lookup or mint is even attempted.
  const state = await readValidatedState(root ? { root } : {});

  // Idempotency. The key is derived purely from the caller's own evidence
  // association — no fuzzy matching, no similarity rule, no guessing that
  // two occurrences "look like" the same one.
  const probe = {
    basis_kind: request.basis.basis_kind,
    fingerprint: request.basis.fingerprint ?? null,
    observations: request.basis.observations ?? [],
  };
  const identityKey = mappingIdentityKey(probe);
  const existing = findActiveByIdentityKey(state.mappings, identityKey);

  if (existing) {
    const event = state.events.find((candidate) => candidate.event_id === existing.event_id) ?? null;
    if (!event) {
      throw new EventAdmissionConflictError(
        `active evidence "${identityKey}" maps to unknown Event "${existing.event_id}"`,
        { identity_key: identityKey, event_id: existing.event_id },
      );
    }
    return {
      outcome: "ALREADY_ADMITTED",
      event,
      mapping: existing,
      schedule_assertion:
        state.scheduleHistory.find(
          (assertion) => assertion.event_id === event.event_id && assertion.lifecycle === "CURRENT",
        ) ?? null,
    };
  }

  const eventId = createEventId(uuid ? { uuid } : {});

  const event = createEvent({
    ...request.event,
    event_id: eventId,
    admitted_at: request.admitted_at,
    admission_basis: { basis_kind: request.basis.basis_kind, method: request.basis.method },
  });

  const mapping = mappingFor(request, eventId);

  const scheduleAssertion = createScheduleAssertion({
    event_id: eventId,
    start: event.start,
    end: event.end,
    status: event.status,
    asserted_by: { basis_kind: request.basis.basis_kind, method: request.basis.method },
    asserted_at: request.admitted_at,
    lifecycle: "CURRENT",
  });

  const nextState = {
    events: [...state.events, event],
    mappings: [...state.mappings, mapping],
    scheduleHistory: [...state.scheduleHistory, scheduleAssertion],
  };

  // Validates the COMPLETE prospective state, then writes it as one
  // atomic commit. An invalid admission never reaches the filesystem.
  await writeState(nextState, root ? { root } : {});

  return { outcome: "ADMITTED", event, mapping, schedule_assertion: scheduleAssertion };
}

/**
 * Attach further governed evidence to an EXISTING Event without minting a
 * new id — the second provider observing a football fixture, or another
 * music source corroborating a gig.
 *
 * The CALLER states which Event the evidence belongs to. This module
 * performs no cross-provider matching of its own; inventing one would be
 * exactly the fuzzy entity resolution the repository forbids.
 *
 *   request.event_id     - the existing Event
 *   request.basis        - the evidence mapping
 *   request.attached_at  - caller-supplied timestamp
 *
 * Returns { outcome, event, mapping }.
 */
export async function attachOccurrenceEvidence(request, { root } = {}) {
  if (request === null || typeof request !== "object") {
    throw new Error("Invalid attachment request: an object is required");
  }
  if (!isNonEmptyString(request.event_id)) {
    throw new Error("Invalid attachment request: request.event_id is required");
  }
  if (request.basis === null || typeof request.basis !== "object") {
    throw new Error("Invalid attachment request: request.basis is required");
  }
  if (!isNonEmptyString(request.attached_at)) {
    throw new Error("Invalid attachment request: request.attached_at is required");
  }

  // Fail-closed (Phase 6): an existing state that does not validate stops
  // here, before this Event is even looked up.
  const state = await readValidatedState(root ? { root } : {});

  const event = state.events.find((candidate) => candidate.event_id === request.event_id) ?? null;
  if (!event) {
    throw new Error(`Cannot attach evidence: no Event "${request.event_id}"`);
  }

  const mapping = createOccurrenceMapping({
    event_id: request.event_id,
    basis_kind: request.basis.basis_kind,
    fingerprint: request.basis.fingerprint ?? null,
    observations: request.basis.observations ?? [],
    method: request.basis.method,
    evidence: request.basis.evidence ?? [],
    decided_at: request.basis.decided_at ?? request.attached_at,
    lifecycle: "ACTIVE",
  });

  const mappingErrors = validateOccurrenceMapping(mapping);
  if (mappingErrors.length > 0) {
    throw new Error(`Invalid evidence mapping: ${mappingErrors.join("; ")}`);
  }

  const identityKey = mappingIdentityKey(mapping);
  const existing = findActiveByIdentityKey(state.mappings, identityKey);

  if (existing) {
    // Exact replay against the same Event is a no-op, not a second row.
    if (existing.event_id === request.event_id) {
      return { outcome: "ALREADY_ATTACHED", event, mapping: existing };
    }
    // The same evidence cannot mean two different occurrences. Refuse
    // rather than silently choosing one or re-pointing the mapping.
    throw new EventAdmissionConflictError(
      `evidence "${identityKey}" is already actively mapped to Event "${existing.event_id}"`,
      { identity_key: identityKey, existing_event_id: existing.event_id, requested_event_id: request.event_id },
    );
  }

  const nextState = {
    events: state.events,
    mappings: [...state.mappings, mapping],
    scheduleHistory: state.scheduleHistory,
  };

  await writeState(nextState, root ? { root } : {});

  return { outcome: "ATTACHED", event, mapping };
}

export { validateAdmissionBasis };
