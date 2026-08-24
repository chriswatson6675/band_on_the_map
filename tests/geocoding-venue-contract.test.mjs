import assert from "node:assert/strict";
import test from "node:test";
import { createVenue, MAP_ELIGIBLE_LOCATION_STATUSES, validateVenue } from "../ingestion/venue/contract.mjs";

// VENUE-GEOCODING-01: the GEOCODED location_status is structurally like
// CONFIRMED (address + coordinates + evidence) but permanently distinct
// in meaning/provenance, and must never be interchangeable with it.

function geocodedProvenance(overrides = {}) {
  return {
    method: "GEOCODED_FROM_OFFICIAL_ADDRESS",
    provider: "NOMINATIM_OSM",
    query_address: "Largo da Graça, 1170-165 Lisboa",
    result_osm_type: "way",
    result_osm_id: "123456",
    result_display_name: "Igreja da Graça, Lisboa, Portugal",
    matched_postcode: "1170-165",
    matched_city: "Lisboa",
    retrieved_at: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

test("MAP_ELIGIBLE_LOCATION_STATUSES is exactly CONFIRMED and GEOCODED", () => {
  assert.deepEqual([...MAP_ELIGIBLE_LOCATION_STATUSES].sort(), ["CONFIRMED", "GEOCODED"]);
});

test("a well-formed GEOCODED venue validates successfully", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "GEOCODED",
    address: "Somewhere Real 1",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [{ url: "https://example.test" }],
    coordinate_provenance: geocodedProvenance(),
  });
  assert.deepEqual(errors, []);
});

test("createVenue accepts a GEOCODED venue with coordinate_provenance", () => {
  assert.doesNotThrow(() =>
    createVenue({
      canonical_name: "Example",
      city: "Lisboa",
      location_status: "GEOCODED",
      address: "Somewhere Real 1",
      latitude: 38.7,
      longitude: -9.1,
      evidence: [{ url: "https://example.test" }],
      coordinate_provenance: geocodedProvenance(),
    }),
  );
});

test("GEOCODED without coordinates is rejected", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "GEOCODED",
    address: "Somewhere Real 1",
    latitude: null,
    longitude: null,
    evidence: [],
    coordinate_provenance: geocodedProvenance(),
  });
  assert.ok(errors.some((e) => e.includes("GEOCODED venue must carry coordinates")));
});

test("GEOCODED without an address is rejected", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "GEOCODED",
    address: null,
    latitude: 38.7,
    longitude: -9.1,
    evidence: [{ url: "https://example.test" }],
    coordinate_provenance: geocodedProvenance(),
  });
  assert.ok(errors.some((e) => e.includes("GEOCODED venue must carry a non-empty address")));
});

test("GEOCODED without a coordinate_provenance object is rejected", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "GEOCODED",
    address: "Somewhere Real 1",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [{ url: "https://example.test" }],
  });
  assert.ok(errors.some((e) => e.includes("coordinate_provenance object")));
});

test("GEOCODED with a coordinate_provenance whose method is not GEOCODED_FROM_OFFICIAL_ADDRESS is rejected", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "GEOCODED",
    address: "Somewhere Real 1",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [{ url: "https://example.test" }],
    coordinate_provenance: { method: "SOMETHING_ELSE" },
  });
  assert.ok(errors.some((e) => e.includes("GEOCODED_FROM_OFFICIAL_ADDRESS")));
});

// The critical permanent distinction: a GEOCODED coordinate must never be
// relabeled as first-party CONFIRMED.
test("a CONFIRMED venue must not carry a GEOCODED_FROM_OFFICIAL_ADDRESS coordinate_provenance", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "CONFIRMED",
    address: "Somewhere Real 1",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [{ url: "https://example.test" }],
    coordinate_provenance: geocodedProvenance(),
  });
  assert.ok(errors.some((e) => e.includes("must not carry a GEOCODED_FROM_OFFICIAL_ADDRESS coordinate_provenance")));
});

test("an existing CONFIRMED venue with no coordinate_provenance at all remains valid (Capitólio/MEO Arena's own meaning is untouched)", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "CONFIRMED",
    address: "Somewhere Real 1",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [{ url: "https://example.test" }],
  });
  assert.deepEqual(errors, []);
});
