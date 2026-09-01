// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — the new
// generic ingestion/squarespace-eventlist/ collector, covering both real
// Squarespace event-block shapes this package live-verified.

import assert from "node:assert/strict";
import test from "node:test";
import { extractEventCards, toObservation, toObservations } from "../ingestion/squarespace-eventlist/observation-adapter.mjs";

const EVENTLIST_HTML = `
<div class="eventlist eventlist--upcoming">
  <article class="eventlist-event eventlist-event--upcoming eventlist-event--hasimg eventlist-hasimg">
    <a href="/whatson/09/03-polica" class="eventlist-title-link">POLIÇA</a>
    <h1 class="eventlist-title"><a href="/whatson/09/03-polica" class="eventlist-title-link">POLIÇA</a></h1>
    <time class="event-date" datetime="2026-09-03">Thursday 3 September 2026</time>
  </article>
  <article class="eventlist-event eventlist-event--upcoming">
    <a href="/whatson/09/05-ratboys" class="eventlist-title-link">RATBOYS</a>
    <time class="event-date" datetime="2026-09-05">Saturday 5 September 2026</time>
  </article>
</div>
`;

const SUMMARY_ITEM_HTML = `
<div class="summary-item-list sqs-gallery">
  <div class="
      summary-item
      positioned
      summary-item-record-type-event
      sqs-gallery-design-autogrid-slide"
      data-upcoming-event-end="1788314400044">
    <a href="/events/14july" data-title="ROXY TUESDAYS " class="summary-thumbnail-container"></a>
  </div>
</div>
`;

test("extractEventCards finds every real card in the 'Events List' block shape, with absolute event_url and date-only certainty", () => {
  const cards = extractEventCards(EVENTLIST_HTML, { baseUrl: "https://www.domelondon.co.uk/whatson" });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, "POLIÇA");
  assert.equal(cards[0].eventUrl, "https://www.domelondon.co.uk/whatson/09/03-polica");
  assert.equal(cards[0].dateOnly, "2026-09-03");
  assert.equal(cards[1].title, "RATBOYS");
});

test("extractEventCards finds every real card in the 'Summary Block' event-record-type shape, using the real data-title attribute", () => {
  const cards = extractEventCards(SUMMARY_ITEM_HTML, { baseUrl: "https://www.theroxy.co.uk/whatson" });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, "ROXY TUESDAYS");
  assert.equal(cards[0].eventUrl, "https://www.theroxy.co.uk/events/14july");
  assert.equal(cards[0].endMs, 1788314400044);
});

test("extractEventCards de-duplicates by event_url", () => {
  const html = EVENTLIST_HTML + EVENTLIST_HTML; // deliberately doubled
  const cards = extractEventCards(html, { baseUrl: "https://www.domelondon.co.uk/whatson" });
  assert.equal(cards.length, 2);
});

test("extractEventCards throws on empty HTML and requires baseUrl", () => {
  assert.throws(() => extractEventCards("", { baseUrl: "https://example.test" }), /non-empty/);
  assert.throws(() => extractEventCards(EVENTLIST_HTML, {}), /baseUrl/);
});

test("toObservation builds a valid Observation with DATE_ONLY certainty for the eventlist shape", () => {
  const [card] = extractEventCards(EVENTLIST_HTML, { baseUrl: "https://www.domelondon.co.uk/whatson" });
  const observation = toObservation(card, { sourceId: "downstairs-at-the-dome-london", venueName: "Downstairs at The Dome", retrievedAt: "2026-09-01T00:00:00Z" });
  assert.equal(observation.source_id, "downstairs-at-the-dome-london");
  assert.equal(observation.venue_name, "Downstairs at The Dome");
  assert.equal(observation.title, "POLIÇA");
  assert.equal(observation.start.date, "2026-09-03");
  assert.equal(observation.start.certainty, "DATE_ONLY");
  assert.equal(observation.event_url, card.eventUrl);
});

test("toObservation requires sourceId", () => {
  const [card] = extractEventCards(EVENTLIST_HTML, { baseUrl: "https://www.domelondon.co.uk/whatson" });
  assert.throws(() => toObservation(card, { venueName: "X" }), /sourceId/);
});

test("toObservations filters out any card missing a title or event_url", () => {
  const cards = [{ title: "Real", eventUrl: "https://x.test/1", dateOnly: "2026-09-01" }, { title: null, eventUrl: "https://x.test/2" }];
  const observations = toObservations(cards, { sourceId: "x", venueName: "V", retrievedAt: "2026-09-01T00:00:00Z" });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].title, "Real");
});
