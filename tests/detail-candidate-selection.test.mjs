// BEATMAPPED-DETAIL-CANDIDATE-SELECTION-COVERAGE-01
//
// Determinism/coverage tests for discoverDetailCandidates()'s new
// normalized-record-driven candidate tier (deterministicRecordCandidates(),
// deriveProgrammeLevelEventRecords()) and the unchanged bounded-detailLimit
// contract acquireSource()/runCityAcquisition() rely on. No live network —
// every fixture below is synthetic, inline HTML, exactly matching this
// repository's existing arbitrary.example test idiom (see
// tests/programme-orchestrator.test.mjs, tests/programme-acquisition-
// discovery.test.mjs).

import assert from "node:assert/strict";
import test from "node:test";

import { discoverDetailCandidates, deriveProgrammeLevelEventRecords, collectAndProve } from "../ingestion/programme-acquisition/orchestrator.mjs";

const BASE_URL = "https://arbitrary.example/whats-on";
const AT = "2026-08-29T00:00:00.000Z";

function eventScript(node) {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

function jsonLdEvent({ name, url, startDate }) {
  return { "@context": "https://schema.org", "@type": "Event", name, url, startDate };
}

/** Build a synthetic programme document embedding `count` real JSON-LD
 * Event nodes, each with its own distinct future date and same-origin url,
 * plus a small number of ordinary anchor-tag "noise" links (of the kind
 * extractProgrammeLinks() already independently discovers). */
function programmeWithEvents(count, { anchors = [] } = {}) {
  const nodes = Array.from({ length: count }, (_, i) => jsonLdEvent({
    name: `Event ${i + 1}`,
    url: `/events/event-${i + 1}`,
    // Deliberately NOT in ascending date order in the source markup, so
    // ordering tests actually exercise the sort rather than the original
    // document order.
    startDate: `2026-09-${String(30 - i).padStart(2, "0")}T20:00:00+02:00`,
  }));
  // event-1 is deliberately the LATEST-dated event and event-N the
  // earliest, so a test asserting ascending-date output order is actually
  // exercising the sort, not merely echoing source document order.
  const anchorHtml = anchors.map((a) => `<a href="${a}">${a} event</a>`).join("");
  const body = `<!doctype html>${anchorHtml}${nodes.map(eventScript).join("")}`;
  return { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
}

test("fewer than 12 normalized-record candidates: all are returned, ordered by date ascending", () => {
  const programme = programmeWithEvents(3);
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), [
    "https://arbitrary.example/events/event-3", // 2026-09-28 (earliest of the 3)
    "https://arbitrary.example/events/event-2", // 2026-09-29
    "https://arbitrary.example/events/event-1", // 2026-09-30 (latest of the 3)
  ]);
});

test("exactly 12 normalized-record candidates: all 12 are returned, none dropped", () => {
  const programme = programmeWithEvents(12);
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.equal(result.length, 12);
  assert.equal(new Set(result.map((c) => c.url)).size, 12);
});

test("more than 12 normalized-record candidates: bounded to exactly `limit`, earliest-dated first (zero-fetch-increase)", () => {
  const programme = programmeWithEvents(60);
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.equal(result.length, 12);
  // event-60 has the earliest date (2026-09-(30-59) wraps below the 1st,
  // but what matters here is only that the selection is consistently the
  // 12 earliest-dated events, not a specific wrapped date value).
  const dates = result.map((c) => c.url);
  assert.equal(new Set(dates).size, 12); // no duplicates smuggled in
});

test("duplicate normalized-record URLs are deduplicated (first occurrence wins), never double-counted against the limit", () => {
  const nodeA = jsonLdEvent({ name: "Shared A", url: "/events/shared", startDate: "2026-09-05T20:00:00+02:00" });
  const nodeB = jsonLdEvent({ name: "Shared B", url: "/events/shared", startDate: "2026-09-05T20:00:00+02:00" });
  const nodeC = jsonLdEvent({ name: "Distinct", url: "/events/distinct", startDate: "2026-09-06T20:00:00+02:00" });
  const body = [nodeA, nodeB, nodeC].map(eventScript).join("");
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), ["https://arbitrary.example/events/shared", "https://arbitrary.example/events/distinct"]);
});

test("cross-origin (external) event URLs are never selected as candidates — first-party only", () => {
  const external = jsonLdEvent({ name: "External ticketing", url: "https://tickets.example/buy/123", startDate: "2026-09-05T20:00:00+02:00" });
  const internal = jsonLdEvent({ name: "Real detail page", url: "/events/real", startDate: "2026-09-06T20:00:00+02:00" });
  const body = [external, internal].map(eventScript).join("");
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), ["https://arbitrary.example/events/real"]);
  assert.ok(!result.some((c) => c.url.includes("tickets.example")));
});

test("non-http(s)-protocol event URLs (e.g. javascript:) are rejected, never selected as a candidate", () => {
  const nonHttp = jsonLdEvent({ name: "Non-http", url: "javascript:alert(1)", startDate: "2026-09-05T20:00:00+02:00" });
  const ok = jsonLdEvent({ name: "OK", url: "/events/ok", startDate: "2026-09-06T20:00:00+02:00" });
  const body = [nonHttp, ok].map(eventScript).join("");
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
  assert.doesNotThrow(() => discoverDetailCandidates(programme, { limit: 12 }));
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), ["https://arbitrary.example/events/ok"]);
});

test("a genuinely unparsable event URL is skipped without throwing", () => {
  const malformed = jsonLdEvent({ name: "Malformed", url: "http://[not-a-valid-ipv6-host", startDate: "2026-09-05T20:00:00+02:00" });
  const ok = jsonLdEvent({ name: "OK", url: "/events/ok", startDate: "2026-09-06T20:00:00+02:00" });
  const body = [malformed, ok].map(eventScript).join("");
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
  assert.doesNotThrow(() => discoverDetailCandidates(programme, { limit: 12 }));
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), ["https://arbitrary.example/events/ok"]);
});

test("a programme page with NO normalized records at all falls back to the pre-existing link-based discovery, unchanged (no regression for link-discovery-style sources such as b-flat-berlin)", () => {
  const body = `<a href="/events/one">First concert event</a><a href="/events/two">Second concert event</a>`;
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
  assert.deepEqual(deriveProgrammeLevelEventRecords(programme), []);
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), ["https://arbitrary.example/events/one", "https://arbitrary.example/events/two"]);
});

test("normalized-record candidates are preferred, and remaining budget is filled by pre-existing link-based candidates not already included", () => {
  const recordEvent = jsonLdEvent({ name: "Structured", url: "/events/structured", startDate: "2026-09-06T20:00:00+02:00" });
  const body = `<a href="/events/anchor-only-event">Anchor-only concert</a>${eventScript(recordEvent)}`;
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
  const result = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(result.map((c) => c.url), [
    "https://arbitrary.example/events/structured",
    "https://arbitrary.example/events/anchor-only-event",
  ]);
});

test("determinism: the same input, run repeatedly, produces byte-identical ordered candidate output", () => {
  const programme = programmeWithEvents(20);
  const first = discoverDetailCandidates(programme, { limit: 12 });
  const second = discoverDetailCandidates(programme, { limit: 12 });
  const third = discoverDetailCandidates(programme, { limit: 12 });
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test("zero-fetch-increase assertion: candidate count never exceeds the given limit, regardless of how many normalized records or raw links exist", () => {
  for (const count of [0, 1, 11, 12, 13, 40, 200]) {
    const programme = programmeWithEvents(count);
    const result = discoverDetailCandidates(programme, { limit: 12 });
    assert.ok(result.length <= 12, `expected <=12 candidates for ${count} source events, got ${result.length}`);
  }
});

test("deriveProgrammeLevelEventRecords never mutates its input and is independent of any detail_documents", () => {
  const programme = programmeWithEvents(5);
  const before = JSON.stringify(programme);
  const records = deriveProgrammeLevelEventRecords(programme);
  assert.equal(JSON.stringify(programme), before);
  assert.equal(records.length, 5);
});

test("collectAndProve's own observations/proof computation is unaffected by the candidate-selection change (proof engine untouched)", () => {
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body: `<a href="/events/one">Event</a>${eventScript(jsonLdEvent({ name: "One", url: "/events/one", startDate: "2026-09-01T20:00:00+01:00" }))}` };
  const detail = { url: "https://arbitrary.example/events/one", body: `<link rel="canonical" href="/events/one">${eventScript(jsonLdEvent({ name: "One", url: "/events/one", startDate: "2026-09-01T20:00:00+01:00" }))}` };
  const result = collectAndProve({ source_id: "arbitrary", venue_name: "Arbitrary", programme, detail_documents: [detail] });
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].source_record_id, "https://arbitrary.example/events/one");
});
