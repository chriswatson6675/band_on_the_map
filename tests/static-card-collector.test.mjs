import assert from "node:assert/strict";
import test from "node:test";
import { collectStaticCardEvents } from "../ingestion/static-cards/collector.mjs";

const options = { sourceId: "arbitrary", venueName: "Arbitrary", cutoffDate: "2026-08-29" };
test("collects only card-local title, ISO time, and first-party detail evidence", () => {
  const body = '<h1>September events</h1><article class="event-card"><a href="/events/one">One</a><time datetime="2026-09-01T20:00:00+01:00"></time></article><article class="calendar-item"><a href="/events/two">Two</a><time datetime="2026-09-02"></time></article>';
  const result = collectStaticCardEvents({ url: "https://arbitrary.example/whats-on", body, at: "2026-08-29T00:00:00Z" }, options);
  assert.equal(result.records.length, 2); assert.equal(result.records[0].event_url, "https://arbitrary.example/events/one");
});
test("rejects headings, cross-card fields, external links, missing date, and generic labels", () => {
  const body = '<h2>Heading Only</h2><article class="event-card"><a href="/events/a">A</a></article><article class="event-card"><time datetime="2026-09-01"></time></article><article class="event-card"><a href="https://tickets.example/a">External</a><time datetime="2026-09-01"></time></article><article class="event-card"><a href="/events/list">What\'s on</a><time datetime="2026-09-01"></time></article>';
  assert.equal(collectStaticCardEvents({ url: "https://arbitrary.example/", body }, options).records.length, 0);
});
