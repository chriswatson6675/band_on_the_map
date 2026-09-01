// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — Jamboree's bespoke Events-
// Manager (WordPress plugin) card parser, live-verified this package —
// see research/source-investigations/london-t2-jamboree-03/. Covers the
// real markup shape and the deterministic, source-exposed <h4>
// programme-note music gate (ingestion/jamboree/filter.mjs).

import assert from "node:assert/strict";
import test from "node:test";
import { extractEventCards, toObservation, toObservations, SOURCE_ID } from "../ingestion/jamboree/observation-adapter.mjs";
import { filterJamboreeMusicRecords } from "../ingestion/jamboree/filter.mjs";

// Trimmed, real markup shape — one genuine music card, one recurring
// class card, and one ambiguous spoken-word/open-mic card (all cited
// verbatim from this package's own live fetch).
const JAMBOREE_HTML = `
<div class="em em-view-container" id="em-view-1953946355" data-view="list-grouped">
<div class="em-list em-events-list em-events-list-grouped" id="em-events-list-grouped-1953946355">
<h2>Sep 2026</h2><div id="events-list-page">
<div class="event-item" id="event-8305">
<div class="event-blurb">
<div class="event-list-image">
<a href="https://www.jamboreevenue.co.uk/events/live-irish-and-celtic-folk-music-in-london-23/" class="eventTitle" title="Celtic Session"></a>
</div>
<span class="event-date-dn">Tuesday 1 September 2026</span><br/>
<h3><a href="https://www.jamboreevenue.co.uk/events/live-irish-and-celtic-folk-music-in-london-23/" title="More info about Celtic Session">Celtic Session</a></h3>
<h4>Live Music from 8.30pm</h4>
</div>
</div>
<div class="event-item" id="event-8320">
<div class="event-blurb">
<div class="event-list-image">
<a href="https://www.jamboreevenue.co.uk/events/life-drawing-class-in-london-39/" class="eventTitle" title="A Life Drawing Class"></a>
</div>
<span class="event-date-dn">Wednesday 2 September 2026</span><br/>
<h3><a href="https://www.jamboreevenue.co.uk/events/life-drawing-class-in-london-39/" title="More info">A Life Drawing Class by North London Life Drawing (Longer Poses)</a></h3>
<h4>Class Runs from 11am-1pm</h4>
</div>
</div>
<div class="event-item" id="event-8341">
<div class="event-blurb">
<div class="event-list-image">
<a href="https://www.jamboreevenue.co.uk/events/word-space-42/" class="eventTitle" title="Word Space"></a>
</div>
<span class="event-date-dn">Thursday 3 September 2026</span><br/>
<h3><a href="https://www.jamboreevenue.co.uk/events/word-space-42/" title="More info">Word Space</a></h3>
<h4>Open mic sign-ups from 6.15pm / Live performance from 7pm</h4>
</div>
</div>
</div>
</div>
</div>
`;

test("extractEventCards finds every real card, with an absolute /events/<slug>/ detail URL and the card's own <h4> programme note preserved", () => {
  const cards = extractEventCards(JAMBOREE_HTML, { baseUrl: "https://www.jamboreevenue.co.uk/upcoming-events/" });
  assert.equal(cards.length, 3);
  assert.equal(cards[0].title, "Celtic Session");
  assert.equal(cards[0].detailUrl, "https://www.jamboreevenue.co.uk/events/live-irish-and-celtic-folk-music-in-london-23/");
  assert.equal(cards[0].programmeNote, "Live Music from 8.30pm");
  assert.equal(cards[1].programmeNote, "Class Runs from 11am-1pm");
  assert.equal(cards[2].programmeNote, "Open mic sign-ups from 6.15pm / Live performance from 7pm");
});

test("date parsing handles this source's own day format (no ordinal suffix, e.g. '1' not '1st') without inventing a year", () => {
  const cards = extractEventCards(JAMBOREE_HTML, { baseUrl: "https://www.jamboreevenue.co.uk/upcoming-events/" });
  const observation = toObservation(cards[0], { retrievedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(observation.start.date, "2026-09-01");
  assert.equal(observation.start.certainty, "DATE_ONLY");
  assert.equal(observation.start.raw, "Tuesday 1 September 2026");
});

test("toObservation hardcodes venue_name 'Jamboree' (single-venue source) and derives source_record_id from the permalink slug", () => {
  const cards = extractEventCards(JAMBOREE_HTML, { baseUrl: "https://www.jamboreevenue.co.uk/upcoming-events/" });
  const observation = toObservation(cards[0], { retrievedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(observation.source_id, SOURCE_ID);
  assert.equal(observation.venue_name, "Jamboree");
  assert.equal(observation.source_record_id, "live-irish-and-celtic-folk-music-in-london-23");
  assert.equal(observation.event_url, observation.source_url);
});

test("toObservation requires card.detailUrl and a well-formed /events/{slug}/ shape", () => {
  assert.throws(() => toObservation(null), /requires card.detailUrl/);
  assert.throws(
    () => toObservation({ title: "X", dateText: "1 January 2027", detailUrl: "https://www.jamboreevenue.co.uk/not-events/x/" }),
    /does not match the expected/,
  );
});

test("filterJamboreeMusicRecords keeps only cards whose own programme_note contains 'Live Music' — a genuine music event without that exact substring is conservatively excluded", () => {
  const cards = extractEventCards(JAMBOREE_HTML, { baseUrl: "https://www.jamboreevenue.co.uk/upcoming-events/" });
  const observations = toObservations(cards, { retrievedAt: "2026-09-01T00:00:00.000Z" });
  const kept = filterJamboreeMusicRecords(observations);
  assert.deepEqual(kept.map((o) => o.title), ["Celtic Session"]);
  // "Word Space" says "Live performance", not "Live Music" — excluded per
  // this filter's own documented conservative default.
  assert.ok(!kept.some((o) => o.title === "Word Space"));
  assert.ok(!kept.some((o) => o.title.includes("Life Drawing")));
});

test("filterJamboreeMusicRecords excludes a card with no programme_note at all, never guessing it is music", () => {
  const observations = [{ title: "Mystery Event", source_fields: {} }, { title: "Mystery Event 2" }];
  assert.deepEqual(filterJamboreeMusicRecords(observations), []);
});
