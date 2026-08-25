// BEATMAPPED-ENRICHMENT-PILOT-01 — read-only loaders for the canonical
// Artist registry (artists/artists.json) and the explicit Event->Artist
// link file (artists/event-artist-links.json).
//
// Mirrors ingestion/geocoding/manual-coordinate-store.mjs's own
// loadManualCoordinateStore() convention exactly: resolves the canonical
// path from THIS MODULE'S OWN FILE LOCATION (import.meta.url, walking up
// to the repository root) — never process.cwd() — and falls back to an
// empty registry/link set for a missing file (ENOENT), exactly as a
// genuinely fresh install (or an isolated test root that never seeded
// artists/*.json) should behave, rather than throwing. Neither loader
// ever writes — this pilot has no operator-facing artist/link editing UI.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveArtistRegistryPath({ root = ROOT } = {}) {
  return resolve(root, "artists/artists.json");
}

export function resolveArtistLinksPath({ root = ROOT } = {}) {
  return resolve(root, "artists/event-artist-links.json");
}

async function readJsonWithFallback(path, fallback) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
  return JSON.parse(raw);
}

/** Returns the parsed artists/artists.json shape ({ artists: [...] }), or { artists: [] } if the file does not exist. */
export async function loadArtistRegistry({ root = ROOT } = {}) {
  const parsed = await readJsonWithFallback(resolveArtistRegistryPath({ root }), { artists: [] });
  if (!Array.isArray(parsed?.artists)) {
    throw new Error(`Invalid artist registry at ${resolveArtistRegistryPath({ root })}: "artists" must be an array`);
  }
  return parsed;
}

/** Returns the parsed artists/event-artist-links.json shape ({ links: [...] }), or { links: [] } if the file does not exist. */
export async function loadArtistLinks({ root = ROOT } = {}) {
  const parsed = await readJsonWithFallback(resolveArtistLinksPath({ root }), { links: [] });
  if (!Array.isArray(parsed?.links)) {
    throw new Error(`Invalid artist link file at ${resolveArtistLinksPath({ root })}: "links" must be an array`);
  }
  return parsed;
}
