import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadAreaConfig } from "../ingestion/area/registry.mjs";
import { runDiscovery, buildDiscoveryReport } from "../ingestion/venue-discovery/run.mjs";

async function loadFixtureText(path) {
  return readFile(new URL(`../fixtures/venue-discovery/${path}`, import.meta.url), "utf8");
}

function fakeFetch(fixturePath) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => loadFixtureText(fixturePath),
  });
}

test("runDiscovery wires the real barcelona-es area through both configured sources end-to-end, fully offline", async () => {
  const area = await loadAreaConfig("barcelona-es");
  const result = await runDiscovery(area, {
    fetchOverpassImpl: fakeFetch("overpass/barcelona-sample.json"),
    fetchBarcelonaOpenDataImpl: fakeFetch("barcelona-open-data/sample.json"),
  });

  assert.equal(result.sourceResults.length, 2);
  const overpassResult = result.sourceResults.find((s) => s.source_kind === "OSM_OVERPASS");
  const openDataResult = result.sourceResults.find((s) => s.source_kind === "BARCELONA_OPEN_DATA_ESPAIS_MUSICA_COPES");
  assert.equal(overpassResult.raw_record_count, 8);
  assert.equal(openDataResult.raw_record_count, 6);

  // 7 named OSM leads (1 dropped for no name) + 5 named open-data leads
  // (1 dropped for no name) = 12 candidates before dedup.
  assert.equal(result.candidatesAfterNormalisation, 12);
  assert.equal(result.droppedNoName, 2);

  const excluded = result.candidates.filter((c) => c.discovery_status === "EXCLUDED");
  assert.ok(excluded.some((c) => c.name === "Restaurant Tapes Test"));

  const strong = result.candidates.filter((c) => c.discovery_status === "LIKELY_LIVE_MUSIC_VENUE");
  assert.ok(strong.some((c) => c.name === "Sala Test Jazz"));
  assert.ok(strong.some((c) => c.name === "Auditori Central"));
  assert.ok(strong.some((c) => c.name === "Tablao Flamenco Test"));

  // Every surviving candidate keeps at least one evidence entry.
  assert.ok(result.candidates.every((c) => c.source_evidence.length >= 1));
});

test("buildDiscoveryReport summarises counts and never injects a known-venue name that was not actually discovered", async () => {
  const area = await loadAreaConfig("barcelona-es");
  const result = await runDiscovery(area, {
    fetchOverpassImpl: fakeFetch("overpass/empty-response.json"),
    fetchBarcelonaOpenDataImpl: fakeFetch("barcelona-open-data/empty-response.json"),
  });
  const report = buildDiscoveryReport(result);

  assert.equal(report.candidates_after_normalisation, 0);
  assert.equal(report.candidates_after_deduplication, 0);
  assert.deepEqual(report.recognised_venues_sample, []);
  assert.deepEqual(report.status_breakdown, {
    LIKELY_LIVE_MUSIC_VENUE: 0,
    POSSIBLE_LIVE_MUSIC_VENUE: 0,
    WEAK_CANDIDATE: 0,
    EXCLUDED: 0,
  });
});

test("runDiscovery throws for an area with an unrecognised discovery_sources.source_kind", async () => {
  const area = {
    area_id: "unknown-source-xx",
    country: "Testland",
    country_code: "XX",
    city: "Testville",
    discovery_sources: [{ source_kind: "SOME_FUTURE_SOURCE" }],
  };
  await assert.rejects(() => runDiscovery(area), /Unknown discovery_sources.source_kind/);
});

test("a malformed upstream Overpass response surfaces as a rejected run, not a silently empty one", async () => {
  const area = await loadAreaConfig("barcelona-es");
  await assert.rejects(
    () =>
      runDiscovery(area, {
        fetchOverpassImpl: fakeFetch("overpass/malformed-response.json"),
        fetchBarcelonaOpenDataImpl: fakeFetch("barcelona-open-data/empty-response.json"),
      }),
    /Malformed Overpass response/,
  );
});

test("running the same fixtures twice produces byte-identical candidate sets (deterministic IDs, no random ordering)", async () => {
  const area = await loadAreaConfig("barcelona-es");
  const opts = {
    fetchOverpassImpl: fakeFetch("overpass/barcelona-sample.json"),
    fetchBarcelonaOpenDataImpl: fakeFetch("barcelona-open-data/sample.json"),
  };
  const first = await runDiscovery(area, opts);
  const second = await runDiscovery(area, opts);
  assert.deepEqual(
    first.candidates.map((c) => c.candidate_id).sort(),
    second.candidates.map((c) => c.candidate_id).sort(),
  );
});
