import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validatePublicationArtifact } from "../ingestion/map/publication.mjs";
import { buildVenueFeatureCollection, sumGigCounts } from "../ingestion/map/cluster-geojson.mjs";

// BOTM-MAP-DISCOVERY-UX-01 — this package is MAP UX ONLY. These tests
// prove the committed publication artifact (data/public/lisbon-porto-map.json)
// still carries a legitimate baseline (see below), and that a UX-only
// change cannot make it invalid or make the underlying dataset appear to
// shrink just because the clustered view renders fewer visual objects at
// wide zoom.
//
// BOTM-CCB-MANUAL-COORDINATE-01 legitimately moved this baseline from 266
// display listings / 12 venue markers to 315 / 13: CCB's canonical venue
// (previously ADDRESS_ONLY, contributing zero display records) received
// an operator-entered MANUAL_OPERATOR_ENTRY coordinate
// (venues/manual-coordinates.json), making it map-eligible for the first
// time — a genuine, intentional dataset change, not a regression this
// guard should mask. Marker/listing coordinates are not otherwise
// hardcoded here — CCB's own real-time record count fluctuates slightly
// run to run (a live API), so this file asserts the exact counts of
// whatever is currently committed, not a number independently guessed at.
//
// BOTM-UNATTENDED-COLLECTION-RUNNER-01's bounded live proof run
// (`npm run unattended`, a genuine live re-acquisition through the new
// canonical unattended command, not a hand edit) legitimately regenerated
// the committed artifact again: display listings moved 315 -> 361 (more
// real, currently-live events across the same 14 sources at the moment
// that proof ran); the marker count stayed exactly 13 (no venue gained or
// lost map eligibility).

const PUBLICATION_PATH = new URL("../data/public/lisbon-porto-map.json", import.meta.url);

async function loadPublication() {
  return JSON.parse(await readFile(PUBLICATION_PATH, "utf8"));
}

test("the committed publication artifact is still valid per its own schema/cross-check rules", async () => {
  const artifact = await loadPublication();
  const errors = validatePublicationArtifact(artifact);
  assert.deepEqual(errors, []);
});

test("baseline preserved: 361 display listings (was 266 before CCB's manual coordinate made it map-eligible; 315 before the unattended runner's live proof re-acquired current data)", async () => {
  const artifact = await loadPublication();
  assert.equal(artifact.counts.display_listing_count, 361);
});

test("baseline preserved: 13 venue markers (was 12 before CCB's manual coordinate made it map-eligible)", async () => {
  const artifact = await loadPublication();
  assert.equal(artifact.counts.map_marker_count, 13);
  const portugalMarkers = artifact.countries.Portugal.markers;
  assert.equal(portugalMarkers.length, 13);
});

test("all 13 underlying venue markers are recoverable/separable — the clustering UI never drops data, only visually combines it at wide zoom", async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  const fc = buildVenueFeatureCollection(portugalMarkers);
  // Every committed marker has a real (CONFIRMED/GEOCODED canonical, or
  // ADDRESS_ONLY + MANUAL_OPERATOR_ENTRY) coordinate, so every one of
  // them becomes exactly one clusterable/unclusterable GeoJSON point
  // feature — none silently dropped by the clustering layer.
  assert.equal(fc.features.length, 13);
  const venueIds = new Set(fc.features.map((f) => f.properties.venue_id));
  assert.equal(venueIds.size, 13);
});

test("CCB's marker uses exactly the operator-supplied coordinate pair, not a rounded/geocoded substitute", async () => {
  const artifact = await loadPublication();
  const ccb = artifact.countries.Portugal.markers.find((m) => m.venue_id === "venue-lisboa-centro-cultural-de-belem-ccb");
  assert.ok(ccb, "expected a CCB marker to be present");
  assert.equal(ccb.latitude, 38.695679);
  assert.equal(ccb.longitude, -9.2073); // -9.20730 and -9.2073 are the identical IEEE754 value
});

test("cluster aggregate gig count across the full live dataset sums to the same total the venue panel/publication artifact already reports", async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  assert.equal(sumGigCounts(portugalMarkers), artifact.counts.display_listing_count);
});

test("Croatia country bucket is still an untouched empty marker list (this package never alters source acquisition or coverage)", async () => {
  const artifact = await loadPublication();
  assert.deepEqual(artifact.countries.Croatia.markers, []);
});
