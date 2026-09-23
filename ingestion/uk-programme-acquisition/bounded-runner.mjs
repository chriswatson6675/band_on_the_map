// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — the same
// bounded-concurrency, per-host-throttled scheduling
// ingestion/programme-acquisition/city-batch.mjs's own mapBounded()
// already implements, with ONE addition this national-scale, potentially
// multi-hour campaign genuinely needs: an `onItemComplete` callback fired
// as each item finishes, not only once the entire batch settles.
// city-batch.mjs's own runCityAcquisition() only resolves after every
// source in the batch has completed (a single Promise.all internally),
// which would mean nothing is durably checkpointed until the WHOLE run
// finishes — unacceptable for a batch this large if the process is ever
// interrupted. This is scheduling-only duplication of a ~15-line function
// (never acquisition logic — that's still 100% acquireSource(), reused
// unchanged); city-batch.mjs's own mapBounded() is not exported, so this
// is the smallest change that adds the one real capability missing
// without touching shared code further than the host-fallback fix
// already made there.

/** Per-item host key: item.programme_url first, else item.website, else "none" — mirrors city-batch.mjs's own (now-fixed) hostFor() exactly. */
function hostFor(item) {
  const url = item.programme_url ?? item.website;
  if (!url) return "none";
  try {
    return new URL(url).host;
  } catch {
    return "none";
  }
}

/**
 * Run `worker(item)` over every item in `items`, bounded by `concurrency`
 * overall and `perHost` per real host, invoking `onItemComplete(item,
 * result, index)` as soon as each individual item finishes (never waiting
 * for the whole batch) so a caller can checkpoint incrementally.
 *
 * A worker that THROWS for one item is caught here and reported through
 * `onItemComplete(item, null, index, error)` (a 4th `error` argument,
 * absent/undefined on a normal completion) rather than being allowed to
 * abort the whole run — this package's own brief (Phase 13) is explicit
 * that "one failed source does not stop the national campaign", and this
 * genuinely happens in practice: `acquireSource()`'s own documented
 * contract claims it never throws for an ordinary acquisition failure,
 * but real national-scale acquisition against real, wildly heterogeneous
 * sites found at least one real counter-example (an unhandled exception
 * several layers deep for a specific malformed detail-page response) —
 * this runner must survive that regardless of whether every such bug in
 * the underlying engine has been individually found and fixed.
 */
export async function runBoundedWithCallback(items, worker, { concurrency = 4, perHost = 1, onItemComplete } = {}) {
  const hostLocks = new Map();
  let cursor = 0;

  async function take() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const host = hostFor(item);
      const active = hostLocks.get(host) ?? 0;
      if (active >= perHost) {
        cursor--;
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }
      hostLocks.set(host, active + 1);
      try {
        let result, error;
        try {
          result = await worker(item);
        } catch (workerError) {
          error = workerError;
        }
        await onItemComplete?.(item, result, index, error);
      } finally {
        hostLocks.set(host, (hostLocks.get(host) ?? 1) - 1);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, take));
}
