// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — Event registry
// persistence.
//
// An opaque, application-issued Event id cannot be recomputed from
// evidence the way venue-lisboa-meo-arena can. That is the deliberate
// cost of rule 7, and it makes persistence a correctness concern rather
// than a convenience: an id that is not written down is gone.
//
// So every write here is validated first and atomic second, following
// ingestion/city-worker/checkpoint-store.mjs and
// ingestion/global-easy-harvester/admission.mjs — temp file plus rename,
// JSON.stringify(value, null, 2) with a trailing newline.
//
// CROSS-FILE ATOMICITY, STATED HONESTLY.
//
// The three registries are three files, and POSIX gives no atomic
// multi-file rename. writeRegistries() therefore does all validation and
// writes every temp file BEFORE renaming any of them, so the only window
// in which a torn state is possible is the rename sequence itself.
// Nothing is claimed beyond that: a full cross-file transaction needs the
// database docs/ARCHITECTURE.md already names as the intended datastore,
// and faking one over JSON files would be worse than saying so.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { validateEventRegistry } from "./contract.mjs";
import { validateOccurrenceMappingRegistry } from "./occurrence-mapping.mjs";
import { validateScheduleHistoryRegistry } from "./schedule-history.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const EVENTS_PATH = "events/events.json";
export const MAPPINGS_PATH = "events/event-occurrence-mappings.json";
export const SCHEDULE_PATH = "events/event-schedule-history.json";

/** The array key inside each registry file. */
const REGISTRY_KEYS = {
  [EVENTS_PATH]: "events",
  [MAPPINGS_PATH]: "mappings",
  [SCHEDULE_PATH]: "schedule_history",
};

const NOTES = {
  [EVENTS_PATH]:
    "Canonical Events (docs/ARCHITECTURE.md). Every event_id is application-issued and opaque: it is minted once at admission and never derived from a provider id, a fingerprint, or any mutable Event attribute.",
  [MAPPINGS_PATH]:
    "Evidence-bearing Event-to-occurrence mappings. Provider identifiers and derived occurrence fingerprints live HERE, never inside an event_id, and never on an Observation.",
  [SCHEDULE_PATH]:
    "Append-only schedule assertions. A rescheduled Event supersedes its assertion and appends a new one; its event_id never changes.",
};

/** An empty, valid registry payload. */
export function emptyRegistry(path) {
  return { note: NOTES[path], [REGISTRY_KEYS[path]]: [] };
}

/** Read one registry, returning its array. A missing file reads as empty. */
export async function readRegistry(path, { root = ROOT } = {}) {
  const key = REGISTRY_KEYS[path];
  try {
    const parsed = JSON.parse(await readFile(resolve(root, path), "utf8"));
    return Array.isArray(parsed?.[key]) ? parsed[key] : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** Read all three registries as one state object. */
export async function readState({ root = ROOT } = {}) {
  const [events, mappings, scheduleHistory] = await Promise.all([
    readRegistry(EVENTS_PATH, { root }),
    readRegistry(MAPPINGS_PATH, { root }),
    readRegistry(SCHEDULE_PATH, { root }),
  ]);
  return { events, mappings, scheduleHistory };
}

/**
 * Validate a complete prospective state across all three registries.
 *
 * This runs BEFORE anything is written, so an invalid admission never
 * begins a write at all — which is the property the tests assert, and the
 * reason a failed admission cannot leave a malformed registry behind.
 */
export function validateState({ events, mappings, scheduleHistory }) {
  const errors = [];
  errors.push(...validateEventRegistry(events));

  const knownEventIds = new Set(
    (events ?? []).map((event) => event?.event_id).filter((id) => typeof id === "string"),
  );

  errors.push(...validateOccurrenceMappingRegistry(mappings, { knownEventIds }));
  errors.push(...validateScheduleHistoryRegistry(scheduleHistory, { knownEventIds }));
  return errors;
}

/**
 * Validate and persist a complete state. Returns the paths written.
 *
 * Nothing is renamed until every temp file exists and the whole state has
 * validated — see this module's header for exactly what that does and
 * does not guarantee.
 */
export async function writeRegistries(state, { root = ROOT } = {}) {
  const errors = validateState(state);
  if (errors.length > 0) {
    throw new Error(`Refusing to persist an invalid Event state: ${errors.join("; ")}`);
  }

  const payloads = [
    [EVENTS_PATH, { note: NOTES[EVENTS_PATH], events: state.events }],
    [MAPPINGS_PATH, { note: NOTES[MAPPINGS_PATH], mappings: state.mappings }],
    [SCHEDULE_PATH, { note: NOTES[SCHEDULE_PATH], schedule_history: state.scheduleHistory }],
  ];

  const staged = [];
  for (const [path, payload] of payloads) {
    const finalPath = resolve(root, path);
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = resolve(dirname(finalPath), `.${path.split("/").pop()}.${randomUUID()}.tmp`);
    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    staged.push({ tmpPath, finalPath });
  }

  for (const { tmpPath, finalPath } of staged) await rename(tmpPath, finalPath);

  return staged.map(({ finalPath }) => finalPath);
}
