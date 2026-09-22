import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { seedMapEligibleVenueMarkers } from "../ingestion/map/projection.mjs";
import { buildUnitedKingdomMarkers, validatePublicationArtifact, buildPublicationArtifact, toPublicationMarker } from "../ingestion/map/publication.mjs";
import { buildNearTermLabel } from "../ingestion/map/near-term.mjs";

function geocodedVenue(overrides = {}) {
  return {
    venue_id: "venue-testcity-empty-venue",
    canonical_name: "Empty Venue",
    country_code: "GB",
    city: "Testcity",
    municipality: "Testcity",
    address: "1 Test Street, Testcity",
    latitude: 51.1,
    longitude: -1.1,
    location_status: "GEOCODED",
    evidence: [{ url: "https://example.test/", kind: "UK_MAJOR_EVENT_CENSUS", note: "test" }],
    coordinate_provenance: { method: "STRUCTURED_POI_NAME_CITY_MATCH" },
    ...overrides,
  };
}

test("seedMapEligibleVenueMarkers adds a listing-free marker for a map-eligible venue not already covered", () => {
  const seeded = seedMapEligibleVenueMarkers([], [geocodedVenue()], new Map());
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].venue_id, "venue-testcity-empty-venue");
  assert.deepEqual(seeded[0].display_listings, []);
  assert.equal(seeded[0].latitude, 51.1);
  assert.equal(seeded[0].longitude, -1.1);
});

test("seedMapEligibleVenueMarkers never duplicates a venue_id already present in existingMarkers", () => {
  const existing = [{ venue_id: "venue-testcity-empty-venue", canonical_name: "Empty Venue (with real listing)", latitude: 1, longitude: 2, address: null, listings: [], display_listings: [{ kind: "SINGLE", source_id: "s", source_record_id: "r" }] }];
  const seeded = seedMapEligibleVenueMarkers(existing, [geocodedVenue()], new Map());
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].display_listings.length, 1, "the Observation-based marker must win, never be overwritten by an empty venue-only marker");
});

test("seedMapEligibleVenueMarkers skips an UNRESOLVED venue — never a fabricated or guessed coordinate", () => {
  const seeded = seedMapEligibleVenueMarkers([], [geocodedVenue({ location_status: "UNRESOLVED", latitude: null, longitude: null, address: null })], new Map());
  assert.equal(seeded.length, 0);
});

test("seedMapEligibleVenueMarkers seeds an ADDRESS_ONLY venue only via a valid MANUAL_OPERATOR_ENTRY override, matching resolveVenueMapCoordinates precedence exactly", () => {
  const addressOnly = geocodedVenue({ location_status: "ADDRESS_ONLY", latitude: null, longitude: null });
  const withoutManual = seedMapEligibleVenueMarkers([], [addressOnly], new Map());
  assert.equal(withoutManual.length, 0);

  const manual = new Map([["venue-testcity-empty-venue", { method: "MANUAL_OPERATOR_ENTRY", latitude: 5, longitude: 6 }]]);
  const withManual = seedMapEligibleVenueMarkers([], [addressOnly], manual);
  assert.equal(withManual.length, 1);
  assert.equal(withManual[0].latitude, 5);
});

test("buildUnitedKingdomMarkers merges London Observation markers with UK venue-only markers, deduplicated by venue_id", () => {
  const markers = buildUnitedKingdomMarkers({
    londonObservations: [],
    londonVenues: [],
    londonSourceRegistry: [],
    ukVenues: [geocodedVenue(), geocodedVenue({ venue_id: "venue-testcity-second-venue", canonical_name: "Second Venue" })],
  });
  assert.equal(markers.length, 2);
  assert.ok(markers.every((m) => Array.isArray(m.display_listings) && m.display_listings.length === 0));
});

test("buildUnitedKingdomMarkers omitting ukVenues keeps EXACTLY today's Observation-only behaviour (regression guard)", () => {
  const markers = buildUnitedKingdomMarkers({ londonObservations: [], londonVenues: [], londonSourceRegistry: [] });
  assert.deepEqual(markers, []);
});

test("validatePublicationArtifact accepts a marker with an empty display_listings array (venue-only marker)", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-09-22T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    unitedKingdomMarkers: [geocodedVenue()].map((v) => ({ venue_id: v.venue_id, canonical_name: v.canonical_name, latitude: v.latitude, longitude: v.longitude, address: v.address, display_listings: [] })),
    sourceResults: [],
    observationCount: 0,
  });
  const errors = validatePublicationArtifact(artifact);
  assert.deepEqual(errors, []);
  assert.equal(artifact.counts.map_marker_count, 1);
  assert.equal(artifact.counts.display_listing_count, 0);
});

test("validatePublicationArtifact still rejects a marker whose display_listings is not an array at all", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-09-22T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    unitedKingdomMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  artifact.countries.UnitedKingdom.markers.push({ venue_id: "venue-x", canonical_name: "X", latitude: 1, longitude: 1, address: null, display_listings: null });
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("display_listings must be an array")));
});

test("no football/sport listing kind is ever accepted by isValidDisplayListing's own SINGLE/GROUP shape check — venue-only markers carry no listing at all, and toPublicationMarker never invents one", () => {
  const marker = { venue_id: "venue-x", canonical_name: "X", latitude: 1, longitude: 1, address: null, listings: [], display_listings: [] };
  const published = toPublicationMarker(marker);
  assert.deepEqual(published.display_listings, []);
});

test("the frontend popup's near-term label helper never crashes on a venue-only marker's empty display_listings", () => {
  assert.equal(buildNearTermLabel([], new Date("2026-09-22T00:00:00.000Z")), null);
});

test("SAFETY: no UK venue-onboarding/geocoding/publication-wiring module references the football Event pipeline (events/event-state.json, gc-football-*) — this package publishes VENUES, never football fixtures", async () => {
  const candidateModules = [
    "ingestion/uk-venue-onboarding/classification.mjs",
    "ingestion/uk-venue-onboarding/dedupe.mjs",
    "ingestion/uk-venue-onboarding/build-registry.mjs",
    "ingestion/uk-venue-onboarding/run.mjs",
    "ingestion/geocoding/run-uk.mjs",
    "ingestion/map/projection.mjs",
    "ingestion/map/publication.mjs",
    "ingestion/publish-map-data/run.mjs",
    "ingestion/unattended-runner/run.mjs",
  ];
  for (const path of candidateModules) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.equal(/events\/event-state\.json/.test(source), false, `${path} must never reference the football Event registry`);
    assert.equal(/gc-football/i.test(source), false, `${path} must never import a football module`);
    assert.equal(/FOOTBALL_FIXTURE/.test(source), false, `${path} must never reference the FOOTBALL_FIXTURE event type`);
  }
});
