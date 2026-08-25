import assert from "node:assert/strict";
import test from "node:test";
import { dedupeCandidates, evaluateCandidatePair } from "../ingestion/venue-discovery/dedupe.mjs";
import { createCandidate } from "../ingestion/venue-discovery/candidate-contract.mjs";
import { normaliseName, normaliseDomain } from "../ingestion/venue-discovery/normalise.mjs";

function candidate(overrides = {}) {
  const name = overrides.name ?? "Sala Test";
  return createCandidate({
    area_id: "barcelona-es",
    name,
    normalised_name: normaliseName(name),
    country: "Spain",
    country_code: "ES",
    city: "Barcelona",
    source_kind: overrides.source_kind ?? "OSM_OVERPASS",
    source_id: overrides.source_id ?? "openstreetmap-overpass",
    source_record_id: overrides.source_record_id ?? "node/1",
    first_seen_at: overrides.first_seen_at ?? "2026-08-25T00:00:00.000Z",
    discovery_status: overrides.discovery_status ?? "WEAK_CANDIDATE",
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    address: overrides.address ?? null,
    website_url: overrides.website_url,
    normalised_domain: overrides.website_url ? normaliseDomain(overrides.website_url) : null,
    discovery_status_reasons: overrides.discovery_status_reasons ?? ["reason"],
  });
}

test("two candidates sharing the same normalised domain are merged", () => {
  const a = candidate({ source_record_id: "node/1", website_url: "https://www.example.cat", latitude: 41.38, longitude: 2.17, first_seen_at: "2026-08-20T00:00:00.000Z" });
  const b = candidate({ source_kind: "BARCELONA_OPEN_DATA_ESPAIS_MUSICA_COPES", source_id: "barcelona-open-data-espais-musica-copes", source_record_id: "9001", website_url: "http://example.cat/agenda", latitude: 41.5, longitude: 2.5, first_seen_at: "2026-08-25T00:00:00.000Z" });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.mergedCount, 1);
  assert.deepEqual(result.candidates[0].merged_candidate_ids, [b.candidate_id]);
  assert.equal(result.candidates[0].source_evidence.length, 2);
});

test("two candidates at (near-)identical coordinates are merged even with different names", () => {
  const a = candidate({ name: "Sala A", source_record_id: "node/1", latitude: 41.3851, longitude: 2.1734 });
  const b = candidate({ name: "Sala A (alt listing)", source_record_id: "node/2", latitude: 41.38511, longitude: 2.17341 });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 1);
});

test("two candidates with identical normalised addresses are merged", () => {
  const a = candidate({ source_record_id: "node/1", address: "Carrer Paradís, 4" });
  const b = candidate({ source_record_id: "node/2", address: "carrer paradis 4" });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 1);
});

test("same exact normalised name within proximity is merged", () => {
  const a = candidate({ name: "Sala Nota Test", source_record_id: "node/1", latitude: 41.383, longitude: 2.1739 });
  const b = candidate({ name: "Sala Nota Test", source_record_id: "node/2", latitude: 41.3833, longitude: 2.1742 });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 1);
});

test("distinct nearby venues with different names and no shared domain/address are NOT merged", () => {
  const a = candidate({ name: "Sala Vermell", source_record_id: "node/1", latitude: 41.383, longitude: 2.1739 });
  const b = candidate({ name: "Cafe Blau", source_record_id: "node/2", latitude: 41.3831, longitude: 2.174 });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.mergedCount, 0);
});

test("similar-sounding names alone (no exact match) are never merged on name resemblance", () => {
  const a = candidate({ name: "Jazz Cafe Barcelona", source_record_id: "node/1", latitude: 41.383, longitude: 2.1739 });
  const b = candidate({ name: "Jazz Cafe Gracia", source_record_id: "node/2", latitude: 41.4, longitude: 2.2 });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 2);
});

test("nearby candidates sharing a name token but not matching are reported as an uncertain pair, not merged", () => {
  const a = candidate({ name: "Jazz Cafe Barcelona", source_record_id: "node/1", latitude: 41.383, longitude: 2.1739 });
  const b = candidate({ name: "Jazz Cafe Gracia", source_record_id: "node/2", latitude: 41.3831, longitude: 2.174 });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.uncertainPairs.length, 1);
  assert.equal(result.uncertainPairs[0].candidate_id_a, a.candidate_id);
});

test("merging preserves the strongest discovery_status and unions reasons", () => {
  const a = candidate({ source_record_id: "node/1", website_url: "https://x.example", discovery_status: "WEAK_CANDIDATE", discovery_status_reasons: ["weak reason"] });
  const b = candidate({
    source_kind: "BARCELONA_OPEN_DATA_ESPAIS_MUSICA_COPES",
    source_id: "barcelona-open-data-espais-musica-copes",
    source_record_id: "9002",
    website_url: "https://x.example",
    discovery_status: "LIKELY_LIVE_MUSIC_VENUE",
    discovery_status_reasons: ["strong reason"],
  });
  const result = dedupeCandidates([a, b]);
  assert.equal(result.candidates[0].discovery_status, "LIKELY_LIVE_MUSIC_VENUE");
  assert.deepEqual(result.candidates[0].discovery_status_reasons.sort(), ["strong reason", "weak reason"].sort());
});

test("a single candidate is passed through unchanged with an empty merged_candidate_ids", () => {
  const a = candidate({ source_record_id: "node/1" });
  const result = dedupeCandidates([a]);
  assert.deepEqual(result.candidates, [a]);
  assert.equal(result.mergedCount, 0);
});

test("dedupeCandidates tolerates an empty list", () => {
  assert.deepEqual(dedupeCandidates([]), { candidates: [], uncertainPairs: [], mergedCount: 0 });
});

test("evaluateCandidatePair reports no match for two candidates missing every comparable field", () => {
  const a = candidate({ source_record_id: "node/1" });
  const b = candidate({ name: "Something Else", source_record_id: "node/2" });
  assert.equal(evaluateCandidatePair(a, b).match, false);
});
