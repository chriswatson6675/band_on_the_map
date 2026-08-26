// BARCELONA-30-VENUE-POPULATION-01 — network client for La Paloma's own
// admin-ajax events endpoint. Isolated in its own tiny module (matching
// this project's existing "network I/O lives in exactly one place per
// source" convention) because this is a POST + form-encoded-body
// request, a different shape from the shared GET-only
// ingestion/http/fetch.mjs helper used by every other collector.

export const LA_PALOMA_USER_AGENT =
  "BandOnTheMap-VenuePopulation/0.1 (+https://github.com/chriswatson6675/band_on_the_map)";

const ENDPOINT = "https://lapaloma.com/wp-admin/admin-ajax.php";
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * POST one month's worth of events request (Catalan `mes`/`any` params,
 * matching this source's own real request shape). `fetchImpl` defaults
 * to the global `fetch` but is always overridable for offline tests.
 * Returns `{ text, retrievedAt }` on a 2xx response; throws on a
 * non-2xx response — never silently returns empty text for that case.
 */
export async function fetchLaPalomaMonth(month, year, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!(month >= 1 && month <= 12)) throw new Error("fetchLaPalomaMonth requires month to be 1-12");
  if (!(year >= 2000)) throw new Error("fetchLaPalomaMonth requires a plausible 4-digit year");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const retrievedAt = new Date().toISOString();

  const body = new URLSearchParams({
    action: "event_controller",
    type: "get",
    mes: String(month),
    any: String(year),
    categoria: "tots",
    lang: "ca",
  }).toString();

  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": LA_PALOMA_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`La Paloma request failed with HTTP ${response.status} for ${month}/${year}`);
    }
    return { text, retrievedAt, sourceUrl: `${ENDPOINT}?mes=${month}&any=${year}` };
  } finally {
    clearTimeout(timeout);
  }
}
