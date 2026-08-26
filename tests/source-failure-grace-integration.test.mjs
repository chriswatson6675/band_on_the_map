// BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01 — full end-to-end
// integration proof, through the REAL, unmodified runUnattendedCycle()
// (never a parallel orchestration loop), that a FAILED source's recent
// last-known-good data is genuinely carried forward for up to 24 hours,
// truthfully marked as retained/DEGRADED, safely bounded by the previous
// artifact's own re-validation, and automatically replaced the moment the
// source recovers. This complements:
//   - tests/source-retention.test.mjs (pure, fully deterministic-clock
//     unit tests for the mechanism itself, including the real 9-venue
//     L'Auditori venue_id set)
//   - tests/barcelona-acquire-all.test.mjs (Barcelona's own retry symmetry)
//   - tests/unattended-runner.test.mjs (the existing multi-country wiring
//     suite this file deliberately does not duplicate)
//
// Every source_id/venue_id below is REAL and already resolvable through
// the committed venues/source-venue-mappings.json (this suite's isolated
// tmpdir root still resolves through that SAME, real, static-imported
// table — see tests/unattended-runner.test.mjs's own comment on
// BARCELONA_SOURCE_ID for why). The "fresh" sources are 3 real
// SOURCE_ID-keyed single-venue mappings; the "umbrella" source is the
// REAL l-auditori-barcelona, matched via 2 of its real VENUE_NAME
// mappings — the exact real-world shape of the production incident this
// package fixes (one source, several mapped venues), just 2 of the real
// 9 rather than all of them (that full 9-venue set is already proven
// separately, at the pure-module level, in tests/source-retention.test.mjs).
//
// Fully offline: acquisition is injected throughout; only the artifact
// read/write and health-report write touch a real (isolated tmpdir) disk.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createObservation, emptyDateTime } from "../ingestion/observation/contract.mjs";
import { resolvePublicationArtifactPath } from "../ingestion/map/publish-artifact-io.mjs";
import { runUnattendedCycle } from "../ingestion/unattended-runner/run.mjs";

const H = 60 * 60 * 1000;

const FRESH_SOURCE_1 = "robadors-23-barcelona";
const FRESH_VENUE_1 = "venue-barcelona-robadors-23";
const FRESH_SOURCE_2 = "byron-barcelona";
const FRESH_VENUE_2 = "venue-barcelona-byron";
const FRESH_SOURCE_3 = "harlem-jazz-club-barcelona";
const FRESH_VENUE_3 = "venue-barcelona-harlem-jazz-club";

// The REAL umbrella source from the actual production incident, matched
// via 2 of its real VENUE_NAME mappings (venues/source-venue-mappings.json).
const UMBRELLA_SOURCE = "l-auditori-barcelona";
const UMBRELLA_VENUE_NAME_1 = "Palau de la Música Catalana";
const UMBRELLA_VENUE_1 = "venue-barcelona-palau-de-la-musica-catalana";
const UMBRELLA_VENUE_NAME_2 = "Monestir Sant Pau del Camp";
const UMBRELLA_VENUE_2 = "venue-barcelona-monestir-sant-pau-del-camp";

function freshObs(sourceId, id) {
  return createObservation({
    source_id: sourceId,
    source_record_id: id,
    retrieved_at: "2026-08-26T09:00:00.000Z",
    title: `Gig ${id}`,
    start: { ...emptyDateTime(), date: "2026-09-15" },
  });
}

function umbrellaObs(id, venueName) {
  return createObservation({
    source_id: UMBRELLA_SOURCE,
    source_record_id: id,
    retrieved_at: "2026-08-26T09:00:00.000Z",
    title: `Gig ${id}`,
    venue_name: venueName,
    start: { ...emptyDateTime(), date: "2026-09-15" },
  });
}

function displayListing(sourceId, recordId, date = "2026-09-15") {
  return { kind: "SINGLE", source_id: sourceId, source_record_id: recordId, source_name: sourceId, title: `Gig ${recordId}`, start: { ...emptyDateTime(), date }, end: emptyDateTime(), event_url: null };
}

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "botm-source-failure-grace-test-"));
  await mkdir(join(root, "venues"), { recursive: true });
  await mkdir(join(root, "data", "public"), { recursive: true });

  await writeFile(join(root, "venues", "lisbon.json"), JSON.stringify({ region: "Lisbon", venues: [] }));
  await writeFile(join(root, "venues", "porto.json"), JSON.stringify({ region: "Porto", venues: [] }));
  await writeFile(
    join(root, "venues", "barcelona.json"),
    JSON.stringify({
      region: "Barcelona",
      venues: [
        { venue_id: FRESH_VENUE_1, canonical_name: "Robadors 23", country_code: "ES", city: "Barcelona", municipality: "Barcelona", address: "Carrer d'en Robador, 23", latitude: 41.3796, longitude: 2.1704, location_status: "GEOCODED", evidence: [{ url: "https://example.com/robadors" }], retrieved_at: "2026-08-01" },
        { venue_id: FRESH_VENUE_2, canonical_name: "Byron", country_code: "ES", city: "Barcelona", municipality: "Barcelona", address: "Carrer de Gràcia", latitude: 41.399, longitude: 2.159, location_status: "GEOCODED", evidence: [{ url: "https://example.com/byron" }], retrieved_at: "2026-08-01" },
        { venue_id: FRESH_VENUE_3, canonical_name: "Harlem Jazz Club", country_code: "ES", city: "Barcelona", municipality: "Barcelona", address: "Carrer de la Comtessa de Sobradiel, 8", latitude: 41.382, longitude: 2.178, location_status: "GEOCODED", evidence: [{ url: "https://example.com/harlem" }], retrieved_at: "2026-08-01" },
        { venue_id: UMBRELLA_VENUE_1, canonical_name: "Palau de la Música Catalana", country_code: "ES", city: "Barcelona", municipality: "Barcelona", address: "Carrer Palau de la Música, 4-6", latitude: 41.3875, longitude: 2.1751, location_status: "GEOCODED", evidence: [{ url: "https://example.com/palau" }], retrieved_at: "2026-08-01" },
        { venue_id: UMBRELLA_VENUE_2, canonical_name: "Monestir de Sant Pau del Camp", country_code: "ES", city: "Barcelona", municipality: "Barcelona", address: "Carrer de Sant Pau, 101", latitude: 41.3765, longitude: 2.1671, location_status: "GEOCODED", evidence: [{ url: "https://example.com/monestir" }], retrieved_at: "2026-08-01" },
      ],
    }),
  );
  return root;
}

/** Seed a valid, previously-published artifact at the canonical path — the ONLY input source-failure retention ever reads. */
async function seedPreviousArtifact(root, { umbrellaLastSuccessAt, includeUmbrellaListings = true }) {
  const artifact = {
    generated_at: "2026-08-26T10:00:00.000Z",
    window: { from: null, to: null },
    source_report: {
      success_count: 4,
      failure_count: 0,
      sources: [
        { source_id: FRESH_SOURCE_1, success: true, raw_record_count: 1, observation_count: 1, last_success_at: "2026-08-26T10:00:00.000Z" },
        { source_id: FRESH_SOURCE_2, success: true, raw_record_count: 1, observation_count: 1, last_success_at: "2026-08-26T10:00:00.000Z" },
        { source_id: FRESH_SOURCE_3, success: true, raw_record_count: 1, observation_count: 1, last_success_at: "2026-08-26T10:00:00.000Z" },
        { source_id: UMBRELLA_SOURCE, success: true, raw_record_count: 2, observation_count: 2, last_success_at: umbrellaLastSuccessAt },
      ],
    },
    counts: { observation_count: 5, display_listing_count: includeUmbrellaListings ? 5 : 3, map_marker_count: includeUmbrellaListings ? 5 : 3 },
    countries: {
      Portugal: { markers: [] },
      Croatia: { markers: [] },
      Spain: {
        markers: [
          { venue_id: FRESH_VENUE_1, canonical_name: "Robadors 23", latitude: 41.3796, longitude: 2.1704, address: "Carrer d'en Robador, 23", display_listings: [displayListing(FRESH_SOURCE_1, "f1")] },
          { venue_id: FRESH_VENUE_2, canonical_name: "Byron", latitude: 41.399, longitude: 2.159, address: "Carrer de Gràcia", display_listings: [displayListing(FRESH_SOURCE_2, "f2")] },
          { venue_id: FRESH_VENUE_3, canonical_name: "Harlem Jazz Club", latitude: 41.382, longitude: 2.178, address: "Carrer de la Comtessa de Sobradiel, 8", display_listings: [displayListing(FRESH_SOURCE_3, "f3")] },
          ...(includeUmbrellaListings
            ? [
                { venue_id: UMBRELLA_VENUE_1, canonical_name: "Palau de la Música Catalana", latitude: 41.3875, longitude: 2.1751, address: "Carrer Palau de la Música, 4-6", display_listings: [displayListing(UMBRELLA_SOURCE, "u1")] },
                { venue_id: UMBRELLA_VENUE_2, canonical_name: "Monestir de Sant Pau del Camp", latitude: 41.3765, longitude: 2.1671, address: "Carrer de Sant Pau, 101", display_listings: [displayListing(UMBRELLA_SOURCE, "u2")] },
              ]
            : []),
        ],
      },
    },
  };
  await writeFile(resolvePublicationArtifactPath({ root }), `${JSON.stringify(artifact, null, 2)}\n`);
}

const emptyPortugalAcquire = async () => ({
  lisbonRegistry: { entries: [] },
  portoRegistry: { entries: [] },
  lisbonResults: [],
  portoResults: [],
  lisbonObservations: [],
  portoObservations: [],
  lisbonAssociations: [],
});

function barcelonaAcquireWithFailingUmbrella() {
  return async () => ({
    barcelonaRegistry: { entries: [{ id: FRESH_SOURCE_1 }, { id: FRESH_SOURCE_2 }, { id: FRESH_SOURCE_3 }, { id: UMBRELLA_SOURCE }] },
    barcelonaResults: [
      { source_id: FRESH_SOURCE_1, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_1, "f1")], notes: [] },
      { source_id: FRESH_SOURCE_2, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_2, "f2")], notes: [] },
      { source_id: FRESH_SOURCE_3, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_3, "f3")], notes: [] },
      { source_id: UMBRELLA_SOURCE, success: false, error: "fetch failed", raw_record_count: 0, observation_count: 0, observations: [], notes: [] },
    ],
    barcelonaObservations: [freshObs(FRESH_SOURCE_1, "f1"), freshObs(FRESH_SOURCE_2, "f2"), freshObs(FRESH_SOURCE_3, "f3")],
  });
}

function barcelonaAcquireWithRecoveredUmbrella() {
  return async () => ({
    barcelonaRegistry: { entries: [{ id: FRESH_SOURCE_1 }, { id: FRESH_SOURCE_2 }, { id: FRESH_SOURCE_3 }, { id: UMBRELLA_SOURCE }] },
    barcelonaResults: [
      { source_id: FRESH_SOURCE_1, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_1, "f1")], notes: [] },
      { source_id: FRESH_SOURCE_2, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_2, "f2")], notes: [] },
      { source_id: FRESH_SOURCE_3, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_3, "f3")], notes: [] },
      { source_id: UMBRELLA_SOURCE, success: true, raw_record_count: 2, observation_count: 2, observations: [umbrellaObs("u1-new", UMBRELLA_VENUE_NAME_1), umbrellaObs("u2-new", UMBRELLA_VENUE_NAME_2)], notes: [] },
    ],
    barcelonaObservations: [freshObs(FRESH_SOURCE_1, "f1"), freshObs(FRESH_SOURCE_2, "f2"), freshObs(FRESH_SOURCE_3, "f3"), umbrellaObs("u1-new", UMBRELLA_VENUE_NAME_1), umbrellaObs("u2-new", UMBRELLA_VENUE_NAME_2)],
  });
}

// --- item 15: the realistic L'Auditori regression scenario ---

test("REGRESSION (L'Auditori shape): the real umbrella source failing within 24h grace does NOT collapse its mapped venues off the live map", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await seedPreviousArtifact(root, { umbrellaLastSuccessAt: new Date(Date.now() - 3 * H).toISOString() }); // well within grace

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-grace-active",
    acquireLisbonPorto: emptyPortugalAcquire,
    acquireBarcelona: barcelonaAcquireWithFailingUmbrella(),
  });

  assert.equal(report.overall_status, "DEGRADED", "a retained-but-failed source must never be reported as fully HEALTHY");
  assert.equal(report.publication_status, "PUBLISHED");

  const artifact = JSON.parse(await readFile(resolvePublicationArtifactPath({ root }), "utf8"));
  const spainVenueIds = artifact.countries.Spain.markers.map((m) => m.venue_id).sort();
  // The full pre-incident baseline (3 fresh + 2 umbrella-covered) is
  // restored — Barcelona does NOT collapse merely because the umbrella
  // source's current state is unknown.
  assert.deepEqual(spainVenueIds, [FRESH_VENUE_1, FRESH_VENUE_2, FRESH_VENUE_3, UMBRELLA_VENUE_1, UMBRELLA_VENUE_2].sort());

  const umbrellaMarker1 = artifact.countries.Spain.markers.find((m) => m.venue_id === UMBRELLA_VENUE_1);
  assert.equal(umbrellaMarker1.display_listings[0].source_id, UMBRELLA_SOURCE);
  assert.equal(umbrellaMarker1.display_listings[0].source_record_id, "u1", "the RETAINED (previous, not this run's) listing content");

  const umbrellaSourceEntry = report.sources.find((s) => s.source_id === UMBRELLA_SOURCE);
  assert.equal(umbrellaSourceEntry.status, "FAILED");
  assert.equal(umbrellaSourceEntry.retained, true, "the health report must truthfully mark this source's data as retained");
  assert.ok(umbrellaSourceEntry.last_success_at, "last_success_at must be surfaced in the health report");

  // Unrelated sources are completely unaffected — this run's own fresh data, not retained.
  const freshMarker = artifact.countries.Spain.markers.find((m) => m.venue_id === FRESH_VENUE_1);
  assert.equal(freshMarker.display_listings[0].source_record_id, "f1");
});

test("grace expiry: an umbrella source still failing >24h after its last real success is NOT retained, and its venues correctly disappear", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await seedPreviousArtifact(root, { umbrellaLastSuccessAt: new Date(Date.now() - 25 * H).toISOString() }); // just beyond grace

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-grace-expired",
    acquireLisbonPorto: emptyPortugalAcquire,
    acquireBarcelona: barcelonaAcquireWithFailingUmbrella(),
  });

  assert.equal(report.overall_status, "DEGRADED");

  const artifact = JSON.parse(await readFile(resolvePublicationArtifactPath({ root }), "utf8"));
  const spainVenueIds = artifact.countries.Spain.markers.map((m) => m.venue_id).sort();
  // Grace has expired — the umbrella venues are honestly absent, never silently extended.
  assert.deepEqual(spainVenueIds, [FRESH_VENUE_1, FRESH_VENUE_2, FRESH_VENUE_3].sort());

  const umbrellaSourceEntry = report.sources.find((s) => s.source_id === UMBRELLA_SOURCE);
  assert.equal(umbrellaSourceEntry.status, "FAILED");
  assert.equal(umbrellaSourceEntry.retained, undefined, "beyond grace, retained must not be present/true");
  assert.ok(umbrellaSourceEntry.last_success_at, "the true last_success_at is still honestly reported, however long ago");
});

test("recovery: once the umbrella source succeeds again, fresh data immediately replaces any retained representation — no manual reset", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await seedPreviousArtifact(root, { umbrellaLastSuccessAt: new Date(Date.now() - 3 * H).toISOString() });

  // Run 1: still failing, within grace — retained.
  const first = await runUnattendedCycle({ root, runId: "run-1", acquireLisbonPorto: emptyPortugalAcquire, acquireBarcelona: barcelonaAcquireWithFailingUmbrella() });
  assert.equal(first.report.overall_status, "DEGRADED");
  const firstUmbrellaEntry = first.report.sources.find((s) => s.source_id === UMBRELLA_SOURCE);
  assert.equal(firstUmbrellaEntry.retained, true);

  // Run 2: the source recovers.
  const second = await runUnattendedCycle({ root, runId: "run-2", acquireLisbonPorto: emptyPortugalAcquire, acquireBarcelona: barcelonaAcquireWithRecoveredUmbrella() });
  assert.equal(second.report.overall_status, "HEALTHY", "every source succeeding again must report fully HEALTHY, not still degraded");

  const artifact = JSON.parse(await readFile(resolvePublicationArtifactPath({ root }), "utf8"));
  const umbrellaMarker1 = artifact.countries.Spain.markers.find((m) => m.venue_id === UMBRELLA_VENUE_1);
  assert.equal(umbrellaMarker1.display_listings[0].source_record_id, "u1-new", "the FRESH new listing, not the previously retained one");

  const umbrellaSourceEntry = second.report.sources.find((s) => s.source_id === UMBRELLA_SOURCE);
  assert.equal(umbrellaSourceEntry.status, "SUCCESS");
  assert.equal(umbrellaSourceEntry.retained, undefined, "a successful source is never marked retained");
});

test("multi-source venue: a fresh source and a failed-but-in-grace source covering the SAME venue merge without duplicating listings", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // Seed a previous artifact where FRESH_VENUE_1 was covered by BOTH
  // fresh-source-1 (still succeeding) and the umbrella source (about to fail).
  await seedPreviousArtifact(root, { umbrellaLastSuccessAt: new Date(Date.now() - 3 * H).toISOString() });
  const artifactPath = resolvePublicationArtifactPath({ root });
  const previous = JSON.parse(await readFile(artifactPath, "utf8"));
  const fresh1Marker = previous.countries.Spain.markers.find((m) => m.venue_id === FRESH_VENUE_1);
  fresh1Marker.display_listings.push(displayListing(UMBRELLA_SOURCE, "shared-old"));
  previous.counts.display_listing_count += 1; // keep the seeded fixture itself schema-valid (no independently-drifting totals)
  await writeFile(artifactPath, `${JSON.stringify(previous, null, 2)}\n`);

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-multi-source",
    acquireLisbonPorto: emptyPortugalAcquire,
    acquireBarcelona: barcelonaAcquireWithFailingUmbrella(),
  });

  assert.equal(report.overall_status, "DEGRADED");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  // Exactly ONE marker for this venue_id (no duplicate), carrying BOTH the
  // fresh listing from FRESH_SOURCE_1 AND the retained one from the umbrella source.
  assert.equal(artifact.countries.Spain.markers.filter((m) => m.venue_id === FRESH_VENUE_1).length, 1);
  const merged = artifact.countries.Spain.markers.find((m) => m.venue_id === FRESH_VENUE_1);
  const identities = merged.display_listings.map((l) => `${l.source_id}:${l.source_record_id}`).sort();
  assert.deepEqual(identities, [`${FRESH_SOURCE_1}:f1`, `${UMBRELLA_SOURCE}:shared-old`].sort());
});

test("successful-zero: a source that legitimately returns zero observations is authoritative, never backfilled from stale data", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // Umbrella source previously succeeded and had listings; this run it
  // succeeds again but genuinely finds nothing upcoming.
  await seedPreviousArtifact(root, { umbrellaLastSuccessAt: "2026-08-26T10:00:00.000Z" });

  const zeroEventAcquire = async () => ({
    barcelonaRegistry: { entries: [{ id: FRESH_SOURCE_1 }, { id: FRESH_SOURCE_2 }, { id: FRESH_SOURCE_3 }, { id: UMBRELLA_SOURCE }] },
    barcelonaResults: [
      { source_id: FRESH_SOURCE_1, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_1, "f1")], notes: [] },
      { source_id: FRESH_SOURCE_2, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_2, "f2")], notes: [] },
      { source_id: FRESH_SOURCE_3, success: true, raw_record_count: 1, observation_count: 1, observations: [freshObs(FRESH_SOURCE_3, "f3")], notes: [] },
      { source_id: UMBRELLA_SOURCE, success: true, raw_record_count: 0, observation_count: 0, observations: [], notes: ["genuinely no upcoming programme"] },
    ],
    barcelonaObservations: [freshObs(FRESH_SOURCE_1, "f1"), freshObs(FRESH_SOURCE_2, "f2"), freshObs(FRESH_SOURCE_3, "f3")],
  });

  const { report } = await runUnattendedCycle({ root, runId: "run-zero", acquireLisbonPorto: emptyPortugalAcquire, acquireBarcelona: zeroEventAcquire });

  assert.equal(report.overall_status, "HEALTHY", "a legitimate zero-event success must never be treated as a failure/degradation");
  const artifact = JSON.parse(await readFile(resolvePublicationArtifactPath({ root }), "utf8"));
  const spainVenueIds = artifact.countries.Spain.markers.map((m) => m.venue_id).sort();
  assert.deepEqual(spainVenueIds, [FRESH_VENUE_1, FRESH_VENUE_2, FRESH_VENUE_3].sort(), "the umbrella venues correctly disappear — zero is authoritative, never backfilled from the previous artifact");

  const umbrellaSourceEntry = report.sources.find((s) => s.source_id === UMBRELLA_SOURCE);
  assert.equal(umbrellaSourceEntry.status, "SUCCESS");
  assert.equal(umbrellaSourceEntry.retained, undefined);
});

test("a corrupt/invalid previous artifact is NEVER trusted as last-known-good — retention simply does not apply, the run still succeeds", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // Deliberately schema-invalid (missing required fields / malformed) — never a source of truth.
  await writeFile(resolvePublicationArtifactPath({ root }), JSON.stringify({ not: "a real publication artifact" }));

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-corrupt-previous",
    acquireLisbonPorto: emptyPortugalAcquire,
    acquireBarcelona: barcelonaAcquireWithFailingUmbrella(),
  });

  assert.equal(report.overall_status, "DEGRADED");
  const artifact = JSON.parse(await readFile(resolvePublicationArtifactPath({ root }), "utf8"));
  const spainVenueIds = artifact.countries.Spain.markers.map((m) => m.venue_id).sort();
  // No usable previous artifact — nothing could safely be retained, even
  // though the umbrella source failed. The run still safely publishes the
  // fresh data it does have.
  assert.deepEqual(spainVenueIds, [FRESH_VENUE_1, FRESH_VENUE_2, FRESH_VENUE_3].sort());

  const umbrellaSourceEntry = report.sources.find((s) => s.source_id === UMBRELLA_SOURCE);
  assert.equal(umbrellaSourceEntry.retained, undefined);
  assert.equal(umbrellaSourceEntry.last_success_at, null, "with no trustworthy previous record, last_success_at is honestly null, never guessed");
});

test("no previous artifact at all (first-ever run): retention is simply unavailable, the run still completes normally", async (t) => {
  const root = await makeTempRoot(); // no seedPreviousArtifact call at all
  t.after(() => rm(root, { recursive: true, force: true }));

  const { report } = await runUnattendedCycle({
    root,
    runId: "run-first-ever",
    acquireLisbonPorto: emptyPortugalAcquire,
    acquireBarcelona: barcelonaAcquireWithFailingUmbrella(),
  });

  assert.equal(report.overall_status, "DEGRADED");
  const artifact = JSON.parse(await readFile(resolvePublicationArtifactPath({ root }), "utf8"));
  assert.deepEqual(
    artifact.countries.Spain.markers.map((m) => m.venue_id).sort(),
    [FRESH_VENUE_1, FRESH_VENUE_2, FRESH_VENUE_3].sort(),
  );
});
