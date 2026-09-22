// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — dynamically derives
// every city name this repository ALREADY has production acquisition work
// for, by reading sources/*.json and venues/*.json directly (the same
// files ingestion/global-easy-harvester/city-registry.mjs already reads)
// rather than trusting a hardcoded list. wave-config.mjs's own static
// WAVE_1_EXCLUDED_CITIES documents the audit this was built from, but this
// function is the actual regression guard: it re-derives the set fresh
// from disk every call, so a future city onboarded into production is
// automatically excluded here too, with no manual list maintenance.

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function normaliseCityName(name) {
  return String(name ?? "").trim().toLowerCase();
}

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

// BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-PUBLISH-LIVE-01: a venue
// whose evidence is EXCLUSIVELY these two kinds — "UK_MAJOR_EVENT_CENSUS"
// (venues/uk.json's own initial address/identity evidence, see
// ingestion/uk-venue-onboarding/build-registry.mjs) and
// "GEOCODED_NOMINATIM_RESULT" (its own later, purely locational
// coordinate evidence, see ingestion/geocoding/run-uk.mjs) — is a governed
// location PIN with zero live per-venue acquisition behind it: no
// sources/*.json entry, no Observations, no listings, regardless of
// whether it has been geocoded yet. That is materially different from
// "real acquisition work" (this module's own stated purpose, see its
// file-level doc comment): a future city-wave choosing Manchester/
// Glasgow/Bristol for genuine per-venue live-event acquisition would NOT
// be duplicating anything this venue-only pin already does. A venue with
// ANY other evidence kind (i.e. genuine per-venue acquisition backing it,
// as every Lisbon/Porto/Barcelona/Berlin/Paris/London venue already has)
// still counts as real coverage, completely unaffected.
const VENUE_ONLY_EVIDENCE_KINDS = new Set(["UK_MAJOR_EVENT_CENSUS", "GEOCODED_NOMINATIM_RESULT"]);

function isCensusOnlyVenue(entry) {
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  return evidence.length > 0 && evidence.every((e) => VENUE_ONLY_EVIDENCE_KINDS.has(e?.kind));
}

async function collectCityValues(dir, arrayKey) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "registry.schema.json");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const cities = [];
  for (const file of files) {
    const doc = await readJsonSafe(resolve(dir, file));
    const entries = doc?.[arrayKey];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.city) continue;
      if (arrayKey === "venues" && isCensusOnlyVenue(entry)) continue;
      cities.push(entry.city);
    }
  }
  return cities;
}

/**
 * Every distinct, normalised city name found anywhere in production
 * `sources/*.json` (`entries[].city`) or `venues/*.json` (`venues[].city`)
 * — i.e. every place this repository already has real acquisition work
 * for, including satellite towns folded into a metro's own registry file
 * (e.g. Sintra/Cascais inside sources/lisbon.json).
 */
export async function deriveExistingCityCoverage({ root = ROOT } = {}) {
  const [sourceCities, venueCities] = await Promise.all([
    collectCityValues(resolve(root, "sources"), "entries"),
    collectCityValues(resolve(root, "venues"), "venues"),
  ]);
  return new Set([...sourceCities, ...venueCities].map(normaliseCityName));
}

export { ROOT as EXISTING_COVERAGE_ROOT };
