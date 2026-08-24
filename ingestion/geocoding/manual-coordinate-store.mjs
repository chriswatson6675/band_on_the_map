// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — canonical persistence for
// operator-entered manual venue map coordinates.
//
// THE CANONICAL, VERSION-CONTROLLED FILE IS venues/manual-coordinates.json
// — never .claude/, scratchpad/, tmp/, temp/, fixtures/, .next/,
// node_modules/, browser localStorage/sessionStorage, or any other
// runtime/ephemeral location. Every function here resolves that path from
// THIS MODULE'S OWN FILE LOCATION (import.meta.url, walking up to the
// repository root) — never from process.cwd() — matching the exact
// existing convention already used by ingestion/geocoding/run.mjs and
// ingestion/geocoding/manual-coordinate-queue.mjs. Launching `next dev`
// from a different directory, or any other process.cwd() state, can never
// change where this module reads or writes.
//
// A manual coordinate entry is a governed OVERRIDE layer that sits
// alongside the canonical Venue registries (venues/lisbon.json,
// venues/porto.json) — it never mutates them, and a Venue's own
// location_status (see ingestion/venue/contract.mjs's LOCATION_STATUSES)
// is completely unaffected by an entry existing here. Manual coordinates
// must never be accepted for a venue that already carries authoritative
// CONFIRMED/GEOCODED coordinates — see saveManualCoordinate below and
// resolveVenueMapCoordinates in ingestion/map/projection.mjs, which is
// the single place precedence between canonical and manual coordinates is
// decided for map/listing purposes.
//
// Writes are atomic: a temporary sibling file is written, fsync'd, closed,
// then renamed onto the canonical path (rename is atomic on the same
// filesystem) — the canonical file is never observed in a partially
// written state, and no abandoned temp file is left behind on success.

import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const MANUAL_ENTRY_METHOD = "MANUAL_OPERATOR_ENTRY";

// Substrings that must never appear in the resolved canonical path — a
// direct, explicit invariant check (also exercised by
// tests/manual-coordinate-store.test.mjs), not just an implicit property
// of "walk up from import.meta.url".
export const FORBIDDEN_PATH_SUBSTRINGS = [
  ".claude",
  "scratchpad",
  "fixtures",
  ".next",
  "node_modules",
  `${"tmp"}`,
  "temp",
];

/**
 * Resolve the canonical manual-coordinate store path. `root` defaults to
 * this repository's real root (derived from this module's own file
 * location) and is overridable ONLY for tests, which must always pass an
 * isolated temporary directory — never the real repository root — when
 * exercising a write.
 */
export function resolveManualCoordinatesPath({ root = ROOT } = {}) {
  return resolve(root, "venues/manual-coordinates.json");
}

function emptyStore() {
  return {
    $schema_note:
      "Canonical operator-entered manual venue coordinates. See docs/OPERATOR_VENUE_COORDINATES.md.",
    entries: [],
  };
}

/**
 * Load the manual-coordinate store fresh from disk — never cached in
 * module/process memory across calls, so a "restart" (a fresh call after
 * some other process/store instance wrote to the file) always observes
 * the latest durable state. Missing file resolves to an empty store
 * (venues/manual-coordinates.json is always committed in this repo, but a
 * fresh temporary test root legitimately has none yet).
 */
export async function loadManualCoordinateStore({ root = ROOT } = {}) {
  const path = resolveManualCoordinatesPath({ root });
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return emptyStore();
    throw error;
  }
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid manual coordinate store at ${path}: "entries" must be an array`);
  }
  return parsed;
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateLatitude(latitude) {
  return isFiniteNumber(latitude) && latitude >= -90 && latitude <= 90;
}

export function validateLongitude(longitude) {
  return isFiniteNumber(longitude) && longitude >= -180 && longitude <= 180;
}

/** Return an array of validation error strings (empty if valid). */
export function validateManualCoordinateEntry(entry) {
  const errors = [];
  if (!entry || typeof entry.venue_id !== "string" || entry.venue_id.trim() === "") {
    errors.push("venue_id is required and must be a non-empty string");
  }
  if (!validateLatitude(entry?.latitude)) {
    errors.push("latitude must be a finite number between -90 and 90");
  }
  if (!validateLongitude(entry?.longitude)) {
    errors.push("longitude must be a finite number between -180 and 180");
  }
  if (entry?.method !== MANUAL_ENTRY_METHOD) {
    errors.push(`method must be exactly "${MANUAL_ENTRY_METHOD}"`);
  }
  if (typeof entry?.entered_at !== "string" || entry.entered_at.trim() === "" || Number.isNaN(Date.parse(entry.entered_at))) {
    errors.push("entered_at is required and must be a valid ISO 8601 timestamp");
  }
  if (entry?.note !== undefined && typeof entry.note !== "string") {
    errors.push("note, when present, must be a string");
  }
  return errors;
}

/**
 * Validate a whole store object: every entry individually valid, AND no
 * duplicate venue_id (at most one active manual entry per venue).
 */
export function validateManualCoordinateStore(store) {
  if (!store || !Array.isArray(store.entries)) {
    return ["store.entries must be an array"];
  }
  const errors = [];
  const seen = new Set();
  for (const entry of store.entries) {
    const entryErrors = validateManualCoordinateEntry(entry);
    for (const message of entryErrors) {
      errors.push(`${entry?.venue_id ?? "(missing venue_id)"}: ${message}`);
    }
    if (entry?.venue_id) {
      if (seen.has(entry.venue_id)) {
        errors.push(`duplicate venue_id: ${entry.venue_id}`);
      }
      seen.add(entry.venue_id);
    }
  }
  return errors;
}

/**
 * Atomic write: temp sibling -> write -> fsync -> close -> rename onto the
 * canonical path. Never leaves an abandoned temp file after success.
 */
async function writeStoreAtomic(path, store) {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = resolve(dirname(path), `.manual-coordinates.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(store, null, 2)}\n`;
  const handle = await open(tmpPath, "w");
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, path);
}

export function findManualEntry(store, venueId) {
  return store.entries.find((entry) => entry.venue_id === venueId) ?? null;
}

/**
 * Save (insert or update) exactly one manual coordinate entry, following
 * the exact sequence this package requires:
 *   1. validate venue_id references a real canonical Venue (`venues`)
 *   2. validate coordinates
 *   3. verify the venue does not already carry authoritative
 *      CONFIRMED/GEOCODED coordinates
 *   4. load the canonical store
 *   5. update/insert exactly one entry for venue_id
 *   6. method = MANUAL_OPERATOR_ENTRY
 *   7. entered_at = current UTC ISO timestamp
 *   8. write atomically
 *   9. re-read the persisted file
 *   10. return the saved state only once persistence is verified
 *
 * `venues` must be the caller's already-loaded canonical Venue array
 * (both registries combined) — this module never loads it itself, so it
 * never has to guess which registry file a venue_id belongs to. The
 * caller submits only venue_id/latitude/longitude/note; there is no
 * `filePath`-shaped input anywhere in this function's signature, and
 * none is ever accepted.
 */
export async function saveManualCoordinate({ venueId, latitude, longitude, note, venues, root = ROOT }) {
  if (!Array.isArray(venues)) {
    throw new Error("saveManualCoordinate requires the caller's already-loaded canonical `venues` array");
  }

  const venue = venues.find((candidate) => candidate.venue_id === venueId);
  if (!venue) {
    return { ok: false, error: "VENUE_NOT_FOUND", detail: `"${venueId}" is not a real canonical Venue` };
  }

  const numericLatitude = typeof latitude === "number" ? latitude : Number(latitude);
  const numericLongitude = typeof longitude === "number" ? longitude : Number(longitude);
  if (!validateLatitude(numericLatitude)) {
    return { ok: false, error: "INVALID_LATITUDE", detail: "latitude must be a finite number between -90 and 90" };
  }
  if (!validateLongitude(numericLongitude)) {
    return { ok: false, error: "INVALID_LONGITUDE", detail: "longitude must be a finite number between -180 and 180" };
  }

  if (venue.location_status === "CONFIRMED" || venue.location_status === "GEOCODED") {
    return {
      ok: false,
      error: "VENUE_ALREADY_AUTHORITATIVE",
      detail: `"${venueId}" already carries authoritative ${venue.location_status} coordinates; a manual entry may never override them`,
    };
  }

  const path = resolveManualCoordinatesPath({ root });
  const store = await loadManualCoordinateStore({ root });

  const entry = {
    venue_id: venueId,
    latitude: numericLatitude,
    longitude: numericLongitude,
    method: MANUAL_ENTRY_METHOD,
    entered_at: new Date().toISOString(),
    ...(typeof note === "string" && note.trim() !== "" ? { note: note.trim() } : {}),
  };

  const entryErrors = validateManualCoordinateEntry(entry);
  if (entryErrors.length > 0) {
    return { ok: false, error: "INVALID_ENTRY", detail: entryErrors.join("; ") };
  }

  const nextEntries = [...store.entries.filter((existing) => existing.venue_id !== venueId), entry];
  await writeStoreAtomic(path, { ...store, entries: nextEntries });

  // Re-read the persisted file before reporting success — never report
  // "Saved" from the in-memory value alone.
  const persisted = await loadManualCoordinateStore({ root });
  const persistedEntry = findManualEntry(persisted, venueId);
  if (
    !persistedEntry ||
    persistedEntry.latitude !== numericLatitude ||
    persistedEntry.longitude !== numericLongitude ||
    persistedEntry.method !== MANUAL_ENTRY_METHOD
  ) {
    return { ok: false, error: "PERSISTENCE_VERIFICATION_FAILED" };
  }

  return { ok: true, entry: persistedEntry };
}

/**
 * Remove a venue's manual coordinate entry (a deliberate "Remove manual
 * coordinates" action). Never touches the canonical Venue record itself —
 * only this override store. Idempotent: removing an entry that does not
 * exist is not an error.
 */
export async function removeManualCoordinate({ venueId, root = ROOT }) {
  const path = resolveManualCoordinatesPath({ root });
  const store = await loadManualCoordinateStore({ root });
  const existed = store.entries.some((entry) => entry.venue_id === venueId);
  if (!existed) {
    return { ok: true, removed: false };
  }

  const nextEntries = store.entries.filter((entry) => entry.venue_id !== venueId);
  await writeStoreAtomic(path, { ...store, entries: nextEntries });

  const persisted = await loadManualCoordinateStore({ root });
  const stillPresent = persisted.entries.some((entry) => entry.venue_id === venueId);
  return { ok: !stillPresent, removed: true };
}

export { ROOT as MANUAL_COORDINATE_STORE_ROOT };
