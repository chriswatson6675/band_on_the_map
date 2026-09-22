import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main as generateArtifacts } from "../ingestion/uk-programme-acquisition/generate-artifacts.mjs";

// generate-artifacts.mjs's own ROOT constant is derived from its own file
// location (dirname-relative), matching every other module in this
// package — it cannot be redirected to an isolated tmpdir the way
// checkpoint.mjs's functions individually can (those DO take an explicit
// `root` option). This suite therefore runs against THIS REPOSITORY's own
// real venues/uk.json and sources/uk.json (read-only) for the venue/source
// data, and its own ISOLATED runtime checkpoint root (a dedicated,
// never-colliding run_id) — but critically ALSO writes its output
// artifacts to an isolated tmpdir via `researchDir`, never to the real,
// committed research/programme-acquisition/uk-national-01/ path. A prior
// version of this test omitted `researchDir` and silently overwrote the
// real, committed national-campaign artifacts with data computed against
// its own empty/isolated checkpoint set every time `npm test` ran — a real
// production incident this test now specifically guards against (see
// generate-artifacts.mjs's own `researchDir` parameter).
//
// Given generate-artifacts.mjs's own `main()` always reads the REAL
// sources/uk.json and venues/uk.json from the repository root, this test
// intentionally keeps its assertions to STRUCTURAL/SHAPE properties that
// hold regardless of the real repository's current acquisition state,
// rather than exact counts that would be fragile against the real,
// still-in-progress national campaign.

test("generateArtifacts runs against the real repository state without throwing, and produces the required research artifact files with a sane shape — without touching the real, committed research artifacts", async (t) => {
  const testRunId = "generate-artifacts-shape-test-01";
  const tmpResearchDir = await mkdtemp(join(tmpdir(), "botm-generate-artifacts-test-"));
  t.after(() => rm(tmpResearchDir, { recursive: true, force: true }));

  const root = process.cwd();
  const realCensusPath = join(root, "research/programme-acquisition/uk-national-01/venue-source-census.json");
  const realCensusBefore = await readFile(realCensusPath, "utf8");

  await generateArtifacts({ runId: testRunId, researchDir: tmpResearchDir });

  const realCensusAfter = await readFile(realCensusPath, "utf8");
  assert.equal(realCensusAfter, realCensusBefore, "this test must never modify the real, committed national-campaign research artifacts");

  const census = JSON.parse(await readFile(join(tmpResearchDir, "venue-source-census.json"), "utf8"));
  assert.equal(census.artifact_type, "UK_PROGRAMME_ACQUISITION_VENUE_SOURCE_CENSUS");
  assert.ok(census.total_venues > 0);
  assert.ok(Array.isArray(census.venues));
  assert.equal(census.venues.length, census.total_venues);
  // Every venue must be accounted for by exactly one recognised state.
  const validStates = new Set(["OFFICIAL_PROGRAMME_FOUND", "OFFICIAL_SITE_FOUND_NO_PROGRAMME", "NO_SOURCE_FOUND", "REVIEW_REQUIRED"]);
  for (const row of census.venues) {
    assert.ok(validStates.has(row.state), `unexpected state "${row.state}" for ${row.venue_id}`);
  }

  const platformFamilies = JSON.parse(await readFile(join(tmpResearchDir, "platform-families.json"), "utf8"));
  assert.equal(platformFamilies.artifact_type, "UK_PROGRAMME_ACQUISITION_PLATFORM_FAMILIES");
  assert.ok(Array.isArray(platformFamilies.families));

  const sourceYield = JSON.parse(await readFile(join(tmpResearchDir, "source-yield.json"), "utf8"));
  assert.equal(sourceYield.artifact_type, "UK_PROGRAMME_ACQUISITION_SOURCE_YIELD");

  const geo = JSON.parse(await readFile(join(tmpResearchDir, "geographic-coverage.json"), "utf8"));
  assert.equal(geo.artifact_type, "UK_PROGRAMME_ACQUISITION_GEOGRAPHIC_COVERAGE");
  assert.ok(typeof geo.by_nation === "object");
});
