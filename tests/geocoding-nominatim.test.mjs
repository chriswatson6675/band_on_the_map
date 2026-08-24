import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNominatimSearchUrl,
  MIN_REQUEST_INTERVAL_MS,
  NOMINATIM_USER_AGENT,
  searchNominatimLive,
} from "../ingestion/geocoding/nominatim.mjs";

test("buildNominatimSearchUrl uses format=jsonv2&addressdetails=1&limit=5&countrycodes=pt", () => {
  const url = buildNominatimSearchUrl("Largo da Graça, 1170-165 Lisboa");
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://nominatim.openstreetmap.org/search");
  assert.equal(parsed.searchParams.get("q"), "Largo da Graça, 1170-165 Lisboa");
  assert.equal(parsed.searchParams.get("format"), "jsonv2");
  assert.equal(parsed.searchParams.get("addressdetails"), "1");
  assert.equal(parsed.searchParams.get("limit"), "5");
  assert.equal(parsed.searchParams.get("countrycodes"), "pt");
});

test("the required identifying User-Agent string is exact", () => {
  assert.equal(
    NOMINATIM_USER_AGENT,
    "BandOnTheMap-VenueGeocoder/0.1 (+https://github.com/chriswatson6675/band_on_the_map)",
  );
});

test("MIN_REQUEST_INTERVAL_MS never permits exceeding 1 request/second", () => {
  assert.ok(MIN_REQUEST_INTERVAL_MS >= 1000, "must wait at least 1 full second between requests");
});

// 1. Offline test proving searchNominatimLive sends the required User-Agent
// and query params — mocks global fetch, never touches the live service.
test("searchNominatimLive sends the identifying User-Agent and returns candidates from a mocked response", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedHeaders = null;
  globalThis.fetch = async (url, init) => {
    capturedUrl = url;
    capturedHeaders = init.headers;
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "content-type" ? "application/json" : null) },
      text: async () => JSON.stringify([{ lat: "38.7", lon: "-9.1" }]),
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await searchNominatimLive("Largo da Graça, 1170-165 Lisboa", {
    countrycodes: "pt",
    limit: 5,
  });

  assert.equal(capturedHeaders["User-Agent"], NOMINATIM_USER_AGENT);
  assert.ok(capturedUrl.includes("countrycodes=pt"));
  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].lat, "38.7");
});

test("two sequential searchNominatimLive calls are spaced at least MIN_REQUEST_INTERVAL_MS apart", async (t) => {
  const originalFetch = globalThis.fetch;
  const callTimes = [];
  globalThis.fetch = async () => {
    callTimes.push(Date.now());
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "[]",
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await searchNominatimLive("Address A, 1000-000 Lisboa");
  await searchNominatimLive("Address B, 1000-000 Lisboa");

  assert.equal(callTimes.length, 2);
  const gap = callTimes[1] - callTimes[0];
  assert.ok(gap >= MIN_REQUEST_INTERVAL_MS - 5, `expected gap >= ~${MIN_REQUEST_INTERVAL_MS}ms, got ${gap}ms`);
});

// VENUE-GEOCODING-01A hardening: prove searchNominatimLive() itself — not
// just a well-behaved sequential caller — enforces single-threaded,
// rate-limited requests. This is exactly the "accidental Promise.all"
// scenario the module-level comment used to only document, not enforce.
test("two CONCURRENT (unawaited) searchNominatimLive calls never have overlapping live fetches, and still respect the rate limit", async (t) => {
  const originalFetch = globalThis.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  const startTimes = [];
  globalThis.fetch = async () => {
    startTimes.push(Date.now());
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // A deliberately slow mocked response: if the mutex failed to
    // serialize these two calls, the second fetch would start while this
    // one is still "in flight", and maxInFlight would exceed 1.
    await new Promise((res) => setTimeout(res, 30));
    inFlight -= 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "[]",
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Fire both calls without awaiting the first before starting the
  // second — never do this against the real service, but this module
  // must remain safe even if a future caller does.
  const [a, b] = await Promise.all([
    searchNominatimLive("Concurrent Address A, 1000-000 Lisboa"),
    searchNominatimLive("Concurrent Address B, 1000-000 Lisboa"),
  ]);

  assert.ok(a.ok && b.ok);
  assert.equal(maxInFlight, 1, "a live fetch must never be in flight while another is still in flight");
  assert.equal(startTimes.length, 2);
  const gap = startTimes[1] - startTimes[0];
  assert.ok(
    gap >= MIN_REQUEST_INTERVAL_MS - 5,
    `expected concurrent calls' fetch starts to still be spaced >= ~${MIN_REQUEST_INTERVAL_MS}ms apart, got ${gap}ms`,
  );
});

// A rejected request must not permanently wedge the shared queue — the
// next queued call still runs (and is still rate-limited/serialized).
test("a failed live request does not block a later queued call from eventually running", async (t) => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      throw new Error("simulated transport failure");
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "[]",
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(() => searchNominatimLive("Failing Address, 1000-000 Lisboa"));
  const second = await searchNominatimLive("Recovering Address, 1000-000 Lisboa");
  assert.equal(second.ok, true);
  assert.equal(call, 2);
});
