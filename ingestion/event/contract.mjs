// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — the generic
// canonical Event contract.
//
// docs/ARCHITECTURE.md defines an Event as "a canonical real-world
// occurrence that is deliberately staged, attendable, and bounded in
// time, resolved from one or more Observations". This module is the
// first runtime representation of that entity. A gig and a football
// fixture are peer Events and pass through exactly the same contract —
// nothing here knows about either domain.
//
// IDENTITY IS DELIBERATELY UNLIKE VENUE AND ARTIST.
//
// createVenueId() derives "venue-<city>-<name>" and createArtistId()
// derives "artist-<name>" from the entity's OWN attributes, because a
// venue's name and city are stable. An Event has no stable attribute
// set: its time changes (postponement is a requirement, not an edge
// case), its venue changes, its title differs between sources for the
// same occurrence, and its participants change. Deriving an Event id
// from any of those would re-mint it on precisely the transitions the id
// exists to survive.
//
// So Event identity is application-issued and opaque (rule 7):
// createEventId() takes no Event attributes and no evidence at all. The
// provider ids and derived occurrence fingerprints that DO identify an
// occurrence to its publisher stay in the evidence mapping
// (./occurrence-mapping.mjs), never in the id — rule 6.

import { randomUUID } from "node:crypto";

import { emptyDateTime } from "../observation/contract.mjs";

/**
 * Top-level classification: small, closed and stable, and the primary
 * product filter. Adding a category is a deliberate architectural
 * decision, so this set is exactly what docs/ARCHITECTURE.md defines —
 * no speculative BUSINESS/ARTS/COMEDY entry is pre-added.
 */
export const EVENT_CATEGORIES = new Set(["MUSIC", "SPORT"]);

/**
 * Types are extensible within a category. A type is only valid inside
 * its own category: MUSIC + FOOTBALL_FIXTURE and SPORT + GIG are both
 * rejected, because classification that does not constrain is not
 * classification.
 */
export const EVENT_TYPES_BY_CATEGORY = new Map([
  ["MUSIC", new Set(["GIG", "FESTIVAL", "PERFORMANCE"])],
  ["SPORT", new Set(["FOOTBALL_FIXTURE"])],
]);

/**
 * Real-world state only. Deliberately NOT a status:
 *
 *   RESCHEDULED
 *
 * Once a new time is confirmed the Event is simply SCHEDULED again, at
 * the new time; "rescheduled" describes history, and history lives in
 * ./schedule-history.mjs. Keeping it as a status would turn this field
 * into a change log.
 *
 * Status is never inferred from the wall clock here. A caller that knows
 * an Event has finished supplies COMPLETED; this contract does not
 * decide that an Event in the past must be over.
 */
export const EVENT_STATUSES = new Set([
  "SCHEDULED",
  "POSTPONED",
  "CANCELLED",
  "COMPLETED",
  "UNCONFIRMED",
]);

/**
 * POINT_IN_TIME is matched by its start (a gig, a fixture). RUN is
 * active across a bounded interval (a multi-day festival, an
 * exhibition), so a date query matches every date it spans rather than
 * pretending it begins anew each day.
 */
export const OCCURRENCE_SHAPES = new Set(["POINT_IN_TIME", "RUN"]);

/**
 * The certainty vocabulary is the Observation contract's, unchanged —
 * see ingestion/observation/contract.mjs. Event reuses that shape (and
 * imports emptyDateTime() from it) rather than inventing a second,
 * independently-drifting time model. Real retained music evidence is
 * DATE_ONLY, so requiring an ISO instant here would force adapters to
 * fabricate a time the source never published.
 */
export const EVENT_TIME_CERTAINTIES = new Set([
  "UTC_INSTANT",
  "DATE_ONLY",
  "TZID_QUALIFIED_UNRESOLVED",
  "FLOATING_LOCAL",
  "TEXT_ONLY",
  "UNKNOWN",
]);

/** `event-` plus a canonical lowercase UUIDv4. */
export const EVENT_ID_PATTERN =
  /^event-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Canonical id shape used by the repository's other registries
 * (venue-lisboa-meo-arena, ukmec-england-ipswich-portman-road). Kept
 * prefix-agnostic on purpose: the football estate's governed venues come
 * from the UK major-event census, not from venues/*.json, and hardcoding
 * a "venue-" prefix here would quietly make the Event core music-only.
 */
const CANONICAL_REF_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Mint a canonical Event id.
 *
 * This function takes NO Event attributes and NO evidence — not the
 * provider key, not the fingerprint, not the venue, title, participants,
 * category, type, schedule or parent. That is the whole point: none of
 * them is an input, so none of them can move an id that already exists.
 * `createEventId.length === 0` is asserted in the tests as a mechanical
 * statement of that property.
 *
 * The only parameter is an injectable generator, so tests can pin ids.
 * It defaults to Node's built-in crypto.randomUUID() — standard, opaque,
 * and already used elsewhere in this repository
 * (ingestion/city-worker/checkpoint-store.mjs), so no dependency is
 * added and no UUID/ULID cryptography is hand-written here.
 */
export function createEventId({ uuid = randomUUID } = {}) {
  return `event-${uuid()}`;
}

/** Does this string look like a canonical Event id? */
export function isEventId(value) {
  return typeof value === "string" && EVENT_ID_PATTERN.test(value);
}

/** Is this the repository's certainty-bearing date/time shape? */
function isDateTimeShape(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A time is "known" when the source genuinely gave a date or an instant.
 * An all-null UNKNOWN placeholder is not a time, and this contract never
 * upgrades one into a guess.
 */
export function hasKnownTime(dateTime) {
  if (!isDateTimeShape(dateTime)) return false;
  return isNonEmptyString(dateTime.date) || isNonEmptyString(dateTime.iso);
}

/**
 * Validate one date/time value against the Observation contract's rules,
 * including that the stated certainty matches what is actually carried.
 * A record claiming UTC_INSTANT without an instant is a fabrication
 * waiting to happen.
 *
 * Exported so ./schedule-history.mjs can reuse this exact governed shape
 * rather than declaring a second, independently-drifting one — a schedule
 * assertion's start/end is held to the same rules as an Event's own.
 */
export function validateDateTime(dateTime, label, errors) {
  if (!isDateTimeShape(dateTime)) {
    errors.push(`${label} must be a date/time object`);
    return;
  }
  if (!EVENT_TIME_CERTAINTIES.has(dateTime.certainty)) {
    errors.push(`${label}.certainty must be one of ${[...EVENT_TIME_CERTAINTIES].join(", ")}`);
    return;
  }
  if (dateTime.certainty === "UTC_INSTANT") {
    if (!isNonEmptyString(dateTime.iso)) errors.push(`${label}.iso is required when certainty is UTC_INSTANT`);
    if (dateTime.is_utc !== true) errors.push(`${label}.is_utc must be true when certainty is UTC_INSTANT`);
  }
  if (dateTime.certainty === "DATE_ONLY") {
    if (!isNonEmptyString(dateTime.date)) errors.push(`${label}.date is required when certainty is DATE_ONLY`);
    if (dateTime.iso !== null) errors.push(`${label}.iso must be null when certainty is DATE_ONLY`);
  }
}

/**
 * Compare two times only where they are genuinely comparable. Two
 * instants compare as instants; two plain dates compare as strings
 * (lexicographic order is calendar order for YYYY-MM-DD, the same reason
 * ingestion/map/date-filter.mjs avoids Date objects). Anything else is
 * left uncompared rather than coerced.
 */
function comparableOrder(start, end) {
  if (isNonEmptyString(start.iso) && isNonEmptyString(end.iso)) {
    const a = new Date(start.iso).getTime();
    const b = new Date(end.iso).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (isNonEmptyString(start.date) && isNonEmptyString(end.date)) {
    if (start.date === end.date) return 0;
    return start.date < end.date ? -1 : 1;
  }
  return null;
}

/**
 * Build one canonical Event. `event_id` must be supplied by the caller —
 * this function never mints one, so an id is only ever created at the
 * single governed point in ./admission.mjs and can never be
 * accidentally re-minted by rebuilding a record.
 *
 * Throws if the result fails validateEvent().
 */
export function createEvent(fields) {
  const event = {
    event_id: fields.event_id ?? null,

    event_category: fields.event_category ?? null,
    event_type: fields.event_type ?? null,

    display_title: fields.display_title ?? null,

    occurrence_shape: fields.occurrence_shape ?? null,
    start: fields.start ?? emptyDateTime(),
    end: fields.end ?? emptyDateTime(),

    status: fields.status ?? null,

    venue_id: fields.venue_id ?? null,
    parent_event_id: fields.parent_event_id ?? null,

    admitted_at: fields.admitted_at ?? null,
    admission_basis: fields.admission_basis ?? null,
  };

  const errors = validateEvent(event);
  if (errors.length > 0) {
    throw new Error(`Invalid Event: ${errors.join("; ")}`);
  }

  return event;
}

/**
 * Return an array of validation error strings (empty if valid). Does not
 * throw — matching validateVenue()/validateObservation().
 */
export function validateEvent(event) {
  const errors = [];

  if (!isEventId(event?.event_id)) {
    errors.push("event_id must be an application-issued id of the form event-<uuid>");
  }

  if (!EVENT_CATEGORIES.has(event?.event_category)) {
    errors.push(`event_category must be one of ${[...EVENT_CATEGORIES].join(", ")}`);
  } else {
    const allowed = EVENT_TYPES_BY_CATEGORY.get(event.event_category);
    if (!allowed.has(event?.event_type)) {
      errors.push(
        `event_type "${event?.event_type}" is not valid for category ${event.event_category} (expected one of ${[...allowed].join(", ")})`,
      );
    }
  }

  if (!EVENT_STATUSES.has(event?.status)) {
    errors.push(`status must be one of ${[...EVENT_STATUSES].join(", ")}`);
  }

  if (!OCCURRENCE_SHAPES.has(event?.occurrence_shape)) {
    errors.push(`occurrence_shape must be one of ${[...OCCURRENCE_SHAPES].join(", ")}`);
  }

  validateDateTime(event?.start, "start", errors);
  if (event?.end !== null && event?.end !== undefined) validateDateTime(event.end, "end", errors);

  if (!hasKnownTime(event?.start)) {
    errors.push("start must carry a genuinely known date or instant");
  }

  if (event?.occurrence_shape === "RUN") {
    if (!hasKnownTime(event?.end)) {
      errors.push("a RUN must carry a genuinely known end");
    } else if (hasKnownTime(event?.start)) {
      const order = comparableOrder(event.start, event.end);
      if (order === 1) errors.push("a RUN's end must not precede its start");
    }
  }

  if (event?.display_title !== null && !isNonEmptyString(event?.display_title)) {
    errors.push("display_title must be a non-empty string or null");
  }

  // Venue is enrichment, never a precondition: an Event with no resolved
  // venue is valid, it simply cannot be plotted (rule 8).
  if (event?.venue_id !== null) {
    if (!isNonEmptyString(event?.venue_id) || !CANONICAL_REF_PATTERN.test(event.venue_id)) {
      errors.push("venue_id must be a canonical venue reference or null");
    }
  }

  if (event?.parent_event_id !== null) {
    if (!isEventId(event?.parent_event_id)) {
      errors.push("parent_event_id must be a canonical Event id or null");
    } else if (event.parent_event_id === event.event_id) {
      errors.push("parent_event_id must not be the Event's own id");
    }
  }

  if (!isNonEmptyString(event?.admitted_at)) {
    errors.push("admitted_at is required");
  }

  errors.push(...validateAdmissionBasis(event?.admission_basis, "admission_basis"));

  return errors;
}

/**
 * The provenance of the identity itself: what KIND of evidence admitted
 * this Event, and the caller's own statement of the governed decision.
 * The evidence itself is not duplicated here — it lives in the occurrence
 * mapping, which is the reviewable record.
 */
export function validateAdmissionBasis(basis, label) {
  const errors = [];
  if (basis === null || typeof basis !== "object" || Array.isArray(basis)) {
    errors.push(`${label} is required`);
    return errors;
  }
  if (!isNonEmptyString(basis.basis_kind)) errors.push(`${label}.basis_kind is required`);
  if (!isNonEmptyString(basis.method)) errors.push(`${label}.method is required`);
  return errors;
}

/**
 * Validate a whole Event registry: every record valid, ids unique,
 * parent references resolvable, and no parent cycles.
 */
export function validateEventRegistry(events) {
  const errors = [];

  if (!Array.isArray(events)) return ["events must be an array"];

  events.forEach((event, index) => {
    for (const error of validateEvent(event)) errors.push(`events[${index}]: ${error}`);
  });

  const byId = new Map();
  events.forEach((event, index) => {
    if (!isEventId(event?.event_id)) return;
    if (byId.has(event.event_id)) {
      errors.push(
        `duplicate event_id "${event.event_id}" at events[${index}] (first seen at events[${byId.get(event.event_id).index}])`,
      );
    } else {
      byId.set(event.event_id, { index, event });
    }
  });

  events.forEach((event, index) => {
    const parent = event?.parent_event_id;
    if (parent === null || parent === undefined) return;
    if (!byId.has(parent)) {
      errors.push(`events[${index}]: parent_event_id "${parent}" does not reference a known Event`);
    }
  });

  // Parent cycles. Bounded and simple: walk each chain, stop on a repeat.
  for (const [eventId, { event }] of byId) {
    const seen = new Set([eventId]);
    let cursor = event.parent_event_id;
    while (cursor != null && byId.has(cursor)) {
      if (seen.has(cursor)) {
        errors.push(`events: parent cycle detected involving "${eventId}"`);
        break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor).event.parent_event_id;
    }
  }

  return errors;
}
