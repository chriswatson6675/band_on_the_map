import assert from "node:assert/strict";
import test from "node:test";
import { projectObservationsToMapMarkers } from "../ingestion/map/projection.mjs";

// VENUE-GEOCODING-01: a Venue is now map-eligible when location_status is
// CONFIRMED OR GEOCODED and it carries valid numeric coordinates.
// ADDRESS_ONLY/UNRESOLVED remain non-eligible; no fallback coordinate is
// ever substituted.

function observation(overrides = {}) {
  return {
    source_id: "agendalx",
    source_record_id: "1",
    retrieved_at: "2026-01-01T00:00:00Z",
    source_fields: { venue_id: 4952 },
    ...overrides,
  };
}

// 9. ADDRESS_ONLY remains non-map-eligible.
test("9. an ADDRESS_ONLY venue never produces a marker", () => {
  const markers = projectObservationsToMapMarkers([observation()], {
    venues: [
      {
        venue_id: "venue-lisboa-igreja-e-convento-da-graca",
        canonical_name: "Igreja e Convento da Graça",
        location_status: "ADDRESS_ONLY",
        address: "Largo da Graça, 1170-165 Lisboa",
        latitude: null,
        longitude: null,
      },
    ],
    sourceRegistry: [],
  });
  assert.equal(markers.length, 0);
});

// 10. GEOCODED becomes map-eligible.
test("10. a GEOCODED venue with valid coordinates produces a marker", () => {
  const markers = projectObservationsToMapMarkers([observation()], {
    venues: [
      {
        venue_id: "venue-lisboa-igreja-e-convento-da-graca",
        canonical_name: "Igreja e Convento da Graça",
        location_status: "GEOCODED",
        address: "Largo da Graça, 1170-165 Lisboa",
        latitude: 38.7147,
        longitude: -9.1306,
        coordinate_provenance: { method: "GEOCODED_FROM_OFFICIAL_ADDRESS" },
      },
    ],
    sourceRegistry: [],
  });
  assert.equal(markers.length, 1);
  assert.equal(markers[0].venue_id, "venue-lisboa-igreja-e-convento-da-graca");
  assert.equal(markers[0].latitude, 38.7147);
  assert.equal(markers[0].longitude, -9.1306);
});

// 11. existing CONFIRMED remains map-eligible.
test("11. a CONFIRMED venue with valid coordinates still produces a marker (unchanged meaning)", () => {
  const markers = projectObservationsToMapMarkers([observation()], {
    venues: [
      {
        venue_id: "venue-lisboa-igreja-e-convento-da-graca",
        canonical_name: "Igreja e Convento da Graça",
        location_status: "CONFIRMED",
        address: "Largo da Graça, 1170-165 Lisboa",
        latitude: 38.7147,
        longitude: -9.1306,
      },
    ],
    sourceRegistry: [],
  });
  assert.equal(markers.length, 1);
});

// 12. invalid numeric coordinates remain rejected.
test("12. a venue with non-numeric/out-of-range coordinates never produces a marker, regardless of location_status", () => {
  for (const location_status of ["CONFIRMED", "GEOCODED"]) {
    for (const [latitude, longitude] of [
      ["38.7", -9.1],
      [NaN, -9.1],
      [999, -9.1],
      [38.7, 999],
    ]) {
      const markers = projectObservationsToMapMarkers([observation()], {
        venues: [
          {
            venue_id: "venue-lisboa-igreja-e-convento-da-graca",
            canonical_name: "Igreja e Convento da Graça",
            location_status,
            address: "Largo da Graça, 1170-165 Lisboa",
            latitude,
            longitude,
          },
        ],
        sourceRegistry: [],
      });
      assert.equal(markers.length, 0, `location_status=${location_status} lat=${latitude} lng=${longitude}`);
    }
  }
});

test("UNRESOLVED still never produces a marker", () => {
  const markers = projectObservationsToMapMarkers([observation()], {
    venues: [
      {
        venue_id: "venue-lisboa-igreja-e-convento-da-graca",
        canonical_name: "Igreja e Convento da Graça",
        location_status: "UNRESOLVED",
        address: null,
        latitude: null,
        longitude: null,
      },
    ],
    sourceRegistry: [],
  });
  assert.equal(markers.length, 0);
});
