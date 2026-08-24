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
// This module enforces BOTH the single-threaded requirement and the rate
// limit itself: every call to searchNominatimLive() is chained onto one
// shared internal promise queue (see requestQueue below), so even two
// calls entered concurrently (e.g. an accidental Promise.all in future
// code) can never have their fetches in flight at the same time, and the
// MIN_REQUEST_INTERVAL_MS wait always separates one call's start from the
// previous call's start — this is not just "well-behaved callers happen
// to await each other". Caching is the caller's responsibility (see
// ingestion/geocoding/run.mjs, which never calls this module for a venue
// that already has a validated, retained fixture unless `--refresh` is
// passed).

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
 * Waits until at least MIN_REQUEST_INTERVAL_MS has passed since the last
 * live request's start, then records this call's start time. Only ever
 * called from inside the serialized queue below (never directly by more
 * than one in-flight caller), so this module-level `lastRequestAt` state
 * is never read/written concurrently.
 */
async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (lastRequestAt !== 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((res) => setTimeout(res, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

// A tiny, dependency-free promise-chain mutex. Every call to
// searchNominatimLive() below chains its work onto this shared queue
// rather than running immediately, so calls are executed strictly one at
// a time in call order, regardless of whether callers await between
// calls. `.then(fn, fn)` (not just `.then(fn)`) deliberately runs the
// next queued call whether the previous one resolved OR rejected, so one
// failed request never permanently wedges every later call.
let requestQueue = Promise.resolve();

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
 * VENUE-LOCATION-RESOLUTION-02 — build the exact
 * `<canonical_name>, <canonical official address>` query string for the
 * NAME_PLUS_ADDRESS_QUERY strategy. Deterministic string construction
 * only: both inputs must already be non-empty, independently evidenced
 * canonical Venue fields (never Observation text, never a venue name
 * alone — see ingestion/geocoding/run.mjs's eligibility checks, which run
 * before this is ever called), and they are simply joined with ", " —
 * never reordered, trimmed of meaning, or otherwise reinterpreted. This is
 * the ONLY place NAME_PLUS_ADDRESS_QUERY's query text is assembled — kept
 * here, not in ingestion/venue/contract.mjs or match-address.mjs, per this
 * package's "provider-specific query construction stays in the Nominatim
 * adapter" rule.
 */
export function buildNamePlusAddressQuery(canonicalName, address) {
  if (typeof canonicalName !== "string" || canonicalName.trim() === "") {
    throw new Error("buildNamePlusAddressQuery requires a non-empty canonical_name");
  }
  if (typeof address !== "string" || address.trim() === "") {
    throw new Error("buildNamePlusAddressQuery requires a non-empty canonical address");
  }
  return `${canonicalName}, ${address}`;
}

/**
 * Issue ONE single, rate-limited, live Nominatim search request for
 * `address`. Safe to call without awaiting the previous call first — this
 * function itself serializes every call (see requestQueue above) so two
 * concurrent callers can never have overlapping fetches, and the
 * MIN_REQUEST_INTERVAL_MS wait always separates one call's start from the
 * previous one's.
 *
 * Returns a plain, JSON-serializable result — the exact shape
 * ingestion/geocoding/run.mjs retains verbatim as one cache fixture under
 * fixtures/geocoding/nominatim/.
 */
export async function searchNominatimLive(address, options = {}) {
  const runRequest = async () => {
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
  };

  // Chain this call onto the shared queue: it only starts once every
  // previously-queued call has fully settled (whether it resolved or
  // rejected), which is what actually guarantees single-threaded
  // execution rather than merely documenting it as a caller obligation.
  const scheduled = requestQueue.then(runRequest, runRequest);
  // Advance the queue to a promise that always resolves, so this call's
  // own failure doesn't propagate into (and permanently reject) whatever
  // the *next* call chains onto.
  requestQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}
