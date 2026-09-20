import assert from "node:assert/strict";
import test from "node:test";
import { collectStaticCardEvents } from "../ingestion/static-cards/collector.mjs";

const options = { sourceId: "arbitrary", venueName: "Arbitrary", cutoffDate: "2026-08-29" };
test("collects only card-local title, ISO time, and first-party detail evidence", () => {
  const body = '<h1>September events</h1><article class="event-card"><a href="/events/one">One</a><time datetime="2026-09-01T20:00:00+01:00"></time></article><article class="calendar-item"><a href="/events/two">Two</a><time datetime="2026-09-02"></time></article>';
  const result = collectStaticCardEvents({ url: "https://arbitrary.example/whats-on", body, at: "2026-08-29T00:00:00Z" }, options);
  assert.equal(result.records.length, 2); assert.equal(result.records[0].event_url, "https://arbitrary.example/events/one");
});
// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — a real
// Manchester source (The Bridgewater Hall) nests further `<div>`
// elements (an image figure, a heading wrapper, a meta block carrying
// the date, a CTA block) INSIDE its own card wrapper `<div>` before the
// card's true closing tag. The old "first closing tag of the same
// element type" search found the innermost nested div's own close,
// silently truncating the card down to its title alone and discarding
// the sibling block carrying the date — a real HTML-nesting gap that
// can affect any card markup using the same tag for a wrapper and its
// own descendants (a very common, ordinary pattern), not a
// Manchester-specific quirk.
test("a card whose date lives in a nested <div> AFTER an earlier same-tag <div> closes is still fully captured, not truncated at the first inner close", () => {
  const body = '<div class="c-event-item card"><figure><a href="/img"><img/></a></figure><div class="heading-wrap"><h3><a href="/whats-on/real-event">Real Event</a></h3></div><div class="meta"><p>20 September 2026</p></div></div>';
  const result = collectStaticCardEvents({ url: "https://arbitrary.example/whats-on", body, at: "2026-08-29T00:00:00Z" }, options);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].title, "Real Event");
  assert.equal(result.records[0].start_raw, "2026-09-20");
});

test("two sibling nested-div cards on the same page are each captured independently, with correct boundaries (no bleed between cards)", () => {
  const body = '<div class="event-card"><div class="wrap"><a href="/e/a">Event A</a></div><div class="meta"><p>1 September 2026</p></div></div><div class="event-card"><div class="wrap"><a href="/e/b">Event B</a></div><div class="meta"><p>2 September 2026</p></div></div>';
  const result = collectStaticCardEvents({ url: "https://arbitrary.example/whats-on", body, at: "2026-08-29T00:00:00Z" }, options);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((r) => r.title).sort(), ["Event A", "Event B"]);
  assert.deepEqual(result.records.map((r) => r.start_raw).sort(), ["2026-09-01", "2026-09-02"]);
});

test("rejects headings, cross-card fields, external links, missing date, and generic labels", () => {
  const body = '<h2>Heading Only</h2><article class="event-card"><a href="/events/a">A</a></article><article class="event-card"><time datetime="2026-09-01"></time></article><article class="event-card"><a href="https://tickets.example/a">External</a><time datetime="2026-09-01"></time></article><article class="event-card"><a href="/events/list">What\'s on</a><time datetime="2026-09-01"></time></article>';
  assert.equal(collectStaticCardEvents({ url: "https://arbitrary.example/", body }, options).records.length, 0);
});
