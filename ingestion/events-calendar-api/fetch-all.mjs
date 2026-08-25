// Generic, source-agnostic pagination orchestrator for the Events Calendar
// REST API family (see ./client.mjs for the parsing this builds on). This
// is the ONLY module in this family that performs network I/O — every
// other module here is pure and offline-testable.
//
// Deterministic pagination: follows the source's OWN `next_rest_url`
// pointer (never reconstructs page numbers itself) until it is null, or
// until `maxPages` is reached, whichever comes first. Never silently
// truncates at page 1 by default — the caller must explicitly pass a
// `maxPages` bound (or accept this module's own conservative default) for
// production use, and a truncated result is always reported as such
// (`truncated: true`), never disguised as a complete one.
//
// Duplicate protection: records are deduplicated by `source_record_id`
// (first occurrence kept) across the whole run, defending against a
// source whose pagination window overlaps at a page boundary.
//
// Failure isolation: a fetch or parse failure on any page stops pagination
// and is returned explicitly in `errors` alongside whatever records were
// already collected from prior, successful pages — this module NEVER
// converts a failure into an empty, falsely-successful result. `ok` is
// `true` only when every attempted page succeeded.

import { fetchText } from "../http/fetch.mjs";
import { buildEventsUrl, normalizeEventRecord, parseEventsPage } from "./client.mjs";

// Conservative default cap on pages followed in one run — a safety bound
// against a misbehaving or unexpectedly large source, not a business rule
// about how many events matter. Callers with a genuinely larger known
// source (e.g. CCB's own 90-record / ~9-page count observed live) should
// pass an explicit, larger `maxPages`.
const DEFAULT_MAX_PAGES = 20;

/**
 * Fetch one page via the shared HTTP helper (ingestion/http/fetch.mjs),
 * returning a plain, serializable result. This is the default `fetchPage`
 * used by fetchAllEvents(); tests inject a fake in its place, so this
 * function itself is never invoked when running the offline test suite.
 */
async function defaultFetchPage(url, { timeoutMs } = {}) {
  const response = await fetchText(url, { timeoutMs, headers: { Accept: "application/json" } });
  return {
    url,
    ok: response.ok,
    status: response.status,
    contentType: response.contentType,
    text: response.text,
    retrievedAt: response.retrievedAt,
  };
}

/**
 * Acquire every eligible record for one configured source, following
 * pagination deterministically within bounds.
 *
 * `config` — see ./client.mjs's buildEventsUrl() for the request-shaping
 * fields (`baseUrl`, `restPath`, `category`, `perPage`, `startDate`,
 * `endDate`); `config.maxPages` overrides DEFAULT_MAX_PAGES.
 *
 * `options.fetchPage(url, { timeoutMs })` — injectable page fetcher,
 * defaulting to a real HTTP GET. Must resolve to
 * `{ ok, status, text, contentType, url }` (never throw for a non-2xx HTTP
 * response — that is a legitimate, reportable page-level failure, not a
 * collector bug) and may reject only for a genuine transport-level failure
 * (DNS, timeout, connection reset).
 *
 * Returns:
 * ```
 * {
 *   ok,                // true only if every attempted page succeeded
 *   records,            // normalized records, deduplicated by source_record_id
 *   pagesFetched,       // number of pages actually requested
 *   truncated,          // true if pagination stopped due to maxPages, not because next_rest_url was null
 *   totalDeclared,      // the source's own reported `total`, from the first page (or null)
 *   errors,             // [{ page, url, message }], empty when ok is true
 * }
 * ```
 */
export async function fetchAllEvents(config, options = {}) {
  const { fetchPage = defaultFetchPage, timeoutMs } = options;
  const maxPages = config?.maxPages ?? DEFAULT_MAX_PAGES;

  if (!(maxPages > 0)) {
    throw new Error("fetchAllEvents requires config.maxPages to be a positive number");
  }

  const seen = new Set();
  const records = [];
  const errors = [];
  let totalDeclared = null;
  let pagesFetched = 0;
  let truncated = false;
  let nextUrl = buildEventsUrl(config);

  while (nextUrl && pagesFetched < maxPages) {
    pagesFetched += 1;
    let pageResult;
    try {
      pageResult = await fetchPage(nextUrl, { timeoutMs });
    } catch (error) {
      errors.push({ page: pagesFetched, url: nextUrl, message: `transport failure: ${error.message}` });
      break;
    }

    if (!pageResult?.ok) {
      errors.push({
        page: pagesFetched,
        url: nextUrl,
        message: `HTTP ${pageResult?.status ?? "unknown"} response`,
      });
      break;
    }

    let parsed;
    try {
      parsed = parseEventsPage(pageResult.text);
    } catch (error) {
      errors.push({ page: pagesFetched, url: nextUrl, message: `parse failure: ${error.message}` });
      break;
    }

    if (pagesFetched === 1) totalDeclared = parsed.total;

    for (const raw of parsed.events) {
      const normalized = normalizeEventRecord(raw);
      if (seen.has(normalized.source_record_id)) continue;
      seen.add(normalized.source_record_id);
      records.push(normalized);
    }

    nextUrl = parsed.nextRestUrl;
  }

  if (nextUrl && pagesFetched >= maxPages) {
    truncated = true;
  }

  return {
    ok: errors.length === 0,
    records,
    pagesFetched,
    truncated,
    totalDeclared,
    errors,
  };
}
