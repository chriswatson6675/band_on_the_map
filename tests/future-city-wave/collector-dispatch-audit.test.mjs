// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — Phase 10's
// "machine-verifiable matrix where practical": for every source family
// capability metadata (ingestion/venue-discovery/programme-fingerprint.mjs)
// claims is already implemented, an EXECUTABLE test proves whether
// orchestrator.mjs's generic acquireSource() path can actually reach it.
// "Fingerprint recognised" is never treated as the same fact as
// "collector exists and the generic dispatcher can execute it" — this
// file is the difference, made concrete and regression-proof.

import assert from "node:assert/strict";
import test from "node:test";

import { routeProgrammeSource, collectAndProve } from "../../ingestion/programme-acquisition/orchestrator.mjs";
import { routeCollectorCapability } from "../../ingestion/venue-discovery/programme-fingerprint.mjs";

const NOW = "2026-01-01T00:00:00.000Z";
const detailPageFor = (url, name) => ({ url, at: NOW, status: 200, content_type: "text/html", body: `<script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"2099-09-01T20:00:00Z","url":"${url}"}</script>` });

function proveWith(programme, detailDocuments = []) {
  const routing = routeProgrammeSource(programme);
  const outcome = collectAndProve({ source_id: "audit", venue_name: "Audit Venue", programme, detail_documents: detailDocuments });
  return { mechanism: routing.selected?.mechanism, collectorRoute: routing.selected?.collector_route, state: outcome.state };
}

test("MATRIX: JSON_LD_EVENT — implementation exists, generically reachable, reaches ACQUISITION_PROVEN", () => {
  const programme = { url: "https://arbitrary.example/events", body: '<link rel="canonical" href="/e/1"><script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2099-09-01T20:00:00Z","url":"/e/1"}</script>', content_type: "text/html", status: 200, at: NOW };
  const result = proveWith(programme, [detailPageFor("https://arbitrary.example/e/1", "A")]);
  assert.equal(result.mechanism, "JSON_LD_EVENT");
  assert.equal(result.state, "ACQUISITION_PROVEN");
});

test("MATRIX: STATIC_HTML_CARDS — implementation exists, generically reachable, reaches ACQUISITION_PROVEN", () => {
  const cardHtml = `<article class="event-card"><a href="https://arbitrary.example/e/1">Gig A</a><time datetime="2099-09-01">1 Sep</time></article>`;
  const programme = { url: "https://arbitrary.example/events", body: cardHtml, content_type: "text/html", status: 200, at: NOW };
  const result = proveWith(programme, [detailPageFor("https://arbitrary.example/e/1", "Gig A")]);
  assert.equal(result.mechanism, "STATIC_HTML_CARDS");
  assert.equal(result.state, "ACQUISITION_PROVEN");
});

test("MATRIX: EMBEDDED_NEXT_DATA — implementation exists, generically reachable (verified in tests/source-execution.test.mjs, cross-referenced here)", () => {
  const programme = { url: "https://arbitrary.example/whats-on", body: '<script id="__NEXT_DATA__" type="application/json">{"events":[{"id":"x","name":"X","startDate":"2099-09-05","url":"/events/x"},{"id":"y","name":"Y","startDate":"2099-09-06","url":"/events/y"}]}</script>', content_type: "text/html", status: 200, at: NOW };
  const routing = routeProgrammeSource(programme);
  assert.equal(routing.selected.mechanism, "EMBEDDED_NEXT_DATA");
  const outcome = collectAndProve({ source_id: "audit", venue_name: "Audit Venue", programme, detail_documents: [] });
  assert.equal(outcome.normalized_event_count ?? outcome.records.length, 2, "the real embedded-state collector must actually run and find both events");
});

test("MATRIX: ICS_OR_ICAL — FIXED by this package. Was NOT dispatched before Correction-02; now genuinely reaches ACQUISITION_PROVEN with corroboration", () => {
  const programme = { url: "https://arbitrary.example/calendar.ics", body: "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nDTSTART:20990901T190000Z\nSUMMARY:A\nURL:https://arbitrary.example/e/1\nEND:VEVENT\nEND:VCALENDAR", content_type: "text/calendar", status: 200, at: NOW };
  assert.equal(routeCollectorCapability("ICS_OR_ICAL"), "EXISTING_COLLECTOR_ZERO_CODE", "sanity: capability metadata claims zero-code");
  const result = proveWith(programme, [detailPageFor("https://arbitrary.example/e/1", "A")]);
  assert.equal(result.mechanism, "ICS_OR_ICAL");
  assert.equal(result.state, "ACQUISITION_PROVEN", "ingestion/ics/parse.mjs is now actually invoked by the generic dispatcher — see ingestion/ics/collector.mjs and orchestrator.mjs's deriveEventRecords()");
});

test("MATRIX: PER_EVENT_ICS — implementation exists (ingestion/per-event-ics/), capability metadata claims zero-code, but generic acquireSource() cannot reach it: it needs a SECOND round of network fetches (each card's own .ics download link) that deriveEventRecords()/collectAndProve() structurally cannot make (both are synchronous, parse-already-fetched-documents-only functions with no fetchDocument access)", () => {
  assert.equal(routeCollectorCapability("PER_EVENT_ICS"), "EXISTING_COLLECTOR_ZERO_CODE", "capability metadata says zero-code");
  // No executable "reaches ACQUISITION_PROVEN" assertion here is possible without
  // fabricating a fetchDocument capability deriveEventRecords() does not have —
  // that absence IS the finding. See this package's own FINAL REPORT §7/§10.
});

test("MATRIX: WORDPRESS_TRIBE_API — FIXED by this package (BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03). Was NOT dispatched before; now genuinely reaches ACQUISITION_PROVEN with corroboration, via the plugin's own real REST JSON (no second network fetch — see programme-resolver.mjs's COMMON_PROGRAMME_PATHS and ingestion/events-calendar-api/collector.mjs)", () => {
  assert.equal(routeCollectorCapability("WORDPRESS_TRIBE_API"), "EXISTING_COLLECTOR_ZERO_CODE", "sanity: capability metadata claims zero-code");
  const tribeBody = JSON.stringify({
    events: [{
      id: 12345,
      title: "A",
      url: "https://arbitrary.example/event/a/",
      rest_url: "https://arbitrary.example/wp-json/tribe/events/v1/events/12345",
      start_date: "2099-09-01 20:00:00",
      utc_start_date: "2099-09-01 19:00:00",
      end_date: "2099-09-01 22:00:00",
      utc_end_date: "2099-09-01 21:00:00",
      timezone: "Europe/London",
      cost: "",
      venue: [],
      categories: [],
      tags: [],
    }],
    rest_url: "https://arbitrary.example/wp-json/tribe/events/v1/events/?page=1",
    total: 1,
    total_pages: 1,
  });
  const programme = { url: "https://arbitrary.example/wp-json/tribe/events/v1/events/", body: tribeBody, content_type: "application/json", status: 200, at: NOW };
  const result = proveWith(programme, [detailPageFor("https://arbitrary.example/event/a/", "A")]);
  assert.equal(result.mechanism, "WORDPRESS_TRIBE_API");
  assert.equal(result.state, "ACQUISITION_PROVEN", "ingestion/events-calendar-api/client.mjs's own parseEventsPage/normalizeEventRecord is now actually invoked by the generic dispatcher — see ingestion/events-calendar-api/collector.mjs and orchestrator.mjs's deriveEventRecords()");
});

test("MATRIX: WORDPRESS_TRIBE_API — a page that merely MENTIONS Tribe markup in ordinary HTML (not the plugin's real REST JSON) correctly still yields nothing: fingerprinting the marker text is not the same as the response actually being parseable Tribe JSON", () => {
  const programme = { url: "https://arbitrary.example/events", body: "<p>the-events-calendar tribe-events wp-json/tribe/events</p>", content_type: "text/html", status: 200, at: NOW };
  const result = proveWith(programme, []);
  assert.equal(result.mechanism, "WORDPRESS_TRIBE_API");
  assert.notEqual(result.state, "ACQUISITION_PROVEN", "the collector runs but parseEventsPage() correctly rejects non-JSON, non-Tribe-shaped text rather than fabricating events from it");
});

test("MATRIX: PUBLIC_REST_JSON — capability metadata claims zero-code, but no single generic REST-JSON parser exists in this repository (every site's JSON shape differs) — correctly NOT auto-dispatched; closer to a genuine NEW_REUSABLE_COLLECTOR_FAMILY case than an existing-but-unwired one", () => {
  assert.equal(routeCollectorCapability("PUBLIC_REST_JSON"), "EXISTING_COLLECTOR_ZERO_CODE", "capability metadata says zero-code — this is the overstatement this test documents");
  const programme = { url: "https://arbitrary.example/api/events", body: '{"events":[{"startdate":"2099-09-01","name":"A"}]}', content_type: "application/json", status: 200, at: NOW };
  const result = proveWith(programme, []);
  assert.equal(result.mechanism, "PUBLIC_REST_JSON");
  assert.notEqual(result.state, "ACQUISITION_PROVEN");
});

test("MATRIX: LIST_TO_DETAIL_HTML — capability metadata claims CONFIGURATION_ONLY, but its own fingerprint signal depends on a `links` field the real acquisition pipeline never populates on a fetched document (ingestion/programme-acquisition/source-execution.mjs's programme object never carries `.links`) — effectively unreachable in the real runtime pipeline, a deeper gap than a missing dispatch branch", () => {
  assert.equal(routeCollectorCapability("LIST_TO_DETAIL_HTML"), "CONFIGURATION_ONLY", "sanity: capability metadata's own claim");
  // Real acquireSource()-shaped documents never carry a `.links` array —
  // so this mechanism can be demonstrated only by directly supplying one,
  // which the real pipeline never does. That gap (not a failed dispatch
  // call) IS the finding — see this package's own FINAL REPORT §7/§10.
});
