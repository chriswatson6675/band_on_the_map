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
      if (entry?.city) cities.push(entry.city);
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
