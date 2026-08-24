import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { toObservations as vuToObservations } from "../ingestion/village-underground/observation-adapter.mjs";
import { projectObservationsToDisplayMarkers } from "../ingestion/map/group-associated-listings.mjs";
import { summariseCity } from "../ingestion/lisbon-porto/run.mjs";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01A regression: 01's own
// tests/venue-map-coordinate-precedence.test.mjs proved
// projectObservationsToMapMarkers (the low-level function) honours
// manualCoordinatesByVenueId — but the REAL display/map surface never
// calls that function directly. It goes through
// projectObservationsToDisplayMarkers (ingestion/map/group-associated-
// listings.mjs) and, in the live runner, ingestion/lisbon-porto/run.mjs's
// summariseCity(). Neither forwarded manualCoordinatesByVenueId before
// this fix, so a dashboard save persisted correctly but never actually
// unlocked anything on the real map/listing surface. These tests exercise
// that ACTUAL call chain, not just the low-level primitive.
//
// No live network access, and no write to the real
// venues/manual-coordinates.json — every manual entry here is an
// in-memory-only Map passed directly as a parameter, exactly like a real
// caller would build from ingestion/geocoding/manual-coordinate-store.mjs's
// loadManualCoordinateStore() output.

const MANUAL_ENTRY = {
  venue_id: "venue-lisboa-igreja-e-convento-da-graca",
  latitude: 38.7147,
  longitude: -9.1306,
  method: "MANUAL_OPERATOR_ENTRY",
  entered_at: "2026-08-24T14:30:00.000Z",
};

function addressOnlyVenue(overrides = {}) {
  return {
    venue_id: "venue-lisboa-igreja-e-convento-da-graca",
    canonical_name: "Igreja e Convento da Graça",
    location_status: "ADDRESS_ONLY",
    address: "Largo da Graça, 1170-165 Lisboa",
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    source_id: "agendalx",
    source_record_id: "1",
    title: "Test gig",
    retrieved_at: "2026-01-01T00:00:00Z",
    source_fields: { venue_id: 4952 }, // AgendaLX resolver mapping -> Igreja e Convento da Graça
    ...overrides,
  };
}

// --- projectObservationsToDisplayMarkers: the actual grouping layer used
// by every real display/map call site (ingestion/lisbon-porto/run.mjs,
// ingestion/lisbon-porto/generate-proof.mjs, ingestion/venue-onboarding/run.mjs) ---

test("projectObservationsToDisplayMarkers: WITHOUT a manual entry, an ADDRESS_ONLY venue produces no marker/listing", () => {
  const markers = projectObservationsToDisplayMarkers([observation()], {
    venues: [addressOnlyVenue()],
    sourceRegistry: [],
  });
  assert.equal(markers.length, 0);
});

test("projectObservationsToDisplayMarkers: WITH a valid manual entry, the venue becomes a real marker with a real display listing", () => {
  const markers = projectObservationsToDisplayMarkers([observation()], {
    venues: [addressOnlyVenue()],
    sourceRegistry: [],
    manualCoordinatesByVenueId: { [MANUAL_ENTRY.venue_id]: MANUAL_ENTRY },
  });
  assert.equal(markers.length, 1, "marker count +1");
  assert.equal(markers[0].latitude, MANUAL_ENTRY.latitude, "the marker uses the manual latitude");
  assert.equal(markers[0].longitude, MANUAL_ENTRY.longitude, "the marker uses the manual longitude");
  assert.equal(markers[0].listings.length, 1, "raw map-eligible listing included");
  assert.equal(markers[0].display_listings.length, 1, "display listing included");
  assert.equal(markers[0].display_listings[0].kind, "SINGLE");
});

test("projectObservationsToDisplayMarkers also accepts a Map, not just a plain object, for manualCoordinatesByVenueId", () => {
  const markers = projectObservationsToDisplayMarkers([observation()], {
    venues: [addressOnlyVenue()],
    sourceRegistry: [],
    manualCoordinatesByVenueId: new Map([[MANUAL_ENTRY.venue_id, MANUAL_ENTRY]]),
  });
  assert.equal(markers.length, 1);
});

// --- summariseCity: the real per-city composition used by
// ingestion/lisbon-porto/run.mjs's live proof (npm run ingest:lisbon-porto),
// including the resolved_but_unmapped_by_venue_id breakdown the operator
// dashboard actually reads. Uses REAL, retained, fixture-backed Village
// Underground Observations (never live network) resolved against the
// REAL committed venues/lisbon.json entry for it (currently ADDRESS_ONLY),
// so this exercises the genuine end-to-end shape, not a synthetic stand-in. ---

const VU_EVENTS_DIR = new URL("../fixtures/village-underground/events/", import.meta.url);

async function loadRealVillageUndergroundObservations() {
  const metadata = JSON.parse(
    await readFile(new URL("../fixtures/village-underground/metadata.json", import.meta.url), "utf8"),
  );
  const names = (await readdir(VU_EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    const slug = name.replace(/\.ics$/, "");
    const request = metadata.requests_made.find((r) => r.slug === slug);
    entries.push({
      slug,
      eventUrl: `https://vulisboa.com/eventos/${slug}`,
      icsUrl: request?.url ?? null,
      icsText: await readFile(new URL(name, VU_EVENTS_DIR), "utf8"),
      fixturePath: `fixtures/village-underground/events/${name}`,
    });
  }
  return vuToObservations(entries, { retrievedAt: metadata.retrieved_at });
}

async function loadRealLisbonVenues() {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  return registry.venues;
}

test("summariseCity: with an EMPTY manual-coordinate map, behaviour is identical to omitting the parameter entirely (the current committed venues/manual-coordinates.json is empty, so this is exactly today's real baseline)", async () => {
  const observations = await loadRealVillageUndergroundObservations();
  const venues = await loadRealLisbonVenues();
  assert.ok(observations.length > 0, "sanity: real fixture Observations were loaded");

  const withoutParam = summariseCity({
    label: "test",
    sourceResults: [{ source_id: "village-underground-lisboa", success: true, raw_record_count: observations.length, observation_count: observations.length, notes: [] }],
    observations,
    venues,
    sourceRegistry: [],
  });
  const withEmptyMap = summariseCity({
    label: "test",
    sourceResults: [{ source_id: "village-underground-lisboa", success: true, raw_record_count: observations.length, observation_count: observations.length, notes: [] }],
    observations,
    venues,
    sourceRegistry: [],
    manualCoordinatesByVenueId: new Map(),
  });

  assert.deepEqual(withEmptyMap.display_listing_count, withoutParam.display_listing_count);
  assert.deepEqual(withEmptyMap.raw_map_eligible_count, withoutParam.raw_map_eligible_count);
  assert.deepEqual(withEmptyMap.resolved_but_unmapped_count, withoutParam.resolved_but_unmapped_count);
  assert.deepEqual(withEmptyMap.resolved_but_unmapped_by_venue_id, withoutParam.resolved_but_unmapped_by_venue_id);
  assert.deepEqual(withEmptyMap.map_marker_count, withoutParam.map_marker_count);

  // Real current state: Village Underground Lisboa is ADDRESS_ONLY in the
  // committed registry with no manual entry, so every one of its resolved
  // Observations is genuinely blocked today.
  const vuVenue = venues.find((v) => v.venue_id === "venue-lisboa-village-underground-lisboa");
  assert.equal(vuVenue.location_status, "ADDRESS_ONLY", "sanity: still ADDRESS_ONLY in the real committed registry");
  assert.equal(withoutParam.display_listing_count, 0);
  assert.ok(withoutParam.resolved_but_unmapped_by_venue_id["venue-lisboa-village-underground-lisboa"] > 0);
});

test("summariseCity: a temporary (never persisted) manual entry for Village Underground moves its Observations from resolved-but-unmapped into display/map eligibility", async () => {
  const observations = await loadRealVillageUndergroundObservations();
  const venues = await loadRealLisbonVenues();
  const vuVenueId = "venue-lisboa-village-underground-lisboa";

  const sourceResults = [
    {
      source_id: "village-underground-lisboa",
      success: true,
      raw_record_count: observations.length,
      observation_count: observations.length,
      notes: [],
    },
  ];

  const before = summariseCity({ label: "test", sourceResults, observations, venues, sourceRegistry: [] });
  const blockedBefore = before.resolved_but_unmapped_by_venue_id[vuVenueId] ?? 0;
  assert.ok(blockedBefore > 0, "sanity: some real Village Underground Observations are genuinely blocked today");
  assert.equal(before.display_listing_count, 0);
  assert.equal(before.map_marker_count, 0);

  // A synthetic, in-memory-only manual entry — this test never reads or
  // writes the real venues/manual-coordinates.json file.
  const manualCoordinatesByVenueId = new Map([
    [
      vuVenueId,
      {
        venue_id: vuVenueId,
        latitude: 38.72,
        longitude: -9.15,
        method: "MANUAL_OPERATOR_ENTRY",
        entered_at: "2026-08-24T00:00:00.000Z",
      },
    ],
  ]);

  const after = summariseCity({
    label: "test",
    sourceResults,
    observations,
    venues,
    sourceRegistry: [],
    manualCoordinatesByVenueId,
  });

  assert.equal(after.resolved_but_unmapped_by_venue_id[vuVenueId] ?? 0, 0, "no longer counted as blocked");
  assert.equal(after.resolved_but_unmapped_count, before.resolved_but_unmapped_count - blockedBefore);
  assert.equal(after.display_listing_count, blockedBefore, "those Observations are now real display listings");
  assert.equal(after.raw_map_eligible_count, blockedBefore);
  assert.equal(after.map_marker_count, 1, "exactly one new marker for Village Underground");
  assert.equal(after.markers[0].latitude, 38.72);
  assert.equal(after.markers[0].longitude, -9.15);

  // The canonical Venue record itself is completely untouched — still
  // honestly ADDRESS_ONLY. Only the composed map/display view changed.
  const vuVenue = venues.find((v) => v.venue_id === vuVenueId);
  assert.equal(vuVenue.location_status, "ADDRESS_ONLY");
  assert.equal(vuVenue.latitude, null);
  assert.equal(vuVenue.longitude, null);
});
