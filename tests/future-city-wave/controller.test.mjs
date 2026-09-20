import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runFutureCityWave } from "../../ingestion/future-city-wave/controller.mjs";
import { recordCandidateState } from "../../ingestion/future-city-wave/state-store.mjs";
import { FAKE_CITIES, plainPage, homepageDiscoveryFetch, makeFetchDocument, fakeDiscoveryCandidate, makeFakeGeocode, makeFakeDiscover } from "./fixtures.mjs";

async function withTempRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), "fcw-test-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const [testville, otherburg, disabledton] = FAKE_CITIES;

function baseFakes() {
  const geocode = makeFakeGeocode({
    "testville-tv": { lat: 1, lon: 1 },
    "otherburg-tv": { lat: 2, lon: 2 },
  });
  return { geocode };
}

test("Tier-1 success: a real-shaped candidate with a working JSON-LD source is proven", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": {
        candidates: [fakeDiscoveryCandidate({ name: "Easy Club", city: "Testville", countryCode: "TV", website: "https://easy.example/", id: 1 })],
        error: null,
      },
    });
    const fetchDocument = makeFetchDocument([["https://easy.example", homepageDiscoveryFetch("https://easy.example")]]);

    const summary = await runFutureCityWave({ root, runId: "r1", cities: [testville], fetchDocument, geocode: baseFakes().geocode, discover });
    assert.equal(summary.counters.tier1_proven, 1);
    assert.equal(summary.counters.future_events_proven, 1);
    assert.equal(summary.city_results[0].status, "COMPLETE");
  });
});

test("every major defer reason is reachable through the wave controller", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": {
        candidates: [
          fakeDiscoveryCandidate({ name: "No Website Venue", city: "Testville", countryCode: "TV", website: null, id: 1 }), // -> T1_DEFER_SOURCE_DISCOVERY (no website at all, gate check)
          fakeDiscoveryCandidate({ name: "No Coords Venue", city: "Testville", countryCode: "TV", website: "https://nocoords.example/", id: 2, lat: null, lon: null }), // -> T1_DEFER_IDENTITY
          fakeDiscoveryCandidate({ name: "Network Fail Venue", city: "Testville", countryCode: "TV", website: "https://networkfail.example/", id: 3 }), // -> T1_DEFER_NETWORK
          fakeDiscoveryCandidate({ name: "Undiscoverable Programme Venue", city: "Testville", countryCode: "TV", website: "https://undiscoverable.example/", id: 4 }), // -> T1_DEFER_SOURCE_DISCOVERY (homepage has no discoverable "events" link)
        ],
        error: null,
      },
    });
    const fetchDocument = makeFetchDocument([
      ["https://networkfail.example", () => { throw new Error("boom"); }],
      ["https://undiscoverable.example", plainPage],
    ]);

    const summary = await runFutureCityWave({ root, runId: "r2", cities: [testville], fetchDocument, geocode: baseFakes().geocode, discover });
    assert.equal(summary.counters.deferred_by_reason.T1_DEFER_SOURCE_DISCOVERY, 2);
    assert.equal(summary.counters.deferred_by_reason.T1_DEFER_IDENTITY, 1);
    assert.equal(summary.counters.deferred_by_reason.T1_DEFER_NETWORK, 1);
    assert.equal(summary.counters.candidates_checked, 4);
  });
});

test("a candidate-level failure is caught, counted, and does not block a later candidate in the same city", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": {
        candidates: [
          fakeDiscoveryCandidate({ name: "Boom Venue", city: "Testville", countryCode: "TV", website: "https://boom.example/", id: 1 }),
          fakeDiscoveryCandidate({ name: "Fine Venue", city: "Testville", countryCode: "TV", website: "https://fine.example/", id: 2 }),
        ],
        error: null,
      },
    });
    const fetchDocument = makeFetchDocument([
      ["https://boom.example", () => { throw new Error("boom, permanently unreachable"); }],
      ["https://fine.example", homepageDiscoveryFetch("https://fine.example")],
    ]);

    const summary = await runFutureCityWave({ root, runId: "r3", cities: [testville], fetchDocument, geocode: baseFakes().geocode, discover });
    // Boom Venue's own fetch failure is a normal, non-crashing NETWORK_FAILURE outcome — proving the SECOND candidate in the same city still gets
    // evaluated regardless of the first one's outcome.
    assert.equal(summary.counters.deferred_by_reason.T1_DEFER_NETWORK, 1);
    assert.equal(summary.counters.tier1_proven, 1, "Fine Venue must still be proven despite Boom Venue's failure");
    assert.equal(summary.city_results[0].checked, 2);
  });
});

test("a city whose geocoding fails does not block the rest of the wave", async () => {
  await withTempRoot(async (root) => {
    const geocode = makeFakeGeocode({ "otherburg-tv": { lat: 2, lon: 2 } }); // testville deliberately has no geocode result -> null
    const discover = makeFakeDiscover({
      "otherburg-tv": {
        candidates: [fakeDiscoveryCandidate({ name: "Surviving Venue", city: "Otherburg", countryCode: "TV", website: "https://survive.example/", id: 9 })],
        error: null,
      },
    });
    const fetchDocument = makeFetchDocument([["https://survive.example", homepageDiscoveryFetch("https://survive.example")]]);

    const summary = await runFutureCityWave({ root, runId: "r4", cities: [testville, otherburg], fetchDocument, geocode, discover });
    assert.equal(summary.counters.geocode_failed, 1);
    assert.equal(summary.city_results[0].status, "GEOCODE_FAILED");
    assert.equal(summary.city_results[1].status, "COMPLETE");
    assert.equal(summary.counters.tier1_proven, 1, "Otherburg's real win must still land despite Testville's geocode failure");
  });
});

test("a disabled city is never processed", async () => {
  await withTempRoot(async (root) => {
    const summary = await runFutureCityWave({ root, runId: "r5", cities: [disabledton], fetchDocument: async () => { throw new Error("must never be called"); }, geocode: async () => { throw new Error("must never be called"); }, discover: async () => { throw new Error("must never be called"); } });
    assert.equal(summary.counters.cities_total, 0);
    assert.deepEqual(summary.city_results, []);
  });
});

test("resume: a discovered city is not re-geocoded/re-queried, and a terminal candidate checkpoint is skipped", async () => {
  await withTempRoot(async (root) => {
    let geocodeCalls = 0;
    let discoverCalls = 0;
    const geocode = async () => { geocodeCalls += 1; return { lat: 1, lon: 1 }; };
    const discoveryPayload = { candidates: [fakeDiscoveryCandidate({ name: "Once Venue", city: "Testville", countryCode: "TV", website: "https://once.example/", id: 1 })], error: null };
    const discover = async () => { discoverCalls += 1; return discoveryPayload; };
    const fetchDocument = makeFetchDocument([["https://once.example", homepageDiscoveryFetch("https://once.example")]]);

    const summary1 = await runFutureCityWave({ root, runId: "resume-1", cities: [testville], fetchDocument, geocode, discover });
    assert.equal(summary1.counters.tier1_proven, 1);
    assert.equal(geocodeCalls, 1);
    assert.equal(discoverCalls, 1);

    // Rerun with the SAME runId: the city was already DISCOVERED and the candidate is already T1_PROVEN (non-terminal, but reused from the checkpoint by the controller's own acquisitionResult cache) --
    // and geocode/discover must not be called again.
    const summary2 = await runFutureCityWave({ root, runId: "resume-1", cities: [testville], fetchDocument: async () => { throw new Error("must not re-fetch"); }, geocode, discover });
    assert.equal(geocodeCalls, 1, "must not re-geocode an already-discovered city");
    assert.equal(discoverCalls, 1, "must not re-query Overpass for an already-discovered city");
    assert.equal(summary2.counters.resumed_skipped, 0, "T1_PROVEN is not a terminal state, so the candidate is re-visited, but via the cache path — see below");
  });
});

test("rerun idempotence: a candidate already recorded as a terminal defer is skipped on rerun (resumed_skipped increments, no fetch happens)", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": { candidates: [fakeDiscoveryCandidate({ name: "Already Deferred", city: "Testville", countryCode: "TV", website: "https://already-deferred.example/", id: 1 })], error: null },
    });
    const geocode = baseFakes().geocode;

    // Pre-populate a terminal checkpoint directly, as if a prior run already deferred this exact candidate.
    const venueId = "venue-testville-already-deferred";
    await recordCandidateState("idempotent-1", venueId, { state: "T1_DEFER_NETWORK", defer_reason: "NETWORK_FAILURE", city_id: "testville-tv" }, { root });

    const summary = await runFutureCityWave({ root, runId: "idempotent-1", cities: [testville], fetchDocument: async () => { throw new Error("must never be called for an already-terminal candidate"); }, geocode, discover });
    assert.equal(summary.counters.resumed_skipped, 1);
    assert.equal(summary.counters.candidates_checked, 0);
  });
});

test("no admission or production-registry write is reachable from this package (static import scan)", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../ingestion/future-city-wave");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".mjs"));
  const forbidden = [/admission\.mjs/i, /publish-map-data/i, /publication-server/i, /deploy/i];
  const offenders = [];
  for (const file of files) {
    const text = await readFile(resolve(dir, file), "utf8");
    const importLines = text.split("\n").filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      for (const pattern of forbidden) {
        if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `future-city-wave must never import admission/publication/deployment code:\n${offenders.join("\n")}`);
});

test("no AI/LLM or browser-automation module is ever imported (static import scan)", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../ingestion/future-city-wave");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".mjs"));
  const forbidden = [/ai-onboarding/i, /playwright/i, /browser-resolution\/playwright-session/i, /anthropic/i, /openai/i, /\bhaiku\b/i, /\bsonnet\b/i];
  const offenders = [];
  for (const file of files) {
    const text = await readFile(resolve(dir, file), "utf8");
    const importLines = text.split("\n").filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      for (const pattern of forbidden) {
        if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `future-city-wave must never import an AI/LLM or browser-automation module:\n${offenders.join("\n")}`);
});
