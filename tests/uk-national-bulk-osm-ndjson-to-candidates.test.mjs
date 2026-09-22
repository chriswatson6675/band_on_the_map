import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildCoverageUnits } from "../ingestion/uk-national-discovery/coverage-plan.mjs";
import { loadCandidatesByCoverageUnit } from "../ingestion/uk-national-bulk-osm/ndjson-to-candidates.mjs";

async function ndjsonFixture(lines) {
  const dir = await mkdtemp(join(tmpdir(), "botm-bulk-osm-ndjson-"));
  const path = join(dir, "candidates.ndjson");
  await writeFile(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  return { dir, path };
}

test("elements are grouped into the coverage unit matching their own coordinate", async (t) => {
  const units = buildCoverageUnits();
  const { dir, path } = await ndjsonFixture([
    { type: "node", id: 1, lat: 51.5074, lon: -0.1278, tags: { name: "London Venue", amenity: "nightclub" } }, // London
    { type: "node", id: 2, lat: 55.9533, lon: -3.1883, tags: { name: "Edinburgh Venue", amenity: "theatre" } }, // Edinburgh
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { candidatesByUnit } = await loadCandidatesByCoverageUnit(path, units, { retrievedAt: "2026-09-22T00:00:00.000Z" });

  const nonEmpty = [...candidatesByUnit.entries()].filter(([, c]) => c.length > 0);
  assert.equal(nonEmpty.length, 2, "London and Edinburgh must land in two DIFFERENT coverage units");
  const names = nonEmpty.flatMap(([, c]) => c.map((cand) => cand.reported_name)).sort();
  assert.deepEqual(names, ["Edinburgh Venue", "London Venue"]);
});

test("every unit is present in the result Map, even with zero matched elements", async (t) => {
  const units = buildCoverageUnits();
  const { dir, path } = await ndjsonFixture([
    { type: "node", id: 1, lat: 51.5074, lon: -0.1278, tags: { name: "London Venue", amenity: "nightclub" } },
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { candidatesByUnit } = await loadCandidatesByCoverageUnit(path, units, { retrievedAt: "2026-09-22T00:00:00.000Z" });
  assert.equal(candidatesByUnit.size, units.length);
});

test("an element with a coordinate outside every coverage unit is reported as unassigned, never silently dropped", async (t) => {
  const units = buildCoverageUnits();
  const { dir, path } = await ndjsonFixture([
    { type: "node", id: 1, lat: 0, lon: 0, tags: { name: "Nowhere Near The UK", amenity: "theatre" } },
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { candidatesByUnit, unassigned } = await loadCandidatesByCoverageUnit(path, units, { retrievedAt: "2026-09-22T00:00:00.000Z" });
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].reported_name, "Nowhere Near The UK");
  const totalAssigned = [...candidatesByUnit.values()].reduce((sum, c) => sum + c.length, 0);
  assert.equal(totalAssigned, 0);
});

test("an element with no name tag is excluded (via the reused parseOverpassCandidates rule), never silently vanishes from accounting", async (t) => {
  const units = buildCoverageUnits();
  const { dir, path } = await ndjsonFixture([
    { type: "node", id: 1, lat: 51.5074, lon: -0.1278, tags: { amenity: "nightclub" } },
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { candidatesByUnit, excludedMissingName } = await loadCandidatesByCoverageUnit(path, units, { retrievedAt: "2026-09-22T00:00:00.000Z" });
  const totalAssigned = [...candidatesByUnit.values()].reduce((sum, c) => sum + c.length, 0);
  assert.equal(totalAssigned, 0);
  assert.equal(excludedMissingName.length, 1);
  assert.equal(excludedMissingName[0].reason, "MISSING_NAME");
});

test("a bare amenity=community_centre element never becomes a candidate — it is returned as a retained filteredGenericLead instead", async (t) => {
  const units = buildCoverageUnits();
  const { dir, path } = await ndjsonFixture([
    { type: "node", id: 1, lat: 51.5074, lon: -0.1278, tags: { name: "Real Nightclub", amenity: "nightclub" } },
    { type: "node", id: 2, lat: 51.51, lon: -0.13, tags: { name: "Village Hall", amenity: "community_centre" } },
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { candidatesByUnit, filteredGenericLeads, signalCounts } = await loadCandidatesByCoverageUnit(path, units, { retrievedAt: "2026-09-22T00:00:00.000Z" });

  const allCandidateNames = [...candidatesByUnit.values()].flat().map((c) => c.reported_name);
  assert.deepEqual(allCandidateNames, ["Real Nightclub"], "the community centre must never appear in the candidate set");

  assert.equal(filteredGenericLeads.length, 1);
  assert.equal(filteredGenericLeads[0].id, 2);
  assert.equal(filteredGenericLeads[0].tags.amenity, "community_centre");
  assert.equal(filteredGenericLeads[0].reason, "FILTERED_GENERIC_NON_EVENT_LEAD");

  assert.equal(signalCounts["amenity=nightclub"], 1);
  assert.equal(signalCounts["amenity=community_centre"], undefined);
});

test("candidates preserve exact OSM identity (type/id) via provider_record_id", async (t) => {
  const units = buildCoverageUnits();
  const { dir, path } = await ndjsonFixture([
    { type: "way", id: 987654, lat: 51.5074, lon: -0.1278, tags: { name: "A Building Venue", amenity: "theatre" }, osm_version: 3, osm_timestamp: "2025-01-01T00:00:00Z" },
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { candidatesByUnit } = await loadCandidatesByCoverageUnit(path, units, { retrievedAt: "2026-09-22T00:00:00.000Z" });
  const candidate = [...candidatesByUnit.values()].flat()[0];
  assert.equal(candidate.provider_record_id, "way/987654");
  assert.equal(candidate.provider_url, "https://www.openstreetmap.org/way/987654");
});
