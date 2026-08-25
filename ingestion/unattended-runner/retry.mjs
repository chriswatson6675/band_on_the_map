// BOTM-UNATTENDED-COLLECTION-RUNNER-01 — a small, deterministic, bounded
// retry helper for TRANSIENT source-acquisition failures only.
//
// Deliberately the smallest implementation that fits this repository's
// existing architecture: no typed error hierarchy exists anywhere in this
// project's collectors (ingestion/lisbon-porto/run.mjs, ingestion/
// events-calendar-api/, ingestion/http/fetch.mjs) — every one throws a
// plain Error with a human-readable message on failure. Classification
// here is therefore a small, honest, message-pattern classifier, not a
// fabricated exception taxonomy this project does not otherwise have.
//
// This module performs NO network I/O and NO real sleeping of its own —
// `delayFn` is injectable specifically so tests never rely on real
// timers (see tests/unattended-runner-retry.test.mjs).

export const DEFAULT_MAX_ATTEMPTS = 3; // initial attempt + up to 2 retries
export const DEFAULT_RETRY_DELAY_MS = 500;

// Patterns matching a genuinely TRANSIENT failure — network/timeout/5xx/
// rate-limit shaped — as opposed to a permanent one (a 4xx client error, a
// parse/validation failure, a "no matching content found" structural
// failure) that would fail identically on every retry. Matches this
// project's own existing error wording verbatim where it already exists
// (e.g. ingestion/events-calendar-api/fetch-all.mjs's "transport failure:",
// ingestion/http/fetch.mjs's AbortController timeout producing "This
// operation was aborted" — both observed live in prior BOTM packages).
const TRANSIENT_MESSAGE_PATTERNS = [
  /transport failure/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /ENOTFOUND/i,
  /\baborted\b/i,
  /fetch failed/i,
  /socket hang up/i,
  /network/i,
  /timed? ?out/i,
  /HTTP 5\d\d/i, // the source's own server failing, not a permanent client-side problem
  /HTTP 429/i, // rate-limited — worth a bounded retry, never an unbounded one
];

/**
 * True for a network/timeout/5xx/429-shaped failure; false for everything
 * else (a 4xx client error, a malformed/missing-content parse failure, a
 * "no rel=shortlink" structural miss, etc.) — those are permanent and
 * retrying them would only waste time and mask a real, non-transient
 * problem with the source or this project's own parsing.
 */
export function isTransientError(error) {
  const message = error?.message ?? String(error ?? "");
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function defaultDelay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * Run `fn(attemptNumber)` up to `maxAttempts` times. Retries ONLY when the
 * previous attempt's error is transient per `isTransient` AND attempts
 * remain. Never throws — a permanently-failing (or exhausted) `fn` is
 * reported in the return value, matching every existing collector's own
 * try/catch convention (ingestion/lisbon-porto/run.mjs's acquireAll()).
 *
 * Returns:
 *   { ok: true,  result, attempts }   — fn() eventually succeeded
 *   { ok: false, error,  attempts }   — every attempt failed, or the last
 *                                        failure was non-transient
 *
 * `delayFn(ms)` is awaited between retries (never before the first
 * attempt, never after the final one) — linear backoff by attempt number
 * (retryDelayMs, 2*retryDelayMs, ...). Injectable so tests never sleep for
 * real.
 */
export async function withRetries(
  fn,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS, retryDelayMs = DEFAULT_RETRY_DELAY_MS, isTransient = isTransientError, delayFn = defaultDelay, onAttempt } = {},
) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fn(attempt);
      if (typeof onAttempt === "function") onAttempt({ attempt, error: null, willRetry: false });
      return { ok: true, result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && isTransient(error);
      if (typeof onAttempt === "function") onAttempt({ attempt, error, willRetry: canRetry });
      if (!canRetry) {
        return { ok: false, error, attempts: attempt };
      }
      await delayFn(retryDelayMs * attempt);
    }
  }
  // Unreachable in practice (the loop above always returns), kept only as
  // a safe fallback if maxAttempts <= 0 is ever passed.
  return { ok: false, error: lastError ?? new Error("withRetries: no attempts made"), attempts: 0 };
}
