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
  DEFAULT_TIMEOUT_MS,
  RUNTIME_DATA_SOURCES,
  fetchRuntimePublicationData,
  isValidPublicationArtifact,
  resolveMapData,
} from "../ingestion/map/runtime-publication.mjs";

function validArtifact({ generatedAt = "2026-08-25T09:00:00.000Z", venueId = "venue-a", markerCount = 1 } = {}) {
  const markers = Array.from({ length: markerCount }, (_, i) => ({
    venue_id: `${venueId}-${i}`,
    canonical_name: `Venue ${i}`,
    latitude: 38.7 + i * 0.01,
    longitude: -9.1,
    address: "Test Address",
    display_listings: [{ kind: "SINGLE", source_id: "test-source", source_record_id: `rec-${i}` }],
  }));
  return {
    generated_at: generatedAt,
    window: { from: null, to: null },
    source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "test-source", success: true, raw_record_count: markerCount, observation_count: markerCount }] },
    counts: { observation_count: markerCount, display_listing_count: markerCount, map_marker_count: markerCount },
    countries: {
      Portugal: { markers },
      Croatia: { markers: [] },
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

test("module-level constants", () => {
  assert.deepEqual(RUNTIME_DATA_SOURCES, ["runtime", "bundled"]);
  assert.equal(typeof DEFAULT_TIMEOUT_MS, "number");
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
test("resolveMapData: network error -> falls back to bundled, source is 'bundled', reason recorded", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchNetworkError(),
  });
  assert.equal(result.source, "bundled");
  assert.deepEqual(result.artifact, bundled);
  assert.equal(result.runtimeError, "NETWORK_ERROR");
});

test("resolveMapData: timeout -> falls back to bundled (never hangs, never leaves the map blank)", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchAbort(),
    timeoutMs: 20,
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "TIMEOUT");
});

test("resolveMapData: non-2xx HTTP response -> falls back to bundled", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchOk({ error: "unreadable" }, { status: 503 }),
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "HTTP_ERROR");
});

// --- PROOF 6: fallback on malformed JSON (including an HTML error page served with 200) ---
test("resolveMapData: malformed JSON body -> falls back to bundled", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchOk("{not valid json", { json: false }),
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "MALFORMED_JSON");
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
test("resolveMapData: valid JSON that fails publication schema validation -> falls back to bundled", async () => {
  const bundled = validArtifact({ venueId: "bundled-venue" });
  const result = await resolveMapData({
    runtimeUrl: "http://runtime.test/map-data",
    bundledArtifact: bundled,
    fetchImpl: fakeFetchOk({ some: "unrelated but validly-parseable JSON shape" }),
  });
  assert.equal(result.source, "bundled");
  assert.equal(result.runtimeError, "INVALID_SCHEMA");
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
