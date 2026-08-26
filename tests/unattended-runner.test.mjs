// BOTM-UNATTENDED-COLLECTION-RUNNER-01 — full orchestration proof for
// runUnattendedCycle(): lock acquisition/release, DEGRADED vs FAILED
// determination, safe publication via the REAL, unmodified publication
// machinery (ingestion/map/publication.mjs, ingestion/map/
// publish-artifact-io.mjs), artifact preservation on catastrophic
// failure, and the health report's exact shape. Fully offline: acquisition
// itself is injected (this suite does not re-test acquireAll()'s own
// retry/isolation behaviour — see tests/unattended-runner-acquire-all.test.mjs
// for that), and every filesystem write happens under an isolated tmpdir
// root, never the real repository.
//
// BEATMAPPED-UNATTENDED-MULTI-COUNTRY-PUBLICATION-01 extends this suite:
// Barcelona/Spain acquisition is injected the SAME way Portugal's already
// is (`acquireBarcelona` option, mirroring the existing `acquireLisbonPorto`
// option) so every existing test here stays fully offline — none of them
// were changed to exercise Barcelona; they simply supply a small,
// deterministic default Barcelona mock (`fakeAcquireBarcelonaEmpty`) so the
// REAL acquireBarcelona() (live network) is never reached. New tests below
// prove the actual multi-country wiring itself.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createObservation, emptyDateTime } from "../ingestion/observation/contract.mjs";
import { acquireRunLock } from "../ingestion/unattended-runner/lock.mjs";
import { resolveHealthReportDir } from "../ingestion/unattended-runner/health-report.mjs";
import { resolvePublicationArtifactPath } from "../ingestion/map/publish-artifact-io.mjs";
import { runUnattendedCycle } from "../ingestion/unattended-runner/run.mjs";

// meo-arena / casa-da-musica: real, existing fixed-single-venue source_ids
// already hardcoded in ingestion/venue/resolver.mjs's
// SOURCE_ID_TO_FIXED_CANONICAL_VENUE table — reusing the REAL resolver,
// never a parallel one. This test only needs to supply canonical Venue
// registries under an isolated root that define those exact venue_ids.
const VENUE_ID_A = "venue-lisboa-meo-arena";
const VENUE_ID_C = "venue-porto-casa-da-musica";

// almo2bar-barcelona: a real, existing SOURCE_ID-keyed entry in the
// committed venues/source-venue-mappings.json (source_key_type "SOURCE_ID"
// — matches ANY Observation from this source_id, regardless of
// source_record_id) resolving to venue-barcelona-almo2bar — the same
// pattern as VENUE_ID_A/VENUE_ID_C above, just Barcelona's own real,
// stable, single-venue mapping instead of a fixed hardcoded one (Barcelona
// has none — every Barcelona source resolves via this data-driven table,
// see ingestion/venue/resolver.mjs's own doc comment). This table is a
// static ESM JSON import inside resolver.mjs (never root-relative), so it
// resolves correctly even under this suite's isolated tmpdir root.
const BARCELONA_SOURCE_ID = "almo2bar-barcelona";
const VENUE_ID_ES = "venue-barcelona-almo2bar";

function obs(sourceId, id, overrides = {}) {
  return createObservation({
    source_id: sourceId,
    source_record_id: id,
    retrieved_at: "2026-08-25T09:00:00.000Z",
    title: `Gig ${id}`,
    start: { ...emptyDateTime(), date: "2026-09-01" },
    ...overrides,
  });
}

async function makeTempRoot({ seedGoodArtifact = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "botm-unattended-runner-test-"));
  await mkdir(join(root, "venues"), { recursive: true });
  await mkdir(join(root, "data", "public"), { recursive: true });

  await writeFile(
    join(root, "venues", "lisbon.json"),
    JSON.stringify({
      region: "Lisbon",
      venues: [
        {
          venue_id: VENUE_ID_A,
          canonical_name: "MEO Arena",
          country_code: "PT",
          city: "Lisboa",
          municipality: "Lisboa",
          address: "Rossio dos Olivais, 1990-231 Lisboa",
          latitude: 38.7607,
          longitude: -9.0944,
          location_status: "CONFIRMED",
          evidence: [{ url: "https://arena.meo.pt/" }],
          retrieved_at: "2026-08-01",
        },
      ],
    }),
  );
  await writeFile(
    join(root, "venues", "porto.json"),
    JSON.stringify({
      region: "Porto",
      venues: [
        {
          venue_id: VENUE_ID_C,
          canonical_name: "Casa da Música",
          country_code: "PT",
          city: "Porto",
          municipality: "Porto",
          address: "Av. da Boavista 604-610, 4149-071 Porto",
          latitude: 41.1597,
          longitude: -8.6306,
          location_status: "CONFIRMED",
          evidence: [{ url: "https://casadamusica.com/" }],
          retrieved_at: "2026-08-01",
        },
      ],
    }),
  );
  // BEATMAPPED-UNATTENDED-MULTI-COUNTRY-PUBLICATION-01: venues/barcelona.json
  // now must exist under every isolated test root too — runUnattendedCycle()
  // reads it unconditionally, the same way it already reads venues/lisbon.json
  // and venues/porto.json. The one venue here (Almo2bar, real committed
  // coordinates/address — see venues/barcelona.json in the real repository)
  // matches VENUE_ID_ES/BARCELONA_SOURCE_ID above exactly.
  await writeFile(
    join(root, "venues", "barcelona.json"),
    JSON.stringify({
      region: "Barcelona",
      venues: [
        {
          venue_id: VENUE_ID_ES,
          canonical_name: "Almo2bar",
          country_code: "ES",
          city: "Barcelona",
          municipality: "Barcelona",
          address: "Carrer de Bruniquer, 59-61, 08024 Barcelona",
          latitude: 41.4056064,
          longitude: 2.1621059,
          location_status: "GEOCODED",
          evidence: [{ url: "https://grupalmodobar.com/" }],
          retrieved_at: "2026-08-26",
        },
      ],
    }),
  );
  // No venues/manual-coordinates.json — loadManualCoordinateStore() falls
  // back to an empty store for a missing file, exactly as it already does
  // for a genuinely fresh install.

  if (seedGoodArtifact) {
    await writeFile(
      join(root, "data", "public", "lisbon-porto-map.json"),
      `${JSON.stringify(
        {
          generated_at: "2026-08-20T00:00:00.000Z",
          window: { from: null, to: null },
          source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1 }] },
          counts: { observation_count: 1, display_listing_count: 1, map_marker_count: 1 },
          countries: {
            Portugal: {
              markers: [
                {
                  venue_id: VENUE_ID_A,
                  canonical_name: "MEO Arena",
                  latitude: 38.7607,
                  longitude: -9.0944,
                  address: "Rossio dos Olivais, 1990-231 Lisboa",
                  display_listings: [{ kind: "SINGLE", source_id: "meo-arena", source_record_id: "old-1", source_name: "MEO Arena", title: "Old Good Gig", start: emptyDateTime(), end: emptyDateTime(), event_url: null }],
                },
              ],
            },
            Croatia: { markers: [] },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return root;
}

function instantDelay() {
  return async () => {};
}

// BEATMAPPED-UNATTENDED-MULTI-COUNTRY-PUBLICATION-01 — the safe, fast,
// fully-offline default every EXISTING (Portugal-only-focused) test below
// passes as `acquireBarcelona`, so none of them ever reach the real
// acquireBarcelona() (live network against 23 real Barcelona sources).
// Zero sources, zero observations: a legitimate, honestly-empty Spain
// acquisition, not a failure — matches how a genuinely quiet source cycle
// would look.
async function fakeAcquireBarcelonaEmpty() {
  return { barcelonaRegistry: { entries: [] }, barcelonaResults: [], barcelonaObservations: [] };
}

// A single successful Barcelona source (almo2bar-barcelona), for tests
// that need Spain to actually publish a real marker.
function fakeAcquireBarcelonaHealthy() {
  return async () => ({
    barcelonaRegistry: { entries: [{ id: BARCELONA_SOURCE_ID, name: "Almo2bar" }] },
    barcelonaResults: [
      { source_id: BARCELONA_SOURCE_ID, success: true, raw_record_count: 1, observation_count: 1, observations: [obs(BARCELONA_SOURCE_ID, "1")], notes: [] },
    ],
    barcelonaObservations: [obs(BARCELONA_SOURCE_ID, "1")],
  });
}

// The same real, existing MEO Arena / Casa da Música pair every other
// HEALTHY-style test in this file already uses.
function fakeAcquirePortugalHealthy() {
  return async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [{ id: "casa-da-musica" }] },
    lisbonResults: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 }],
    portoResults: [{ source_id: "casa-da-musica", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("casa-da-musica", "1")], notes: [], attempts: 1 }],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [obs("casa-da-musica", "1")],
    lisbonAssociations: [],
  });
}

test("DEGRADED: A succeeds, B fails, C succeeds — safe publication completes, B never blocks A/C", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const fakeAcquire = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena", name: "MEO Arena" }] },
    portoRegistry: { entries: [{ id: "casa-da-musica", name: "Casa da Música" }] },
    lisbonResults: [
      { source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 },
      { source_id: "broken-source", success: false, error: "HTTP 503 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [], attempts: 3 },
    ],
    portoResults: [{ source_id: "casa-da-musica", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("casa-da-musica", "1")], notes: [], attempts: 1 }],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [obs("casa-da-musica", "1")],
    lisbonAssociations: [],
  });

  const { report } = await runUnattendedCycle({ root, runId: "test-degraded", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });

  assert.equal(report.overall_status, "DEGRADED");
  assert.equal(report.publication_status, "PUBLISHED");
  assert.equal(report.artifact_preserved, false);
  assert.equal(report.active_source_count, 3);
  assert.equal(report.successful_source_count, 2);
  assert.equal(report.failed_source_count, 1);
  assert.equal(report.map_marker_count, 2);

  const failedEntry = report.sources.find((s) => s.source_id === "broken-source");
  assert.equal(failedEntry.status, "FAILED");
  assert.equal(failedEntry.attempts, 3);
  assert.match(failedEntry.error, /HTTP 503/);

  // The public artifact really was written, and really does contain both A and C.
  const artifactPath = resolvePublicationArtifactPath({ root });
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const venueIds = artifact.countries.Portugal.markers.map((m) => m.venue_id).sort();
  assert.deepEqual(venueIds, [VENUE_ID_A, VENUE_ID_C].sort());
});

test("FAILED (all sources fail): the previous known-good public artifact is preserved untouched", async (t) => {
  const root = await makeTempRoot({ seedGoodArtifact: true });
  t.after(() => rm(root, { recursive: true, force: true }));

  const artifactPath = resolvePublicationArtifactPath({ root });
  const before = await readFile(artifactPath, "utf8");

  const fakeAcquire = async () => ({
    lisbonRegistry: { entries: [] },
    portoRegistry: { entries: [] },
    lisbonResults: [{ source_id: "meo-arena", success: false, error: "HTTP 500 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [], attempts: 3 }],
    portoResults: [{ source_id: "casa-da-musica", success: false, error: "transport failure: aborted", raw_record_count: 0, observation_count: 0, observations: [], notes: [], attempts: 3 }],
    lisbonObservations: [],
    portoObservations: [],
    lisbonAssociations: [],
  });

  const { report } = await runUnattendedCycle({ root, runId: "test-failed", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });

  assert.equal(report.overall_status, "FAILED");
  assert.equal(report.publication_status, "PRESERVED_PREVIOUS");
  assert.equal(report.publication_reason, "CATASTROPHIC_RUN");
  assert.equal(report.artifact_preserved, true);

  const after = await readFile(artifactPath, "utf8");
  assert.equal(after, before, "a FAILED run must never overwrite the last known-good public artifact");
});

test("HEALTHY: every source succeeds and publication succeeds", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const fakeAcquire = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [{ id: "casa-da-musica" }] },
    lisbonResults: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 }],
    portoResults: [{ source_id: "casa-da-musica", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("casa-da-musica", "1")], notes: [], attempts: 1 }],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [obs("casa-da-musica", "1")],
    lisbonAssociations: [],
  });

  const { report } = await runUnattendedCycle({ root, runId: "test-healthy", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });
  assert.equal(report.overall_status, "HEALTHY");
  assert.equal(report.failed_source_count, 0);
  assert.equal(report.publication_status, "PUBLISHED");
});

test("overlapping run: a second invocation while a lock is already held is refused safely, artifact untouched", async (t) => {
  const root = await makeTempRoot({ seedGoodArtifact: true });
  t.after(() => rm(root, { recursive: true, force: true }));

  const artifactPath = resolvePublicationArtifactPath({ root });
  const before = await readFile(artifactPath, "utf8");

  // Simulate an in-flight run by holding the lock ourselves first.
  const held = await acquireRunLock({ root, pid: process.pid });
  assert.equal(held.ok, true);

  const fakeAcquire = async () => {
    throw new Error("must never be called — the run should be refused before any acquisition happens");
  };

  const outcome = await runUnattendedCycle({ root, runId: "test-overlap", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });

  assert.equal(outcome.refused, true);
  assert.equal(outcome.reason, "ANOTHER_RUN_IN_PROGRESS");

  const after = await readFile(artifactPath, "utf8");
  assert.equal(after, before, "a refused overlapping run must never touch the public artifact");

  // No health report should have been written for a refused run either.
  const reportDir = resolveHealthReportDir({ root });
  await assert.rejects(() => readFile(join(reportDir, "test-overlap.json")));
});

test("the lock is released after a normal (HEALTHY) completion, allowing a subsequent run", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const fakeAcquire = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [] },
    lisbonResults: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 }],
    portoResults: [],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [],
    lisbonAssociations: [],
  });

  await runUnattendedCycle({ root, runId: "run-1", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });
  const second = await runUnattendedCycle({ root, runId: "run-2", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });
  assert.equal(second.refused, undefined, "the lock must be released after a normal completion");
  assert.equal(second.report.overall_status, "HEALTHY");
});

test("the lock is released after a handled FAILED run (catastrophic), allowing a subsequent run", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const failingAcquire = async () => ({
    lisbonRegistry: { entries: [] },
    portoRegistry: { entries: [] },
    lisbonResults: [{ source_id: "meo-arena", success: false, error: "HTTP 500 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [], attempts: 3 }],
    portoResults: [],
    lisbonObservations: [],
    portoObservations: [],
    lisbonAssociations: [],
  });
  const healthyAcquire = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [] },
    lisbonResults: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 }],
    portoResults: [],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [],
    lisbonAssociations: [],
  });

  const first = await runUnattendedCycle({ root, runId: "run-fail", acquireLisbonPorto: failingAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });
  assert.equal(first.report.overall_status, "FAILED");

  const second = await runUnattendedCycle({ root, runId: "run-recover", acquireLisbonPorto: healthyAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });
  assert.equal(second.refused, undefined, "the lock must be released even after a handled FAILED run");
  assert.equal(second.report.overall_status, "HEALTHY");
});

test("health report is written with UTC timestamps and can be read back byte-identically via latest.json", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const fakeAcquire = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [] },
    lisbonResults: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 }],
    portoResults: [],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [],
    lisbonAssociations: [],
  });

  const { report } = await runUnattendedCycle({ root, runId: "run-ts", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty });
  assert.ok(report.started_at.endsWith("Z"), "started_at must be a UTC (Z-suffixed) ISO timestamp");
  assert.ok(report.completed_at.endsWith("Z"), "completed_at must be a UTC (Z-suffixed) ISO timestamp");
  assert.ok(typeof report.duration_ms === "number" && report.duration_ms >= 0);

  const dir = resolveHealthReportDir({ root });
  const persistedRun = JSON.parse(await readFile(join(dir, "run-ts.json"), "utf8"));
  const persistedLatest = JSON.parse(await readFile(join(dir, "latest.json"), "utf8"));
  assert.deepEqual(persistedRun, report);
  assert.deepEqual(persistedLatest, report);
});

test("uses this project's bounded retry policy defaults when maxAttempts/retryDelayMs are not overridden", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let seenRetryPolicy = null;
  const fakeAcquire = async (args) => {
    seenRetryPolicy = args.retryPolicy;
    return {
      lisbonRegistry: { entries: [] },
      portoRegistry: { entries: [] },
      lisbonResults: [],
      portoResults: [],
      lisbonObservations: [],
      portoObservations: [],
      lisbonAssociations: [],
    };
  };

  await runUnattendedCycle({ root, runId: "run-policy", acquireLisbonPorto: fakeAcquire, acquireBarcelona: fakeAcquireBarcelonaEmpty, delayFn: instantDelay() });
  assert.equal(seenRetryPolicy.maxAttempts, 3);
  assert.equal(seenRetryPolicy.retryDelayMs, 500);
});

// --- BEATMAPPED-UNATTENDED-MULTI-COUNTRY-PUBLICATION-01 — multi-country wiring proofs ---

test("the unattended runner invokes Barcelona/Spain acquisition every cycle, not just Portugal", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let barcelonaAcquisitionCalled = false;
  const spyAcquireBarcelona = async () => {
    barcelonaAcquisitionCalled = true;
    return fakeAcquireBarcelonaEmpty();
  };

  await runUnattendedCycle({ root, runId: "run-spain-invoked", acquireLisbonPorto: fakeAcquirePortugalHealthy(), acquireBarcelona: spyAcquireBarcelona });
  assert.equal(barcelonaAcquisitionCalled, true, "acquireBarcelona() must be called on every unattended cycle, not left Portugal-only");
});

test("Portugal AND Spain markers both reach the SAME combined publication artifact", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-both-countries",
    acquireLisbonPorto: fakeAcquirePortugalHealthy(),
    acquireBarcelona: fakeAcquireBarcelonaHealthy(),
  });

  assert.equal(report.overall_status, "HEALTHY");
  assert.equal(report.publication_status, "PUBLISHED");
  // map_marker_count/display_listing_count are GLOBAL totals across every
  // published country (see ingestion/map/publication.mjs's own doc
  // comment) — 2 Portugal (MEO Arena, Casa da Música) + 1 Spain (Almo2bar).
  assert.equal(report.map_marker_count, 3);

  const artifactPath = resolvePublicationArtifactPath({ root });
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(
    artifact.countries.Portugal.markers.map((m) => m.venue_id).sort(),
    [VENUE_ID_A, VENUE_ID_C].sort(),
  );
  assert.deepEqual(
    artifact.countries.Spain.markers.map((m) => m.venue_id),
    [VENUE_ID_ES],
  );
});

test("a Portugal-side source failure does not zero Spain — Spain still publishes its own successful data", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const degradedPortugal = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [{ id: "casa-da-musica" }] },
    lisbonResults: [
      { source_id: "meo-arena", success: false, error: "HTTP 503 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [], attempts: 3 },
    ],
    portoResults: [{ source_id: "casa-da-musica", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("casa-da-musica", "1")], notes: [], attempts: 1 }],
    lisbonObservations: [],
    portoObservations: [obs("casa-da-musica", "1")],
    lisbonAssociations: [],
  });

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-portugal-partial-fail",
    acquireLisbonPorto: degradedPortugal,
    acquireBarcelona: fakeAcquireBarcelonaHealthy(),
  });

  assert.equal(report.overall_status, "DEGRADED", "one failed Portugal source degrades the run but must not fail it outright");
  assert.equal(report.publication_status, "PUBLISHED");

  const artifactPath = resolvePublicationArtifactPath({ root });
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(
    artifact.countries.Spain.markers.map((m) => m.venue_id),
    [VENUE_ID_ES],
    "Spain's own successful acquisition must be completely unaffected by a Portugal-side source failure",
  );
  assert.deepEqual(
    artifact.countries.Portugal.markers.map((m) => m.venue_id),
    [VENUE_ID_C],
    "Casa da Música (the surviving Portugal source) must still publish",
  );
});

test("a Spain-side source failure does not zero Portugal — Portugal still publishes its own successful data", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const degradedBarcelona = async () => ({
    barcelonaRegistry: { entries: [{ id: BARCELONA_SOURCE_ID }] },
    barcelonaResults: [
      { source_id: BARCELONA_SOURCE_ID, success: false, error: "HTTP 503 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [] },
    ],
    barcelonaObservations: [],
  });

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-spain-partial-fail",
    acquireLisbonPorto: fakeAcquirePortugalHealthy(),
    acquireBarcelona: degradedBarcelona,
  });

  assert.equal(report.overall_status, "DEGRADED", "one failed Barcelona source degrades the run but must not fail it outright");
  assert.equal(report.publication_status, "PUBLISHED");

  const artifactPath = resolvePublicationArtifactPath({ root });
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(
    artifact.countries.Portugal.markers.map((m) => m.venue_id).sort(),
    [VENUE_ID_A, VENUE_ID_C].sort(),
    "Portugal's own successful acquisition must be completely unaffected by a Spain-side source failure",
  );
  assert.deepEqual(artifact.countries.Spain.markers, [], "Spain honestly publishes zero markers this run — never fabricated");
});

test("a TOTAL Barcelona acquisition failure (the whole call throws) does not abort Portugal's already-successful cycle", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const throwingAcquireBarcelona = async () => {
    throw new Error("sources/barcelona.json unreadable");
  };

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-spain-total-fail",
    acquireLisbonPorto: fakeAcquirePortugalHealthy(),
    acquireBarcelona: throwingAcquireBarcelona,
  });

  assert.equal(report.overall_status, "DEGRADED", "a total Barcelona acquisition failure must degrade, never crash, the whole cycle");
  assert.equal(report.publication_status, "PUBLISHED");

  const artifactPath = resolvePublicationArtifactPath({ root });
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(
    artifact.countries.Portugal.markers.map((m) => m.venue_id).sort(),
    [VENUE_ID_A, VENUE_ID_C].sort(),
    "Portugal must still publish even though Barcelona's whole acquisition call threw",
  );
  assert.deepEqual(artifact.countries.Spain.markers, [], "Spain honestly publishes zero markers — never fabricated");

  // The failure must be VISIBLE in the health report, not silently swallowed.
  const failedEntry = report.sources.find((s) => s.source_id === "barcelona-acquisition");
  assert.ok(failedEntry, "the total Barcelona acquisition failure must appear as its own FAILED source entry");
  assert.equal(failedEntry.status, "FAILED");
  assert.match(failedEntry.error, /sources\/barcelona\.json unreadable/);
});

test("failed_source_count/successful_source_count/active_source_count are truthful TOTALS across Portugal + Spain combined", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const degradedPortugal = async () => ({
    lisbonRegistry: { entries: [{ id: "meo-arena" }] },
    portoRegistry: { entries: [{ id: "casa-da-musica" }] },
    lisbonResults: [
      { source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("meo-arena", "1")], notes: [], attempts: 1 },
      { source_id: "broken-lisbon-source", success: false, error: "HTTP 500 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [], attempts: 3 },
    ],
    portoResults: [{ source_id: "casa-da-musica", success: true, raw_record_count: 1, observation_count: 1, observations: [obs("casa-da-musica", "1")], notes: [], attempts: 1 }],
    lisbonObservations: [obs("meo-arena", "1")],
    portoObservations: [obs("casa-da-musica", "1")],
    lisbonAssociations: [],
  });
  const degradedBarcelona = async () => ({
    barcelonaRegistry: { entries: [{ id: BARCELONA_SOURCE_ID }] },
    barcelonaResults: [
      { source_id: BARCELONA_SOURCE_ID, success: true, raw_record_count: 1, observation_count: 1, observations: [obs(BARCELONA_SOURCE_ID, "1")], notes: [] },
      { source_id: "broken-barcelona-source", success: false, error: "HTTP 503 response", raw_record_count: 0, observation_count: 0, observations: [], notes: [] },
    ],
    barcelonaObservations: [obs(BARCELONA_SOURCE_ID, "1")],
  });

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-combined-counts",
    acquireLisbonPorto: degradedPortugal,
    acquireBarcelona: degradedBarcelona,
  });

  assert.equal(report.overall_status, "DEGRADED");
  // 3 Portugal-side (meo-arena, broken-lisbon-source, casa-da-musica) + 2
  // Barcelona-side (almo2bar-barcelona, broken-barcelona-source) = 5 total.
  assert.equal(report.active_source_count, 5);
  assert.equal(report.successful_source_count, 3);
  assert.equal(report.failed_source_count, 2);
  assert.deepEqual(
    report.sources.filter((s) => s.status === "FAILED").map((s) => s.source_id).sort(),
    ["broken-barcelona-source", "broken-lisbon-source"],
  );
  // map_marker_count is the GLOBAL total (2 Portugal + 1 Spain).
  assert.equal(report.map_marker_count, 3);
});
