// Tiny, generic, source-agnostic HTTP fetch helper shared by every live
// collector added under LISBON-AUTOMATIC-SUBSET-01.
//
// Deliberately small: a bounded-timeout GET with a consistent identifying
// User-Agent, returning a plain, serializable result rather than a raw
// Response object (so a collector can log/retain it directly as
// provenance). This module makes no acquisition decisions of its own — it
// never chooses a URL, never retries, and never interprets the body; that
// is every source's own discovery/adapter code.
//
// Reused (not duplicated) by every new collector in ingestion/village-
// underground/, ingestion/bota/, ingestion/odivelas/, ingestion/meo-arena/,
// and ingestion/lisbon-subset/run.mjs.

export const USER_AGENT =
  "BandOnTheMap/0.1 lisbon-automatic-subset-01 (https://github.com/chriswatson6675/band_on_the_map)";

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * GET `url` with a bounded timeout and this project's standard identifying
 * User-Agent. Returns a plain object — never throws for a non-2xx HTTP
 * response (that is a legitimate, reportable acquisition result, not a
 * collector bug) — but does reject for a genuine network/transport
 * failure (DNS, timeout, connection reset), which is the caller's own
 * signal to fail that source closed and report it.
 *
 *   { url, status, ok, contentType, linkHeader, text, retrievedAt }
 *
 * `linkHeader` is the raw `Link` response header (or null) — used by the
 * Capitólio-style collectors that read a stable ID from `rel=shortlink`.
 */
export async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const retrievedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      linkHeader: response.headers.get("link"),
      text,
      retrievedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract a `rel=shortlink` (or other named `rel`) target URL from a raw
 * `Link` response header value, e.g.
 * `<https://example.org/?p=2908>; rel=shortlink` -> the string between
 * `<` and `>`. Returns null if the header is absent or the named rel is
 * not present — never guessed.
 */
export function extractLinkHeaderUrl(linkHeader, rel = "shortlink") {
  if (typeof linkHeader !== "string" || linkHeader.trim() === "") return null;
  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="?([a-zA-Z0-9_-]+)"?/.exec(part.trim());
    if (match && match[2] === rel) return match[1];
  }
  return null;
}
