import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidate,
  validateCandidate,
  buildDiscoveryCandidateId,
  DISCOVERY_STATUSES,
} from "../ingestion/venue-discovery/candidate-contract.mjs";

function baseFields(overrides = {}) {
  return {
    area_id: "barcelona-es",
    name: "Sala Test",
    country: "Spain",
    country_code: "ES",
    city: "Barcelona",
    source_kind: "OSM_OVERPASS",
    source_id: "openstreetmap-overpass",
    source_record_id: "node/1001",
    first_seen_at: "2026-08-25T00:00:00.000Z",
    discovery_status: "WEAK_CANDIDATE",
    ...overrides,
  };
}

test("buildDiscoveryCandidateId is deterministic and namespaced away from onboarding candidate IDs", () => {
  const id = buildDiscoveryCandidateId("barcelona-es", "OSM_OVERPASS", "openstreetmap-overpass", "node/1001");
  assert.equal(id, "dcand-barcelona-es-osm-overpass-openstreetmap-overpass-node-1001");
  assert.equal(id, buildDiscoveryCandidateId("barcelona-es", "OSM_OVERPASS", "openstreetmap-overpass", "node/1001"));
});

test("createCandidate defaults candidate_id from area/source identity", () => {
  const candidate = createCandidate(baseFields());
  assert.equal(candidate.candidate_id, buildDiscoveryCandidateId("barcelona-es", "OSM_OVERPASS", "openstreetmap-overpass", "node/1001"));
  assert.equal(candidate.last_seen_at, candidate.first_seen_at);
});

test("source_evidence defaults to one entry mirroring the top-level source_* fields", () => {
  const candidate = createCandidate(baseFields({ source_tags: { amenity: "music_venue" } }));
  assert.equal(candidate.source_evidence.length, 1);
  assert.equal(candidate.source_evidence[0].source_kind, "OSM_OVERPASS");
  assert.deepEqual(candidate.source_evidence[0].source_tags, { amenity: "music_venue" });
});

test("missing (never invented) fields stay null", () => {
  const candidate = createCandidate(baseFields());
  assert.equal(candidate.address, null);
  assert.equal(candidate.latitude, null);
  assert.equal(candidate.longitude, null);
  assert.equal(candidate.website_url, null);
  assert.equal(candidate.normalised_domain, null);
});

test("DISCOVERY_STATUSES matches the four-tier vocabulary", () => {
  assert.deepEqual(
    [...DISCOVERY_STATUSES].sort(),
    ["EXCLUDED", "LIKELY_LIVE_MUSIC_VENUE", "POSSIBLE_LIVE_MUSIC_VENUE", "WEAK_CANDIDATE"].sort(),
  );
});

test("validateCandidate requires latitude and longitude together", () => {
  const errors = validateCandidate({ ...createCandidate(baseFields()), latitude: 41.38 });
  assert.ok(errors.some((e) => e.includes("both be present or both be null")));
});

test("validateCandidate rejects an out-of-range latitude", () => {
  const errors = validateCandidate({ ...createCandidate(baseFields()), latitude: 200, longitude: 2 });
  assert.ok(errors.some((e) => e.includes("latitude must be a number between -90 and 90")));
});

test("validateCandidate rejects an unknown discovery_status", () => {
  const errors = validateCandidate({ ...createCandidate(baseFields()), discovery_status: "MAYBE" });
  assert.ok(errors.some((e) => e.includes("discovery_status must be one of")));
});

test("validateCandidate rejects empty source_evidence", () => {
  const errors = validateCandidate({ ...createCandidate(baseFields()), source_evidence: [] });
  assert.ok(errors.some((e) => e.includes("source_evidence must be a non-empty array")));
});

test("createCandidate throws for a missing required field rather than silently admitting it", () => {
  assert.throws(() => createCandidate(baseFields({ name: null })), /Invalid discovery Candidate/);
});
