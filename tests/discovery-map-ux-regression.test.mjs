import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validatePublicationArtifact } from "../ingestion/map/publication.mjs";
import { buildVenueFeatureCollection, sumGigCounts } from "../ingestion/map/cluster-geojson.mjs";

// BOTM-MAP-DISCOVERY-UX-01 — this package is MAP UX ONLY. These tests
// prove the committed publication artifact (data/public/lisbon-porto-map.json)
// still carries the exact baseline the task brief expects (266 display
// listings / 12 venue markers), and that a UX-only change cannot make it
// invalid or make the underlying dataset appear to shrink just because
// the clustered view renders fewer visual objects at wide zoom.

const PUBLICATION_PATH = new URL("../data/public/lisbon-porto-map.json", import.meta.url);

async function loadPublication() {
  return JSON.parse(await readFile(PUBLICATION_PATH, "utf8"));
}

test("the committed publication artifact is still valid per its own schema/cross-check rules", async () => {
  const artifact = await loadPublication();
  const errors = validatePublicationArtifact(artifact);
  assert.deepEqual(errors, []);
});

test("baseline preserved: 266 display listings", async () => {
  const artifact = await loadPublication();
  assert.equal(artifact.counts.display_listing_count, 266);
});

test("baseline preserved: 12 venue markers", async () => {
  const artifact = await loadPublication();
  assert.equal(artifact.counts.map_marker_count, 12);
  const portugalMarkers = artifact.countries.Portugal.markers;
  assert.equal(portugalMarkers.length, 12);
});

test("all 12 underlying venue markers are recoverable/separable — the clustering UI never drops data, only visually combines it at wide zoom", async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  const fc = buildVenueFeatureCollection(portugalMarkers);
  // Every committed marker has a real (CONFIRMED) coordinate, so every
  // one of them becomes exactly one clusterable/unclusterable GeoJSON
  // point feature — none silently dropped by the new clustering layer.
  assert.equal(fc.features.length, 12);
  const venueIds = new Set(fc.features.map((f) => f.properties.venue_id));
  assert.equal(venueIds.size, 12);
});

test("cluster aggregate gig count across the full live dataset sums to the same 266 total the venue panel/publication artifact already reports", async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  assert.equal(sumGigCounts(portugalMarkers), artifact.counts.display_listing_count);
});

test("Croatia country bucket is still an untouched empty marker list (this package never alters source acquisition or coverage)", async () => {
  const artifact = await loadPublication();
  assert.deepEqual(artifact.countries.Croatia.markers, []);
});
