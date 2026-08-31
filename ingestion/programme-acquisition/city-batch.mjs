// BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01 — this file's own
// per-source acquisition logic was extracted verbatim into
// source-execution.mjs's `acquireSource()` (a named, independently
// callable, independently testable single-source interface — see that
// file's own header comment for the full contract and terminal-state
// vocabulary). This file now owns ONLY the batch-level concerns a city
// runner actually needs on top of that: bounded concurrency and bounded
// per-host request throttling. No acquisition behaviour changed except
// one small, documented addition — every result now always carries
// `retry_provenance` (previously omitted on two early-return branches;
// `retry_count` was already computed uniformly by mapBounded() below, now
// computed uniformly by acquireSource() itself instead) — see this
// package's own FINAL REPORT.

import { acquireSource, DEFAULT_DETAIL_LIMIT } from "./source-execution.mjs";

async function mapBounded(items, worker, { concurrency = 4, perHost = 1 } = {}) {
  const results = new Array(items.length);
  const hostLocks = new Map();
  let cursor = 0;
  async function take() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const host = item.programme_url ? new URL(item.programme_url).host : "none";
      const active = hostLocks.get(host) ?? 0;
      if (active >= perHost) { cursor--; await new Promise((resolve) => setTimeout(resolve, 10)); continue; }
      hostLocks.set(host, active + 1);
      try { results[index] = await worker(item); } finally { hostLocks.set(host, (hostLocks.get(host) ?? 1) - 1); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, take));
  return results;
}

/** Generic city-neutral bounded acquisition batch. Fetching/evidence retention is injected. Delegates every source's own acquisition to acquireSource() (source-execution.mjs) — this function adds only scheduling on top. `detailLimit` defaults to source-execution.mjs's own DEFAULT_DETAIL_LIMIT constant (BEATMAPPED-DETAIL-LIMIT-36-IMPLEMENTATION-01) so this file never hardcodes a second, independently-driftable literal. */
export async function runCityAcquisition({ sources, fetchDocument, concurrency = 4, perHost = 1, detailLimit = DEFAULT_DETAIL_LIMIT } = {}) {
  if (!Array.isArray(sources)) throw new Error("sources must be an array");
  if (typeof fetchDocument !== "function") throw new Error("fetchDocument is required");
  return mapBounded(sources, (source) => acquireSource(source, { fetchDocument, detailLimit }), { concurrency, perHost });
}
