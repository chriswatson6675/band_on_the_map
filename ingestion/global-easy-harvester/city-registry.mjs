// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — global city queue, derived
// from repository truth (sources/*.json on disk) rather than a hardcoded
// city list, per Phase 4 of this package's brief: "Do not hard-code only
// the five currently discussed cities if more exist."

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// sources/ also holds registry.schema.json and non-city sub-source files
// (e.g. sources/agendalx.json, a single Lisbon sub-source with a different
// shape — not a per-city registry). Only files that parse as
// { entries: [...] } with entries carrying a `city` field are real city
// registries; this filter is applied structurally below, not by filename
// guesswork.
const NON_CITY_REGISTRY_FILES = new Set(["registry.schema.json"]);

/**
 * The known city estate, read fresh from disk every call (no caching, no
 * in-memory state — matches this repository's own "reconstructable purely
 * from disk" convention, e.g. programme-acquisition-resolver.mjs). Returns
 * one entry per sources/<city-key>.json that structurally IS a per-city
 * registry, sorted deterministically by city_key.
 */
export async function listKnownCities({ root = ROOT } = {}) {
  const sourcesDir = resolve(root, "sources");
  const files = (await readdir(sourcesDir)).filter(
    (f) => f.endsWith(".json") && !NON_CITY_REGISTRY_FILES.has(f),
  );

  const cities = [];
  for (const file of files) {
    const cityKey = file.replace(/\.json$/, "");
    const path = resolve(sourcesDir, file);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : null;
    if (!entries || entries.length === 0 || !entries[0]?.city) continue;

    const displayCity = entries[0].city;
    const countryCode = entries[0].country_code ?? null;
    const venuesPath = resolve(root, "venues", `${cityKey}.json`);

    cities.push({
      city_key: cityKey,
      display_name: displayCity,
      country_code: countryCode,
      sources_registry_path: path,
      venues_registry_path: venuesPath,
      source_count: entries.length,
      enabled: true,
    });
  }

  cities.sort((a, b) => a.city_key.localeCompare(b.city_key));
  return cities;
}

export { ROOT as CITY_REGISTRY_ROOT };
