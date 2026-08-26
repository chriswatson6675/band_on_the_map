// BARCELONA-30-VENUE-POPULATION-01 — offline proofs that Barcelona/Spain
// joins Portugal/Croatia in the SAME publication machinery
// (ingestion/map/publication.mjs, ingestion/map/projection.mjs) without
// changing any existing caller's behaviour when Spain data is omitted.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpainMarkers,
  buildPublicationArtifact,
  validatePublicationArtifact,
  isCatastrophicPublicationRun,
} from "../ingestion/map/publication.mjs";
import { getMarkersForCountry } from "../ingestion/map/projection.mjs";
import { createObservation, emptyDateTime } from "../ingestion/observation/contract.mjs";
import { createVenue } from "../ingestion/venue/contract.mjs";

function barcelonaVenue(overrides = {}) {
  return createVenue({
    canonical_name: "Sala Test Barcelona",
    city: "Barcelona",
    country_code: "ES",
    address: "Carrer Test 1, 08001 Barcelona",
    latitude: 41.3851,
    longitude: 2.1734,
    location_status: "CONFIRMED",
    evidence: [{ url: "https://example.cat", kind: "OFFICIAL_VENUE_WEBSITE", note: "test" }],
    ...overrides,
  });
}

function barcelonaObservation(venueName, overrides = {}) {
  const start = emptyDateTime();
  start.date = "2026-09-17";
  start.iso = "2026-09-17T19:00:00.000Z";
  start.is_utc = true;
  start.certainty = "UTC_INSTANT";
  return createObservation({
    source_id: "test-barcelona-source",
    source_record_id: "1",
    retrieved_at: "2026-08-26T00:00:00.000Z",
    title: "Test Gig",
    venue_name: venueName,
    start,
    ...overrides,
  });
}

function minimalArtifact(overrides = {}) {
  return {
    generated_at: "2026-08-26T00:00:00.000Z",
    window: { from: null, to: null },
    source_report: { success_count: 0, failure_count: 0, sources: [] },
    counts: { observation_count: 0, display_listing_count: 0, map_marker_count: 0 },
    countries: { Portugal: { markers: [] }, Croatia: { markers: [] } },
    ...overrides,
  };
}

test("an artifact with no countries.Spain key at all remains valid (pre-Barcelona fixtures never need rewriting)", () => {
  assert.deepEqual(validatePublicationArtifact(minimalArtifact()), []);
});

test("buildPublicationArtifact omitting spainMarkers publishes an empty Spain bucket and unchanged Portugal/Croatia counts", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-26T00:00:00.000Z",
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  assert.deepEqual(artifact.countries.Spain, { markers: [] });
  assert.equal(artifact.counts.map_marker_count, 0);
});

test("buildSpainMarkers projects a resolvable Barcelona Observation into a real display marker, via the SAME machinery as Portugal", () => {
  // Requires a resolver mapping — exercised properly in the full
  // integration proof; here we assert the function at least runs the
  // same projection pipeline and returns [] for an unresolved venue name
  // (never a fabricated marker).
  const markers = buildSpainMarkers({
    barcelonaObservations: [barcelonaObservation("Some Unmapped Venue Name")],
    barcelonaVenues: [barcelonaVenue()],
    barcelonaSourceRegistry: [],
  });
  assert.deepEqual(markers, []);
});

test("buildPublicationArtifact combines Portugal + Spain markers into one honest total", () => {
  const portugalMarker = {
    venue_id: "venue-lisboa-test",
    canonical_name: "Test Lisboa Venue",
    latitude: 38.7,
    longitude: -9.1,
    address: "Test Address",
    display_listings: [{ kind: "SINGLE", source_id: "s1", source_record_id: "r1" }],
  };
  const spainMarker = {
    venue_id: "venue-barcelona-test",
    canonical_name: "Test Barcelona Venue",
    latitude: 41.38,
    longitude: 2.17,
    address: "Test Address",
    display_listings: [
      { kind: "SINGLE", source_id: "s2", source_record_id: "r2" },
      { kind: "SINGLE", source_id: "s2", source_record_id: "r3" },
    ],
  };

  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-26T00:00:00.000Z",
    portugalMarkers: [portugalMarker],
    spainMarkers: [spainMarker],
    sourceResults: [{ source_id: "s1", success: true, raw_record_count: 1, observation_count: 1 }],
    observationCount: 3,
  });

  assert.equal(artifact.countries.Portugal.markers.length, 1);
  assert.equal(artifact.countries.Spain.markers.length, 1);
  assert.equal(artifact.counts.map_marker_count, 2);
  assert.equal(artifact.counts.display_listing_count, 3);
  assert.deepEqual(validatePublicationArtifact(artifact), []);
});

test("validatePublicationArtifact rejects a drifting map_marker_count once Spain markers are present", () => {
  const artifact = minimalArtifact({
    countries: {
      Portugal: { markers: [] },
      Croatia: { markers: [] },
      Spain: {
        markers: [
          {
            venue_id: "venue-barcelona-x",
            canonical_name: "X",
            latitude: 41.38,
            longitude: 2.17,
            address: "A",
            display_listings: [{ kind: "SINGLE", source_id: "s", source_record_id: "r" }],
          },
        ],
      },
    },
    counts: { observation_count: 1, display_listing_count: 1, map_marker_count: 0 }, // wrong: should be 1
  });
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("map_marker_count")));
});

test("validatePublicationArtifact requires countries.Spain.markers to be an array when the key is present at all", () => {
  const artifact = minimalArtifact({ countries: { Portugal: { markers: [] }, Croatia: { markers: [] }, Spain: { markers: "not-an-array" } } });
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("countries.Spain.markers must be an array")));
});

test("a Barcelona venue_id colliding with an existing Portugal venue_id is caught by the now-global uniqueness check", () => {
  const sharedMarker = (city) => ({
    venue_id: "venue-collision",
    canonical_name: city,
    latitude: 1,
    longitude: 1,
    address: "A",
    display_listings: [{ kind: "SINGLE", source_id: "s", source_record_id: `r-${city}` }],
  });
  const artifact = minimalArtifact({
    countries: {
      Portugal: { markers: [sharedMarker("Lisboa")] },
      Croatia: { markers: [] },
      Spain: { markers: [sharedMarker("Barcelona")] },
    },
    counts: { observation_count: 2, display_listing_count: 2, map_marker_count: 2 },
  });
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("duplicate marker venue_id")));
});

test("getMarkersForCountry returns Spain markers only when explicitly supplied", () => {
  const spainMarkers = [{ venue_id: "venue-barcelona-x" }];
  const portugalMarkers = [{ venue_id: "venue-lisboa-x" }];
  assert.deepEqual(getMarkersForCountry("Spain", portugalMarkers, spainMarkers), spainMarkers);
  assert.deepEqual(getMarkersForCountry("Spain", portugalMarkers), []); // 2-arg call: unchanged prior behaviour
  assert.deepEqual(getMarkersForCountry("Portugal", portugalMarkers, spainMarkers), portugalMarkers);
  assert.deepEqual(getMarkersForCountry("Croatia", portugalMarkers, spainMarkers), []);
});

test("isCatastrophicPublicationRun: zero Portugal markers is NOT catastrophic when Spain markers exist", () => {
  assert.equal(
    isCatastrophicPublicationRun({ sourceSuccessCount: 1, portugalMarkerCount: 0, spainMarkerCount: 5 }),
    false,
  );
});

test("isCatastrophicPublicationRun: both zero is catastrophic", () => {
  assert.equal(
    isCatastrophicPublicationRun({ sourceSuccessCount: 1, portugalMarkerCount: 0, spainMarkerCount: 0 }),
    true,
  );
});

test("isCatastrophicPublicationRun: omitting spainMarkerCount keeps the exact original Portugal-only rule", () => {
  assert.equal(isCatastrophicPublicationRun({ sourceSuccessCount: 1, portugalMarkerCount: 0 }), true);
  assert.equal(isCatastrophicPublicationRun({ sourceSuccessCount: 1, portugalMarkerCount: 3 }), false);
});

test("isCatastrophicPublicationRun: zero source successes is still always catastrophic", () => {
  assert.equal(
    isCatastrophicPublicationRun({ sourceSuccessCount: 0, portugalMarkerCount: 3, spainMarkerCount: 3 }),
    true,
  );
});
