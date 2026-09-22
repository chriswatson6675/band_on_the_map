import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, mergeCandidatesByUnit, reclassifyPackage02Failures } from "../ingestion/uk-national-bulk-osm/run.mjs";
import { createVenueDiscoveryCandidate } from "../ingestion/venue-discovery/contract.mjs";
import { reconcileCandidatesByCity } from "../ingestion/uk-national-bulk-osm/reconcile-by-city.mjs";
import { reconcileWithExistingRegistry } from "../ingestion/venue-discovery/existing-registry.mjs";
import { classifyDiscoveryGroup } from "../ingestion/uk-national-discovery/admission.mjs";

test("parseArgs defaults runId and derives workDir from it when not given", () => {
  const args = parseArgs([]);
  assert.equal(args.runId, "uk-national-bulk-osm-02");
  assert.ok(args.workDir.includes("uk-national-bulk-osm-02"));
  assert.equal(args.skipExtraction, false);
});

test("parseArgs honours --run-id, --gb-pbf, --ni-pbf, --skip-extraction", () => {
  const args = parseArgs(["--run-id=custom-run", "--gb-pbf=/x/gb.pbf", "--ni-pbf=/x/ni.pbf", "--skip-extraction"]);
  assert.equal(args.runId, "custom-run");
  assert.equal(args.gbPbf, "/x/gb.pbf");
  assert.equal(args.niPbf, "/x/ni.pbf");
  assert.equal(args.skipExtraction, true);
});

test("mergeCandidatesByUnit concatenates candidates from multiple sources for the same unit, never overwrites", () => {
  const a = new Map([["u1", [{ id: 1 }]], ["u2", [{ id: 2 }]]]);
  const b = new Map([["u1", [{ id: 3 }]]]);
  const merged = mergeCandidatesByUnit(a, b);
  assert.deepEqual(merged.get("u1").map((c) => c.id).sort(), [1, 3]);
  assert.deepEqual(merged.get("u2").map((c) => c.id), [2]);
});

test("mergeCandidatesByUnit with no sources returns an empty map", () => {
  assert.equal(mergeCandidatesByUnit().size, 0);
});

test("reclassifyPackage02Failures reads the real retained package-02 coverage-progress.json and reports 15 reclassified units", async () => {
  const { reclassified_count, reclassified_unit_ids } = await reclassifyPackage02Failures();
  assert.equal(reclassified_count, 15);
  assert.equal(reclassified_unit_ids.length, 15);
  assert.ok(reclassified_unit_ids.includes("uk-grid-r00-c04"));
  assert.ok(reclassified_unit_ids.includes("uk-grid-r01-c10"));
});

// --- End-to-end: a bulk-OSM candidate that duplicates an EXISTING canonical venue must never be re-admitted ---

function osmCandidate({ id, name, city, lat, lon, address = null }) {
  return createVenueDiscoveryCandidate({
    candidate_id: `cand-osm-node-${id}`,
    city,
    country_code: "GB",
    reported_name: name,
    reported_address: address,
    reported_latitude: lat,
    reported_longitude: lon,
    reported_website: null,
    reported_category: "amenity=nightclub",
    discovery_provider: "OPENSTREETMAP_OVERPASS",
    provider_record_id: `node/${id}`,
    provider_url: `https://www.openstreetmap.org/node/${id}`,
    retrieved_at: "2026-09-22T00:00:00.000Z",
    discovery_evidence: [
      { kind: "OSM_ELEMENT", value: `node/${id}` },
      { kind: "OSM_TAGS", value: JSON.stringify({ name, amenity: "nightclub" }) },
    ],
    music_relevance_hint: "amenity=nightclub",
    active_status_hint: null,
    official_site_hint: null,
  });
}

test("a bulk-OSM candidate matching an existing canonical venue's name+address is classified ALREADY_CANONICAL, never re-admitted", () => {
  const existingVenue = { venue_id: "already-existing-club-bristol", canonical_name: "Already Existing Club", address: "123 High Street, Bristol", city: "Bristol" };
  const candidate = osmCandidate({ id: 42, name: "Already Existing Club", city: "Bristol", lat: 51.4545, lon: -2.5879, address: "123 High Street, Bristol" });

  const groups = reconcileCandidatesByCity([candidate]);
  const withRegistry = reconcileWithExistingRegistry(groups, { entries: [] }, { venues: [existingVenue] });
  const decision = classifyDiscoveryGroup(withRegistry[0]);

  assert.equal(decision.status, "ALREADY_CANONICAL");
});

test("a genuinely new bulk-OSM candidate with strong tag evidence is AUTO_ADMIT_HIGH_CONFIDENCE", () => {
  const candidate = osmCandidate({ id: 99, name: "Brand New Nightclub", city: "Leeds", lat: 53.8008, lon: -1.5491 });
  const groups = reconcileCandidatesByCity([candidate]);
  const withRegistry = reconcileWithExistingRegistry(groups, { entries: [] }, { venues: [] });
  const decision = classifyDiscoveryGroup(withRegistry[0]);
  assert.equal(decision.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});
