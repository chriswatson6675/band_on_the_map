import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normaliseWebsite, validateRegistry } from "../sources/registry/validate.mjs";

async function loadJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("sources/porto.json contains the 19-entry LISBON-PORTO-OVERNIGHT-COVERAGE-01 first-wave cohort plus LISBON-PORTO-P1-SOURCE-AUTOMATION-01's Super Bock Arena addition (20 total)", async () => {
  const registry = await loadJson("../sources/porto.json");
  assert.equal(Array.isArray(registry.entries), true);
  assert.equal(registry.entries.length, 20);
});

test("every entry in sources/porto.json passes registry validation", async () => {
  const registry = await loadJson("../sources/porto.json");
  const errors = validateRegistry(registry.entries);
  assert.deepEqual(errors, []);
});

// PORTO-COVERAGE-02 reassessed cm-gaia-eventos from its original
// BOTM-RESEARCH-PORTO-SOURCES-01 DISCOVERED finding to TECHNICALLY_REVIEWED
// (see sources/porto.json's own research_provenance.note on that entry) —
// research_provenance.research_id legitimately now names the LATEST
// reassessing task, per registry.schema.json's own documented "seeded or
// last reassessed from" semantics. Every other entry's research provenance
// is untouched.
test("every entry carries research provenance from its original research task, except cm-gaia-eventos (reassessed under PORTO-COVERAGE-02) and super-bock-arena (added under LISBON-PORTO-P1-SOURCE-AUTOMATION-01)", async () => {
  const registry = await loadJson("../sources/porto.json");
  for (const entry of registry.entries) {
    if (entry.id === "cm-gaia-eventos") {
      assert.equal(entry.research_provenance.research_id, "PORTO-COVERAGE-02");
    } else if (entry.id === "super-bock-arena") {
      assert.equal(entry.research_provenance.research_id, "LISBON-PORTO-P1-SOURCE-AUTOMATION-01");
    } else {
      assert.equal(entry.research_provenance.research_id, "BOTM-RESEARCH-PORTO-SOURCES-01");
    }
    assert.equal(entry.research_provenance.review_date, "2026-08-24");
  }
});

test("exactly the four technically-proven entries are TECHNICALLY_REVIEWED / TECHNICAL_PATH_PROVEN", async () => {
  const registry = await loadJson("../sources/porto.json");
  const proven = registry.entries.filter((e) => e.lifecycle_status === "TECHNICALLY_REVIEWED").map((e) => e.id).sort();
  assert.deepEqual(proven, ["casa-da-musica", "cm-gaia-eventos", "super-bock-arena", "teatro-municipal-do-porto"]);
  for (const entry of registry.entries) {
    if (proven.includes(entry.id)) {
      assert.equal(entry.monitoring_status, "TECHNICAL_PATH_PROVEN");
    }
  }
});

test("no entry ids collide with the Lisbon registry", async () => {
  const porto = await loadJson("../sources/porto.json");
  const lisbon = await loadJson("../sources/lisbon.json");
  const portoIds = new Set(porto.entries.map((e) => e.id));
  const lisbonIds = new Set(lisbon.entries.map((e) => e.id));
  for (const id of portoIds) {
    assert.equal(lisbonIds.has(id), false, `id "${id}" collides with a Lisbon registry entry`);
  }
});

test("no AMBER/UNKNOWN rights_status entry has been silently upgraded to GREEN except the honestly-evidenced open-data exception", async () => {
  const registry = await loadJson("../sources/porto.json");
  const greenEntries = registry.entries.filter((entry) => entry.rights_status === "GREEN").map((e) => e.id);
  // porto-opendata-agenda-cultural is the sole, explicitly-evidenced (CC-Zero
  // licensed CKAN dataset) GREEN entry in this cohort — see its own
  // rights_notes for why GREEN and UNSUITABLE_AUTOMATION coexist honestly.
  assert.deepEqual(greenEntries, ["porto-opendata-agenda-cultural"]);
});

test("registry entries reference country PT and only municipalities within the researched Greater Porto region", async () => {
  const registry = await loadJson("../sources/porto.json");
  const allowedMunicipalities = new Set([
    "Porto",
    "Vila Nova de Gaia",
    "Matosinhos",
    "Maia",
    "Gondomar",
    "Valongo",
    "Vila do Conde",
    "Póvoa de Varzim",
    "Espinho",
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

test("every Greater Porto target municipality is represented by at least one entry", async () => {
  const registry = await loadJson("../sources/porto.json");
  const represented = new Set(registry.entries.map((e) => e.municipality).filter(Boolean));
  for (const municipality of [
    "Porto",
    "Vila Nova de Gaia",
    "Matosinhos",
    "Maia",
    "Gondomar",
    "Valongo",
    "Vila do Conde",
    "Póvoa de Varzim",
    "Espinho",
  ]) {
    assert.ok(represented.has(municipality), `expected at least one entry for ${municipality}`);
  }
});

test("normaliseWebsite still functions as imported (shared validator behaviour)", () => {
  assert.equal(normaliseWebsite("https://www.CasaDaMusica.com/"), "casadamusica.com");
});
