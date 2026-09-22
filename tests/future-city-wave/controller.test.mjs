import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runFutureCityWave } from "../../ingestion/future-city-wave/controller.mjs";
import { recordCandidateState, resolveCandidatesDir, sanitizeIdForFilename } from "../../ingestion/future-city-wave/state-store.mjs";
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
    // This is a genuine idempotence test for the CURRENT (Correction-03) checkpoint format — the
    // candidate's own execution_id is the key, exactly as recordCandidateState now requires. The
    // separate legacy-format (venue_id-keyed, no execution_id) compatibility path has its own
    // dedicated tests below.
    const venueId = "venue-testville-already-deferred";
    // provenance.candidate_id must match exactly what toWaveCandidate() will derive for the SAME
    // discovered candidate below (fixtures.mjs's fakeDiscoveryCandidate id:1 -> "cand-osm-node-1"),
    // since that is now the durable checkpoint key.
    const candidateStub = { venue_id: venueId, provenance: { candidate_id: "cand-osm-node-1" } };
    await recordCandidateState("idempotent-1", candidateStub, { state: "T1_DEFER_NETWORK", defer_reason: "NETWORK_FAILURE", city_id: "testville-tv" }, { root });

    const summary = await runFutureCityWave({ root, runId: "idempotent-1", cities: [testville], fetchDocument: async () => { throw new Error("must never be called for an already-terminal candidate"); }, geocode, discover });
    assert.equal(summary.counters.resumed_skipped, 1);
    assert.equal(summary.counters.candidates_checked, 0);
  });
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — checkpoint
// identity tests. A real Manchester run found 11 pairs of distinct
// reconciled candidates sharing an identical canonical_name (so an
// identical venue_id, since venue_id is derived from name+city alone) —
// e.g. two separate representations of "AO Arena" from different
// providers — silently overwriting each other's checkpoint file. These
// tests prove that no longer happens: each candidate is now checkpointed
// by its own durable execution_id (reconciled_candidate_id, or a legacy
// candidate_id), independent of its display name.

test("checkpoint identity: two distinct candidates sharing the same canonical name never collide — both reach their own persisted terminal state, and resume skips both independently", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": {
        candidates: [
          fakeDiscoveryCandidate({ name: "Duplicate Name Venue", city: "Testville", countryCode: "TV", website: "https://dup-a.example/", id: 101 }),
          fakeDiscoveryCandidate({ name: "Duplicate Name Venue", city: "Testville", countryCode: "TV", website: "https://dup-b.example/", id: 102 }),
        ],
        error: null,
      },
    });
    // T1_PROVEN is deliberately NOT a terminal/skippable state in this system (see the
    // "resume: a discovered city..." test above) — a genuinely terminal DEFER outcome is what
    // exercises checkpoint resume, exactly like the pre-existing idempotence test does.
    const fetchDocument = makeFetchDocument([
      ["https://dup-a.example", () => { throw new Error("dup-a permanently unreachable"); }],
      ["https://dup-b.example", () => { throw new Error("dup-b permanently unreachable"); }],
    ]);
    const geocode = baseFakes().geocode;

    const summary = await runFutureCityWave({ root, runId: "collision-1", cities: [testville], fetchDocument, geocode, discover });
    assert.equal(summary.counters.candidates_checked, 2, "both same-named candidates must be independently evaluated, never merged");
    assert.equal(summary.counters.deferred_by_reason.T1_DEFER_NETWORK, 2, "both independently reach their own terminal outcome — neither's result overwrote the other's checkpoint file");

    const dir = resolveCandidatesDir("collision-1", { root });
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 2, "two distinct checkpoint files must exist on disk, not one collided file");

    // Resume: re-running must skip BOTH (each recognised via its own execution_id).
    const resumed = await runFutureCityWave({ root, runId: "collision-1", cities: [testville], fetchDocument: async () => { throw new Error("must not re-fetch a resumed terminal candidate"); }, geocode, discover });
    assert.equal(resumed.counters.resumed_skipped, 2);
    assert.equal(resumed.counters.candidates_checked, 0);
  });
});

test("legacy checkpoint compatibility: an unambiguous pre-Correction-03 checkpoint (no execution_id, keyed only by venue_id) is still safely reused", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": { candidates: [fakeDiscoveryCandidate({ name: "Legacy Only Venue", city: "Testville", countryCode: "TV", website: "https://legacy-only.example/", id: 201 })], error: null },
    });
    const geocode = baseFakes().geocode;

    // Simulate a genuine pre-Correction-03 checkpoint file: written directly, venue_id-keyed, no execution_id field at all.
    const venueId = "venue-testville-legacy-only-venue";
    const dir = resolveCandidatesDir("legacy-1", { root });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${sanitizeIdForFilename(venueId)}.json`), JSON.stringify({ venue_id: venueId, state: "T1_DEFER_NETWORK", defer_reason: "NETWORK_FAILURE", city_id: "testville-tv", updated_at: "2026-01-01T00:00:00.000Z" }, null, 2));

    const summary = await runFutureCityWave({ root, runId: "legacy-1", cities: [testville], fetchDocument: async () => { throw new Error("must not re-fetch — the unambiguous legacy checkpoint must be reused"); }, geocode, discover });
    assert.equal(summary.counters.resumed_skipped, 1);
    assert.equal(summary.counters.candidates_checked, 0);
  });
});

test("legacy checkpoint compatibility: an AMBIGUOUS pre-Correction-03 checkpoint (today's candidates share its venue_id) is NOT reused — both are re-evaluated fresh", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": {
        candidates: [
          fakeDiscoveryCandidate({ name: "Ambiguous Legacy Venue", city: "Testville", countryCode: "TV", website: "https://ambig-a.example/", id: 301 }),
          fakeDiscoveryCandidate({ name: "Ambiguous Legacy Venue", city: "Testville", countryCode: "TV", website: "https://ambig-b.example/", id: 302 }),
        ],
        error: null,
      },
    });
    const geocode = baseFakes().geocode;

    // A single legacy checkpoint under the shared venue_id — it cannot tell which of today's TWO candidates it belongs to.
    const venueId = "venue-testville-ambiguous-legacy-venue";
    const dir = resolveCandidatesDir("legacy-2", { root });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${sanitizeIdForFilename(venueId)}.json`), JSON.stringify({ venue_id: venueId, state: "T1_DEFER_NETWORK", defer_reason: "NETWORK_FAILURE", city_id: "testville-tv", updated_at: "2026-01-01T00:00:00.000Z" }, null, 2));

    const fetchDocument = makeFetchDocument([
      ["https://ambig-a.example", homepageDiscoveryFetch("https://ambig-a.example")],
      ["https://ambig-b.example", homepageDiscoveryFetch("https://ambig-b.example")],
    ]);
    const summary = await runFutureCityWave({ root, runId: "legacy-2", cities: [testville], fetchDocument, geocode, discover });
    assert.equal(summary.counters.resumed_skipped, 0, "an ambiguous legacy checkpoint must never be silently attributed to either candidate");
    assert.equal(summary.counters.candidates_checked, 2, "both must be re-evaluated fresh");
    assert.equal(summary.counters.tier1_proven, 2);
  });
});

test("counters equal persisted states: after a run with same-name distinct candidates, checkpoint file count and tier1_proven both equal candidates_checked", async () => {
  await withTempRoot(async (root) => {
    const discover = makeFakeDiscover({
      "testville-tv": {
        candidates: [
          fakeDiscoveryCandidate({ name: "Accounting Venue", city: "Testville", countryCode: "TV", website: "https://acct-a.example/", id: 401 }),
          fakeDiscoveryCandidate({ name: "Accounting Venue", city: "Testville", countryCode: "TV", website: "https://acct-b.example/", id: 402 }),
          fakeDiscoveryCandidate({ name: "Accounting Venue", city: "Testville", countryCode: "TV", website: "https://acct-c.example/", id: 403 }),
        ],
        error: null,
      },
    });
    const fetchDocument = makeFetchDocument([
      ["https://acct-a.example", homepageDiscoveryFetch("https://acct-a.example")],
      ["https://acct-b.example", homepageDiscoveryFetch("https://acct-b.example")],
      ["https://acct-c.example", homepageDiscoveryFetch("https://acct-c.example")],
    ]);
    const geocode = baseFakes().geocode;

    const summary = await runFutureCityWave({ root, runId: "accounting-1", cities: [testville], fetchDocument, geocode, discover });
    const dir = resolveCandidatesDir("accounting-1", { root });
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 3, "checkpoint file count must equal the number of distinct candidates evaluated");
    assert.equal(summary.counters.candidates_checked, 3);
    assert.equal(summary.counters.tier1_proven, 3);
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
