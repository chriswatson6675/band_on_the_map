// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — Event state
// persistence.
//
// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-HARDENING-01 replaced this
// module's original three-file layout with the single-document model below.
//
// WHY ONE FILE.
//
// An opaque, application-issued Event id cannot be recomputed from
// evidence the way venue-lisboa-meo-arena can. That is the deliberate
// cost of rule 7, and it makes persistence a correctness concern rather
// than a convenience: an id that is not written down is gone.
//
// The original design held one logical Event admission across THREE
// files (events.json, event-occurrence-mappings.json,
// event-schedule-history.json), validated once, then wrote and renamed
// each file in sequence. That is atomic PER FILE but not atomic as one
// admission: a process death after the first rename (or the second) could
// leave events.json holding a new Event whose mapping or schedule
// assertion was never written — a torn logical state no reader could
// distinguish from a real one.
//
// So the complete logical state — every Event, every evidence mapping,
// every schedule assertion — is now ONE JSON document
// (events/event-state.json), and one admission is one write: one temp
// file, one rename. There is no window in which a caller can observe a
// state that is new here and old there, because there is no "there" —
// only the single rename decides whether the whole prospective state
// replaces the whole prior one.
//
// This mirrors the repository's own single-document atomic-write idiom
// (ingestion/city-worker/checkpoint-store.mjs's per-source checkpoint,
// ingestion/global-easy-harvester/admission.mjs's writeJsonAtomic): temp
// file plus rename, JSON.stringify(value, null, 2) with a trailing
// newline. Nothing beyond that filesystem guarantee is claimed — a true
// cross-table transaction needs the database docs/ARCHITECTURE.md already
// names as the intended datastore, and faking one over JSON would be
// worse than saying so.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { isEventId, validateEventRegistry } from "./contract.mjs";
import { validateOccurrenceMappingRegistry } from "./occurrence-mapping.mjs";
import { validateScheduleHistoryRegistry } from "./schedule-history.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The single canonical Event-state document. There is no second file. */
export const EVENT_STATE_PATH = "events/event-state.json";

export const EVENT_STATE_SCHEMA_VERSION = 1;

const NOTE =
  "Canonical Event state (docs/ARCHITECTURE.md), persisted as ONE atomic JSON document so that one admission is one commit: events, event_occurrence_mappings and schedule_history must never be observed torn relative to one another. Every event_id is application-issued and opaque, minted once at admission. Provider identifiers and derived occurrence fingerprints live in event_occurrence_mappings, never inside an event_id and never on an Observation.";

function emptyDoc() {
  return {
    schema_version: EVENT_STATE_SCHEMA_VERSION,
    note: NOTE,
    events: [],
    event_occurrence_mappings: [],
    schedule_history: [],
  };
}

/** The persisted document shape <-> this module's in-memory state shape. */
function docToState(doc) {
  return {
    events: Array.isArray(doc?.events) ? doc.events : [],
    mappings: Array.isArray(doc?.event_occurrence_mappings) ? doc.event_occurrence_mappings : [],
    scheduleHistory: Array.isArray(doc?.schedule_history) ? doc.schedule_history : [],
  };
}

function stateToDoc(state) {
  return {
    schema_version: EVENT_STATE_SCHEMA_VERSION,
    note: NOTE,
    events: state.events,
    event_occurrence_mappings: state.mappings,
    schedule_history: state.scheduleHistory,
  };
}

/** Read the raw persisted document. A missing file reads as empty — the bootstrap case, not a fault. A malformed JSON body propagates. */
async function readDoc({ root = ROOT } = {}) {
  let raw;
  try {
    raw = await readFile(resolve(root, EVENT_STATE_PATH), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return emptyDoc();
    throw error;
  }
  return JSON.parse(raw);
}

/**
 * Read the complete Event state as this module's three logical arrays.
 * This is a RAW read: a document with an unexpected schema_version or one
 * that fails cross-registry validation is still returned here, because
 * inspection (a test asserting the shipped registry is empty, a report
 * reading current counts) is not the same operation as being about to
 * mint an Event or attach evidence. For that, see readValidatedState().
 */
export async function readState(options = {}) {
  return docToState(await readDoc(options));
}

/**
 * The fail-closed load path (Phase 6). Every code path that is about to
 * perform an idempotency lookup, mint an Event, attach evidence, or
 * otherwise decide anything on the strength of the persisted state MUST
 * read through here, never through readState() directly. A persisted
 * state that does not validate — a missing CURRENT schedule, a mapping
 * pointing at no Event, a CURRENT schedule that contradicts its Event, a
 * fingerprint active on two Events, a malformed schedule status — stops
 * the caller cold. It is never replayed against as ALREADY_ADMITTED,
 * never minted around, and never silently repaired.
 */
export async function readValidatedState(options = {}) {
  const doc = await readDoc(options);
  if (doc?.schema_version !== EVENT_STATE_SCHEMA_VERSION) {
    throw new Error(
      `Refusing to operate on invalid persisted Event state: schema_version must be ${EVENT_STATE_SCHEMA_VERSION}, found ${JSON.stringify(doc?.schema_version)}`,
    );
  }

  const state = docToState(doc);
  const errors = validateState(state);
  if (errors.length > 0) {
    throw new Error(`Refusing to operate on invalid persisted Event state: ${errors.join("; ")}`);
  }
  return state;
}

/** Byte-for-byte structural comparison of two date/time values (or two nulls). Both sides are always built from the same certainty-bearing shape, so this needs no deep-equality library. */
function sameDateTime(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * An Event's own start/end/status is trustworthy only if its CURRENT
 * schedule assertion says the same thing — otherwise "when is it" has two
 * different, simultaneously-persisted answers. Only the CURRENT assertion
 * is held to this (Phase 9): a SUPERSEDED assertion is retained history
 * and is EXPECTED to differ — that is what makes a postponement legible
 * after the fact, not a contradiction to reject.
 *
 * This also covers occurrence_shape = RUN without branching on it: a
 * RUN's own end-known/end-after-start rule is already enforced by
 * validateEvent() on the Event record itself, so requiring the CURRENT
 * assertion to match that record exactly inherits the same guarantee for
 * free.
 */
function validateCurrentScheduleParity(events, scheduleHistory) {
  const errors = [];
  if (!Array.isArray(events) || !Array.isArray(scheduleHistory)) return errors;

  const currentByEvent = new Map();
  for (const assertion of scheduleHistory) {
    if (assertion?.lifecycle === "CURRENT" && isEventId(assertion?.event_id)) {
      currentByEvent.set(assertion.event_id, assertion);
    }
  }

  for (const event of events) {
    if (!isEventId(event?.event_id)) continue;
    const current = currentByEvent.get(event.event_id);
    // A missing CURRENT assertion is already reported by
    // validateScheduleHistoryRegistry(); this check has nothing to compare.
    if (!current) continue;

    if (!sameDateTime(current.start, event.start)) {
      errors.push(`Event "${event.event_id}": CURRENT schedule start does not match the Event's own start`);
    }
    if (!sameDateTime(current.end, event.end)) {
      errors.push(`Event "${event.event_id}": CURRENT schedule end does not match the Event's own end`);
    }
    if (current.status !== event.status) {
      errors.push(`Event "${event.event_id}": CURRENT schedule status does not match the Event's own status`);
    }
  }

  return errors;
}

/**
 * Validate a complete prospective state across all three logical
 * registries plus the invariants that only make sense across them.
 *
 * This runs BEFORE anything is written, so an invalid admission never
 * begins a write at all — the property the tests assert, and the reason
 * a failed admission cannot leave a malformed state behind.
 */
export function validateState({ events, mappings, scheduleHistory }) {
  const errors = [];
  errors.push(...validateEventRegistry(events));

  const knownEventIds = new Set(
    (events ?? []).map((event) => event?.event_id).filter((id) => typeof id === "string"),
  );

  errors.push(...validateOccurrenceMappingRegistry(mappings, { knownEventIds }));
  errors.push(...validateScheduleHistoryRegistry(scheduleHistory, { knownEventIds }));
  errors.push(...validateCurrentScheduleParity(events, scheduleHistory));
  return errors;
}

/**
 * Validate a complete prospective state, then stage it as a single temp
 * file. Nothing about the persisted state changes yet — see
 * commitStagedState(). Exposed separately (rather than folded into
 * writeState()) so the crash-consistency tests can prove the actual
 * guarantee: everything up to and including this call is invisible to
 * every reader.
 */
export async function stageState(state, { root = ROOT } = {}) {
  const errors = validateState(state);
  if (errors.length > 0) {
    throw new Error(`Refusing to persist an invalid Event state: ${errors.join("; ")}`);
  }

  const finalPath = resolve(root, EVENT_STATE_PATH);
  await mkdir(dirname(finalPath), { recursive: true });
  const tmpPath = resolve(dirname(finalPath), `.event-state.${randomUUID()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(stateToDoc(state), null, 2)}\n`, "utf8");
  return { tmpPath, finalPath };
}

/**
 * The sole commit point. Before this call resolves, the only state any
 * reader can observe is whatever was there before stageState() ran. After
 * it resolves, the WHOLE new state is visible — never events updated with
 * mappings or schedule history still pending, because there is only ever
 * one file and one rename.
 */
export async function commitStagedState({ tmpPath, finalPath }) {
  await rename(tmpPath, finalPath);
  return finalPath;
}

/** Validate and persist a complete state in one atomic commit. Returns the path written. */
export async function writeState(state, options = {}) {
  return commitStagedState(await stageState(state, options));
}
