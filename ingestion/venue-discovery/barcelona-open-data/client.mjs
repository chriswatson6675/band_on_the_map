// VENUE-DISCOVERY-ENGINE-01 — Ajuntament de Barcelona Open Data client.
//
// This collector is deliberately AREA-SPECIFIC, not part of the generic
// engine: every city has its own open-data portal with its own schema,
// so unlike ingestion/venue-discovery/overpass/ this module is never
// expected to be reused unmodified for Madrid or Berlin (see
// docs/VENUE_DISCOVERY.md PHASE 2C). It exists because Barcelona
// happens to publish a genuinely useful, free, CC-BY 4.0, weekly-updated
// dataset of music/drinks premises
// (opendata-ajuntament.barcelona.cat, dataset "Espais de música i
// copes") with explicit category tags (e.g. "Locals de música en viu",
// "Tablaos flamencs") that are stronger, more explicit evidence than any
// generic OSM tag can offer for this one city.
//
// Network interaction is the ONLY thing this module does — see
// parse.mjs for interpretation and category-rules.mjs for the
// evidence-signal rules.

export const BARCELONA_OPEN_DATA_USER_AGENT =
  "BandOnTheMap-VenueDiscovery/0.1 (+https://github.com/chriswatson6675/band_on_the_map)";

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * GET `datasetJsonUrl` (the exact CKAN resource download URL from the
 * Area's discovery_sources config, e.g. areas/barcelona-es.json) and
 * return the parsed JSON array. `fetchImpl` defaults to the global
 * `fetch` but is always overridable for offline/fixture-driven tests.
 */
export async function fetchBarcelonaOpenData(
  datasetJsonUrl,
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {},
) {
  if (typeof datasetJsonUrl !== "string" || datasetJsonUrl.trim() === "") {
    throw new Error("fetchBarcelonaOpenData requires a non-empty datasetJsonUrl");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const retrievedAt = new Date().toISOString();

  try {
    const response = await fetchImpl(datasetJsonUrl, {
      headers: { "User-Agent": BARCELONA_OPEN_DATA_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Barcelona Open Data request failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error(`Barcelona Open Data response was not valid JSON: ${error.message}`);
    }

    return { body, retrievedAt, sourceUrl: datasetJsonUrl };
  } finally {
    clearTimeout(timeout);
  }
}
