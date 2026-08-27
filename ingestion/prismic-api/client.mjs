// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — generic, source-agnostic
// client for Prismic's own public, unauthenticated Content API v2
// (`https://<repository>.cdn.prismic.io/api/v2`), a headless-CMS REST
// contract that is the SAME for every site built on Prismic regardless of
// which "custom types" (event/post/page/...) that repository's own
// content model defines — confirmed live and public (no access_token
// required) for Point Éphémère's own site
// (research/source-investigations/point-ephemere-paris-01/).
//
// This is a genuinely new, reusable collector family (recommended_family
// "NEW_FAMILY_REQUIRED" per COLLECTOR_FAMILIES not yet naming Prismic —
// see docs/SOURCE_INVESTIGATION_POLICY.md) — the first source in this
// project built on Prismic. Matches this project's existing
// ingestion/sanity/client.mjs / ingestion/events-calendar-api/client.mjs
// convention: two responsibilities only, (1) building request URLs and
// (2) parsing already-fetched response bodies. Live HTTP acquisition is a
// separate caller concern (see ingestion/http/fetch.mjs), so this module
// is pure and offline-testable. It never assumes what fields a document's
// own `data` object contains — that per-repository mapping belongs to a
// caller (see ingestion/point-ephemere/discovery.mjs for the one concrete,
// proven mapping this family currently ships).

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Build the API v2 root URL for one Prismic repository, e.g.
 * buildApiRootUrl("pointf") -> "https://pointf.cdn.prismic.io/api/v2".
 */
export function buildApiRootUrl(repository) {
  if (!nonEmptyString(repository)) {
    throw new Error("buildApiRootUrl requires a non-empty repository name");
  }
  return `https://${repository}.cdn.prismic.io/api/v2`;
}

/**
 * Parse the API root's own response body (Prismic's fixed "ref discovery"
 * envelope) into `{ masterRef, types, searchFormAction }`. Throws on
 * invalid JSON or a body missing the `refs` array / master ref / search
 * form action Prismic's own API contract always includes — a malformed
 * root response means this repository cannot be queried at all, never
 * silently treated as "no events".
 */
export function parseApiRoot(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("parseApiRoot requires a non-empty response body string");
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Prismic API root response body is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.refs)) {
    throw new Error('Prismic API root response body has no "refs" array');
  }
  const master = parsed.refs.find((r) => isPlainObject(r) && r.isMasterRef === true);
  if (!master || !nonEmptyString(master.ref)) {
    throw new Error("Prismic API root response body has no master ref");
  }
  const searchFormAction =
    isPlainObject(parsed.forms) && isPlainObject(parsed.forms.everything) && nonEmptyString(parsed.forms.everything.action)
      ? parsed.forms.everything.action
      : null;
  if (!searchFormAction) {
    throw new Error('Prismic API root response body has no forms.everything.action search endpoint');
  }
  return {
    masterRef: master.ref,
    types: isPlainObject(parsed.types) ? parsed.types : {},
    searchFormAction,
  };
}

/**
 * Build one `documents/search` request URL. `searchFormAction` is the
 * exact endpoint the repository's own API root reported (see
 * parseApiRoot() above) — never hardcoded or guessed by this module.
 *
 * `options.predicates` — an array of raw Prismic predicate strings (e.g.
 * `at(document.type,"event")`, `date.after(my.event.start_date,"2026-08-26")`),
 * each wrapped in its own `[...]` and concatenated, matching Prismic's own
 * documented `q=[[pred1][pred2]]` query-array syntax. Never validated or
 * interpreted by this module — predicate construction is entirely the
 * caller's, since only the caller knows its own custom type's field names.
 * `options.orderings` — a raw Prismic orderings string (e.g.
 * `[my.event.start_date]`), passed straight through.
 * `options.page` / `options.pageSize` — plain integers.
 */
export function buildDocumentsSearchUrl(searchFormAction, ref, options = {}) {
  if (!nonEmptyString(searchFormAction)) {
    throw new Error("buildDocumentsSearchUrl requires a non-empty searchFormAction URL");
  }
  if (!nonEmptyString(ref)) {
    throw new Error("buildDocumentsSearchUrl requires a non-empty ref");
  }
  const { predicates = [], orderings, page, pageSize } = options;
  if (!Array.isArray(predicates)) {
    throw new Error("buildDocumentsSearchUrl requires options.predicates to be an array of predicate strings");
  }

  const url = new URL(searchFormAction);
  url.searchParams.set("ref", ref);
  if (predicates.length > 0) {
    const q = predicates.map((p) => `[${p}]`).join("");
    url.searchParams.set("q", `[${q}]`);
  }
  if (nonEmptyString(orderings)) url.searchParams.set("orderings", orderings);
  if (page != null) url.searchParams.set("page", String(page));
  if (pageSize != null) url.searchParams.set("pageSize", String(pageSize));

  return url.toString();
}

/**
 * Parse one already-fetched `documents/search` response body into
 * `{ documents, page, resultsPerPage, resultsSize, totalResultsSize,
 * totalPages, nextPage }`. `documents` is the RAW array of Prismic
 * documents exactly as the API returned them — per-document field mapping
 * is a separate, caller-owned step (matching
 * ingestion/events-calendar-api/client.mjs's parseEventsPage()/
 * normalizeEventRecord() split), so a parsing failure always shows the
 * source's own original shape.
 *
 * Throws on invalid JSON, a non-object top level, or a body genuinely
 * missing the `results` array Prismic's own contract always includes — an
 * empty `results: []` is a legitimate, different, non-throwing case (a
 * genuinely empty page), never conflated with a malformed response.
 */
export function parseSearchResponse(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("parseSearchResponse requires a non-empty response body string");
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Prismic search response body is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error("Prismic search response body did not parse to a JSON object");
  }
  if (!Array.isArray(parsed.results)) {
    throw new Error('Prismic search response body has no "results" array');
  }

  return {
    documents: parsed.results,
    page: typeof parsed.page === "number" ? parsed.page : null,
    resultsPerPage: typeof parsed.results_per_page === "number" ? parsed.results_per_page : null,
    resultsSize: typeof parsed.results_size === "number" ? parsed.results_size : null,
    totalResultsSize: typeof parsed.total_results_size === "number" ? parsed.total_results_size : null,
    totalPages: typeof parsed.total_pages === "number" ? parsed.total_pages : null,
    nextPage: nonEmptyString(parsed.next_page) ? parsed.next_page : null,
  };
}
