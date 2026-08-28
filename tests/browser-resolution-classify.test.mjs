import assert from "node:assert/strict";
import test from "node:test";

import { classifyNetworkResponse, classifyRenderedDom, extractEmbeddedState, inspectStructuredValue } from "../ingestion/browser-resolution/classify.mjs";
import { tuplesFromJsonLd, tuplesFromRenderedCards } from "../ingestion/browser-resolution/event-tuples.mjs";

const event = (id) => ({ id, name: `Artist ${id}`, startDate: `2026-09-${id.padStart(2, "0")}`, url: `https://example.test/events/${id}` });

test("repeated event-shaped records prove a programme endpoint without numeric confidence", () => {
  const result = inspectStructuredValue({ events: [event("1"), event("2")], next: "/api/events?page=2" });
  assert.equal(result.state, "PROGRAMME_ENDPOINT_PROVEN");
  assert.equal(result.event_like_record_count, 2);
  assert.deepEqual(result.pagination_paths, ["$.next"]);
  assert.equal("confidence" in result, false);
});

test("one event-shaped record remains a likely endpoint", () => {
  assert.equal(inspectStructuredValue({ data: event("1") }).state, "LIKELY_PROGRAMME_ENDPOINT");
});

test("ordinary JSON is not misclassified as programme data", () => {
  assert.equal(inspectStructuredValue({ navigation: [{ title: "About", href: "/about" }] }).state, "STRUCTURED_RESPONSE_NOT_PROGRAMME");
});

test("JSON and GraphQL responses receive generic mechanism classifications", () => {
  const rest = classifyNetworkResponse({ url: "https://example.test/api/events", status: 200, content_type: "application/json", body: JSON.stringify({ events: [event("1"), event("2")] }), relationship: "SAME_ORIGIN" }, { maxResponseBytes: 100_000 });
  assert.equal(rest.state, "PROGRAMME_ENDPOINT_PROVEN");
  assert.equal(rest.mechanism, "PUBLIC_REST_JSON");
  const graphql = classifyNetworkResponse({ url: "https://example.test/graphql", status: 200, content_type: "application/json", body: JSON.stringify({ data: { events: [event("1"), event("2")] } }), relationship: "SAME_ORIGIN" }, { maxResponseBytes: 100_000 });
  assert.equal(graphql.mechanism, "PUBLIC_GRAPHQL");
});

test("calendar and access-block responses classify explicitly", () => {
  assert.equal(classifyNetworkResponse({ url: "https://example.test/feed.ics", status: 200, content_type: "text/calendar", body: "BEGIN:VEVENT", relationship: "SAME_ORIGIN" }, { maxResponseBytes: 100 }).state, "PROGRAMME_ENDPOINT_PROVEN");
  assert.equal(classifyNetworkResponse({ url: "https://example.test/api", status: 403, content_type: "application/json", body: "{}", relationship: "SAME_ORIGIN" }, { maxResponseBytes: 100 }).state, "ACCESS_BLOCKED");
});

test("oversize or unknown-length response bodies remain uninspected", () => {
  const result = classifyNetworkResponse({ url: "https://example.test/api", status: 200, content_type: "application/json", body: "", body_skipped: true, skip_reason: "response exceeded maxResponseBytes", relationship: "SAME_ORIGIN" }, { maxResponseBytes: 100 });
  assert.equal(result.state, "PROBE_LIMIT_REACHED");
});

test("Next, Nuxt, generic JSON, and JSON-LD embedded state are detected", () => {
  const body = JSON.stringify({ events: [event("1"), event("2")] });
  const blocks = extractEmbeddedState(`<script id="__NEXT_DATA__" type="application/json">${body}</script><script id="__NUXT__" type="application/json">${body}</script><script id="store" type="application/json">${body}</script><script type="application/ld+json">${JSON.stringify(event("3")).replace("{", "{\"@type\":\"Event\",")}</script>`);
  assert.deepEqual(blocks.map((item) => item.mechanism), ["EMBEDDED_NEXT_DATA", "EMBEDDED_NUXT_STATE", "OTHER_EMBEDDED_APP_STATE", "JSON_LD_EVENT"]);
  assert.ok(blocks.every((item) => item.state === "EMBEDDED_PROGRAMME_STATE_PROVEN"));
});

test("rendered DOM fallback requires repeated date and event-link structure", () => {
  const result = classifyRenderedDom({ text: "September 12  September 13", links: [{ text: "Event one", url: "https://example.test/events/1" }, { text: "Concert two", url: "https://example.test/events/2" }], initialText: "Loading" });
  assert.equal(result.state, "RENDERED_DOM_PROGRAMME_ONLY");
  assert.equal(result.hydrated_change_observed, true);
});

test("JSON-LD Event tuples retain bounded associated fields from rendered evidence", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", "@id": "https://example.test/events/1", name: "Correct title", startDate: "2026-09-01T20:00:00+02:00", endDate: "2026-09-01T22:00:00+02:00", url: "/events/1", offers: { url: "/tickets/1" } })}</script>`;
  const [tuple] = tuplesFromJsonLd(html, { sourcePageUrl: "https://example.test/programme" });
  assert.equal(tuple.title, "Correct title");
  assert.equal(tuple.start_raw, "2026-09-01T20:00:00+02:00");
  assert.equal(tuple.source_record_id, "https://example.test/events/1");
  assert.equal(tuple.event_url, "https://example.test/events/1");
  assert.equal(tuple.ticket_url, "https://example.test/tickets/1");
  assert.equal(tuple.provenance.title, "JSON_LD.name");
});

test("rendered-card tuples never combine fields from separate cards or invent IDs", () => {
  const tuples = tuplesFromRenderedCards([
    { name: "Title only", startDate: "", url: "https://example.test/events/1", id: "" },
    { name: "Correct event", startDate: "2026-09-02", url: "https://example.test/events/2", id: "" },
  ], { sourcePageUrl: "https://example.test/programme" });
  assert.equal(tuples.length, 1);
  assert.equal(tuples[0].title, "Correct event");
  assert.equal(tuples[0].source_record_id, undefined);
});
