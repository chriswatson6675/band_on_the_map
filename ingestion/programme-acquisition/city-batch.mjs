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

// Falls back to `item.website`'s own host when `item.programme_url` is
// absent — a source whose programme_url is not yet known (a real,
// increasingly common shape: acquireSource() discovers the real
// programme page itself from a bare `website`) previously always
// bucketed under the single literal host "none", which silently
// serialised an ENTIRE batch of otherwise-unrelated real domains through
// one shared perHost=1 slot regardless of `concurrency` — a real
// throttling bug, not a deliberate safety margin (the actual concern this
// function protects against — many requests to the SAME real host — was
// never at risk for two DIFFERENT domains that both happen to lack a
// pre-known programme_url). Existing callers that already pass
// `programme_url` are completely unaffected — this only changes
// behaviour for the case that was previously indistinguishable from "no
// host at all".
function hostFor(item) {
  const url = item.programme_url ?? item.website;
  if (!url) return "none";
  try {
    return new URL(url).host;
  } catch {
    return "none";
  }
}

async function mapBounded(items, worker, { concurrency = 4, perHost = 1 } = {}) {
  const results = new Array(items.length);
  const hostLocks = new Map();
  let cursor = 0;
  async function take() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const host = hostFor(item);
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
