// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-AND-DISCOVERY-CORRECTION-01 —
// end-to-end calibration tests reproducing the REAL corrected-pipeline
// shapes found during the actual Manchester forensic investigation (see
// this package's own FINAL REPORT), plus an executable canary proving the
// confirmed-but-deliberately-unfixed EXISTING_COLLECTOR_NOT_DISPATCHED
// gap (Phase 4/8 of this package's brief) — so a future fix to
// orchestrator.mjs's dispatch table is a deliberate, visible change to
// this test, never a silent behaviour drift.

import assert from "node:assert/strict";
import test from "node:test";

import { discoverCityCandidates } from "../../ingestion/future-city-wave/overpass-discovery.mjs";
import { toWaveCandidate } from "../../ingestion/future-city-wave/candidate.mjs";
import { evaluateTier1Candidate } from "../../ingestion/global-easy-harvester/tier1-gate.mjs";
import { routeProgrammeSource, collectAndProve } from "../../ingestion/programme-acquisition/orchestrator.mjs";

const CALIBRATION_CITY = { name: "Testville", city_id: "testville-tv", country: "Testland", country_code: "TV", wave_id: "calibration" };

test("FIXED (BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02): ICS_OR_ICAL is now actually dispatched to the real ICS parser, not silently routed through the JSON-LD-only fallback", () => {
  const programme = { url: "https://arbitrary.example/calendar.ics", body: "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nDTSTART:20990901T190000Z\nSUMMARY:A Real Gig\nURL:https://arbitrary.example/events/a\nEND:VEVENT\nEND:VCALENDAR", content_type: "text/calendar", status: 200, at: "2026-01-01T00:00:00.000Z" };
  const routing = routeProgrammeSource(programme);
  assert.equal(routing.selected.mechanism, "ICS_OR_ICAL", "sanity: the fingerprint must select ICS_OR_ICAL for real ICS content");
  assert.equal(routing.selected.collector_route, "EXISTING_COLLECTOR_ZERO_CODE", "routeCollectorCapability() genuinely claims this is already zero-code — see ingestion/venue-discovery/programme-fingerprint.mjs");

  // Real ICS content, with no independently-fetched detail page: records
  // ARE now genuinely produced by the real parser (proving dispatch is
  // wired), but the SAME detail-page-corroboration proof bar every other
  // collector family already requires still applies — deliberately never
  // weakened just to make ICS "work".
  const noDetailDocs = collectAndProve({ source_id: "canary", venue_name: "Canary Venue", programme, detail_documents: [] });
  assert.equal(noDetailDocs.records.length, 1, "the real ICS parser must actually run and produce a record — this is what was broken before");
  assert.equal(noDetailDocs.state, "STABLE_IDENTITY_PROOF_FAILED", "without independent detail-page corroboration, the same proof bar as every other family applies — not weakened for ICS");

  // With a real, independently-fetched detail page corroborating the same event_url:
  const detailPage = { url: "https://arbitrary.example/events/a", body: '<script type="application/ld+json">{"@type":"Event","name":"A Real Gig","startDate":"2099-09-01T19:00:00Z","url":"https://arbitrary.example/events/a"}</script>', content_type: "text/html", status: 200, at: "2026-01-01T00:00:00.000Z" };
  const withDetailDoc = collectAndProve({ source_id: "canary", venue_name: "Canary Venue", programme, detail_documents: [detailPage] });
  assert.equal(withDetailDoc.state, "ACQUISITION_PROVEN", "with real corroborating evidence, ICS now genuinely reaches ACQUISITION_PROVEN through the real, existing ingestion/ics/parse.mjs — never reachable before this fix");
  assert.equal(withDetailDoc.observations.length, 1);
});

test("end-to-end calibration shape: an arena (leisure=stadium, no amenity tag) is discovered via the corrected nwr query, prioritised ahead of a community centre, and proven via JSON-LD — reproducing the real AO Arena result with zero venue-specific code", async () => {
  const fetchOverpass = async () => ({
    elements: [
      // A community centre the OLD 15-cap-with-arbitrary-order selection could easily have let crowd out a real arena.
      { type: "node", id: 1, lat: 1, lon: 1, tags: { name: "Some Community Centre", amenity: "community_centre", website: "https://community.example/" } },
      // A real arena — no `amenity` tag at all, discoverable only because leisure=stadium is now queried, and only visible at all because it is a `way`.
      { type: "way", id: 2, center: { lat: 1, lon: 1 }, tags: { name: "Big Arena", leisure: "stadium", website: "https://big-arena.example/" } },
    ],
  });
  const discovery = await discoverCityCandidates(CALIBRATION_CITY, { lat: 1, lon: 1 }, { fetchOverpass, limit: 15 });
  assert.equal(discovery.raw_stats.way, 1);
  assert.equal(discovery.candidates[0].reported_name, "Big Arena", "the arena must be tried before the community centre, matching the real Manchester priority-tier evidence");

  const candidate = toWaveCandidate(discovery.candidates[0], CALIBRATION_CITY);
  assert.equal(candidate.has_admissible_location, true, "a way's center.lat/lon must count as real location evidence, same as a node's own coordinates");

  const homepageWithEventsLink = (url) => ({ url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html", body: '<nav><a href="/events">Events</a></nav>' });
  const jsonLdEventsPage = (url) => ({
    url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html",
    body: '<link rel="canonical" href="/events/a"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"A Real Gig","startDate":"2099-09-01T20:00:00+01:00","url":"/events/a"}</script>',
  });
  const fetchDocument = async (url) => (url === "https://big-arena.example/" ? homepageWithEventsLink(url) : jsonLdEventsPage(url.includes("/events/a") ? url : "https://big-arena.example/events/a"));

  const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
  assert.equal(verdict.status, "T1_PROVEN");
  assert.equal(verdict.acquisition_result.collector, "JSON_LD_EVENT");
  assert.equal(verdict.acquisition_result.proven_event_count, 1);
});
