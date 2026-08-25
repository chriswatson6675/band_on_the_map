// VENUE-DISCOVERY-ENGINE-01 — Area registry loader.
//
// Mirrors the "one file per city" pattern already used by
// sources/lisbon.json / sources/porto.json and venues/lisbon.json /
// venues/porto.json (see docs/SOURCE_REGISTRY.md's "City-by-city
// expansion model"), but one level more granular: one file per AREA
// under areas/<area_id>.json, since (unlike a source or venue registry)
// an Area is a single config object, not a list. Adding Madrid means
// adding areas/madrid-es.json — never touching this loader.

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAreaConfig } from "./contract.mjs";

const AREAS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../areas");

// Never treated as an Area config, even though it lives in areas/.
const NON_AREA_FILES = new Set(["registry.schema.json"]);

/**
 * Load and validate ONE Area config by its area_id, from
 * areas/<area_id>.json. Throws if the file is missing or fails
 * validateAreaConfig() — never silently falls back to a partial config.
 */
export async function loadAreaConfig(areaId, { areasDir = AREAS_DIR } = {}) {
  const path = join(areasDir, `${areaId}.json`);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`No area config found for "${areaId}" at ${path}: ${error.message}`);
  }

  let area;
  try {
    area = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Area config ${path} is not valid JSON: ${error.message}`);
  }

  const errors = validateAreaConfig(area);
  if (errors.length > 0) {
    throw new Error(`Area config ${path} is invalid: ${errors.join("; ")}`);
  }
  if (area.area_id !== areaId) {
    throw new Error(`Area config ${path} declares area_id "${area.area_id}", expected "${areaId}"`);
  }

  return area;
}

/**
 * List every valid Area config under areas/. Used by future
 * multi-area tooling (e.g. "run discovery for every ACTIVE area") —
 * not required for the Barcelona proof, which loads Barcelona directly
 * by ID, but kept here so a second/third managed area needs no new
 * loader code.
 */
export async function listAreaConfigs({ areasDir = AREAS_DIR } = {}) {
  let entries;
  try {
    entries = await readdir(areasDir);
  } catch (error) {
    throw new Error(`Could not read areas directory ${areasDir}: ${error.message}`);
  }

  const areaIds = entries
    .filter((name) => name.endsWith(".json") && !NON_AREA_FILES.has(name))
    .map((name) => name.slice(0, -".json".length))
    .sort();

  const areas = [];
  for (const areaId of areaIds) {
    areas.push(await loadAreaConfig(areaId, { areasDir }));
  }
  return areas;
}
