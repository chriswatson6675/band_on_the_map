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
//
// BARCELONA-30-VENUE-POPULATION-01's `npm run publish:map-data` legitimately
// regenerated the committed artifact again: it now ALSO acquires Barcelona
// (`acquireBarcelona()`, 15 new sources) and publishes a new
// `countries.Spain` bucket alongside the unchanged Portugal/Croatia ones —
// see `ingestion/map/publication.mjs`'s `buildSpainMarkers()`. Portugal's
// own live counts moved independently too (361 -> 433 display listings,
// the same "real sources fluctuate run to run" behaviour documented above,
// unrelated to Barcelona) — the marker count stayed 13 (no Portugal venue
// gained/lost eligibility). `artifact.counts.*` are now GLOBAL totals
// across every published country (never Portugal-only), by design — see
// that function's own doc comment.
//
// BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01 regenerated the committed
// artifact once more (2026-08-26T11:36:04.660Z) to prove the frontend's
// new Spain wiring against real, current data rather than the stale
// 14-marker Phase 1 snapshot: Spain grew 14 -> 31 (the -02 population
// package's 16 additional venues, +KU Barcelona becoming map-eligible via
// its own operator coordinate — see docs/BARCELONA_VENUE_POPULATION.md
// and docs/BAND-ON-THE-MAP-BARCELONA-30-VENUE-POPULATION-02, not anything
// this frontend-integration package acquired itself; no new source was
// added here). Portugal moved 13 -> 12 in THIS SPECIFIC run only because
// `ccb-centro-cultural-belem`'s own live endpoint
// (www.ccb.pt/wp-json/tribe/events/v1/events/) returned a transport abort
// on three consecutive live attempts during this verification window — a
// pre-existing, external, unrelated-to-Barcelona source outage (CCB's own
// site), not a regression: no code touched by this package can affect
// Portugal source acquisition at all (see app/page.tsx and
// components/DiscoveryMap.tsx's diffs — additive Spain-only changes).
// This baseline will legitimately move back to 13 the next time CCB's own
// site answers a live run — exactly the same "assert whatever is
// currently committed, not a number independently guessed at" rule this
// file has followed since BOTM-CCB-MANUAL-COORDINATE-01.
//
// BEATMAPPED-BARCELONA-PR-REVIEW-AND-INTEGRATE-01 regenerated the
// artifact once more (2026-08-26T12:26:28.325Z), immediately before PR
// review/merge, specifically to recheck CCB: this run's `npm run
// publish:map-data` reported 37/37 sources succeeded, 0 failed — CCB's
// own endpoint recovered, so Portugal is back to its normal 13 (44 total
// markers: 13 Portugal + 31 Spain; 1454 display listings; 1503
// observations).
//
// BEATMAPPED-BERLIN-PRE-INTEGRATION-REUSE-AND-PUBLICATION-AUDIT-01
// (2026-08-26) — TEST-DESIGN FIX, read this before touching the numbers
// below again:
//
// Every paragraph above followed one rule: "assert the exact counts of
// whatever is currently committed, not a number independently guessed
// at." That rule was reasonable for EVENT/LISTING volume (a live source's
// own upcoming-events count genuinely fluctuates run to run — asserting
// it exactly is not a defect-prevention mechanism, so this file still
// does not try to). It was NOT reasonable for MAP MARKER (venue) counts:
// a first Berlin population/reuse trial once updated this file's
// marker-count assertions from "31 Spain markers" to "22 Spain markers"
// purely because `l-auditori-barcelona` (a real, previously-onboarded
// Barcelona source, wholly unrelated to Berlin) returned a single
// transient `"fetch failed"` during that particular live run — silently
// blessing real, live-network-caused data loss (9 genuine Barcelona
// venues) as though it were the new correct baseline. An exact-equality
// regression test cannot tell a genuine venue-coverage change apart from
// a transient fetch failure; a "the number changed, so update the test to
// match" workflow turns transient data loss into a passing test every
// time, which is exactly backwards for a regression guard.
//
// The fix has two parts:
//
// 1. ingestion/map/source-retention.mjs's `mergeRetainedMarkers()` (the
//    canonical, current-main resilience module — BEATMAPPED-SOURCE-
//    FAILURE-GRACE-AND-RETRY-01) — a source that genuinely fails now has
//    its previously-published listings retained (bounded to a 24-hour
//    grace from that source's own last success) rather than silently
//    dropped. BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-
//    INTEGRATION-01 additionally tags every retained listing `stale:
//    true` plus `retained_since` (that source's own `last_success_at` —
//    never a second, independently-derived timestamp; see
//    extractRetainableMarkersForSource()'s own doc comment) so retained
//    data is never silently indistinguishable from freshly-acquired data,
//    and rolls this up into the artifact's own `resilience` block (see
//    the well-formedness test below).
//
// 2. THIS FILE — marker-count assertions below are FLOORS (`>=` against
//    `KNOWN_GOOD_MARKER_FLOORS`, evidence-backed minimums from real,
//    previously-verified publication states), not exact equality. A
//    floor may only be RAISED, and only by a deliberate, evidenced
//    population/onboarding task that adds real venues — never lowered,
//    and never "corrected" merely because a live rerun happened to
//    acquire fewer sources successfully. Display/listing counts remain
//    informational (no hardcoded exact or floor value) — venue/source
//    continuity is the invariant that matters here, not event-count
//    stability.

const PUBLICATION_PATH = new URL("../data/public/lisbon-porto-map.json", import.meta.url);

// Evidence-backed minimum venue-marker coverage per country. Raise only
// via a deliberate, evidenced population/onboarding commit; never lower,
// and never to paper over a transient live-acquisition failure.
//   Portugal: 12 — BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01's own
//     documented CCB-outage floor (13 is the normal/healthy count).
//   Spain: 31 — verified at commit e0cfc4d (BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01),
//     the last state proven not to be degraded by a live-run transient
//     failure; protected going forward by the canonical retention module.
//   Germany: 20 — the BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01
//     committed floor (Volksbühne's marker only ever existed in an
//     uncommitted live-run-proof fixture, never in a committed publication
//     artifact, so it is not part of this evidenced floor).
const KNOWN_GOOD_MARKER_FLOORS = { Portugal: 12, Spain: 31, Germany: 20 };

async function loadPublication() {
  return JSON.parse(await readFile(PUBLICATION_PATH, "utf8"));
}

test("the committed publication artifact is still valid per its own schema/cross-check rules", async () => {
  const artifact = await loadPublication();
  const errors = validatePublicationArtifact(artifact);
  assert.deepEqual(errors, []);
});

test("total display listings is a positive, internally-consistent count (event volume is not asserted exactly — real sources fluctuate run to run)", async () => {
  const artifact = await loadPublication();
  assert.ok(artifact.counts.display_listing_count > 0);
});

test(`venue-marker coverage never falls below the known-good floor per country (Portugal >= ${KNOWN_GOOD_MARKER_FLOORS.Portugal}, Spain >= ${KNOWN_GOOD_MARKER_FLOORS.Spain}, Germany >= ${KNOWN_GOOD_MARKER_FLOORS.Germany} — see header comment)`, async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  const spainMarkers = artifact.countries.Spain.markers;
  const germanyMarkers = artifact.countries.Germany.markers;
  assert.ok(
    portugalMarkers.length >= KNOWN_GOOD_MARKER_FLOORS.Portugal,
    `Portugal markers dropped below the known-good floor: ${portugalMarkers.length} < ${KNOWN_GOOD_MARKER_FLOORS.Portugal}`,
  );
  assert.ok(
    spainMarkers.length >= KNOWN_GOOD_MARKER_FLOORS.Spain,
    `Spain markers dropped below the known-good floor: ${spainMarkers.length} < ${KNOWN_GOOD_MARKER_FLOORS.Spain}`,
  );
  assert.ok(
    germanyMarkers.length >= KNOWN_GOOD_MARKER_FLOORS.Germany,
    `Germany markers dropped below the known-good floor: ${germanyMarkers.length} < ${KNOWN_GOOD_MARKER_FLOORS.Germany}`,
  );
  assert.equal(
    artifact.counts.map_marker_count,
    portugalMarkers.length + spainMarkers.length + germanyMarkers.length,
    "map_marker_count must be the exact sum of the per-country marker arrays — no independently-drifting total",
  );
});

test("all underlying Portugal venue markers are recoverable/separable — the clustering UI never drops data, only visually combines it at wide zoom", async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  const fc = buildVenueFeatureCollection(portugalMarkers);
  // Every committed marker has a real (CONFIRMED/GEOCODED canonical, or
  // ADDRESS_ONLY + MANUAL_OPERATOR_ENTRY) coordinate, so every one of
  // them becomes exactly one clusterable/unclusterable GeoJSON point
  // feature — none silently dropped by the clustering layer.
  assert.equal(fc.features.length, portugalMarkers.length);
  const venueIds = new Set(fc.features.map((f) => f.properties.venue_id));
  assert.equal(venueIds.size, portugalMarkers.length);
  assert.ok(portugalMarkers.length >= KNOWN_GOOD_MARKER_FLOORS.Portugal);
});

test("CCB's marker, when present, uses exactly the operator-supplied coordinate pair, not a rounded/geocoded substitute", async () => {
  // BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01: made conditional on CCB
  // actually being in the currently-committed artifact — see this file's
  // own header comment. CCB's own live endpoint (www.ccb.pt) can return a
  // transport abort on a given live `npm run publish:map-data` attempt,
  // so CCB is legitimately absent from some commits' data
  // (source-isolation: one source's outage never blocks the others, and
  // never invents a fallback value — see ingestion/lisbon-porto/run.mjs's
  // acquireAll()). The coordinate assertion itself is unchanged and still
  // enforced whenever CCB IS present — this is a skip on genuinely
  // missing live data, not a weakened check.
  const artifact = await loadPublication();
  const ccb = artifact.countries.Portugal.markers.find((m) => m.venue_id === "venue-lisboa-centro-cultural-de-belem-ccb");
  if (!ccb) {
    console.log("  (skipped: CCB is not present in the currently-committed artifact — its own live endpoint was unreachable at publish time)");
    return;
  }
  assert.equal(ccb.latitude, 38.695679);
  assert.equal(ccb.longitude, -9.2073); // -9.20730 and -9.2073 are the identical IEEE754 value
});

test("cluster aggregate gig count across the full live dataset (Portugal + Spain + Germany) sums to the same GLOBAL total the publication artifact already reports", async () => {
  const artifact = await loadPublication();
  const portugalMarkers = artifact.countries.Portugal.markers;
  const spainMarkers = artifact.countries.Spain.markers;
  const germanyMarkers = artifact.countries.Germany.markers;
  // artifact.counts.display_listing_count is a GLOBAL total across every
  // published country (see buildPublicationArtifact()'s own doc comment)
  // — never Portugal-only — so this cross-check must sum all three.
  assert.equal(
    sumGigCounts(portugalMarkers) + sumGigCounts(spainMarkers) + sumGigCounts(germanyMarkers),
    artifact.counts.display_listing_count,
  );
});

test("all underlying Spain venue markers are recoverable/separable — the clustering UI never drops Barcelona data either", async () => {
  const artifact = await loadPublication();
  const spainMarkers = artifact.countries.Spain.markers;
  const fc = buildVenueFeatureCollection(spainMarkers);
  assert.equal(fc.features.length, spainMarkers.length);
  const venueIds = new Set(fc.features.map((f) => f.properties.venue_id));
  assert.equal(venueIds.size, spainMarkers.length);
  assert.ok(spainMarkers.length >= KNOWN_GOOD_MARKER_FLOORS.Spain);
});

test("all underlying Germany venue markers are recoverable/separable — the clustering UI never drops Berlin data either", async () => {
  const artifact = await loadPublication();
  const germanyMarkers = artifact.countries.Germany.markers;
  const fc = buildVenueFeatureCollection(germanyMarkers);
  assert.equal(fc.features.length, germanyMarkers.length);
  const venueIds = new Set(fc.features.map((f) => f.properties.venue_id));
  assert.equal(venueIds.size, germanyMarkers.length);
  assert.ok(germanyMarkers.length >= KNOWN_GOOD_MARKER_FLOORS.Germany);
});

test("Croatia country bucket is still an untouched empty marker list (this package never alters source acquisition or coverage)", async () => {
  const artifact = await loadPublication();
  assert.deepEqual(artifact.countries.Croatia.markers, []);
});

test("the artifact's resilience block is well-formed, and honestly reports any last-known-good retention that occurred this run", async () => {
  const artifact = await loadPublication();
  assert.ok(artifact.resilience && typeof artifact.resilience === "object");
  assert.equal(typeof artifact.resilience.retained_stale_listing_count, "number");
  assert.ok(artifact.resilience.retained_stale_listing_count >= 0);
  assert.ok(Array.isArray(artifact.resilience.retained_stale_source_ids));
  // Every listing tagged stale:true anywhere in the artifact must belong
  // to a source_id this rollup actually names — no silently-untracked
  // retention.
  const staleSourceIds = new Set(artifact.resilience.retained_stale_source_ids);
  for (const country of Object.values(artifact.countries)) {
    for (const marker of country.markers ?? []) {
      for (const listing of marker.display_listings ?? []) {
        if (listing.stale !== true) continue;
        const ids = listing.kind === "GROUP" ? (listing.sources ?? []).map((s) => s.source_id) : [listing.source_id];
        for (const id of ids) assert.ok(staleSourceIds.has(id), `stale listing from ${id} is not reflected in resilience.retained_stale_source_ids`);
      }
    }
  }
});
