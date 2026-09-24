// BOTM-RUNTIME-PUBLICATION-BRIDGE-01 — offline proofs for the browser-safe
// runtime-vs-bundled decision logic (ingestion/map/runtime-publication.mjs)
// that app/page.tsx uses. `fetchImpl` is always injected here — no real
// network call, no live DigitalOcean/Netlify endpoint of any kind, matching
// this repository's existing dependency-free-ingestion-module testing
// convention.
//
// Covers OFFLINE PROOFS (3) website runtime loader accepts valid runtime
// data, (4) website uses bundled data when the runtime URL is unset,
// (5) website falls back when the runtime endpoint is unavailable,
// (6) website falls back on malformed JSON, (7) website falls back on an
// invalid publication schema, (8) fresh runtime data can differ from
// bundled data and the runtime version wins, (9) no Git operation is
// required for a runtime refresh (this whole module never touches the
// filesystem or a repository), (10) no credential/hostname is embedded.

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  RUNTIME_DATA_SOURCES,
  fetchRuntimePublicationData,
  isValidPublicationArtifact,
  resolveMapData,
} from "../ingestion/map/runtime-publication.mjs";

function validArtifact({ generatedAt = "2026-08-25T09:00:00.000Z", venueId = "venue-a", markerCount = 1, unitedKingdomMarkerCount = 0 } = {}) {
  const markers = Array.from({ length: markerCount }, (_, i) => ({
    venue_id: `${venueId}-${i}`,
    canonical_name: `Venue ${i}`,
    latitude: 38.7 + i * 0.01,
    longitude: -9.1,
    address: "Test Address",
    display_listings: [{ kind: "SINGLE", source_id: "test-source", source_record_id: `rec-${i}` }],
  }));
  const unitedKingdomMarkers = Array.from({ length: unitedKingdomMarkerCount }, (_, i) => ({
    venue_id: `venue-uk-${i}`,
    canonical_name: `UK Venue ${i}`,
    latitude: 51.5 + i * 0.01,
    longitude: -0.1,
    address: "Test Address, London",
    display_listings: [{ kind: "SINGLE", source_id: "test-uk-source", source_record_id: `uk-rec-${i}` }],
  }));
  const total = markerCount + unitedKingdomMarkerCount;
  return {
    generated_at: generatedAt,
    window: { from: null, to: null },
    source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "test-source", success: true, raw_record_count: total, observation_count: total }] },
    counts: { observation_count: total, display_listing_count: total, map_marker_count: total },
    countries: {
      Portugal: { markers },
      Croatia: { markers: [] },
      ...(unitedKingdomMarkerCount > 0 ? { UnitedKingdom: { markers: unitedKingdomMarkers } } : {}),
    },
  };
}

function fakeFetchOk(body, { status = 200, json = true } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (json ? JSON.stringify(body) : body),
  });
}

function fakeFetchNetworkError(message = "network down") {
  return async () => {
    throw new Error(message);
  };
}

function fakeFetchAbort() {
  return async (_url, { signal } = {}) =>
    new Promise((_resolve, reject) => {
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }
    });
}

// Counts real fetchImpl invocations and delegates to a given implementation
// — the seam every retry test below uses to assert EXACTLY how many
// attempts were made (never more, never fewer).
function countingFetch(impl) {
  const state = { calls: 0 };
  const fetchImpl = async (...args) => {
    state.calls += 1;
    return impl(...args);
  };
  return { fetchImpl, calls: () => state.calls };
}

test("module-level constants", () => {
  assert.deepEqual(RUNTIME_DATA_SOURCES, ["runtime", "bundled"]);
  assert.equal(typeof DEFAULT_TIMEOUT_MS, "number");
  assert.equal(typeof DEFAULT_RETRY_DELAY_MS, "number");
});

// BEATMAPPED-RUNTIME-FETCH-TIMEOUT-LONDON-LIVE-01: the original default
// (4000ms) was too tight for some real visitor network conditions on the
// current, growing artifact size — widened to 15000ms. A hardcoded literal
// here (rather than just `typeof === "number"`) is deliberate: this is the
// one number this whole package exists to change, so a regression that
// silently narrows it back down must fail a test, not just a code review.
test("DEFAULT_TIMEOUT_MS is 15000ms (BEATMAPPED-RUNTIME-FETCH-TIMEOUT-LONDON-LIVE-01 — widened from the original, too-tight 4000ms)", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 15000);
});

test("isValidPublicationArtifact: true for a genuinely valid artifact, false for garbage", () => {
  assert.equal(isValidPublicationArtifact(validArtifact()), true);
  assert.equal(isValidPublicationArtifact(null), false);
  assert.equal(isValidPublicationArtifact("<html>not json shaped</html>"), false);
  assert.equal(isValidPublicationArtifact({ not: "a publication artifact" }), false);
  assert.equal(isValidPublicationArtifact({ countries: {} }), false);
});

// --- PROOF 3: website runtime loader accepts valid runtime data ---
test("fetchRuntimePublicationData: ok:true + the parsed artifact for a valid response", async () => {
  const artifact = validArtifact();
  const result = await fetchRuntimePublicationData("http://runtime.test/map-data", { fetchImpl: fakeFetchOk(artifact) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.artifact, artifact);
});

// --- PROOF 4: bundled data used when the runtime URL is unset ---
test("resolveMapData: no runtimeUrl configured -> bundled immediately, no fetch call, source is 'bundled'", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  let fetchCalled = false;
  const result = await resolveMapData({
    runtimeUrl: null,
    bundledArtifact: bundled,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("must not be called");
    },
  });
  assert.equal(result.source, "bundled");
  assert.deepEqual(result.artifact, bundled);
  assert.equal(result.runtimeError, null);
  assert.equal(fetchCalled, false);
});

// --- PROOF 5: fallback when the runtime endpoint is unavailable (network error + timeout) ---
// BEATMAPPED-RUNTIME-FETCH-TIMEOUT-LONDON-LIVE-01: both of these now
// retry exactly once before falling back (NETWORK_ERROR/TIMEOUT are the
// two RETRYABLE_REASONS) — retryDelayMs is overridden to a tiny value so
// the test stays fast; the retry mechanism itself is proven precisely by
// the dedicated "exactly one retry" tests further down.
test("resolveMapData: network error (both attempts) -> falls back to bundled, source is 'bundled', reason recorded", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchNetworkError(),
    retryDelayMs: 1,
  });
  assert.equal(result.source, "bundled");
  assert.deepEqual(result.artifact, bundled);
  assert.equal(result.runtimeError, "NETWORK_ERROR");
});

test("resolveMapData: timeout (both attempts) -> falls back to bundled (never hangs, never leaves the map blank)", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchAbort(),
    timeoutMs: 20,
    retryDelayMs: 1,
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "TIMEOUT");
});

// BEATMAPPED-RUNTIME-FETCH-TIMEOUT-LONDON-LIVE-01 — item 7: "timeout
// beyond new limit still falls back". A request that never resolves
// within timeoutMs still times out and still falls back cleanly, no
// matter how generous timeoutMs is — proven here with a timeoutMs
// comfortably larger than the OLD 4000ms default (proving the widened
// window alone doesn't turn a genuinely-hung request into a false
// success), while staying fast via a small explicit override rather than
// the real 15000ms literal.
test("resolveMapData: a request that never resolves still times out and falls back, even with a timeoutMs well beyond the old 4000ms default", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchAbort(),
    timeoutMs: 50, // stand-in for "beyond 4000ms" at test-speed scale
    retryDelayMs: 1,
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "TIMEOUT");
});

// BEATMAPPED-RUNTIME-FETCH-TIMEOUT-LONDON-LIVE-01 — item 7: "runtime
// response slower than 4 seconds but within new timeout succeeds". Real
// 4000ms/15000ms wall-clock waits would make this suite slow, so this
// proves the identical mechanism at a fast, proportional scale: a
// response that resolves AFTER a delay that would have exceeded the old
// tight timeout, but well WITHIN the timeoutMs actually configured —
// exactly the relationship DEFAULT_TIMEOUT_MS's widening exists to fix.
test("resolveMapData: a runtime response slower than a tight timeout but within a wider one still succeeds, validated artifact wins", async () => {
  const runtime = validArtifact({ venueId: "runtime-venue", markerCount: 5 });
  const slowFetch = async (_url, { signal } = {}) =>
    new Promise((resolvePromise, reject) => {
      const timer = setTimeout(
        () => resolvePromise({ ok: true, status: 200, text: async () => JSON.stringify(runtime) }),
        30, // "slower than a tight timeout" at test-speed scale
      );
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });

  // Sanity: the SAME slow response against a tight timeout (proportionally
  // standing in for the old 4000ms default) genuinely times out first —
  // otherwise this proof would be vacuous.
  const tight = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: validArtifact({ venueId: "bundled-venue" }),
    fetchImpl: slowFetch,
    timeoutMs: 10,
    retryDelayMs: 1,
  });
  assert.equal(tight.source, "bundled");
  assert.equal(tight.runtimeError, "TIMEOUT");

  // The same slow response against a wider timeout (proportionally
  // standing in for the new 15000ms default) succeeds.
  const wide = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: validArtifact({ venueId: "bundled-venue" }),
    fetchImpl: slowFetch,
    timeoutMs: 200,
    retryDelayMs: 1,
  });
  assert.equal(wide.source, "runtime");
  assert.deepEqual(wide.artifact, runtime);
  assert.equal(wide.runtimeError, null);
});

test("resolveMapData: non-2xx HTTP response -> falls back to bundled, and is NEVER retried (not a retryable reason)", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const { fetchImpl, calls } = countingFetch(fakeFetchOk({ error: "unreadable" }, { status: 503 }));
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "HTTP_ERROR");
  assert.equal(calls(), 1, "HTTP_ERROR must never be retried");
});

// --- PROOF 6: fallback on malformed JSON (including an HTML error page served with 200) ---
test("resolveMapData: malformed JSON body -> falls back to bundled, and is NEVER retried (not a retryable reason)", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const { fetchImpl, calls } = countingFetch(fakeFetchOk("{not valid json", { json: false }));
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "MALFORMED_JSON");
  assert.equal(calls(), 1, "MALFORMED_JSON must never be retried");
});

test("resolveMapData: an HTML error page served with 200 is treated as malformed, never as usable data", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchOk("<html><body>Bad Gateway</body></html>", { json: false }),
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "MALFORMED_JSON");
});

// --- PROOF 7: fallback on an invalid publication schema ---
test("resolveMapData: valid JSON that fails publication schema validation -> falls back to bundled, and is NEVER retried (not a retryable reason)", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const { fetchImpl, calls } = countingFetch(fakeFetchOk({ some: "unrelated but validly-parseable JSON shape" }));
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "INVALID_SCHEMA");
  assert.equal(calls(), 1, "INVALID_SCHEMA must never be retried");
});

// --- PROOF 8: fresh runtime data can differ from bundled data, and the runtime version wins ---
test("resolveMapData: valid runtime data DIFFERS from bundled data and the runtime version wins", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue", markerCount: 1 });
  const runtime = validArtifact({ venueId: "runtime-venue", markerCount: 3, generatedAt: "2026-08-25T12:00:00.000Z" });

  assert.notDeepEqual(bundled, runtime, "fixtures must be genuinely different for this proof to mean anything");

  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchOk(runtime),
  });

  assert.equal(result.source, "runtime");
  assert.deepEqual(result.artifact, runtime);
  assert.equal(result.artifact.counts.map_marker_count, 3);
  assert.notDeepEqual(result.artifact, bundled);
  assert.equal(result.runtimeError, null);
});

// BEATMAPPED-RUNTIME-FETCH-TIMEOUT-LONDON-LIVE-01 — item 7: "UnitedKingdom
// bucket survives runtime selection". Reproduces the exact real-world
// symptom this package fixes: a bundled artifact with NO UnitedKingdom
// key at all (matching data/public/lisbon-porto-map.json's own current,
// pre-London shape) versus a runtime artifact that genuinely carries
// London markers — the runtime version, UnitedKingdom bucket included,
// must be what's rendered once the fetch succeeds.
test("resolveMapData: a runtime artifact carrying a UnitedKingdom bucket survives selection intact — the exact real-world symptom this package fixes", async () => {
  const bundledWithoutUK = validArtifact({ venueId: "bundled-venue", markerCount: 132 }); // no unitedKingdomMarkerCount -> no UnitedKingdom key, matching the real bundled fixture's current shape
  assert.equal(bundledWithoutUK.countries.UnitedKingdom, undefined, "sanity: the bundled fixture must genuinely lack a UnitedKingdom bucket");

  const runtimeWithUK = validArtifact({ venueId: "runtime-venue", markerCount: 128, unitedKingdomMarkerCount: 8 });

  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundledWithoutUK,
    fetchImpl: fakeFetchOk(runtimeWithUK),
  });

  assert.equal(result.source, "runtime");
  assert.equal(result.runtimeError, null);
  assert.ok(Array.isArray(result.artifact.countries.UnitedKingdom?.markers), "UnitedKingdom bucket must survive onto the rendered artifact");
  assert.equal(result.artifact.countries.UnitedKingdom.markers.length, 8);
});

// --- retry mechanism: exactly one retry, only for TIMEOUT/NETWORK_ERROR ---

test("resolveMapData: TIMEOUT then success on retry -> runtime wins, exactly 2 fetch attempts made", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const runtime = validArtifact({ venueId: "runtime-venue", markerCount: 2 });
  let attempt = 0;
  const { fetchImpl, calls } = countingFetch(async (_url, { signal } = {}) => {
    attempt += 1;
    if (attempt === 1) {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(runtime) };
  });

  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
    timeoutMs: 20,
    retryDelayMs: 1,
  });

  assert.equal(result.source, "runtime");
  assert.deepEqual(result.artifact, runtime);
  assert.equal(calls(), 2, "exactly one retry attempt (2 total calls) after a TIMEOUT");
});

test("resolveMapData: NETWORK_ERROR then success on retry -> runtime wins, exactly 2 fetch attempts made", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const runtime = validArtifact({ venueId: "runtime-venue", markerCount: 2 });
  let attempt = 0;
  const { fetchImpl, calls } = countingFetch(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("connection reset");
    return { ok: true, status: 200, text: async () => JSON.stringify(runtime) };
  });

  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
    retryDelayMs: 1,
  });

  assert.equal(result.source, "runtime");
  assert.deepEqual(result.artifact, runtime);
  assert.equal(calls(), 2, "exactly one retry attempt (2 total calls) after a NETWORK_ERROR");
});

test("resolveMapData: TIMEOUT on both attempts -> falls back to bundled after exactly 2 calls, never a third attempt", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const { fetchImpl, calls } = countingFetch(fakeFetchAbort());

  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
    timeoutMs: 15,
    retryDelayMs: 1,
  });

  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "TIMEOUT");
  assert.equal(calls(), 2, "must retry exactly once, never loop indefinitely");
});

test("resolveMapData: NETWORK_ERROR on both attempts -> falls back to bundled after exactly 2 calls, never a third attempt", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const { fetchImpl, calls } = countingFetch(fakeFetchNetworkError());

  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl,
    retryDelayMs: 1,
  });

  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "NETWORK_ERROR");
  assert.equal(calls(), 2, "must retry exactly once, never loop indefinitely");
});

// --- PROOF 9: no Git operation is required for a runtime refresh ---
test("this module performs no filesystem or Git operation of any kind — only fetch()", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const source = await readFile(fileURLToPath(new URL("../ingestion/map/runtime-publication.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /node:fs|node:child_process|require\(["']fs["']\)|simple-git|execSync|spawn\(/);
});

// --- PROOF 10: no credential/hostname embedded ---
test("no credential or hardcoded live hostname appears anywhere in the runtime-publication source", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const source = await readFile(fileURLToPath(new URL("../ingestion/map/runtime-publication.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /digitalocean\.com|\.do-vps\.|ghp_[A-Za-z0-9]|github_pat_|bandonthemap\.\w+/i);
  const ipLiterals = source.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
  assert.equal(ipLiterals.length, 0, `unexpected IP literal(s) in source: ${ipLiterals.join(", ")}`);
});

test("fetchRuntimePublicationData: no URL configured resolves to NO_URL_CONFIGURED without calling fetch", async () => {
  let called = false;
  const result = await fetchRuntimePublicationData(null, {
    fetchImpl: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NO_URL_CONFIGURED");
  assert.equal(called, false);
});
