import assert from "node:assert/strict";
import test from "node:test";
import { geocodeAdmittedVenues } from "../ingestion/venue-onboarding/bounded-geocoding.mjs";

function addressOnlyVenue(id, overrides = {}) {
  return {
    venue_id: id,
    canonical_name: id,
    country_code: "PT",
    city: "Lisboa",
    municipality: "Lisboa",
    address: `Address for ${id}`,
    latitude: null,
    longitude: null,
    location_status: "ADDRESS_ONLY",
    evidence: [{ url: "https://example.test", kind: "OFFICIAL_VENUE_WEBSITE", note: "x" }],
    ...overrides,
  };
}

function fakeGeocoder({ liveCalls, geocodedIds = new Set() }) {
  return async (target) => {
    liveCalls.push(target.venue_id);
    if (geocodedIds.has(target.venue_id)) {
      return { venue_id: target.venue_id, outcome: "GEOCODED", latitude: 1, longitude: 1 };
    }
    return { venue_id: target.venue_id, outcome: "LEFT_ADDRESS_ONLY", reason: "NO_CANDIDATE_PASSED_ALL_CHECKS" };
  };
}

const registryTargetForVenue = () => ({ region: "lisbon", registryPath: "venues/lisbon.json" });

// 12. Geocoder live cap (15, or whatever is configured) is enforced.
test("12. no more than maxLiveRequests venues are actually geocoded live; the rest are READY_FOR_GEOCODING", async () => {
  const venues = Array.from({ length: 5 }, (_, i) => addressOnlyVenue(`venue-${i}`));
  const liveCalls = [];

  const { results, liveRequestCount } = await geocodeAdmittedVenues(venues, {
    maxLiveRequests: 3,
    registryTargetForVenue,
    loadCachedFixture: async () => null, // nothing cached — every request would be live
    validateCacheIdentity: () => ({ valid: false }),
    geocodeOneVenue: fakeGeocoder({ liveCalls }),
    cacheDir: "/fake/cache/dir",
  });

  assert.equal(liveRequestCount, 3);
  assert.equal(liveCalls.length, 3, "the geocoder itself must never be called beyond the cap");

  const readyForGeocoding = results.filter((r) => r.outcome === "READY_FOR_GEOCODING");
  assert.equal(readyForGeocoding.length, 2);
  // Retained, not discarded: every input venue has exactly one result.
  assert.equal(results.length, 5);
  for (const venue of venues) {
    assert.ok(results.some((r) => r.venue_id === venue.venue_id));
  }
});

test("12. the cap is a hard maximum even when every venue would otherwise geocode successfully", async () => {
  const venues = Array.from({ length: 20 }, (_, i) => addressOnlyVenue(`venue-${i}`));
  const geocodedIds = new Set(venues.map((v) => v.venue_id));
  const liveCalls = [];

  const { liveRequestCount } = await geocodeAdmittedVenues(venues, {
    maxLiveRequests: 15,
    registryTargetForVenue,
    loadCachedFixture: async () => null,
    validateCacheIdentity: () => ({ valid: false }),
    geocodeOneVenue: fakeGeocoder({ liveCalls, geocodedIds }),
    cacheDir: "/fake/cache/dir",
  });

  assert.ok(liveRequestCount <= 15);
  assert.equal(liveRequestCount, 15);
  assert.equal(liveCalls.length, 15);
});

// 13. Cached queries do not consume the live cap.
test("13. a venue with a valid cached fixture never counts against the cap, even when the cap is already exhausted", async () => {
  const venues = [addressOnlyVenue("venue-cached"), ...Array.from({ length: 3 }, (_, i) => addressOnlyVenue(`venue-live-${i}`))];
  const liveCalls = [];

  const { results, liveRequestCount } = await geocodeAdmittedVenues(venues, {
    maxLiveRequests: 3,
    registryTargetForVenue,
    // Only "venue-cached" has a fixture on disk.
    loadCachedFixture: async (venueId) => (venueId === "venue-cached" ? { venue_id: venueId } : null),
    validateCacheIdentity: (fixture) => ({ valid: Boolean(fixture) }),
    geocodeOneVenue: fakeGeocoder({ liveCalls }),
    cacheDir: "/fake/cache/dir",
  });

  // All 3 live-request budget goes to the 3 non-cached venues; the cached
  // one is still processed (geocodeOneVenue is still called — it reads
  // its own cache — but the cap accounting never counts it).
  assert.equal(liveRequestCount, 3);
  assert.equal(results.filter((r) => r.outcome === "READY_FOR_GEOCODING").length, 0);
  assert.ok(liveCalls.includes("venue-cached"), "a cached venue is still processed (cache hit), just not counted");
});

test("13. an invalid/stale cache fixture (identity mismatch) is treated as needing a live request", async () => {
  const venues = [addressOnlyVenue("venue-stale-cache")];
  const liveCalls = [];

  const { liveRequestCount } = await geocodeAdmittedVenues(venues, {
    maxLiveRequests: 15,
    registryTargetForVenue,
    loadCachedFixture: async () => ({ venue_id: "venue-stale-cache", query_address: "OLD ADDRESS" }),
    validateCacheIdentity: () => ({ valid: false, failures: ["query_address"] }),
    geocodeOneVenue: fakeGeocoder({ liveCalls }),
    cacheDir: "/fake/cache/dir",
  });

  assert.equal(liveRequestCount, 1);
});

test("an empty venue list makes zero geocoder calls and consumes zero cap", async () => {
  const liveCalls = [];
  const { results, liveRequestCount } = await geocodeAdmittedVenues([], {
    maxLiveRequests: 15,
    registryTargetForVenue,
    loadCachedFixture: async () => null,
    validateCacheIdentity: () => ({ valid: false }),
    geocodeOneVenue: fakeGeocoder({ liveCalls }),
    cacheDir: "/fake/cache/dir",
  });
  assert.deepEqual(results, []);
  assert.equal(liveRequestCount, 0);
  assert.equal(liveCalls.length, 0);
});

// 10/11 (cross-checked against the real orchestration's own module,
// ingestion/geocoding/run.mjs, unmodified) — GEOCODED vs LEFT_ADDRESS_ONLY
// outcomes pass through geocodeAdmittedVenues() unchanged, exactly as
// they come back from whatever geocodeOneVenue implementation is
// injected (proving this module never reinterprets/loosens them).
test("10/11. GEOCODED and LEFT_ADDRESS_ONLY outcomes from the injected geocoder pass through unchanged", async () => {
  const venues = [addressOnlyVenue("venue-will-geocode"), addressOnlyVenue("venue-will-fail")];
  const { results } = await geocodeAdmittedVenues(venues, {
    maxLiveRequests: 15,
    registryTargetForVenue,
    loadCachedFixture: async () => null,
    validateCacheIdentity: () => ({ valid: false }),
    geocodeOneVenue: fakeGeocoder({ liveCalls: [], geocodedIds: new Set(["venue-will-geocode"]) }),
    cacheDir: "/fake/cache/dir",
  });
  assert.equal(results.find((r) => r.venue_id === "venue-will-geocode").outcome, "GEOCODED");
  assert.equal(results.find((r) => r.venue_id === "venue-will-fail").outcome, "LEFT_ADDRESS_ONLY");
});
