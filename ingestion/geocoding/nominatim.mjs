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
import { extractPostcode, extractStreet } from "./match-address.mjs";

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
 * Fetch and parse ONE Nominatim response for an already-built `url`,
 * after waiting out the shared rate limit. Never called directly by more
 * than one in-flight caller — see the queue chaining below, shared by
 * BOTH searchNominatimLive() (free-text `q=`) and
 * searchNominatimStructuredLive() (VENUE-LOCATION-RESOLUTION-03's
 * structured amenity/street/city/... search) — a live structured request
 * and a live free-text request can therefore never race each other
 * either, and both count against the exact same MIN_REQUEST_INTERVAL_MS
 * spacing.
 */
async function fetchNominatimUrl(url, describeForErrors) {
  await waitForRateLimit();
  const res = await fetchText(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
  });

  let candidates = [];
  if (res.ok) {
    try {
      const parsed = JSON.parse(res.text);
      candidates = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new Error(`Failed to parse Nominatim response as JSON for ${describeForErrors}: ${error.message}`);
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

/**
 * Chain `runRequest` onto the shared single-threaded request queue.
 * `.then(fn, fn)` deliberately runs the next queued call whether the
 * previous one resolved OR rejected, so one failed request never
 * permanently wedges every later call (free-text or structured).
 */
function enqueueNominatimRequest(runRequest) {
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
  const url = buildNominatimSearchUrl(address, options);
  return enqueueNominatimRequest(() => fetchNominatimUrl(url, `"${address}"`));
}

// ===========================================================================
// VENUE-LOCATION-RESOLUTION-03 — STRUCTURED_POI_QUERY: Nominatim's
// documented STRUCTURED search form (separate amenity/street/city/county/
// state/country/postalcode fields, never a single free-text `q=` string),
// with layer=poi so only point-of-interest-shaped results are returned.

// Fixed, non-derived structured-search params (this package's brief,
// section "Structured query construction"): every field here is the same
// for every STRUCTURED_POI_QUERY request this project ever issues — never
// venue-specific, never derived from an address. Frozen so a cache
// fixture can compare against it directly.
export const STRUCTURED_POI_FIXED_PARAMS = Object.freeze({
  country: "Portugal",
  countrycodes: "pt",
  format: "jsonv2",
  addressdetails: "1",
  namedetails: "1",
  extratags: "1",
  limit: "5",
  layer: "poi",
});

/**
 * Deterministically derive STRUCTURED_POI_QUERY's own structured search
 * fields from ONE canonical Venue's already-evidenced identity — never
 * from Observation text, never from an unresolved/unadmitted candidate.
 * `amenity` is always the venue's own canonical_name (this package's
 * "amenity field equals canonical venue identity" rule — never a fuzzy or
 * partial name). `city` is the venue's municipality/city where present.
 * `postalcode`/`street` are included ONLY when deterministically
 * extractable from the canonical address (extractPostcode()/
 * extractStreet() from match-address.mjs) — omitted, never guessed,
 * otherwise; the query remains valid with amenity+city+postalcode alone.
 */
export function buildStructuredPoiFields(canonicalName, address, cityOrMunicipality) {
  if (typeof canonicalName !== "string" || canonicalName.trim() === "") {
    throw new Error("buildStructuredPoiFields requires a non-empty canonical_name");
  }
  if (typeof address !== "string" || address.trim() === "") {
    throw new Error("buildStructuredPoiFields requires a non-empty canonical address");
  }

  const fields = { amenity: canonicalName };
  if (typeof cityOrMunicipality === "string" && cityOrMunicipality.trim() !== "") {
    fields.city = cityOrMunicipality;
  }
  const postalcode = extractPostcode(address);
  if (postalcode) fields.postalcode = postalcode;
  const street = extractStreet(address);
  if (street) fields.street = street;
  return fields;
}

/**
 * Build the exact Nominatim `/search` URL for STRUCTURED_POI_QUERY's
 * structured fields. NEVER sends a `q=` free-text parameter alongside the
 * structured fields (Nominatim's own structured-search contract, and this
 * package's brief). `amenity` is required; `street`/`city`/`county`/
 * `state` are included only when actually present on `fields`.
 */
export function buildStructuredPoiSearchUrl(fields, { baseUrl = NOMINATIM_BASE_URL } = {}) {
  if (!fields || typeof fields.amenity !== "string" || fields.amenity.trim() === "") {
    throw new Error("buildStructuredPoiSearchUrl requires a non-empty amenity field");
  }

  const params = new URLSearchParams();
  params.set("amenity", fields.amenity);
  if (fields.street) params.set("street", fields.street);
  if (fields.city) params.set("city", fields.city);
  if (fields.county) params.set("county", fields.county);
  if (fields.state) params.set("state", fields.state);
  params.set("country", STRUCTURED_POI_FIXED_PARAMS.country);
  if (fields.postalcode) params.set("postalcode", fields.postalcode);
  params.set("countrycodes", STRUCTURED_POI_FIXED_PARAMS.countrycodes);
  params.set("format", STRUCTURED_POI_FIXED_PARAMS.format);
  params.set("addressdetails", STRUCTURED_POI_FIXED_PARAMS.addressdetails);
  params.set("namedetails", STRUCTURED_POI_FIXED_PARAMS.namedetails);
  params.set("extratags", STRUCTURED_POI_FIXED_PARAMS.extratags);
  params.set("limit", STRUCTURED_POI_FIXED_PARAMS.limit);
  params.set("layer", STRUCTURED_POI_FIXED_PARAMS.layer);
  // Deliberately never params.set("q", ...) — see this function's doc
  // comment and tests/geocoding-structured-poi.test.mjs test 6.
  return `${baseUrl}/search?${params.toString()}`;
}

/**
 * Issue ONE single, rate-limited, live Nominatim STRUCTURED search
 * request. Shares searchNominatimLive()'s exact same serialized queue and
 * rate limiter (see fetchNominatimUrl/enqueueNominatimRequest above) —
 * never a second, independent request path that could race a free-text
 * request or exceed 1 request/second in combination with it.
 */
export async function searchNominatimStructuredLive(fields, options = {}) {
  const url = buildStructuredPoiSearchUrl(fields, options);
  return enqueueNominatimRequest(() => fetchNominatimUrl(url, JSON.stringify(fields)));
}

// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — a direct
// Nominatim `/lookup` of one already-known OSM node/way/relation id, used
// when a venue candidate's own originating OSM object id is already known
// (e.g. from research/venue-estate/london-venue-estate-01.json's own
// osm_ref) — this resolves directly to that exact object's own recorded
// address/coordinates. This is not a fuzzy name/address search that might
// match the wrong place; it is asking the same open dataset the candidate
// itself came from for that candidate's own recorded location. Still
// shares the exact same rate-limited, single-threaded queue as
// searchNominatimLive()/searchNominatimStructuredLive() above — never a
// second, independent request path.

const OSM_TYPE_PREFIXES = Object.freeze({ node: "N", way: "W", relation: "R" });

/**
 * Build the exact Nominatim `/lookup` URL for one OSM object.
 * `osmType` must be "node" | "way" | "relation"; `osmId` the bare numeric
 * OSM id (string or number) — never a fabricated/guessed id, always one
 * already cited in this project's own retained research evidence.
 */
export function buildNominatimLookupUrl(osmType, osmId, { baseUrl = NOMINATIM_BASE_URL } = {}) {
  const prefix = OSM_TYPE_PREFIXES[osmType];
  if (!prefix) {
    throw new Error(`buildNominatimLookupUrl requires osmType to be one of ${Object.keys(OSM_TYPE_PREFIXES).join(", ")}`);
  }
  if ((typeof osmId !== "string" && typeof osmId !== "number") || String(osmId).trim() === "") {
    throw new Error("buildNominatimLookupUrl requires a non-empty osmId");
  }
  const params = new URLSearchParams({
    osm_ids: `${prefix}${osmId}`,
    format: "jsonv2",
    addressdetails: "1",
  });
  return `${baseUrl}/lookup?${params.toString()}`;
}

/**
 * Issue ONE single, rate-limited, live Nominatim `/lookup` request for a
 * known OSM node/way/relation id. Shares the exact same serialized queue
 * and rate limiter as every other live call in this module.
 */
export async function lookupNominatimOsmIdLive(osmType, osmId, options = {}) {
  const url = buildNominatimLookupUrl(osmType, osmId, options);
  return enqueueNominatimRequest(() => fetchNominatimUrl(url, `${osmType}/${osmId}`));
}

/**
 * Parse `osm_ref` as retained in research/venue-estate/london-venue-estate-01.json
 * (e.g. "osm-node-10251739583", "osm-way-1110282368", "osm-relation-2023676")
 * into `{ osmType, osmId }` for lookupNominatimOsmIdLive()/buildNominatimLookupUrl().
 * Throws on anything not matching that exact retained shape — never guesses.
 */
export function parseOsmRef(osmRef) {
  const match = /^osm-(node|way|relation)-(\d+)$/.exec(String(osmRef ?? ""));
  if (!match) {
    throw new Error(`parseOsmRef: "${osmRef}" is not a recognised osm-{node|way|relation}-<id> reference`);
  }
  return { osmType: match[1], osmId: match[2] };
}
