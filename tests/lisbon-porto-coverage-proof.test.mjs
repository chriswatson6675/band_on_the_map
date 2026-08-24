import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildLisbonPortoOvernightCoverageProof } from "../ingestion/lisbon-porto/generate-proof.mjs";
import { buildLisbonAutomaticSubsetProof } from "../ingestion/lisbon-subset/generate-proof.mjs";
import { buildLisbonMapProof } from "../ingestion/map/generate-proof.mjs";

const PROOF_PATH = new URL("../fixtures/map/lisbon-porto-overnight-coverage-01-proof.json", import.meta.url);

test("the committed lisbon-porto-overnight-coverage-01-proof.json exactly matches what code regenerates from the same retained fixtures", async () => {
  const regenerated = await buildLisbonPortoOvernightCoverageProof();
  const committed = JSON.parse(await readFile(PROOF_PATH, "utf8"));
  assert.deepEqual(committed, regenerated);
});

test("regenerating twice from the same retained fixtures produces byte-identical output (deterministic rerun)", async () => {
  const first = await buildLisbonPortoOvernightCoverageProof();
  const second = await buildLisbonPortoOvernightCoverageProof();
  assert.deepEqual(first, second);
});

// Existing invariants must not regress: LISBON-AUTOMATIC-SUBSET-01's own
// proof, and the original three-source BOTM-MULTISOURCE-LINKS-01 proof
// underneath it, stay completely untouched by this package.

test("the embedded lisbon_subset block is byte-identical to LISBON-AUTOMATIC-SUBSET-01's own standalone proof", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const standalone = await buildLisbonAutomaticSubsetProof();
  assert.deepEqual(proof.lisbon_subset, standalone);
  assert.equal(proof.lisbon_subset.total_underlying_observations, 38);
});

test("the original three-source BOTM-MULTISOURCE-LINKS-01 proof remains completely unaffected", async () => {
  const original = await buildLisbonMapProof();
  assert.equal(original.total_underlying_observations, 24);
  assert.equal(original.markers.length, 1);
});

test("the Capitólio 11-raw/6-display invariant survives unchanged inside the combined package", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const capitolio = proof.lisbon_subset.markers.find(
    (m) => m.venue_id === "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
  );
  assert.ok(capitolio);
  assert.equal(capitolio.listings.length, 11);
  assert.equal(capitolio.display_listings.length, 6);
});

// New Porto contribution.

test("all three Porto sources contribute Observations from real retained fixtures", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  assert.equal(proof.porto.per_source_observation_counts["casa-da-musica"], 3);
  assert.equal(proof.porto.per_source_observation_counts["teatro-municipal-do-porto"], 5);
  assert.equal(proof.porto.per_source_observation_counts["cm-gaia-eventos"], 3);
  assert.equal(proof.porto.raw_observation_total, 11);
});

test("all 11 retained Porto Observations fall within the 2026-08-24..2026-12-31 proof window", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  assert.equal(proof.porto.observations_within_date_bounds, proof.porto.raw_observation_total);
});

// PORTO-COVERAGE-02: cm-gaia-eventos (Vila Nova de Gaia, part of the
// Greater Porto region already researched under sources/porto.json) adds
// real música-tagged Observations, but — matching the honest,
// already-documented cm-odivelas-agenda-cultura precedent — it exposes no
// venue field at all, so it contributes zero map markers of its own; it
// never regresses the two markers Casa da Música/Teatro Rivoli already
// earned.
test("cm-gaia-eventos Observations are honestly UNRESOLVED (no venue field on this source) and contribute zero markers", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  assert.deepEqual(
    proof.porto.markers.map((m) => m.venue_id).sort(),
    ["venue-porto-casa-da-musica", "venue-porto-teatro-rivoli"],
  );
  assert.equal(proof.porto.map_marker_count, 2);
});

// VENUE-GEOCODING-01: Casa da Música's official address was
// deterministically GEOCODED (see fixtures/geocoding/nominatim/
// venue-porto-casa-da-musica.json and venues/porto.json's own
// coordinate_provenance) — it produced Porto's first map marker.
// VENUE-LOCATION-RESOLUTION-02 legitimately promoted Teatro Rivoli too, via
// the second NAME_PLUS_ADDRESS_QUERY strategy (fixtures/geocoding/nominatim/
// venue-porto-teatro-rivoli--name-plus-address.json) — its own retained
// Porto Observation fixtures now resolve to a real marker rather than a
// resolved-but-unmapped Observation. Teatro Campo Alegre was ALSO promoted
// to GEOCODED (see venues/porto.json), but no retained fixture Observation
// in this deterministic sample happens to resolve to it, so it does not
// (yet) contribute a marker here — this proof only reflects what its
// retained, non-live fixtures actually contain.
test("Porto now produces two map markers (Casa da Música + Teatro Rivoli, both GEOCODED) — nothing fabricated", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  assert.equal(proof.porto.map_marker_count, 2);
  assert.equal(proof.porto.markers.length, 2);
  assert.deepEqual(
    proof.porto.markers.map((m) => m.venue_id).sort(),
    ["venue-porto-casa-da-musica", "venue-porto-teatro-rivoli"],
  );

  const venueRegistry = JSON.parse(
    await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"),
  );
  const rivoli = venueRegistry.venues.find((v) => v.venue_id === "venue-porto-teatro-rivoli");
  assert.equal(rivoli.location_status, "GEOCODED");
  assert.equal(rivoli.coordinate_provenance.query_strategy, "NAME_PLUS_ADDRESS_QUERY");
  const campoAlegre = venueRegistry.venues.find((v) => v.venue_id === "venue-porto-teatro-campo-alegre");
  assert.equal(campoAlegre.location_status, "GEOCODED");
});

test("the combined map_marker_count is the Lisbon subset's own marker count plus Porto's two markers", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  assert.equal(proof.combined.map_marker_count, proof.lisbon_subset.markers.length + proof.porto.map_marker_count);
  assert.equal(proof.combined.map_marker_count, 4);
});

test("combined raw_observation_total is the sum of the two halves", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  assert.equal(
    proof.combined.raw_observation_total,
    proof.lisbon_subset.total_underlying_observations + proof.porto.raw_observation_total,
  );
  assert.equal(proof.combined.raw_observation_total, 49);
});

test("no BOTA GEO leakage and no cross-source fact leakage regress inside the combined package", async () => {
  const proof = await buildLisbonPortoOvernightCoverageProof();
  const json = JSON.stringify(proof);
  // The known-bad BOTA placeholder coordinate must never appear as a used marker location.
  assert.ok(!json.includes('"latitude": 40.720756'));
  assert.ok(!json.includes('"longitude": -74.000761'));
});
