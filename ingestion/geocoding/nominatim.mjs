// Nominatim (OpenStreetMap) provider adapter for VENUE-GEOCODING-01's
// one-time, bounded, developer-side canonical Venue geocoding.
//
// This is deliberately NOT production/runtime geocoding infrastructure:
// nothing in this module (or ingestion/geocoding/run.mjs, its one manual
// entry point — `npm run geocode:venues`) is imported by the web
// frontend, runs on every ingestion, runs per-Observation/per-event, is
// scheduled, or backs autocomplete. See docs/ARCHITECTURE.md and this
// package's own doc comments for that boundary.
//
// Every Nominatim-specific concern — base URL, query parameters, response
// shape, User-Agent, rate limiting — is kept behind this one small
// adapter so a future package can swap providers without touching
// ingestion/geocoding/match-address.mjs, ingestion/geocoding/run.mjs's
// orchestration, or the Venue model (ingestion/venue/contract.mjs).
//
// Public Nominatim usage policy
// (https://operations.osmfoundation.org/policies/nominatim/) requires:
//   - single-threaded requests (never issued concurrently);
//   - no more than 1 request/second;
//   - a valid, identifying User-Agent (not a generic browser UA);
//   - caching results rather than repeating the same query.
// This module enforces the rate limit itself (MIN_REQUEST_INTERVAL_MS,
// waited before every live request); caching is the caller's
// responsibility (see ingestion/geocoding/run.mjs, which never calls this
// module for a venue that already has a retained fixture unless
// `--refresh` is passed).

import { fetchText } from "../http/fetch.mjs";

export const NOMINATIM_USER_AGENT =
  "BandOnTheMap-VenueGeocoder/0.1 (+https://github.com/chriswatson6675/band_on_the_map)";

// Configurable base URL so a future task can point this at a different
// Nominatim-compatible instance (or a wholly different provider's own
// adapter) purely through configuration.
export const NOMINATIM_BASE_URL = process.env.BOTM_NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org";

// Never exceed 1 request/second; wait a little more than a second to stay
// safely inside the public policy rather than riding the exact limit.
export const MIN_REQUEST_INTERVAL_MS = 1100;

let lastRequestAt = 0;

/**
 * Serializes live requests to at least MIN_REQUEST_INTERVAL_MS apart.
 * Module-level state is intentional: every live call in one process
 * (i.e. one `npm run geocode:venues` invocation) shares the same
 * rate-limit clock, so callers cannot accidentally issue two requests in
 * parallel by forgetting to await.
 */
async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (lastRequestAt !== 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((res) => setTimeout(res, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

/**
 * Build the exact Nominatim `/search` URL for one address query. Fixed
 * to `format=jsonv2&addressdetails=1&limit=5&countrycodes=pt` per this
 * package's brief — never broadened to a venue-name search.
 */
export function buildNominatimSearchUrl(
  address,
  { countrycodes = "pt", limit = 5, baseUrl = NOMINATIM_BASE_URL } = {},
) {
  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    countrycodes,
  });
  return `${baseUrl}/search?${params.toString()}`;
}

/**
 * Issue ONE single, rate-limited, live Nominatim search request for
 * `address`. Never call this in a loop without awaiting each call before
 * starting the next (this module's own rate limiter enforces the delay,
 * but callers must still stay single-threaded — never Promise.all this).
 *
 * Returns a plain, JSON-serializable result — the exact shape
 * ingestion/geocoding/run.mjs retains verbatim as one cache fixture under
 * fixtures/geocoding/nominatim/.
 */
export async function searchNominatimLive(address, options = {}) {
  await waitForRateLimit();
  const url = buildNominatimSearchUrl(address, options);
  const res = await fetchText(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
  });

  let candidates = [];
  if (res.ok) {
    try {
      const parsed = JSON.parse(res.text);
      candidates = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new Error(`Failed to parse Nominatim response as JSON for "${address}": ${error.message}`);
    }
  }

  return {
    url,
    status: res.status,
    ok: res.ok,
    candidates,
    retrieved_at: res.retrievedAt ?? new Date().toISOString(),
  };
}
