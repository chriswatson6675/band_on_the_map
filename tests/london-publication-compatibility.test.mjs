// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — proves
// London's real live-run markers (retained proof, no live network here)
// flow cleanly into the existing buildPublicationArtifact()/
// validatePublicationArtifact()/isCatastrophicPublicationRun() boundary
// alongside Portugal/Spain/Germany/France, with zero schema changes.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPublicationArtifact, validatePublicationArtifact, isCatastrophicPublicationRun } from "../ingestion/map/publication.mjs";

async function loadLondonProof() {
  return JSON.parse(
    await readFile(
      new URL(
        "../fixtures/map/beatmapped-london-first-tranche-main-rebase-and-music-gate-01-live-run-proof.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

test("the real London live-run proof's markers already carry the exact toPublicationMarker() shape and validate cleanly as the sole populated country", async () => {
  const proof = await loadLondonProof();
  const markers = proof.london.markers;
  assert.ok(markers.length > 0, "the retained proof must carry real markers");

  const artifact = buildPublicationArtifact({
    generatedAt: "2026-09-01T12:00:00Z",
    from: null,
    to: null,
    portugalMarkers: [],
    unitedKingdomMarkers: markers,
    sourceResults: proof.london.source_results,
    observationCount: proof.london.observation_total,
  });

  assert.deepEqual(validatePublicationArtifact(artifact), []);
  assert.equal(artifact.countries.UnitedKingdom.markers.length, markers.length);
  assert.equal(artifact.counts.map_marker_count, markers.length);
  assert.equal(artifact.counts.display_listing_count, proof.london.display_listing_count);

  // Every other country bucket stays present and empty — no regression to
  // Portugal/Spain/Germany/France just because London is now populated.
  for (const country of ["Portugal", "Croatia", "Spain", "Germany", "France"]) {
    assert.deepEqual(artifact.countries[country].markers, []);
  }
});

test("a London-only publication run is never treated as catastrophic when at least one source succeeded and at least one marker resulted", async () => {
  const proof = await loadLondonProof();
  const successCount = proof.london.source_results.filter((r) => r.success).length;
  assert.ok(successCount > 0);

  const catastrophic = isCatastrophicPublicationRun({
    sourceSuccessCount: successCount,
    portugalMarkerCount: 0,
    unitedKingdomMarkerCount: proof.london.markers.length,
  });
  assert.equal(catastrophic, false);
});

test("a run with zero London markers (all sources genuinely producing nothing) IS still caught as catastrophic when Portugal is also empty — the rule is never weakened for London specifically", () => {
  const catastrophic = isCatastrophicPublicationRun({
    sourceSuccessCount: 3,
    portugalMarkerCount: 0,
    unitedKingdomMarkerCount: 0,
  });
  assert.equal(catastrophic, true);
});

// Every London first-tranche display listing retains its own real,
// first-party event_url — the MUSIC GATE's own exclusions never silently
// drop a URL either; a kept listing always carries one.
test("every London display listing surviving into the publication artifact retains its own real event_url", async () => {
  const proof = await loadLondonProof();
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-09-01T12:00:00Z",
    from: null,
    to: null,
    portugalMarkers: [],
    unitedKingdomMarkers: proof.london.markers,
    sourceResults: proof.london.source_results,
    observationCount: proof.london.observation_total,
  });

  let withUrl = 0;
  let total = 0;
  for (const marker of artifact.countries.UnitedKingdom.markers) {
    for (const listing of marker.display_listings) {
      total += 1;
      if (listing.kind === "SINGLE" && listing.event_url) withUrl += 1;
    }
  }
  assert.ok(total > 0);
  assert.equal(withUrl, total, "every London listing in this first tranche should carry its own event_url");
});
