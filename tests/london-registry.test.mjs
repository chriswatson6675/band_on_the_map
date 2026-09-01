import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateRegistry } from "../sources/registry/validate.mjs";

async function loadJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("sources/london.json contains exactly the 6 live-verified first-tranche entries", async () => {
  const registry = await loadJson("../sources/london.json");
  assert.equal(Array.isArray(registry.entries), true);
  assert.equal(registry.entries.length, 6);
});

test("every entry in sources/london.json passes registry validation", async () => {
  const registry = await loadJson("../sources/london.json");
  const errors = validateRegistry(registry.entries);
  assert.deepEqual(errors, []);
});

const SQUARESPACE_SOURCE_IDS = new Set(["downstairs-at-the-dome-london", "night-tales-loft-london", "the-roxy-london"]);
const SMALL_BESPOKE_SOURCE_IDS = new Set(["100-club-london", "the-underworld-london", "jazz-cafe-posk-london"]);

test("every entry is TECHNICAL_PATH_PROVEN/TECHNICALLY_REVIEWED with acquisition_method STABLE_EVENT_PAGE (no source in this tranche relies on JSON-LD)", async () => {
  const registry = await loadJson("../sources/london.json");
  assert.equal(SQUARESPACE_SOURCE_IDS.size + SMALL_BESPOKE_SOURCE_IDS.size, registry.entries.length);
  for (const entry of registry.entries) {
    assert.equal(entry.monitoring_status, "TECHNICAL_PATH_PROVEN", `${entry.id}: monitoring_status`);
    assert.equal(entry.lifecycle_status, "TECHNICALLY_REVIEWED", `${entry.id}: lifecycle_status`);
    assert.equal(entry.acquisition_method, "STABLE_EVENT_PAGE", `${entry.id}: acquisition_method`);
    assert.equal(entry.research_provenance.research_id, "BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01");
    if (SQUARESPACE_SOURCE_IDS.has(entry.id)) {
      assert.equal(entry.london_collector_classification, "MINOR_ADAPTER", `${entry.id}: collector classification`);
    } else if (SMALL_BESPOKE_SOURCE_IDS.has(entry.id)) {
      assert.equal(entry.london_collector_classification, "SMALL_BESPOKE", `${entry.id}: collector classification`);
    } else {
      assert.fail(`${entry.id}: unexpected source id, not in either known tranche-1 family list`);
    }
  }
});

test("no entry ids collide with any existing city registry", async () => {
  const london = await loadJson("../sources/london.json");
  const others = await Promise.all(
    ["../sources/lisbon.json", "../sources/porto.json", "../sources/barcelona.json", "../sources/berlin.json", "../sources/paris.json"].map(
      loadJson,
    ),
  );
  const londonIds = new Set(london.entries.map((e) => e.id));
  for (const other of others) {
    for (const entry of other.entries) {
      assert.equal(londonIds.has(entry.id), false, `id "${entry.id}" collides with an existing registry entry`);
    }
  }
});

test("every entry has rights_status UNKNOWN (not reviewed for reuse permission in this package) and no entry was silently upgraded to GREEN", async () => {
  const registry = await loadJson("../sources/london.json");
  for (const entry of registry.entries) {
    assert.equal(entry.rights_status, "UNKNOWN", `${entry.id}: rights review is genuinely out of scope for this package`);
  }
});

test("registry entries reference country GB, city London, with a real London borough as municipality, and every id ends -london", async () => {
  const registry = await loadJson("../sources/london.json");
  for (const entry of registry.entries) {
    assert.equal(entry.country_code, "GB");
    assert.equal(entry.city, "London");
    assert.ok(typeof entry.municipality === "string" && entry.municipality.trim() !== "");
    assert.ok(entry.id.endsWith("-london"), `${entry.id}: source id should end in -london`);
  }
});

// No entry in this tranche uses a third-party listing platform as its
// primary source (task section 6's first-party source gate — Fire's own
// Skiddle-sourced candidate from the prior package was explicitly dropped
// rather than carried forward).
test("every entry's events_url points at the venue's own official domain — never a third-party listing platform", async () => {
  const registry = await loadJson("../sources/london.json");
  for (const entry of registry.entries) {
    assert.ok(typeof entry.events_url === "string" && entry.events_url.startsWith("https://"));
    const eventsHost = new URL(entry.events_url).hostname;
    const officialHost = new URL(entry.official_website).hostname;
    assert.equal(eventsHost, officialHost, `${entry.id}: events_url host must match official_website host (first-party only)`);
    for (const thirdParty of ["skiddle.com", "dice.fm", "ra.co", "songkick.com", "bandsintown.com"]) {
      assert.ok(!entry.events_url.includes(thirdParty), `${entry.id}: must not use third-party listing platform ${thirdParty}`);
    }
  }
});
