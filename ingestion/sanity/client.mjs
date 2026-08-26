// BARCELONA-30-VENUE-POPULATION-02 — generic, source-agnostic client for
// Sanity.io's own public, unauthenticated GROQ query CDN API
// (`https://<projectId>.apicdn.sanity.io/<apiVersion>/data/query/<dataset>`),
// confirmed live and public (no API token required) for Razzmatazz's own
// site (see research/source-investigations/razzmatazz-barcelona-01/).
//
// A prior investigation (BARCELONA-30-VENUE-POPULATION-01,
// docs/BARCELONA_VENUE_POPULATION.md) found Razzmatazz's Sanity-backed
// site but deferred it: "the public API returns heavily reference-based
// documents requiring GROQ dereferencing work not yet done". This module
// resolves that gap the CLEAN way — GROQ's own `->` dereference operator
// resolves `{_type: "reference", _ref: "..."}` fields SERVER-SIDE, in one
// request, rather than requiring a second fetch per reference. No GROQ
// query is embedded here; queries are supplied by the caller (see
// ingestion/razzmatazz/discovery.mjs) — this module only knows how to
// build the request URL and parse the response envelope.
//
// Deliberately generic: never references a specific venue, project, or
// dataset. Every source-specific fact (projectId, dataset, apiVersion,
// the GROQ query itself) is supplied by the caller, matching this
// project's existing ingestion/events-calendar-api/, ingestion/fourvenues/
// family convention.

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Build the request URL for one Sanity GROQ query against the project's
 * own public CDN API (`useCdn: true` — the same endpoint the project's own
 * site itself calls, per its retained `window.__NUXT__.config` — see
 * research/source-investigations/razzmatazz-barcelona-01/evidence/).
 *
 * `config.projectId`, `config.dataset` (required, non-empty strings).
 * `config.apiVersion` (optional, defaults to a fixed, dated version — a
 * Sanity API version is a stable, versioned contract, never "latest").
 * `query` (required, a non-empty GROQ query string).
 */
export function buildQueryUrl(config, query) {
  if (!config || !nonEmptyString(config.projectId) || !nonEmptyString(config.dataset)) {
    throw new Error("buildQueryUrl requires config.projectId and config.dataset (non-empty strings)");
  }
  if (!nonEmptyString(query)) {
    throw new Error("buildQueryUrl requires a non-empty GROQ query string");
  }
  const apiVersion = config.apiVersion ?? "v2024-02-01";
  const url = new URL(`https://${config.projectId}.apicdn.sanity.io/${apiVersion}/data/query/${config.dataset}`);
  url.searchParams.set("query", query);
  return url.toString();
}

/**
 * Parse one already-fetched response body (a JSON string) into the raw
 * `result` value exactly as the API returned it. Throws on invalid JSON,
 * a non-object top level, a `result` key genuinely absent, or an explicit
 * `{error: ...}` envelope (a malformed/rejected GROQ query) — an empty
 * array `result: []` is a legitimate, different, non-throwing case (a
 * genuinely event-less query), never conflated with a malformed response.
 */
export function parseQueryResponse(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("parseQueryResponse requires a non-empty response body string");
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Sanity response body is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error("Sanity response body is not a JSON object");
  }
  if (parsed.error) {
    const message = isPlainObject(parsed.error) ? parsed.error.description ?? JSON.stringify(parsed.error) : String(parsed.error);
    throw new Error(`Sanity query rejected: ${message}`);
  }
  if (!("result" in parsed)) {
    throw new Error('Sanity response body has no "result" key');
  }
  return parsed.result;
}
