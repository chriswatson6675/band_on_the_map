// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — the new generic
// ingestion/aeg-presents/ collector, covering the real AEG-hosted card
// markup shared by Eventim Apollo and Watford Colosseum (both live-
// verified this package — see research/source-investigations/london-t2-
// eventim-apollo-03/ and london-t2-watford-colosseum-03/). The two
// venues genuinely differ in one respect this test exercises directly:
// their complete text date's own token order ("Weekday Dayth Month
// Year" vs "Weekday - Month Dayth Year").

import assert from "node:assert/strict";
import test from "node:test";
import { extractEventCards, toObservation, toObservations } from "../ingestion/aeg-presents/observation-adapter.mjs";
import { filterAegPresentsMusicRecords, MUSIC_GATE_INCLUDED_TITLES } from "../ingestion/aeg-presents/filter.mjs";

// Trimmed, real markup shape (Eventim Apollo: "Weekday Dayth Month Year").
const EVENTIM_HTML = `
<div class="search-item"
  data-start-month="september-2026" data-end-month="september-2026"
>
  <div class="card h-full  card--horizontal">
    <div class="card__info">
      <p class="date uppercase">Monday 21st September 2026</p>
      <h3 class="card__title">Judas Priest</h3>
      <p class="card__short-description">Plus special guests: Nevermore</p>
    </div>
    <div class="card__cta-link">
      <a class="btn ml-6" href="/events/judas-priest" target="_self">Information</a>
    </div>
    <a class="cover-link" href="/events/judas-priest"></a>
  </div>
</div>
<div class="search-item"
  data-start-month="september-2026" data-end-month="september-2026"
>
  <div class="card h-full  card--horizontal">
    <div class="card__info">
      <p class="date uppercase">Saturday 5th September 2026</p>
      <h3 class="card__title">Kanan Gill: Not This Again</h3>
    </div>
    <div class="card__cta-link">
      <a class="btn ml-6" href="/events/kanan-gill-not-this-again" target="_self">Information</a>
    </div>
    <a class="cover-link" href="/events/kanan-gill-not-this-again"></a>
  </div>
</div>
`;

// Trimmed, real markup shape (Watford Colosseum: "Weekday - Month Dayth Year").
const WATFORD_HTML = `
<div class="search-item"
  data-start-month="september-2026" data-end-month="september-2026"
  data-venue="watfordColosseum"
>
  <div class="card h-full mb-8  card--horizontal--event">
    <div class="card__info-wrap">
      <div class="card__info">
        <p class="card__info--event-date">Saturday - September 12th 2026</p>
        <h2 class="card__title mt-4">Fun Lovin' Criminals</h2>
        <p class="card__short-description">Live With The DiFontaine Orchestra</p>
      </div>
      <div class="card__cta-link">
        <a class="btn btn--slim btn--un-button" href="/events/fun-lovin-criminals" target="_self">Info</a>
      </div>
    </div>
  </div>
  <a class="cover-link" href="/events/fun-lovin-criminals"></a>
</div>
`;

test("extractEventCards finds every real card and resolves an absolute /events/<slug> detail URL, on both venues' own markup shapes", () => {
  const eventimCards = extractEventCards(EVENTIM_HTML, { baseUrl: "https://www.eventimapollo.com/events/" });
  assert.equal(eventimCards.length, 2);
  assert.equal(eventimCards[0].title, "Judas Priest");
  assert.equal(eventimCards[0].detailUrl, "https://www.eventimapollo.com/events/judas-priest");
  assert.equal(eventimCards[1].title, "Kanan Gill: Not This Again");

  const watfordCards = extractEventCards(WATFORD_HTML, { baseUrl: "https://www.watfordcolosseum.co.uk/events/" });
  assert.equal(watfordCards.length, 1);
  assert.equal(watfordCards[0].title, "Fun Lovin' Criminals");
  assert.equal(watfordCards[0].detailUrl, "https://www.watfordcolosseum.co.uk/events/fun-lovin-criminals");
});

test("date parsing is independent of the two venues' own differing token order — both resolve to the same correct calendar date shape", () => {
  const eventimCards = extractEventCards(EVENTIM_HTML, { baseUrl: "https://www.eventimapollo.com/events/" });
  const watfordCards = extractEventCards(WATFORD_HTML, { baseUrl: "https://www.watfordcolosseum.co.uk/events/" });

  const eventimObs = toObservation(eventimCards[0], { sourceId: "eventim-apollo-london", venueName: "Eventim Apollo", retrievedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(eventimObs.start.date, "2026-09-21");
  assert.equal(eventimObs.start.certainty, "DATE_ONLY");
  assert.equal(eventimObs.start.raw, "Monday 21st September 2026");

  const watfordObs = toObservation(watfordCards[0], { sourceId: "watford-colosseum-london", venueName: "Watford Colosseum", retrievedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(watfordObs.start.date, "2026-09-12");
  assert.equal(watfordObs.start.raw, "Saturday - September 12th 2026");
});

test("toObservation never invents a year — a date lacking a 4-digit year falls back to TEXT_ONLY certainty with no date", () => {
  const card = { title: "Some Show", dateText: "Saturday September 12th", detailUrl: "https://www.eventimapollo.com/events/some-show" };
  const observation = toObservation(card, { sourceId: "eventim-apollo-london", venueName: "Eventim Apollo", retrievedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(observation.start.date, null);
  assert.equal(observation.start.certainty, "TEXT_ONLY");
});

test("toObservation requires sourceId and a well-formed /events/{slug} detail URL — never guesses a source_record_id", () => {
  const card = { title: "X", dateText: "Monday 1st January 2027", detailUrl: "https://www.eventimapollo.com/events/x" };
  assert.throws(() => toObservation(card, { venueName: "Eventim Apollo" }), /requires sourceId/);
  assert.throws(
    () => toObservation({ ...card, detailUrl: "https://www.eventimapollo.com/not-events/x" }, { sourceId: "eventim-apollo-london" }),
    /does not match the expected/,
  );
});

test("toObservations builds one Observation per card, carrying the given sourceId/venueName through every one", () => {
  const cards = extractEventCards(EVENTIM_HTML, { baseUrl: "https://www.eventimapollo.com/events/" });
  const observations = toObservations(cards, { sourceId: "eventim-apollo-london", venueName: "Eventim Apollo", retrievedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(observations.length, 2);
  for (const observation of observations) {
    assert.equal(observation.source_id, "eventim-apollo-london");
    assert.equal(observation.venue_name, "Eventim Apollo");
    assert.equal(observation.event_url, observation.source_url);
  }
});

test("filterAegPresentsMusicRecords keeps only the curated, evidenced music titles for the given source — never a wider set", () => {
  const cards = extractEventCards(EVENTIM_HTML, { baseUrl: "https://www.eventimapollo.com/events/" });
  const observations = toObservations(cards, { sourceId: "eventim-apollo-london", venueName: "Eventim Apollo", retrievedAt: "2026-09-01T00:00:00.000Z" });
  const kept = filterAegPresentsMusicRecords("eventim-apollo-london", observations);
  assert.deepEqual(kept.map((o) => o.title), ["Judas Priest"]);
});

test("filterAegPresentsMusicRecords fails closed (keeps nothing) for a source with no curated inclusion list configured", () => {
  const observations = [{ title: "Judas Priest" }];
  assert.deepEqual(filterAegPresentsMusicRecords("watford-colosseum-london", observations), []);
  assert.deepEqual(filterAegPresentsMusicRecords("some-unconfigured-source", observations), []);
});

test("the curated inclusion list for eventim-apollo-london is non-empty and every title is a non-empty string", () => {
  const included = MUSIC_GATE_INCLUDED_TITLES["eventim-apollo-london"];
  assert.ok(included instanceof Set);
  assert.ok(included.size > 0);
  for (const title of included) {
    assert.equal(typeof title, "string");
    assert.notEqual(title.trim(), "");
  }
});
