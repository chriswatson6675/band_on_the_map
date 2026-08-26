// BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01 — pure, deterministic,
// offline proof for ingestion/map/source-retention.mjs: the entire
// "FAILED means unknown, not empty" mechanism. No live network, no real
// timers — every timestamp is a plain literal, matching this project's
// existing pure-module testing convention (see tests/publication-artifact.test.mjs).

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RETENTION_GRACE_MS,
  computeSourceLastSuccessAt,
  isWithinRetentionGrace,
  annotateSourceProvenance,
  extractRetainableMarkersForSource,
  combineRetainedVenueMaps,
  mergeRetainedMarkers,
} from "../ingestion/map/source-retention.mjs";

const NOW = "2026-08-26T14:00:00.000Z";
const H = 60 * 60 * 1000;

// --- DEFAULT_RETENTION_GRACE_MS ---

test("DEFAULT_RETENTION_GRACE_MS is exactly 24 hours", () => {
  assert.equal(DEFAULT_RETENTION_GRACE_MS, 24 * H);
});

// --- computeSourceLastSuccessAt ---

test("computeSourceLastSuccessAt: a success this run refreshes last_success_at to generatedAt, regardless of any previous value", () => {
  assert.equal(computeSourceLastSuccessAt({ success: true, generatedAt: NOW, previousLastSuccessAt: "2020-01-01T00:00:00.000Z" }), NOW);
  assert.equal(computeSourceLastSuccessAt({ success: true, generatedAt: NOW, previousLastSuccessAt: null }), NOW);
});

test("computeSourceLastSuccessAt: a failure this run carries the previous value forward unchanged", () => {
  assert.equal(computeSourceLastSuccessAt({ success: false, generatedAt: NOW, previousLastSuccessAt: "2026-08-25T10:00:00.000Z" }), "2026-08-25T10:00:00.000Z");
});

test("computeSourceLastSuccessAt: a failure with no previous recorded success stays null — never fabricated", () => {
  assert.equal(computeSourceLastSuccessAt({ success: false, generatedAt: NOW, previousLastSuccessAt: null }), null);
  assert.equal(computeSourceLastSuccessAt({ success: false, generatedAt: NOW }), null);
});

// --- isWithinRetentionGrace ---

test("isWithinRetentionGrace: null/unknown last_success_at is never within grace", () => {
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: null, now: NOW }), false);
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: undefined, now: NOW }), false);
});

test("isWithinRetentionGrace: exactly at the 24h boundary is still within grace (inclusive)", () => {
  const exactlyBoundary = new Date(Date.parse(NOW) - DEFAULT_RETENTION_GRACE_MS).toISOString();
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: exactlyBoundary, now: NOW }), true);
});

test("isWithinRetentionGrace: one millisecond past the 24h boundary is beyond grace", () => {
  const justBeyond = new Date(Date.parse(NOW) - DEFAULT_RETENTION_GRACE_MS - 1).toISOString();
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: justBeyond, now: NOW }), false);
});

test("isWithinRetentionGrace: well within grace (a few hours ago) is true; well beyond (days ago) is false", () => {
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: new Date(Date.parse(NOW) - 3 * H).toISOString(), now: NOW }), true);
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: new Date(Date.parse(NOW) - 3 * 24 * H).toISOString(), now: NOW }), false);
});

test("isWithinRetentionGrace: a custom graceMs is honoured", () => {
  const sixHoursAgo = new Date(Date.parse(NOW) - 6 * H).toISOString();
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: sixHoursAgo, now: NOW, graceMs: 4 * H }), false);
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: sixHoursAgo, now: NOW, graceMs: 8 * H }), true);
});

test("isWithinRetentionGrace: unparseable timestamps never crash and are never within grace", () => {
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: "not-a-date", now: NOW }), false);
  assert.equal(isWithinRetentionGrace({ lastSuccessAt: NOW, now: "also-not-a-date" }), false);
});

// --- annotateSourceProvenance ---

test("annotateSourceProvenance: a source that succeeds this run — including succeeding with ZERO observations — is never retained_eligible, and its last_success_at refreshes to generatedAt (successful-zero is authoritative)", () => {
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "quiet-venue", success: true, observation_count: 0, raw_record_count: 0 }],
    previousSourceReportSources: [{ source_id: "quiet-venue", success: false, last_success_at: "2020-01-01T00:00:00.000Z" }],
    generatedAt: NOW,
  });
  assert.equal(result.retained_eligible, false);
  assert.equal(result.last_success_at, NOW);
});

test("annotateSourceProvenance: a FAILED source within 24h of its last recorded success is retained_eligible", () => {
  const recentSuccess = new Date(Date.parse(NOW) - 3 * H).toISOString();
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "l-auditori-barcelona", success: false, error: "fetch failed" }],
    previousSourceReportSources: [{ source_id: "l-auditori-barcelona", success: true, last_success_at: recentSuccess }],
    generatedAt: NOW,
  });
  assert.equal(result.retained_eligible, true);
  assert.equal(result.last_success_at, recentSuccess);
});

test("annotateSourceProvenance: a FAILED source beyond 24h of its last recorded success is NOT retained_eligible", () => {
  const staleSuccess = new Date(Date.parse(NOW) - 25 * H).toISOString();
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "l-auditori-barcelona", success: false, error: "fetch failed" }],
    previousSourceReportSources: [{ source_id: "l-auditori-barcelona", success: true, last_success_at: staleSuccess }],
    generatedAt: NOW,
  });
  assert.equal(result.retained_eligible, false);
  assert.equal(result.last_success_at, staleSuccess); // the clock is NOT reset merely by another failure — still the true last success
});

test("annotateSourceProvenance: repeated consecutive failures never reset the grace clock — it stays anchored to the original last success", () => {
  const originalSuccess = new Date(Date.parse(NOW) - 20 * H).toISOString();
  let previous = [{ source_id: "flaky", success: true, last_success_at: originalSuccess }];
  let generatedAt = NOW;

  for (let i = 0; i < 3; i += 1) {
    const [result] = annotateSourceProvenance({
      sourceResults: [{ source_id: "flaky", success: false, error: "fetch failed" }],
      previousSourceReportSources: previous,
      generatedAt,
    });
    assert.equal(result.last_success_at, originalSuccess, `iteration ${i}: last_success_at must stay anchored to the original success, never reset by a failure`);
    previous = [{ source_id: "flaky", success: false, last_success_at: result.last_success_at }];
    generatedAt = new Date(Date.parse(generatedAt) + H).toISOString(); // advance the clock between failed runs
  }
});

test("annotateSourceProvenance: a source with no previous record at all (never seen before) is never retained_eligible", () => {
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "brand-new-source", success: false, error: "HTTP 500 response" }],
    previousSourceReportSources: [],
    generatedAt: NOW,
  });
  assert.equal(result.retained_eligible, false);
  assert.equal(result.last_success_at, null);
});

test("annotateSourceProvenance: recovery — a source that previously failed and now succeeds is immediately authoritative again, never retained_eligible", () => {
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "l-auditori-barcelona", success: true, observation_count: 161, raw_record_count: 239 }],
    previousSourceReportSources: [{ source_id: "l-auditori-barcelona", success: false, last_success_at: new Date(Date.parse(NOW) - 5 * H).toISOString() }],
    generatedAt: NOW,
  });
  assert.equal(result.retained_eligible, false);
  assert.equal(result.last_success_at, NOW);
});

test("annotateSourceProvenance: an always-succeeding source is completely unaffected — last_success_at always == generatedAt, never retained_eligible", () => {
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "jamboree-barcelona", success: true, observation_count: 200, raw_record_count: 200 }],
    previousSourceReportSources: [{ source_id: "jamboree-barcelona", success: true, last_success_at: "2026-08-25T10:00:00.000Z" }],
    generatedAt: NOW,
  });
  assert.equal(result.retained_eligible, false);
  assert.equal(result.last_success_at, NOW);
});

test("annotateSourceProvenance: preserves every other field on the source result unchanged", () => {
  const [result] = annotateSourceProvenance({
    sourceResults: [{ source_id: "x", success: true, observation_count: 3, raw_record_count: 3, attempts: 2, notes: ["ok"] }],
    previousSourceReportSources: [],
    generatedAt: NOW,
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.notes, ["ok"]);
  assert.equal(result.observation_count, 3);
});

// --- extractRetainableMarkersForSource ---

function singleListing({ sourceId, recordId, date = null }) {
  return { kind: "SINGLE", source_id: sourceId, source_record_id: recordId, title: `Event ${recordId}`, start: { date }, end: { date }, event_url: null };
}

function marker({ venueId, name, listings, lat = 41.4, lon = 2.15 }) {
  return { venue_id: venueId, canonical_name: name, latitude: lat, longitude: lon, address: "Some address", display_listings: listings };
}

test("extractRetainableMarkersForSource: extracts only listings matching the given source_id, grouped by venue_id, across Portugal+Spain", () => {
  const previousArtifact = {
    countries: {
      Portugal: { markers: [marker({ venueId: "v-porto", name: "Porto Venue", listings: [singleListing({ sourceId: "other-source", recordId: "1", date: "2026-09-01" })] })] },
      Spain: {
        markers: [
          marker({ venueId: "v-auditori", name: "L'Auditori", listings: [singleListing({ sourceId: "l-auditori-barcelona", recordId: "10", date: "2026-09-01" })] }),
          marker({ venueId: "v-jamboree", name: "Jamboree", listings: [singleListing({ sourceId: "jamboree-barcelona", recordId: "20", date: "2026-09-02" })] }),
        ],
      },
    },
  };

  const retained = extractRetainableMarkersForSource({ previousArtifact, sourceId: "l-auditori-barcelona", todayDateString: "2026-08-26" });

  assert.equal(retained.size, 1);
  const venue = retained.get("v-auditori");
  assert.equal(venue.canonical_name, "L'Auditori");
  assert.equal(venue.country, "Spain");
  assert.equal(venue.listings.length, 1);
  assert.equal(venue.listings[0].source_record_id, "10");
});

test("extractRetainableMarkersForSource: the real 9-venue L'Auditori scenario — one umbrella source, nine distinct canonical venues, all correctly attributed", () => {
  const AUDITORI_VENUES = [
    "venue-barcelona-l-auditori",
    "venue-barcelona-palau-de-la-musica-catalana",
    "venue-barcelona-esglesia-de-sant-felip-neri",
    "venue-barcelona-monestir-sant-pau-del-camp",
    "venue-barcelona-basilica-de-santa-maria-del-pi",
    "venue-barcelona-sant-andreu-teatre",
    "venue-barcelona-reial-monestir-de-pedralbes",
    "venue-barcelona-casino-alianca-poblenou",
    "venue-barcelona-esmuc",
  ];
  const spainMarkers = AUDITORI_VENUES.map((venueId, i) =>
    marker({ venueId, name: `Venue ${i}`, listings: [singleListing({ sourceId: "l-auditori-barcelona", recordId: String(i), date: "2026-09-15" })] }),
  );
  // Plus 22 unrelated, still-successful venues that must NEVER be retained by this extraction.
  spainMarkers.push(marker({ venueId: "venue-barcelona-jamboree", name: "Jamboree", listings: [singleListing({ sourceId: "jamboree-barcelona", recordId: "1", date: "2026-09-01" })] }));

  const previousArtifact = { countries: { Portugal: { markers: [] }, Spain: { markers: spainMarkers } } };
  const retained = extractRetainableMarkersForSource({ previousArtifact, sourceId: "l-auditori-barcelona", todayDateString: "2026-08-26" });

  assert.equal(retained.size, 9);
  for (const venueId of AUDITORI_VENUES) assert.ok(retained.has(venueId), `expected ${venueId} to be retained`);
  assert.ok(!retained.has("venue-barcelona-jamboree"), "an unrelated, still-successful source's venue must never be retained");
});

test("extractRetainableMarkersForSource: GROUP-kind listings are NEVER retained, even when one of their sources[] entries matches — a documented, deliberate scope boundary", () => {
  const groupListing = {
    kind: "GROUP",
    display_title: "Combined show",
    start: { date: "2026-09-01" },
    end: { date: "2026-09-01" },
    sources: [{ source_id: "hot-clube-de-portugal", source_record_id: "1" }, { source_id: "teatro-variedades-capitolio", source_record_id: "2" }],
  };
  const previousArtifact = { countries: { Portugal: { markers: [marker({ venueId: "v-capitolio", name: "Capitólio", listings: [groupListing] })] }, Spain: { markers: [] } } };

  const retained = extractRetainableMarkersForSource({ previousArtifact, sourceId: "hot-clube-de-portugal", todayDateString: "2026-08-26" });
  assert.equal(retained.size, 0);
});

test("extractRetainableMarkersForSource: drops obviously-expired retained listings (known date before today), keeps future ones, never drops an unknown date", () => {
  const previousArtifact = {
    countries: {
      Portugal: { markers: [] },
      Spain: {
        markers: [
          marker({
            venueId: "v-mixed",
            name: "Mixed Venue",
            listings: [
              singleListing({ sourceId: "l-auditori-barcelona", recordId: "past", date: "2026-08-01" }), // expired
              singleListing({ sourceId: "l-auditori-barcelona", recordId: "future", date: "2026-09-01" }), // upcoming
              singleListing({ sourceId: "l-auditori-barcelona", recordId: "unknown", date: null }), // never dropped
            ],
          }),
        ],
      },
    },
  };

  const retained = extractRetainableMarkersForSource({ previousArtifact, sourceId: "l-auditori-barcelona", todayDateString: "2026-08-26" });
  const recordIds = retained.get("v-mixed").listings.map((l) => l.source_record_id).sort();
  assert.deepEqual(recordIds, ["future", "unknown"]);
});

test("extractRetainableMarkersForSource: no previous artifact data for the source → empty map, never throws", () => {
  const previousArtifact = { countries: { Portugal: { markers: [] }, Spain: { markers: [] } } };
  const retained = extractRetainableMarkersForSource({ previousArtifact, sourceId: "nonexistent-source", todayDateString: "2026-08-26" });
  assert.equal(retained.size, 0);
});

// --- combineRetainedVenueMaps ---

test("combineRetainedVenueMaps: two independent sources' retained venues merge cleanly when they don't overlap", () => {
  const mapA = new Map([["v1", { venue_id: "v1", listings: [{ source_record_id: "a" }] }]]);
  const mapB = new Map([["v2", { venue_id: "v2", listings: [{ source_record_id: "b" }] }]]);
  const combined = combineRetainedVenueMaps([mapA, mapB]);
  assert.equal(combined.size, 2);
  assert.deepEqual(combined.get("v1").listings, [{ source_record_id: "a" }]);
  assert.deepEqual(combined.get("v2").listings, [{ source_record_id: "b" }]);
});

test("combineRetainedVenueMaps: two independently-failed sources both attributable to the SAME venue have their listings concatenated, not overwritten", () => {
  const mapA = new Map([["v1", { venue_id: "v1", listings: [{ source_record_id: "a" }] }]]);
  const mapB = new Map([["v1", { venue_id: "v1", listings: [{ source_record_id: "b" }] }]]);
  const combined = combineRetainedVenueMaps([mapA, mapB]);
  assert.equal(combined.size, 1);
  assert.deepEqual(
    combined.get("v1").listings.map((l) => l.source_record_id),
    ["a", "b"],
  );
});

test("combineRetainedVenueMaps: an empty input list produces an empty map", () => {
  assert.equal(combineRetainedVenueMaps([]).size, 0);
  assert.equal(combineRetainedVenueMaps(undefined).size, 0);
});

// --- mergeRetainedMarkers ---

test("mergeRetainedMarkers: a retained venue with NO fresh marker this run is synthesized from its own last-known-good metadata", () => {
  const retained = new Map([
    ["v-auditori", { venue_id: "v-auditori", canonical_name: "L'Auditori", latitude: 41.4, longitude: 2.19, address: "Addr", listings: [singleListing({ sourceId: "l-auditori-barcelona", recordId: "1" })] }],
  ]);
  const merged = mergeRetainedMarkers([], retained);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].venue_id, "v-auditori");
  assert.equal(merged[0].canonical_name, "L'Auditori");
  assert.equal(merged[0].display_listings.length, 1);
});

test("mergeRetainedMarkers: a retained venue that ALSO has a fresh marker this run gets the retained listings appended, not a duplicate marker", () => {
  const fresh = [marker({ venueId: "v-multi", name: "Multi-source Venue", listings: [singleListing({ sourceId: "fresh-source", recordId: "fresh-1" })] })];
  const retained = new Map([
    ["v-multi", { venue_id: "v-multi", canonical_name: "Multi-source Venue", latitude: 41.4, longitude: 2.15, address: "Addr", listings: [singleListing({ sourceId: "stale-source", recordId: "stale-1" })] }],
  ]);
  const merged = mergeRetainedMarkers(fresh, retained);

  assert.equal(merged.length, 1); // never a second marker for the same venue_id
  const identities = merged[0].display_listings.map((l) => `${l.source_id}:${l.source_record_id}`).sort();
  assert.deepEqual(identities, ["fresh-source:fresh-1", "stale-source:stale-1"]);
});

test("mergeRetainedMarkers: fresh data always wins — a retained listing whose identity already exists in the fresh marker is never duplicated", () => {
  const sharedListing = singleListing({ sourceId: "same-source", recordId: "same-record" });
  const fresh = [marker({ venueId: "v-x", name: "Venue X", listings: [sharedListing] })];
  const retained = new Map([["v-x", { venue_id: "v-x", canonical_name: "Venue X", latitude: 41.4, longitude: 2.15, address: "Addr", listings: [sharedListing] }]]);

  const merged = mergeRetainedMarkers(fresh, retained);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].display_listings.length, 1, "the identical retained listing must never be duplicated alongside the fresh one");
});

test("mergeRetainedMarkers: empty/absent retained venues leaves the fresh marker list completely unchanged", () => {
  const fresh = [marker({ venueId: "v-a", name: "A", listings: [singleListing({ sourceId: "s", recordId: "1" })] })];
  assert.deepEqual(mergeRetainedMarkers(fresh, new Map()), fresh);
  assert.deepEqual(mergeRetainedMarkers(fresh, null), fresh);
  assert.deepEqual(mergeRetainedMarkers(fresh, undefined), fresh);
});

test("mergeRetainedMarkers: never mutates the original fresh marker objects passed in", () => {
  const originalListing = singleListing({ sourceId: "fresh-source", recordId: "1" });
  const fresh = [marker({ venueId: "v-x", name: "Venue X", listings: [originalListing] })];
  const retained = new Map([["v-x", { venue_id: "v-x", canonical_name: "Venue X", latitude: 41.4, longitude: 2.15, address: "Addr", listings: [singleListing({ sourceId: "stale-source", recordId: "2" })] }]]);

  mergeRetainedMarkers(fresh, retained);
  assert.equal(fresh[0].display_listings.length, 1, "the ORIGINAL fresh marker array passed in must never be mutated in place");
});

test("mergeRetainedMarkers: multiple unrelated retained venues (the real 9-venue scenario) all synthesize correctly alongside 22 unaffected fresh markers", () => {
  const freshMarkers = Array.from({ length: 22 }, (_, i) => marker({ venueId: `v-fresh-${i}`, name: `Fresh ${i}`, listings: [singleListing({ sourceId: `source-${i}`, recordId: "1" })] }));
  const retainedVenues = new Map(
    Array.from({ length: 9 }, (_, i) => [
      `v-retained-${i}`,
      { venue_id: `v-retained-${i}`, canonical_name: `Retained ${i}`, latitude: 41.4, longitude: 2.15, address: "Addr", listings: [singleListing({ sourceId: "l-auditori-barcelona", recordId: String(i) })] },
    ]),
  );

  const merged = mergeRetainedMarkers(freshMarkers, retainedVenues);
  assert.equal(merged.length, 31); // 22 fresh + 9 retained — the pre-incident Barcelona baseline, restored
});
