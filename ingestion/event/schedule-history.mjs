// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — append-only Event
// schedule history.
//
// WHY THIS EXISTS AT ALL.
//
// Football fixtures move, gigs move, conferences move. docs/ARCHITECTURE.md
// rule 7 requires an Event id to survive that, and the only way an id
// survives a changed time is if the time is NOT part of the id and the
// change is recorded somewhere else. This is that somewhere else.
//
// An assertion is never edited and never deleted. A schedule change
// appends a new CURRENT assertion and marks the previous one SUPERSEDED,
// so the pre-postponement schedule — and the evidence that asserted it —
// stays readable forever. The Event id does not move, and the Event
// record's own start/end simply reflect whichever assertion is CURRENT.
//
// This package implements the contract, its validation, and the INITIAL
// assertion that admission creates. The full rescheduling workflow
// (detecting a move, superseding, re-asserting) is deliberately a later
// package — the structure it will need is proven here, not the workflow.

import { EVENT_STATUSES, hasKnownTime, isEventId, validateAdmissionBasis, validateDateTime } from "./contract.mjs";

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/**
 * CURRENT is the schedule in force. SUPERSEDED is a retained prior
 * assertion. Exactly one CURRENT assertion may exist per Event — an
 * Event with two current schedules has no answer to "when is it", which
 * is a registry-level error rather than something a consumer should have
 * to resolve.
 */
export const SCHEDULE_LIFECYCLES = new Set(["CURRENT", "SUPERSEDED"]);

/**
 * Build one schedule assertion. Throws if it fails
 * validateScheduleAssertion().
 *
 * `start`/`end`/`status` mirror the Event's own fields at the moment the
 * assertion was made, and `asserted_by` carries the same shape as an
 * Event's admission_basis so that "who said so" is recorded identically
 * wherever it appears.
 */
export function createScheduleAssertion(fields) {
  const assertion = {
    event_id: fields.event_id ?? null,
    start: fields.start ?? null,
    end: fields.end ?? null,
    status: fields.status ?? null,
    asserted_by: fields.asserted_by ?? null,
    asserted_at: fields.asserted_at ?? null,
    lifecycle: fields.lifecycle ?? "CURRENT",
    superseded_at: fields.superseded_at ?? null,
  };

  const errors = validateScheduleAssertion(assertion);
  if (errors.length > 0) {
    throw new Error(`Invalid schedule assertion: ${errors.join("; ")}`);
  }

  return assertion;
}

/**
 * Return an array of validation error strings (empty if valid).
 *
 * start/end/status reuse the Event contract's OWN governed shapes
 * (validateDateTime, EVENT_STATUSES) rather than a weaker duplicate: a
 * schedule assertion that carried status "BANANA" or a start of
 * `{ foo: "bar" }` used to pass this function. It no longer does.
 *
 * The one thing this function deliberately does NOT check is whether a
 * RUN Event's end agrees with its start, or whether this assertion's
 * start/end/status agree with its owning Event's current fields — both
 * need the Event record, which only exists at complete-state validation
 * (see ./registry.mjs's validateState()). A SUPERSEDED assertion is
 * retained history and is expected to disagree with the Event's current
 * fields; only complete-state validation can tell CURRENT from SUPERSEDED
 * and hold only the former to that parity.
 */
export function validateScheduleAssertion(assertion) {
  const errors = [];

  if (!isEventId(assertion?.event_id)) {
    errors.push("event_id must be an application-issued Event id");
  }

  validateDateTime(assertion?.start, "start", errors);
  if (!hasKnownTime(assertion?.start)) {
    errors.push("start must carry a genuinely known date or instant");
  }

  if (assertion?.end !== null && assertion?.end !== undefined) {
    validateDateTime(assertion.end, "end", errors);
  }

  if (!EVENT_STATUSES.has(assertion?.status)) {
    errors.push(`status must be one of ${[...EVENT_STATUSES].join(", ")}`);
  }
  if (!isNonEmptyString(assertion?.asserted_at)) errors.push("asserted_at is required");

  errors.push(...validateAdmissionBasis(assertion?.asserted_by, "asserted_by"));

  if (!SCHEDULE_LIFECYCLES.has(assertion?.lifecycle)) {
    errors.push(`lifecycle must be one of ${[...SCHEDULE_LIFECYCLES].join(", ")}`);
  }

  if (assertion?.lifecycle === "SUPERSEDED" && !isNonEmptyString(assertion?.superseded_at)) {
    errors.push("a SUPERSEDED assertion must record superseded_at");
  }
  if (assertion?.lifecycle === "CURRENT" && assertion?.superseded_at !== null) {
    errors.push("a CURRENT assertion must not carry superseded_at");
  }

  return errors;
}

/** The assertion currently in force for one Event, if any. */
export function currentAssertionFor(assertions, eventId) {
  return (
    (assertions ?? []).find(
      (assertion) => assertion?.event_id === eventId && assertion?.lifecycle === "CURRENT",
    ) ?? null
  );
}

/**
 * Validate the whole schedule-history registry, including the one-current
 * -assertion-per-Event invariant and that every assertion belongs to a
 * known Event.
 */
export function validateScheduleHistoryRegistry(assertions, { knownEventIds = null } = {}) {
  const errors = [];

  if (!Array.isArray(assertions)) return ["schedule_history must be an array"];

  assertions.forEach((assertion, index) => {
    for (const error of validateScheduleAssertion(assertion)) {
      errors.push(`schedule_history[${index}]: ${error}`);
    }
  });

  if (knownEventIds) {
    assertions.forEach((assertion, index) => {
      if (typeof assertion?.event_id !== "string") return;
      if (!knownEventIds.has(assertion.event_id)) {
        errors.push(
          `schedule_history[${index}]: event_id "${assertion.event_id}" does not reference a known Event`,
        );
      }
    });
  }

  const currentByEvent = new Map();
  assertions.forEach((assertion, index) => {
    if (assertion?.lifecycle !== "CURRENT" || typeof assertion?.event_id !== "string") return;
    const previous = currentByEvent.get(assertion.event_id);
    if (previous !== undefined) {
      errors.push(
        `schedule_history[${index}]: "${assertion.event_id}" already has a CURRENT assertion at schedule_history[${previous}]`,
      );
    } else {
      currentByEvent.set(assertion.event_id, index);
    }
  });

  // An admitted Event with no current schedule has lost its time.
  if (knownEventIds) {
    for (const eventId of knownEventIds) {
      if (!currentByEvent.has(eventId)) {
        errors.push(`schedule_history: Event "${eventId}" has no CURRENT schedule assertion`);
      }
    }
  }

  return errors;
}
