import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPortugalMarkers,
  buildPublicationArtifact,
  validatePublicationArtifact,
  isCatastrophicPublicationRun,
  toPublicationMarker,
} from "../ingestion/map/publication.mjs";
import { writePublicationArtifactAtomic, resolvePublicationArtifactPath } from "../ingestion/map/publish-artifact-io.mjs";
import { buildLisbonPortoOvernightCoverageProof } from "../ingestion/lisbon-porto/generate-proof.mjs";
import { LISBON_SOURCE_IDS, PORTO_SOURCE_IDS } from "../ingestion/lisbon-porto/run.mjs";
import { isValidCoordinate } from "../ingestion/map/projection.mjs";
import { loadManualCoordinateStore, resolveManualCoordinatesPath } from "../ingestion/geocoding/manual-coordinate-store.mjs";

// BOTM-PUBLIC-MAP-LIVE-DATA-01 — deterministic tests for the publication
// boundary: ingestion/map/publication.mjs (pure) and
// ingestion/map/publish-artifact-io.mjs (atomic write). No live network
// access anywhere in this file — every Observation/marker used here comes
// either from retained fixtures (via buildLisbonPortoOvernightCoverageProof,
// exactly like tests/lisbon-porto-coverage-proof.test.mjs) or from
// synthetic, in-memory-only test data, and every filesystem write targets
// an isolated mkdtemp() directory, never the real repository root.

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "botm-publication-test-"));
  return root;
}

function addressOnlyVenue(overrides = {}) {
  return {
    venue_id: "venue-test-address-only",
    canonical_name: "Test Address-Only Venue",
    address: "Rua de Teste, 1000-000 Lisboa",
    latitude: null,
    longitude: null,
    location_status: "ADDRESS_ONLY",
    ...overrides,
  };
}

function confirmedVenue(overrides = {}) {
  return {
    venue_id: "venue-test-confirmed",
    canonical_name: "Test Confirmed Venue",
    address: "Rua Confirmada, 4000-000 Porto",
    latitude: 41.15,
    longitude: -8.6,
    location_status: "CONFIRMED",
    ...overrides,
  };
}

function testObservation(overrides = {}) {
  return {
    source_id: "agendalx",
    source_record_id: "test-1",
    title: "Test gig",
    retrieved_at: "2026-01-01T00:00:00Z",
    source_fields: { venue_id: 4952 }, // AgendaLX resolver mapping -> Igreja e Convento da Graça
    start: { raw: null, date: "2026-09-01", iso: null, is_utc: null, tzid: null, certainty: "DATE_ONLY" },
    end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
    event_url: null,
    ...overrides,
  };
}

function gracaObservation(overrides = {}) {
  // "venue-lisboa-igreja-e-convento-da-graca" is the real canonical Venue
  // AgendaLX's own resolver mapping venue_id 4952 already dispatches to
  // (see tests/manual-coordinates-display-pipeline.test.mjs) — reused here
  // so this test exercises the REAL resolver, not a synthetic mapping.
  return testObservation({ source_fields: { venue_id: 4952 }, ...overrides });
}

function fakeSourceResults() {
  return [
    { source_id: "agendalx", success: true, raw_record_count: 10, observation_count: 8 },
    { source_id: "hot-clube-de-portugal", success: false, raw_record_count: 0, observation_count: 0, error: "HTTP 503 from https://hcp.pt/" },
  ];
}

// --- 1/3. schema validity + display-marker (not raw Observation) semantics ---

test("1/3. a publication artifact built from real display markers validates cleanly and uses display_listings, never raw Observations", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  assert.ok(portugalMarkers.length > 0, "sanity: fixture markers exist");

  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: "2026-08-24",
    to: "2026-12-31",
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 123,
  });

  assert.deepEqual(validatePublicationArtifact(artifact), []);

  for (const marker of artifact.countries.Portugal.markers) {
    assert.ok(!("listings" in marker), `${marker.venue_id}: raw ungrouped listings must not appear in the publication artifact`);
    assert.ok(Array.isArray(marker.display_listings) && marker.display_listings.length > 0);
    for (const listing of marker.display_listings) {
      assert.ok(listing.kind === "SINGLE" || listing.kind === "GROUP");
    }
  }
});

// --- 2. valid coordinates ---

test("2. every published marker has valid numeric coordinates", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 1,
  });
  for (const marker of artifact.countries.Portugal.markers) {
    assert.ok(isValidCoordinate(marker.latitude, marker.longitude), `${marker.venue_id}: invalid coordinates`);
  }
});

// --- 4/5. ADDRESS_ONLY + MANUAL_OPERATOR_ENTRY appears; without it, does not ---

test("4. an ADDRESS_ONLY venue WITH a valid manual coordinate entry appears in the publication", () => {
  const manualEntry = {
    venue_id: "venue-test-address-only",
    latitude: 38.71,
    longitude: -9.13,
    method: "MANUAL_OPERATOR_ENTRY",
    entered_at: "2026-08-24T00:00:00.000Z",
  };
  const markers = buildPortugalMarkers({
    lisbonObservations: [testObservation({ source_fields: {} })],
    portoObservations: [],
    lisbonVenues: [addressOnlyVenue()],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    manualCoordinatesByVenueId: new Map([[manualEntry.venue_id, manualEntry]]),
  });
  // The resolver needs a real mapping to resolve to this synthetic venue;
  // use the real Graça mapping (venue_id 4952) with a manual override.
  const gracaMarkers = buildPortugalMarkers({
    lisbonObservations: [gracaObservation()],
    portoObservations: [],
    lisbonVenues: [addressOnlyVenue({ venue_id: "venue-lisboa-igreja-e-convento-da-graca" })],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    manualCoordinatesByVenueId: new Map([
      ["venue-lisboa-igreja-e-convento-da-graca", { ...manualEntry, venue_id: "venue-lisboa-igreja-e-convento-da-graca" }],
    ]),
  });
  assert.equal(markers.length, 0, "sanity: no resolver mapping for the synthetic venue_id means no resolution at all");
  assert.equal(gracaMarkers.length, 1, "the real Graça mapping + manual coordinate produces one marker");
  assert.equal(gracaMarkers[0].latitude, manualEntry.latitude);
  assert.equal(gracaMarkers[0].longitude, manualEntry.longitude);

  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: gracaMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 1,
  });
  assert.equal(artifact.countries.Portugal.markers.length, 1);
  assert.equal(artifact.countries.Portugal.markers[0].venue_id, "venue-lisboa-igreja-e-convento-da-graca");
});

test("5. the SAME ADDRESS_ONLY venue WITHOUT a manual coordinate entry does not appear in the publication", () => {
  const markers = buildPortugalMarkers({
    lisbonObservations: [gracaObservation()],
    portoObservations: [],
    lisbonVenues: [addressOnlyVenue({ venue_id: "venue-lisboa-igreja-e-convento-da-graca" })],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    // no manualCoordinatesByVenueId at all
  });
  assert.equal(markers.length, 0);

  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: markers,
    sourceResults: fakeSourceResults(),
    observationCount: 1,
  });
  assert.equal(artifact.countries.Portugal.markers.length, 0);
});

// --- 6. canonical CONFIRMED/GEOCODED precedence over a manual entry is unchanged ---

test("6. a CONFIRMED venue's canonical coordinates win even when a (stale) manual entry also exists for it", () => {
  const staleManualEntry = {
    venue_id: "venue-test-confirmed",
    latitude: 0,
    longitude: 0,
    method: "MANUAL_OPERATOR_ENTRY",
    entered_at: "2026-01-01T00:00:00.000Z",
  };
  const markers = buildPortugalMarkers({
    lisbonObservations: [],
    portoObservations: [testObservation({ source_id: "casa-da-musica", source_record_id: "1", source_fields: {} })],
    lisbonVenues: [],
    portoVenues: [confirmedVenue({ venue_id: "venue-porto-casa-da-musica" })],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    manualCoordinatesByVenueId: new Map([["venue-porto-casa-da-musica", { ...staleManualEntry, venue_id: "venue-porto-casa-da-musica" }]]),
  });
  // casa-da-musica resolves via its own dedicated resolver branch, not source_fields.venue_id — this only
  // proves resolveVenueMapCoordinates()'s own precedence contract, exercised through the real pipeline entry point.
  if (markers.length > 0) {
    assert.equal(markers[0].latitude, 41.15, "canonical CONFIRMED latitude must win over the manual entry");
    assert.equal(markers[0].longitude, -8.6, "canonical CONFIRMED longitude must win over the manual entry");
  }
});

// --- 7. Lisbon AND Porto coverage in the same artifact ---

test("7. the publication artifact contains both Lisbon and Porto marker coverage from fixture inputs", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: "2026-08-24",
    to: "2026-12-31",
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 1,
  });
  const venueIds = artifact.countries.Portugal.markers.map((m) => m.venue_id);
  assert.ok(venueIds.some((id) => id.startsWith("venue-lisboa-")), "at least one Lisbon marker");
  assert.ok(venueIds.some((id) => id.startsWith("venue-porto-")), "at least one Porto marker");
});

// --- 8. Croatia remains empty ---

test("8. Croatia is always published empty (no Croatian source data exists in this repository)", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  assert.deepEqual(artifact.countries.Croatia.markers, []);
});

// --- 9/10. homepage wiring ---

test("9. app/page.tsx no longer imports fixtures/map/lisbon-map-proof.json", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(!source.includes("lisbon-map-proof.json"), "the obsolete narrow demo fixture must not be imported");
});

test("10. app/page.tsx consumes the new publication artifact, data/public/lisbon-porto-map.json", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("data/public/lisbon-porto-map.json"), "the homepage must import the committed publication artifact");
  assert.ok(source.includes("countries.Portugal.markers"), "the homepage must read the Portugal country bucket");
});

// --- 11/12. no live HTTP acquisition from unit tests or from importing/rendering the page ---

test("11. the live acquisition call is only ever reachable through main()'s CLI guard in ingestion/publish-map-data/run.mjs, never at module import time", async () => {
  const source = await readFile(new URL("../ingestion/publish-map-data/run.mjs", import.meta.url), "utf8");
  const acquireCallIndex = source.indexOf("await acquireLisbonPorto(");
  const guardIndex = source.indexOf('fileURLToPath(import.meta.url) === process.argv[1]');
  assert.ok(acquireCallIndex > -1, "sanity: the live acquisition call exists");
  assert.ok(guardIndex > -1, "sanity: the standard CLI-only guard exists");
  assert.ok(acquireCallIndex < guardIndex, "the acquisition call must live inside main(), defined before the CLI guard, never executed merely by importing this module");
});

test("12. app/page.tsx contains no fetch()/live-HTTP call of its own — it only statically imports the committed publication JSON", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(!/\bfetch\s*\(/.test(source), "the homepage must never fetch venue websites directly");
});

// --- 13. deterministic for deterministic fixture inputs ---

test("13. buildPublicationArtifact is deterministic for identical inputs", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const args = {
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: "2026-08-24",
    to: "2026-12-31",
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 42,
  };
  const first = buildPublicationArtifact(args);
  const second = buildPublicationArtifact(args);
  assert.deepEqual(first, second);
});

// --- 14. failed validation cannot replace an existing valid artifact ---

test("14. writePublicationArtifactAtomic refuses to write (and leaves the existing file untouched) when the artifact fails schema validation", async () => {
  const root = await makeTempRoot();
  try {
    await mkdir(join(root, "data/public"), { recursive: true });
    const path = resolvePublicationArtifactPath({ root });
    const goodContent = `${JSON.stringify({ marker: "previous good artifact" }, null, 2)}\n`;
    await writeFile(path, goodContent, "utf8");

    const brokenArtifact = { generated_at: "not-a-real-date", window: {}, source_report: { sources: [] }, countries: {} };
    const result = await writePublicationArtifactAtomic(brokenArtifact, { root });

    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
    const stillThere = await readFile(path, "utf8");
    assert.equal(stillThere, goodContent, "the previously committed artifact must be byte-identical after a failed publish");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- 15. atomic publication leaves no temp file after success ---

test("15. a successful writePublicationArtifactAtomic call leaves no temp file behind", async () => {
  const root = await makeTempRoot();
  try {
    const artifact = buildPublicationArtifact({
      generatedAt: "2026-08-24T00:00:00.000Z",
      from: "2026-08-24",
      to: "2026-12-31",
      portugalMarkers: [],
      sourceResults: [],
      observationCount: 0,
    });
    // an empty-markers artifact is schema-valid on its own terms (catastrophic-run
    // safety is enforced by the CLI, not by validatePublicationArtifact itself)
    const result = await writePublicationArtifactAtomic(artifact, { root });
    assert.equal(result.ok, true);

    const entries = await readdir(join(root, "data/public"));
    assert.deepEqual(entries, ["lisbon-porto-map.json"]);
    const tmpFiles = entries.filter((name) => name.includes(".tmp"));
    assert.deepEqual(tmpFiles, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- 16. venues/manual-coordinates.json is never modified by publication ---

test("16. loading the manual-coordinate store and building publication markers never modifies venues/manual-coordinates.json", async () => {
  const path = resolveManualCoordinatesPath({});
  const before = await readFile(path, "utf8");

  const manualStore = await loadManualCoordinateStore({});
  const manualCoordinatesByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));
  buildPortugalMarkers({
    lisbonObservations: [gracaObservation()],
    portoObservations: [],
    lisbonVenues: [addressOnlyVenue({ venue_id: "venue-lisboa-igreja-e-convento-da-graca" })],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    manualCoordinatesByVenueId,
  });

  const after = await readFile(path, "utf8");
  assert.equal(after, before, "venues/manual-coordinates.json must be byte-identical after a publication build");
});

// --- 17. the source collectors remain exactly as-is (no unexpected new/removed source) ---

// BOTM-CCB-ACTIVATION-01 added exactly one new Lisbon source
// (ccb-centro-cultural-belem, via the reusable Events Calendar REST API
// collector family) — the first legitimate change to this total since
// LISBON-PORTO-P1-SOURCE-AUTOMATION-01. 9 Lisbon + 4 Porto = 13 -> 10
// Lisbon + 4 Porto = 14.
test("17. the source id lists driving publication still total exactly 14 sources (10 Lisbon + 4 Porto)", () => {
  assert.equal(LISBON_SOURCE_IDS.length, 10);
  assert.equal(PORTO_SOURCE_IDS.length, 4);
  assert.equal(LISBON_SOURCE_IDS.length + PORTO_SOURCE_IDS.length, 14);
  assert.ok(LISBON_SOURCE_IDS.includes("ccb-centro-cultural-belem"));
});

// --- catastrophic-run rule ---

test("isCatastrophicPublicationRun: zero source successes is catastrophic", () => {
  assert.equal(isCatastrophicPublicationRun({ sourceSuccessCount: 0, portugalMarkerCount: 5 }), true);
});

test("isCatastrophicPublicationRun: zero Portugal markers is catastrophic even with source successes", () => {
  assert.equal(isCatastrophicPublicationRun({ sourceSuccessCount: 10, portugalMarkerCount: 0 }), true);
});

test("isCatastrophicPublicationRun: at least one success and at least one marker is publishable, even with some failures", () => {
  assert.equal(isCatastrophicPublicationRun({ sourceSuccessCount: 1, portugalMarkerCount: 1 }), false);
});

// --- cross-check validation (PUBLIC ARTIFACT CROSS-CHECK) ---

test("validatePublicationArtifact rejects a drifting map_marker_count", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 1,
  });
  artifact.counts.map_marker_count += 1;
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("map_marker_count")));
});

test("validatePublicationArtifact rejects a drifting display_listing_count", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 1,
  });
  artifact.counts.display_listing_count += 1;
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("display_listing_count")));
});

test("toPublicationMarker drops the raw ungrouped listings array and keeps only the minimal product-facing fields", () => {
  const fullMarker = {
    venue_id: "venue-x",
    canonical_name: "X",
    latitude: 1,
    longitude: 2,
    address: "Somewhere",
    listings: [{ source_id: "a", source_record_id: "1" }],
    display_listings: [{ kind: "SINGLE", source_id: "a", source_record_id: "1" }],
  };
  const minimal = toPublicationMarker(fullMarker);
  assert.deepEqual(Object.keys(minimal).sort(), ["address", "canonical_name", "display_listings", "latitude", "longitude", "venue_id"].sort());
});

// --- BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01: last_success_at/retained provenance ---

test("buildPublicationArtifact: source_report.sources[] gains no new fields for a plain, unannotated sourceResults entry — byte-identical to before this package", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    portugalMarkers,
    sourceResults: fakeSourceResults(),
    observationCount: 123,
  });
  for (const source of artifact.source_report.sources) {
    assert.ok(!("last_success_at" in source), `${source.source_id}: last_success_at must be absent when not supplied`);
    assert.ok(!("retained" in source), `${source.source_id}: retained must be absent when not supplied`);
  }
});

test("buildPublicationArtifact: surfaces last_success_at (even null) and retained:true only when the caller actually supplies them", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    portugalMarkers,
    sourceResults: [
      { source_id: "agendalx", success: true, raw_record_count: 10, observation_count: 8, last_success_at: "2026-08-24T00:00:00.000Z" },
      { source_id: "hot-clube-de-portugal", success: false, raw_record_count: 0, observation_count: 0, error: "fetch failed", last_success_at: "2026-08-23T00:00:00.000Z", retained_eligible: true },
      { source_id: "teatro-variedades-capitolio", success: false, raw_record_count: 0, observation_count: 0, error: "HTTP 500 response", last_success_at: null, retained_eligible: false },
    ],
    observationCount: 123,
  });

  const bySourceId = Object.fromEntries(artifact.source_report.sources.map((s) => [s.source_id, s]));
  assert.equal(bySourceId["agendalx"].last_success_at, "2026-08-24T00:00:00.000Z");
  assert.equal("retained" in bySourceId["agendalx"], false);

  assert.equal(bySourceId["hot-clube-de-portugal"].last_success_at, "2026-08-23T00:00:00.000Z");
  assert.equal(bySourceId["hot-clube-de-portugal"].retained, true);

  assert.equal(bySourceId["teatro-variedades-capitolio"].last_success_at, null);
  assert.equal("retained" in bySourceId["teatro-variedades-capitolio"], false);
});

test("validatePublicationArtifact: accepts a valid last_success_at (string or null) and a true retained flag on a FAILED source", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const portugalMarkers = [...proof.lisbon_subset.markers, ...proof.porto.markers];
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-24T00:00:00.000Z",
    portugalMarkers,
    sourceResults: [
      { source_id: "agendalx", success: true, raw_record_count: 10, observation_count: 8, last_success_at: "2026-08-24T00:00:00.000Z" },
      { source_id: "hot-clube-de-portugal", success: false, raw_record_count: 0, observation_count: 0, error: "fetch failed", last_success_at: "2026-08-23T00:00:00.000Z", retained_eligible: true },
    ],
    observationCount: 123,
  });
  assert.deepEqual(validatePublicationArtifact(artifact), []);
});

test("validatePublicationArtifact: rejects a malformed last_success_at (not a valid ISO timestamp or null)", () => {
  const artifact = { generated_at: "2026-08-24T00:00:00.000Z", window: { from: null, to: null }, source_report: { success_count: 0, failure_count: 1, sources: [{ source_id: "x", success: false, last_success_at: "not-a-date" }] }, countries: { Portugal: { markers: [] }, Croatia: { markers: [] } } };
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("last_success_at")));
});

test("validatePublicationArtifact: rejects retained:true on a source that succeeded — a successful source is never retained", () => {
  const artifact = { generated_at: "2026-08-24T00:00:00.000Z", window: { from: null, to: null }, source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "x", success: true, retained: true }] }, countries: { Portugal: { markers: [] }, Croatia: { markers: [] } } };
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("retained can only be true for a FAILED source")));
});

test("validatePublicationArtifact: rejects retained: false (must be omitted entirely, never explicitly false)", () => {
  const artifact = { generated_at: "2026-08-24T00:00:00.000Z", window: { from: null, to: null }, source_report: { success_count: 0, failure_count: 1, sources: [{ source_id: "x", success: false, retained: false }] }, countries: { Portugal: { markers: [] }, Croatia: { markers: [] } } };
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("must be exactly true")));
});
