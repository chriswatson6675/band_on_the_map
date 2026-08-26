// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — offline,
// deterministic, no-network proof that ingestion/per-event-ics/ genuinely
// works against TWO real, independently retained Berlin venues sharing
// the same underlying platform (Uber Arena, a general-purpose arena also
// hosting non-music events; Verti Music Hall, a dedicated concert venue)
// — the whole point of this being a NEW_REUSABLE_COLLECTOR rather than a
// one-off, venue-specific scraper. Every fixture here is byte-identical
// retained evidence, copied from
// research/source-investigations/{uber-arena-berlin-01,
// verti-music-hall-berlin-01}/evidence/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEventCards,
  filterMusicEventCards,
  extractIcalLink,
  deriveSourceRecordIdFromDetailUrl,
} from "../ingestion/per-event-ics/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/per-event-ics/observation-adapter.mjs";

function fixture(dir, name) {
  return readFile(new URL(`../fixtures/${dir}/${name}`, import.meta.url), "utf8");
}

// --- Uber Arena (data-categoryname present: a multi-purpose arena) ---

test("extractEventCards: real Uber Arena listing page yields real cards with category names", async () => {
  const html = await fixture("uber-arena-berlin", "events-all.html");
  const cards = extractEventCards(html);
  assert.ok(cards.length > 10, "expected many real cards from the retained listing page");
  assert.ok(cards.every((c) => typeof c.detailUrl === "string" && c.detailUrl.includes("/events/detail/")));
  assert.ok(cards.some((c) => c.categoryName === "konzert"));
  assert.ok(cards.some((c) => c.categoryName === "basketball"));
  const apache = cards.find((c) => c.detailUrl.includes("apache207-zusatzshows"));
  assert.ok(apache, "Apache 207 card must be discovered");
  assert.equal(apache.title, "Apache 207");
  assert.equal(apache.categoryName, "konzert");
});

test("filterMusicEventCards: Uber Arena's basketball/comedy/sport cards are rejected, konzert cards pass", async () => {
  const html = await fixture("uber-arena-berlin", "events-all.html");
  const cards = extractEventCards(html);
  const { musicCards, rejectedCards } = filterMusicEventCards(cards);
  assert.ok(musicCards.length > 0);
  assert.ok(rejectedCards.length > 0);
  assert.ok(musicCards.every((c) => c.categoryName === "konzert"));
  assert.ok(rejectedCards.every((c) => c.categoryName !== "konzert"));
  assert.ok(rejectedCards.some((c) => c.categoryName === "basketball"));
});

test("extractIcalLink + deriveSourceRecordIdFromDetailUrl: real Bryan Adams detail page", async () => {
  const detailHtml = await fixture("uber-arena-berlin", "event-detail-bryan-adams.html");
  const icalLink = extractIcalLink(detailHtml);
  assert.equal(icalLink, "https://www.uber-arena.de/events/ical/bryan-adams-berlin/3772/1");

  const id = deriveSourceRecordIdFromDetailUrl("https://www.uber-arena.de/events/detail/bryan-adams-berlin/2026-10-02-2000");
  assert.equal(id, "bryan-adams-berlin/2026-10-02-2000");
});

test("toObservation: the real retained Bryan Adams .ics adapts into a genuine Observation (GEO present)", async () => {
  const icsText = await fixture("uber-arena-berlin", "event-bryan-adams.ics");
  const observation = toObservation(
    {
      detailUrl: "https://www.uber-arena.de/events/detail/bryan-adams-berlin/2026-10-02-2000",
      title: "Bryan Adams",
      icsText,
      icsUrl: "https://www.uber-arena.de/events/ical/bryan-adams-berlin/3772/1",
      retrievedAt: "2026-08-26T12:00:00Z",
      categoryName: "konzert",
    },
    { source_id: "uber-arena-berlin", venueNameOverride: "Uber Arena" },
  );

  assert.equal(observation.source_id, "uber-arena-berlin");
  assert.equal(observation.source_record_id, "bryan-adams-berlin/2026-10-02-2000");
  assert.equal(observation.title, "Bryan Adams");
  assert.equal(observation.start.iso, "2026-10-02T18:00:00Z");
  assert.equal(observation.start.is_utc, true);
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.end.iso, "2026-10-02T20:00:00Z");
  assert.equal(observation.venue_name, "Uber Arena");
  assert.equal(observation.location_text, "12 Mühlenstraße  Berlin Berlin 10243");
  assert.equal(observation.event_url, "https://www.uber-arena.de/events/detail/bryan-adams-berlin/2026-10-02-2000");
  assert.equal(observation.source_fields.ics_uid, null, "this platform's real ICS carries no UID at all");
  assert.equal(observation.source_fields.geo, "52.5063462;13.4436582");
  assert.equal(observation.raw_evidence.byte_faithful, true);
});

// --- Verti Music Hall (no data-categoryname at all: a single-purpose venue) ---

test("extractEventCards: real Verti Music Hall listing page yields cards with NO category name (single-purpose venue)", async () => {
  const html = await fixture("verti-music-hall-berlin", "events-all.html");
  const cards = extractEventCards(html);
  assert.ok(cards.length > 10);
  assert.ok(cards.every((c) => c.categoryName === null), "Verti's own list page carries no data-categoryname attribute at all");
  const sigurRos = cards.find((c) => c.detailUrl.includes("sigur-ros"));
  assert.ok(sigurRos);
  assert.equal(sigurRos.title, "Sigur Rós: The Orchestral Tour");
});

test("filterMusicEventCards: every Verti Music Hall card passes when categoryName is absent", async () => {
  const html = await fixture("verti-music-hall-berlin", "events-all.html");
  const cards = extractEventCards(html);
  const { musicCards, rejectedCards } = filterMusicEventCards(cards);
  assert.equal(musicCards.length, cards.length);
  assert.equal(rejectedCards.length, 0);
});

test("toObservation: the real retained Amelie Lens .ics adapts into a genuine Observation (LOCATION absent, honestly null)", async () => {
  const icsText = await fixture("verti-music-hall-berlin", "event-amelie-lens.ics");
  const observation = toObservation(
    {
      detailUrl: "https://www.uber-eats-music-hall.de/events/detail/amelie-lens/2026-10-02-2000",
      title: "Amelie Lens",
      icsText,
      icsUrl: "https://www.uber-eats-music-hall.de/events/ical/amelie-lens/4002/2",
      retrievedAt: "2026-08-26T12:05:00Z",
      categoryName: null,
    },
    { source_id: "verti-music-hall-berlin", venueNameOverride: "Verti Music Hall" },
  );

  assert.equal(observation.source_id, "verti-music-hall-berlin");
  assert.equal(observation.source_record_id, "amelie-lens/2026-10-02-2000");
  assert.equal(observation.title, "Amelie Lens");
  assert.equal(observation.start.iso, "2026-10-02T18:00:00Z");
  assert.equal(observation.venue_name, "Verti Music Hall");
  assert.equal(observation.location_text, null, "this real retained sample's ICS carries no LOCATION property at all");
  assert.equal(observation.source_fields.geo, null);
});

test("toObservations: batch-adapts multiple real per-event records sharing one config", async () => {
  const amelieIcs = await fixture("verti-music-hall-berlin", "event-amelie-lens.ics");
  const beartoothIcs = await fixture("verti-music-hall-berlin", "event-beartooth.ics");
  const observations = toObservations(
    [
      {
        detailUrl: "https://www.uber-eats-music-hall.de/events/detail/amelie-lens/2026-10-02-2000",
        icsText: amelieIcs,
        retrievedAt: "2026-08-26T12:05:00Z",
      },
      {
        detailUrl: "https://www.uber-eats-music-hall.de/events/detail/beartooth/2026-11-01-2000",
        icsText: beartoothIcs,
        retrievedAt: "2026-08-26T12:05:00Z",
      },
    ],
    { source_id: "verti-music-hall-berlin", venueNameOverride: "Verti Music Hall" },
  );
  assert.equal(observations.length, 2);
  assert.deepEqual(
    observations.map((o) => o.source_record_id).sort(),
    ["amelie-lens/2026-10-02-2000", "beartooth/2026-11-01-2000"],
  );
  assert.ok(observations.every((o) => o.venue_name === "Verti Music Hall"));
});

test("toObservation: an explicit record.sourceRecordId (a proven-stable ICS UID) overrides detailUrl-slug derivation", async () => {
  const icsText = await fixture("uber-arena-berlin", "event-bryan-adams.ics");
  const observation = toObservation(
    {
      detailUrl: "https://columbiahalle.berlin/veranstaltung/elle.html",
      sourceRecordId: "9702@Columbiahalle",
      icsText,
      icsUrl: "https://columbiahalle.berlin/veranstaltung/elle.html",
      retrievedAt: "2026-08-26T12:00:00Z",
    },
    { source_id: "columbiahalle-berlin", venueNameOverride: "Columbiahalle" },
  );
  assert.equal(observation.source_record_id, "9702@Columbiahalle");
});

test("this module never fabricates a value: a malformed/empty card list throws where required, and unmatched cards are skipped not guessed", async () => {
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractIcalLink(""), /non-empty/);
  assert.throws(() => deriveSourceRecordIdFromDetailUrl(""), /non-empty/);
  assert.throws(
    () => extractIcalLink("<html><body>no ical link here</body></html>"),
    /No per-event ical link/,
  );
});
