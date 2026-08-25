import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_RETRY_DELAY_MS, isTransientError, withRetries } from "../ingestion/unattended-runner/retry.mjs";

// --- isTransientError classification ---

test("isTransientError: true for network/timeout/5xx/429-shaped errors", () => {
  assert.equal(isTransientError(new Error("transport failure: This operation was aborted")), true);
  assert.equal(isTransientError(new Error("HTTP 503 response")), true);
  assert.equal(isTransientError(new Error("HTTP 429 response")), true);
  assert.equal(isTransientError(new Error("fetch failed")), true);
  assert.equal(isTransientError(new Error("connect ECONNREFUSED 1.2.3.4:443")), true);
  assert.equal(isTransientError(new Error("request timed out")), true);
});

test("isTransientError: false for permanent/data errors — never blindly retried", () => {
  assert.equal(isTransientError(new Error("HTTP 404 response")), false);
  assert.equal(isTransientError(new Error("HTTP 400 response")), false);
  assert.equal(isTransientError(new Error('no "events" array (source reported: "Category not found")')), false);
  assert.equal(isTransientError(new Error('"351-festival-urbano" is not present in sources/lisbon.json')), false);
  assert.equal(isTransientError(new Error("no rel=shortlink Link header with a numeric post id — skipped, not guessed")), false);
});

test("isTransientError: handles a non-Error thrown value without throwing itself", () => {
  assert.equal(isTransientError("a plain string failure"), false);
  assert.equal(isTransientError(undefined), false);
});

// --- withRetries: no real sleeping — delayFn is always injected ---

function instantDelay() {
  const calls = [];
  const delayFn = async (ms) => {
    calls.push(ms);
  };
  return { delayFn, calls };
}

test("withRetries: succeeds on the first attempt — no delay, attempts=1", async () => {
  const { delayFn, calls } = instantDelay();
  let callCount = 0;
  const result = await withRetries(async () => {
    callCount += 1;
    return "ok";
  }, { delayFn });

  assert.deepEqual(result, { ok: true, result: "ok", attempts: 1 });
  assert.equal(callCount, 1);
  assert.deepEqual(calls, []);
});

test("withRetries: retries a transient failure and succeeds on attempt 2, with linear backoff delay", async () => {
  const { delayFn, calls } = instantDelay();
  let callCount = 0;
  const result = await withRetries(
    async () => {
      callCount += 1;
      if (callCount === 1) throw new Error("transport failure: aborted");
      return "recovered";
    },
    { delayFn, retryDelayMs: 100 },
  );

  assert.deepEqual(result, { ok: true, result: "recovered", attempts: 2 });
  assert.equal(callCount, 2);
  assert.deepEqual(calls, [100]); // one delay, before the 2nd attempt, = retryDelayMs * 1
});

test("withRetries: exhausts DEFAULT_MAX_ATTEMPTS (3) on a persistently transient failure, backoff grows linearly", async () => {
  const { delayFn, calls } = instantDelay();
  let callCount = 0;
  const result = await withRetries(
    async () => {
      callCount += 1;
      throw new Error("HTTP 503 response");
    },
    { delayFn, retryDelayMs: 100 },
  );

  assert.equal(result.ok, false);
  assert.equal(result.attempts, DEFAULT_MAX_ATTEMPTS);
  assert.match(result.error.message, /HTTP 503/);
  assert.equal(callCount, DEFAULT_MAX_ATTEMPTS);
  assert.deepEqual(calls, [100, 200]); // delay before attempt 2, delay before attempt 3 — never a 3rd delay after the final attempt
});

test("withRetries: never retries a non-transient (permanent) failure — fails after exactly 1 attempt", async () => {
  const { delayFn, calls } = instantDelay();
  let callCount = 0;
  const result = await withRetries(async () => {
    callCount += 1;
    throw new Error("HTTP 404 response");
  }, { delayFn });

  assert.equal(result.ok, false);
  assert.equal(result.attempts, 1);
  assert.equal(callCount, 1);
  assert.deepEqual(calls, [], "a permanent failure must never incur a retry delay");
});

test("withRetries: honours a custom isTransient classifier", async () => {
  const { delayFn } = instantDelay();
  let callCount = 0;
  const result = await withRetries(
    async () => {
      callCount += 1;
      throw new Error("custom-marker");
    },
    { delayFn, maxAttempts: 2, isTransient: (error) => error.message === "custom-marker" },
  );
  assert.equal(result.attempts, 2);
  assert.equal(callCount, 2);
});

test("withRetries: onAttempt callback reports every attempt with correct willRetry flag", async () => {
  const { delayFn } = instantDelay();
  const attempts = [];
  let callCount = 0;
  await withRetries(
    async () => {
      callCount += 1;
      if (callCount < 3) throw new Error("transport failure");
      return "done";
    },
    { delayFn, maxAttempts: 3, onAttempt: ({ attempt, error, willRetry }) => attempts.push({ attempt, hasError: !!error, willRetry }) },
  );
  assert.deepEqual(attempts, [
    { attempt: 1, hasError: true, willRetry: true },
    { attempt: 2, hasError: true, willRetry: true },
    { attempt: 3, hasError: false, willRetry: false },
  ]);
});

test("DEFAULT_MAX_ATTEMPTS is 3 (initial attempt + up to 2 retries), DEFAULT_RETRY_DELAY_MS is a small, bounded value", () => {
  assert.equal(DEFAULT_MAX_ATTEMPTS, 3);
  assert.ok(DEFAULT_RETRY_DELAY_MS > 0 && DEFAULT_RETRY_DELAY_MS <= 5000);
});
