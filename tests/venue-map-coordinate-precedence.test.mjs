import assert from "node:assert/strict";
import test from "node:test";

import { resolveVenueMapCoordinates, projectObservationsToMapMarkers } from "../ingestion/map/projection.mjs";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01: resolveVenueMapCoordinates() is
// the single deterministic place canonical-vs-manual coordinate
// precedence is decided. A manual coordinate must NEVER override an
// existing CONFIRMED/GEOCODED coordinate, and ADDRESS_ONLY only becomes
// map-eligible with a VALID manual entry — never a fallback, never a
// guess.

const MANUAL_ENTRY = {
  venue_id: "venue-test",
  latitude: 38.72,
  longitude: -9.14,
  method: "MANUAL_OPERATOR_ENTRY",
  entered_at: "2026-08-24T14:30:00.000Z",
};

function observation(overrides = {}) {
  return {
    source_id: "agendalx",
    source_record_id: "1",
    retrieved_at: "2026-01-01T00:00:00Z",
    source_fields: { venue_id: 4952 },
    ...overrides,
  };
}

// 9. CONFIRMED coordinates take precedence over manual.
test("9. CONFIRMED canonical coordinates take precedence over a manual entry", () => {
  const venue = {
    venue_id: "venue-test",
    location_status: "CONFIRMED",
    latitude: 41.0,
    longitude: -8.0,
  };
  const result = resolveVenueMapCoordinates(venue, MANUAL_ENTRY);
  assert.equal(result.eligible, true);
  assert.equal(result.latitude, 41.0);
  assert.equal(result.longitude, -8.0);
  assert.equal(result.source, "CONFIRMED");
});

// 10. GEOCODED coordinates take precedence over manual.
test("10. GEOCODED canonical coordinates take precedence over a manual entry", () => {
  const venue = {
    venue_id: "venue-test",
    location_status: "GEOCODED",
    latitude: 41.0,
    longitude: -8.0,
  };
  const result = resolveVenueMapCoordinates(venue, MANUAL_ENTRY);
  assert.equal(result.eligible, true);
  assert.equal(result.latitude, 41.0);
  assert.equal(result.longitude, -8.0);
  assert.equal(result.source, "GEOCODED");
});

// 11. ADDRESS_ONLY + manual coordinates becomes map eligible.
test("11. ADDRESS_ONLY with a valid manual entry becomes map-eligible via the manual coordinates", () => {
  const venue = {
    venue_id: "venue-test",
    location_status: "ADDRESS_ONLY",
    latitude: null,
    longitude: null,
  };
  const result = resolveVenueMapCoordinates(venue, MANUAL_ENTRY);
  assert.equal(result.eligible, true);
  assert.equal(result.latitude, MANUAL_ENTRY.latitude);
  assert.equal(result.longitude, MANUAL_ENTRY.longitude);
  assert.equal(result.source, "MANUAL_OPERATOR_ENTRY");
});

// 12. ADDRESS_ONLY without manual remains non-map-eligible.
test("12. ADDRESS_ONLY without any manual entry remains non-map-eligible", () => {
  const venue = {
    venue_id: "venue-test",
    location_status: "ADDRESS_ONLY",
    latitude: null,
    longitude: null,
  };
  const result = resolveVenueMapCoordinates(venue, null);
  assert.equal(result.eligible, false);
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
});

// 13. UNRESOLVED remains non-map-eligible, even with a stray manual entry.
test("13. UNRESOLVED remains non-map-eligible regardless of any manual entry", () => {
  const venue = {
    venue_id: "venue-test",
    location_status: "UNRESOLVED",
    latitude: null,
    longitude: null,
  };
  const result = resolveVenueMapCoordinates(venue, MANUAL_ENTRY);
  assert.equal(result.eligible, false);
});

test("a manual entry with an invalid method is never honoured", () => {
  const venue = { venue_id: "venue-test", location_status: "ADDRESS_ONLY", latitude: null, longitude: null };
  const result = resolveVenueMapCoordinates(venue, { ...MANUAL_ENTRY, method: "SOMETHING_ELSE" });
  assert.equal(result.eligible, false);
});

test("a manual entry with out-of-range coordinates is never honoured", () => {
  const venue = { venue_id: "venue-test", location_status: "ADDRESS_ONLY", latitude: null, longitude: null };
  const result = resolveVenueMapCoordinates(venue, { ...MANUAL_ENTRY, latitude: 999 });
  assert.equal(result.eligible, false);
});

// 14. map/listing eligibility uses the composed coordinate result.
test("14. projectObservationsToMapMarkers uses the composed manual-aware coordinate result end to end", () => {
  const venues = [
    {
      venue_id: "venue-lisboa-igreja-e-convento-da-graca",
      canonical_name: "Igreja e Convento da Graça",
      location_status: "ADDRESS_ONLY",
      address: "Largo da Graça, 1170-165 Lisboa",
      latitude: null,
      longitude: null,
    },
  ];

  // Without a manual entry: still no marker.
  const withoutManual = projectObservationsToMapMarkers([observation()], { venues, sourceRegistry: [] });
  assert.equal(withoutManual.length, 0);

  // With a valid manual entry: exactly one marker, at the manual coordinates.
  const withManual = projectObservationsToMapMarkers([observation()], {
    venues,
    sourceRegistry: [],
    manualCoordinatesByVenueId: { "venue-lisboa-igreja-e-convento-da-graca": MANUAL_ENTRY },
  });
  assert.equal(withManual.length, 1);
  assert.equal(withManual[0].latitude, MANUAL_ENTRY.latitude);
  assert.equal(withManual[0].longitude, MANUAL_ENTRY.longitude);

  // Also accepts a plain Map, not just a plain object.
  const withManualMap = projectObservationsToMapMarkers([observation()], {
    venues,
    sourceRegistry: [],
    manualCoordinatesByVenueId: new Map([["venue-lisboa-igreja-e-convento-da-graca", MANUAL_ENTRY]]),
  });
  assert.equal(withManualMap.length, 1);
});

test("a stale manual entry is never used once the venue becomes CONFIRMED/GEOCODED — canonical always wins", () => {
  const venues = [
    {
      venue_id: "venue-lisboa-igreja-e-convento-da-graca",
      canonical_name: "Igreja e Convento da Graça",
      location_status: "GEOCODED",
      address: "Largo da Graça, 1170-165 Lisboa",
      latitude: 38.7147,
      longitude: -9.1306,
    },
  ];
  const markers = projectObservationsToMapMarkers([observation()], {
    venues,
    sourceRegistry: [],
    manualCoordinatesByVenueId: { "venue-lisboa-igreja-e-convento-da-graca": { ...MANUAL_ENTRY, latitude: 0, longitude: 0 } },
  });
  assert.equal(markers.length, 1);
  assert.equal(markers[0].latitude, 38.7147);
  assert.equal(markers[0].longitude, -9.1306);
});

test("omitting manualCoordinatesByVenueId entirely leaves existing CONFIRMED/GEOCODED-only behaviour completely unchanged", () => {
  const venues = [
    {
      venue_id: "venue-lisboa-igreja-e-convento-da-graca",
      canonical_name: "Igreja e Convento da Graça",
      location_status: "GEOCODED",
      address: "Largo da Graça, 1170-165 Lisboa",
      latitude: 38.7147,
      longitude: -9.1306,
    },
  ];
  const markers = projectObservationsToMapMarkers([observation()], { venues, sourceRegistry: [] });
  assert.equal(markers.length, 1);
  assert.equal(markers[0].latitude, 38.7147);
});
