// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — CENTQUATRE-PARIS's own
// public Hydra (API Platform / Symfony) JSON API discovery step. See
// research/source-investigations/centquatre-paris-01/.
//
// The venue's Nuxt frontend (https://www.104.fr/programme?genre=concerts)
// renders from this SAME public API — but that page's own '?genre=concerts'
// query string has NO effect server-side (confirmed during investigation:
// the page's embedded __NUXT_DATA__ payload carries the venue's full,
// unfiltered multi-discipline programme regardless of that query
// parameter). The clean, structured, documented acquisition path is
// therefore to call the underlying API directly, using the filter
// parameters its own self-documenting 'hydra:search' IriTemplate actually
// supports — never the page's own query string.
//
// This module performs no network I/O itself (no `fetch`) — it only
// builds the request URL and parses an already-fetched JSON response
// body, matching every other discovery module's convention in this
// project (the caller supplies its own HTTP client, e.g.
// ingestion/http/fetch.mjs).

export const API_BASE_URL = "https://www.104.fr";

// This source's own "Concert" tag resource IRI, resolved once during
// investigation via GET https://www.104.fr/api/tags?search=concert (see
// research/source-investigations/centquatre-paris-01/evidence/
// api-events-concert-future-sample.json's own retained response) — a
// first-party, source-declared identifier, not a guessed value. If this
// source ever renumbers its own tags, a future re-investigation must
// re-resolve and update this constant; it is deliberately NOT re-resolved
// on every call (that would be an extra live request per run for a value
// this stable).
export const CONCERT_TAG_IRI = "/api/tags/14";

/**
 * Build the exact, documented `/api/events` URL for "every future,
 * concert-tagged event, soonest first" — the same filter combination
 * proven live during investigation. `afterDate` must be a `YYYY-MM-DD`
 * string (the caller's own notion of "today", never guessed by this
 * module); `baseUrl` defaults to the real API host so a future test can
 * point this at a local fixture server if ever needed.
 */
export function buildConcertEventsUrl(afterDate, { baseUrl = API_BASE_URL } = {}) {
  if (typeof afterDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(afterDate)) {
    throw new Error("buildConcertEventsUrl requires afterDate as a YYYY-MM-DD string");
  }
  const params = new URLSearchParams();
  params.append("taggedEntities.tag[]", CONCERT_TAG_IRI);
  params.append("sortingFirstDateTime[after]", afterDate);
  params.append("order[sortingFirstDateTime]", "asc");
  return `${baseUrl}/api/events?${params.toString()}`;
}

/**
 * Extract the `hydra:member` array from one already-fetched `/api/events`
 * JSON-LD response body (already `JSON.parse`d). Throws on a response
 * that is not a well-formed Hydra collection — this is a stricter
 * contract than most discovery modules in this project because a
 * malformed Hydra envelope (e.g. an unexpected error page) is a genuine
 * signal something is wrong with the request, not a legitimate "nothing
 * scheduled" result (which this API instead represents as a well-formed
 * envelope with an empty `hydra:member` array).
 */
export function extractEventMembers(responseBody) {
  if (!responseBody || typeof responseBody !== "object" || !Array.isArray(responseBody["hydra:member"])) {
    throw new Error("extractEventMembers requires a well-formed Hydra collection response ({ 'hydra:member': [...] })");
  }
  return responseBody["hydra:member"];
}
