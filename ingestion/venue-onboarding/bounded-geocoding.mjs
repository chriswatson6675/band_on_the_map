// VENUE-AUTO-ONBOARDING-01 — the hard live-geocoder request cap (this
// task's brief, section 7): at most MAX_LIVE_GEOCODE_REQUESTS uncached
// live Nominatim requests across a whole `npm run onboard:venues` run.
// A cache HIT that also passes VENUE-GEOCODING-01A's own identity check
// (ingestion/geocoding/run.mjs's validateCacheIdentity) never counts
// against the cap. Once the cap is reached, every remaining newly
// admitted ADDRESS_ONLY venue is reported READY_FOR_GEOCODING — never
// discarded, never geocoded anyway.
//
// This orchestration is factored out into its own small, dependency-
// injected module so it can be unit-tested (tests/venue-onboarding-
// geocoding-cap.test.mjs) against a fake geocodeOneVenue/
// loadCachedFixture pair — never the real network, and without needing
// to drive the whole ingestion/venue-onboarding/run.mjs script.

export const DEFAULT_MAX_LIVE_GEOCODE_REQUESTS = 15;

/**
 *   venues                    - newly admitted ADDRESS_ONLY canonical Venue[]
 *   options.maxLiveRequests    - the hard cap (default 15)
 *   options.registryTargetForVenue - (venue) => { region, registryPath }
 *   options.loadCachedFixture  - (venueId, cacheDir) => fixture | null
 *   options.validateCacheIdentity - (fixture, target, venue) => { valid, failures }
 *   options.geocodeOneVenue    - (target, opts) => result (the real
 *                                 ingestion/geocoding/run.mjs#geocodeOneVenue,
 *                                 or a fake for tests)
 *   options.cacheDir           - passed through to loadCachedFixture
 *
 * Returns `{ results, liveRequestCount }` — `results` has one entry per
 * input venue, in order; `liveRequestCount` is the exact number of
 * genuinely live (non-cached) requests this call made, always
 * `<= maxLiveRequests`.
 */
export async function geocodeAdmittedVenues(
  venues,
  {
    maxLiveRequests = DEFAULT_MAX_LIVE_GEOCODE_REQUESTS,
    registryTargetForVenue,
    loadCachedFixture,
    validateCacheIdentity,
    geocodeOneVenue,
    cacheDir,
  },
) {
  let liveRequestCount = 0;
  const results = [];

  for (const venue of venues ?? []) {
    const { region, registryPath } = registryTargetForVenue(venue);
    const target = { venue_id: venue.venue_id, region, registryPath };

    const cachedFixture = await loadCachedFixture(venue.venue_id, cacheDir);
    const identity = cachedFixture ? validateCacheIdentity(cachedFixture, target, venue) : { valid: false };
    const cacheValid = Boolean(identity.valid);

    if (!cacheValid && liveRequestCount >= maxLiveRequests) {
      results.push({
        venue_id: venue.venue_id,
        outcome: "READY_FOR_GEOCODING",
        reason: `live geocode cap (${maxLiveRequests}) reached — retained ADDRESS_ONLY, not discarded`,
      });
      continue;
    }

    if (!cacheValid) liveRequestCount += 1;

    const result = await geocodeOneVenue(target, {});
    results.push(result);
  }

  return { results, liveRequestCount };
}
