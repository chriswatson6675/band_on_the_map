// VENUE-DISCOVERY-ENGINE-01 — Overpass API network adapter.
//
// Every Overpass-specific concern (endpoint, request shape, timeout,
// User-Agent) is kept behind this one small module, matching this
// repository's existing provider-adapter pattern (see
// ingestion/geocoding/nominatim.mjs's own doc comment). Network
// interaction is the ONLY thing this module does — it never builds a
// query (query-builder.mjs) and never interprets a response
// (parse.mjs) — so tests can inject a fake `fetchImpl` and run fully
// offline (see tests/venue-discovery-overpass-*.test.mjs).

export const OVERPASS_USER_AGENT =
  "BandOnTheMap-VenueDiscovery/0.1 (+https://github.com/chriswatson6675/band_on_the_map)";

export const OVERPASS_BASE_URL = process.env.BOTM_OVERPASS_BASE_URL ?? "https://overpass-api.de/api/interpreter";

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * POST one Overpass QL `query` and return the parsed JSON body (or throw
 * on a non-2xx response or invalid JSON — a genuine failure to acquire,
 * not something for this module to silently paper over). `fetchImpl`
 * defaults to the global `fetch` but is always overridable, so
 * offline/fixture-driven tests never touch the network.
 */
export async function fetchOverpass(
  query,
  { baseUrl = OVERPASS_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {},
) {
  if (typeof query !== "string" || query.trim() === "") {
    throw new Error("fetchOverpass requires a non-empty query string");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const retrievedAt = new Date().toISOString();

  try {
    const response = await fetchImpl(baseUrl, {
      method: "POST",
      headers: {
        "User-Agent": OVERPASS_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Overpass request failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error(`Overpass response was not valid JSON: ${error.message}`);
    }

    return { body, retrievedAt, sourceUrl: baseUrl };
  } finally {
    clearTimeout(timeout);
  }
}
