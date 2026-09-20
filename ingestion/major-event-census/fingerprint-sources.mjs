// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-01 — bounded live fingerprinting
// of the census's official calendar sources (Phase 13/14).
//
// Reuses, never duplicates: fingerprintProgrammeSurface() and
// routeCollectorCapability() from ingestion/venue-discovery/, the SAME
// engine the production acquisition path already uses, so a census
// readiness claim means the same thing here as it does there.
//
// Strictly bounded and read-only: one GET per calendar URL, a fixed
// concurrency limit, a per-request timeout, and no retries beyond the
// shared fetch helper's own policy. It acquires NO events and writes
// nothing outside the census artifacts.

import { fingerprintProgrammeSurface, routeCollectorCapability } from "../venue-discovery/programme-fingerprint.mjs";
import { fetchText } from "../http/fetch.mjs";

/**
 * Map a capability route (the repository's own existing vocabulary) onto
 * this census's acquisition-readiness vocabulary. A source is NEVER
 * called READY on HTTP 200 alone — readiness is derived from what the
 * shared fingerprint engine structurally detected, which is the same
 * basis the real acquisition pipeline dispatches on.
 */
export function readinessFromFingerprint({ ok, mechanism, collectorRoute }) {
  if (!ok) return "SOURCE_REVIEW_REQUIRED";
  if (mechanism === "NO_CURRENT_PROGRAMME_FOUND") return "NO_PUBLIC_CALENDAR";
  if (["ACCESS_BLOCKED", "CLIENT_RENDERED_UNKNOWN", "SOCIAL_FIRST_PROGRAMME", "IMAGE_OR_POSTER_PROGRAMME"].includes(mechanism)) {
    return "TIER3_BROWSER_OR_COMPLEX";
  }
  switch (collectorRoute) {
    case "EXISTING_COLLECTOR_ZERO_CODE": return "READY_TIER1";
    case "CONFIGURATION_ONLY": return "READY_WITH_CONFIGURATION";
    case "GENERIC_CAPABILITY_WIDENING":
    case "NEW_REUSABLE_COLLECTOR_FAMILY": return "TIER2_REUSABLE_FAMILY";
    case "CURRENTLY_BLOCKED": return "TIER3_BROWSER_OR_COMPLEX";
    default: return "SOURCE_REVIEW_REQUIRED";
  }
}

async function fingerprintOne(source, { fetchDocument, timeoutMs }) {
  const startedAt = new Date().toISOString();
  try {
    const document = await Promise.race([
      fetchDocument(source.source_url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("census fingerprint timeout")), timeoutMs)),
    ]);
    const httpOk = document.status >= 200 && document.status < 300;
    const fingerprint = fingerprintProgrammeSurface(document);
    const mechanism = httpOk ? fingerprint.mechanism : "ACCESS_BLOCKED";
    const collectorRoute = routeCollectorCapability(mechanism);
    return {
      ...source,
      source_family: mechanism,
      source_family_signals: fingerprint.signals ?? null,
      collector_route: collectorRoute,
      acquisition_readiness: readinessFromFingerprint({ ok: httpOk, mechanism, collectorRoute }),
      http_status: document.status,
      fingerprinted_at: startedAt,
      fingerprint_error: null,
    };
  } catch (error) {
    // A source we could not reach is honestly unknown, never "not ready"
    // and never "ready" — it goes to explicit review.
    return {
      ...source,
      source_family: null,
      source_family_signals: null,
      collector_route: null,
      acquisition_readiness: "SOURCE_REVIEW_REQUIRED",
      http_status: null,
      fingerprinted_at: startedAt,
      fingerprint_error: describeFetchFailure(error),
    };
  }
}

/**
 * Node's fetch reports almost every transport problem as the same opaque
 * "fetch failed", with the real reason on error.cause. Recording only the
 * outer message makes a site that merely needs a cookie jar look identical
 * to one that no longer resolves, which would understate the census's
 * reachable population. The cause is kept whenever there is one.
 */
function describeFetchFailure(error) {
  const message = String(error?.message ?? error);
  const cause = error?.cause?.message ?? error?.cause?.code ?? null;
  if (!cause || String(cause).trim() === "" || String(cause) === message) return message;
  // A redirect loop against a plain fetch is a cookie-jar limitation on our
  // side, not evidence that the venue publishes nothing.
  if (/redirect count exceeded/i.test(String(cause))) {
    return `${message}: redirect loop (cookie-less fetch) — site likely requires cookie/consent handling, not unreachable`;
  }
  return `${message}: ${cause}`;
}

async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

/**
 * Fingerprint every supplied calendar source, bounded by `concurrency`
 * and `limit`. One source's failure never affects another's result.
 */
export async function fingerprintCalendarSources(sources, { fetchDocument = defaultFetchDocument, concurrency = 4, timeoutMs = 20000, limit = Infinity, onProgress } = {}) {
  const queue = sources.slice(0, limit === Infinity ? sources.length : limit);
  const results = new Array(queue.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= queue.length) return;
      results[index] = await fingerprintOne(queue[index], { fetchDocument, timeoutMs });
      completed += 1;
      onProgress?.(completed, queue.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  // Any source beyond `limit` keeps its un-fingerprinted state honestly,
  // rather than being silently dropped from the census.
  return [...results, ...sources.slice(queue.length)];
}
