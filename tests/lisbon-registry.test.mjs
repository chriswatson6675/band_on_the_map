import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normaliseWebsite, validateRegistry } from "../sources/registry/validate.mjs";

async function loadJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("sources/lisbon.json contains exactly 25 first-wave entries", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  assert.equal(Array.isArray(registry.entries), true);
  assert.equal(registry.entries.length, 25);
});

test("every entry in sources/lisbon.json passes registry validation", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  const errors = validateRegistry(registry.entries);
  assert.deepEqual(errors, []);
});

test("every entry carries research provenance from BOTM-RESEARCH-LISBON-SOURCES-01", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  for (const entry of registry.entries) {
    assert.equal(entry.research_provenance.research_id, "BOTM-RESEARCH-LISBON-SOURCES-01");
    assert.equal(entry.research_provenance.review_date, "2026-08-23");
  }
});

test("AgendaLX appears exactly once in the Lisbon registry", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  const byId = registry.entries.filter((entry) => entry.id === "agendalx");
  assert.equal(byId.length, 1);

  const agendalxWebsite = normaliseWebsite("https://www.agendalx.pt/");
  const byWebsite = registry.entries.filter(
    (entry) => normaliseWebsite(entry.official_website) === agendalxWebsite,
  );
  assert.equal(byWebsite.length, 1);
});

test("the registry's AgendaLX entry is compatible with, not a duplicate of, sources/agendalx.json", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  const detailedContract = await loadJson("../sources/agendalx.json");

  const registryEntry = registry.entries.find((entry) => entry.id === "agendalx");
  assert.ok(registryEntry, "expected an id: \"agendalx\" entry in the registry");
  assert.equal(registryEntry.id, detailedContract.id);
  assert.ok(registryEntry.detailed_source_ref.includes("sources/agendalx.json"));

  // The repository's governed, path-specific evidence (AMBER for the frontend
  // category-query path actually used for music) must not be silently
  // upgraded to the dataset-level GREEN recorded in sources/agendalx.json.
  assert.equal(registryEntry.rights_status, "AMBER");
});

test("the six research-identified structured sources are exactly the entries using API_JSON/RSS/ICS_CALENDAR", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  const structuredMethods = new Set(["API_JSON", "RSS", "ICS_CALENDAR", "JSON_LD_EVENT", "EMBEDDED_JSON"]);
  const structured = registry.entries
    .filter((entry) => structuredMethods.has(entry.acquisition_method))
    .map((entry) => entry.id)
    .sort();

  assert.deepEqual(structured, [
    "agendalx",
    "bota-anjos",
    "cm-odivelas-agenda-cultura",
    "forum-luisa-todi",
    "hot-clube-de-portugal",
    "village-underground-lisboa",
  ]);
});

test("no AMBER/UNKNOWN rights_status entry has been silently upgraded to GREEN", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  const greenEntries = registry.entries.filter((entry) => entry.rights_status === "GREEN");
  // First-wave Lisbon cohort research found no confirmed GREEN rights source;
  // this pins that assessment so a future edit can't quietly relax it.
  assert.deepEqual(greenEntries, []);
});

test("registry entries reference country PT and only municipalities within the researched region", async () => {
  const registry = await loadJson("../sources/lisbon.json");
  const allowedMunicipalities = new Set([
    "Lisboa",
    "Sintra",
    "Cascais",
    "Oeiras",
    "Seixal",
    "Setúbal",
    "Amadora",
    "Odivelas",
  ]);

  for (const entry of registry.entries) {
    assert.equal(entry.country_code, "PT");
    if (entry.municipality !== null) {
      assert.ok(
        allowedMunicipalities.has(entry.municipality),
        `unexpected municipality "${entry.municipality}" on entry ${entry.id}`,
      );
    }
  }
});
