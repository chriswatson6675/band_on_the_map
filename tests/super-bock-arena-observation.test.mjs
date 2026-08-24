import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MUSIC_CATEGORY_SLUGS,
  parseSuperBockArenaAgenda,
  filterMusicRecords,
} from "../ingestion/super-bock-arena/discovery.mjs";
import {
  SOURCE_ID,
  parseSuperBockArenaDate,
  toObservation,
  toObservations,
} from "../ingestion/super-bock-arena/observation-adapter.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

async function loadFixtureRecords() {
  const html = await readFile(new URL("../fixtures/super-bock-arena/agenda-excerpt.html", import.meta.url), "utf8");
  return parseSuperBockArenaAgenda(html);
}

// 1. fixture acquisition/parsing

test("discovery extracts every real event on the retained agenda excerpt", async () => {
  const records = await loadFixtureRecords();
  assert.equal(records.length, 6);
  assert.deepEqual(
    records.map((r) => r.source_record_id),
    ["7755", "7515", "7416", "7149", "7642", "7776"],
  );
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseSuperBockArenaAgenda(""), /non-empty/);
});

test("discovery returns an empty array for a page with no event blocks, without throwing", () => {
  assert.deepEqual(parseSuperBockArenaAgenda("<html><body>no events here</body></html>"), []);
});

test("discovery deduplicates by WordPress post id (first occurrence order kept)", () => {
  const html = `<div class="tribe-events-loop"><div class="sba-month-list">
    <div id="post-9" class="type-tribe_events post-9 tribe-events-category-pop-rock" title="X">
      <h3 class="tribe-events-list-event-title"><a class="tribe-event-url" href="https://www.superbockarena.pt/evento/x/" title="First">First</a></h3>
      <span class="tribe-event-date-start">1 Setembro, 21:00</span>
    </div>
    <div id="post-9" class="type-tribe_events post-9 tribe-events-category-pop-rock" title="X">
      <h3 class="tribe-events-list-event-title"><a class="tribe-event-url" href="https://www.superbockarena.pt/evento/x/" title="Second">Second</a></h3>
      <span class="tribe-event-date-start">2 Setembro, 21:00</span>
    </div>
  </div></div>`;
  const records = parseSuperBockArenaAgenda(html);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "First");
});

// 2. stable ID derivation

test("source_record_id is the WordPress post id embedded in id=\"post-{id}\"", async () => {
  const records = await loadFixtureRecords();
  for (const record of records) {
    assert.match(record.source_record_id, /^\d+$/);
  }
});

// month-header attribution (the specific live off-by-one this collector must avoid)

test("a card's own trailing month-header separator governs the NEXT card, never itself", async () => {
  const records = await loadFixtureRecords();
  const byId = Object.fromEntries(records.map((r) => [r.source_record_id, r]));
  // Live evidence: Placebo (28 Setembro) sits physically before the
  // "Outubro 2026" <h2> separator in the source's own markup — its own
  // month_header_text must still read "Setembro 2026", matching its own
  // date_text's month, not the header that trails after it.
  assert.equal(byId["7416"].month_header_text, "Setembro 2026");
  assert.equal(byId["7416"].date_text, "28 Setembro, 20:00");
});

// 3. full date derivation

test("parseSuperBockArenaDate combines a same-year card (no year in its own text) with its governing month-header year", () => {
  assert.deepEqual(parseSuperBockArenaDate("28 Setembro, 20:00", "Setembro 2026"), { date: "2026-09-28" });
  assert.deepEqual(parseSuperBockArenaDate("9 Outubro, 21:00", "Outubro 2026"), { date: "2026-10-09" });
});

test("parseSuperBockArenaDate uses the card's OWN year when the text already states one, never the header", () => {
  assert.deepEqual(parseSuperBockArenaDate("6 Novembro 2027, 21:30", "Novembro 2027"), { date: "2027-11-06" });
  assert.deepEqual(parseSuperBockArenaDate("6 Novembro 2027, 21:30", "Dezembro 2026"), { date: "2027-11-06" });
});

test("parseSuperBockArenaDate fails closed on a card/header month mismatch, never guesses", () => {
  assert.equal(parseSuperBockArenaDate("28 Setembro, 20:00", "Outubro 2026"), null);
});

test("parseSuperBockArenaDate fails closed with no header and no year in the card's own text", () => {
  assert.equal(parseSuperBockArenaDate("28 Setembro, 20:00", null), null);
});

test("start.date/certainty are derived correctly end-to-end for the real Placebo and Tiago Bettencourt records", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  const placebo = observations.find((o) => o.source_record_id === "7416");
  assert.equal(placebo.start.date, "2026-09-28");
  assert.equal(placebo.start.certainty, "FLOATING_LOCAL");
  assert.equal(placebo.start.raw, "28 Setembro, 20:00");

  const tiago = observations.find((o) => o.source_record_id === "7776");
  assert.equal(tiago.start.date, "2027-11-06");
  assert.equal(tiago.start.certainty, "FLOATING_LOCAL");
});

// 4. ambiguous/missing dates fail closed

test("an unparseable date_text never fabricates a date", () => {
  const obs = toObservation(
    { source_record_id: "1", title: "t", categories: ["pop-rock"], date_text: "algures em setembro", month_header_text: "Setembro 2026" },
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "TEXT_ONLY");
});

test("a genuinely absent date_text never fabricates a date", () => {
  const obs = toObservation(
    { source_record_id: "1", title: "t", categories: ["pop-rock"], date_text: null, month_header_text: null },
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "UNKNOWN");
});

// 5. music filtering

test("filterMusicRecords excludes this venue's own non-music categories (gaming, circo) and keeps genuine concerts", async () => {
  const records = await loadFixtureRecords();
  const music = filterMusicRecords(records);
  assert.deepEqual(
    music.map((r) => r.source_record_id).sort(),
    ["7149", "7416", "7515", "7776"],
  );
  const excluded = records.filter((r) => !music.includes(r));
  assert.deepEqual(excluded.map((r) => r.source_record_id).sort(), ["7642", "7755"]);
  for (const record of music) {
    assert.ok(record.categories.some((c) => MUSIC_CATEGORY_SLUGS.has(c)));
  }
});

test("a record with a music tag AND a non-music tag is still kept (the venue's own taxonomy already asserts it is music)", () => {
  const records = parseSuperBockArenaAgenda(
    `<div class="tribe-events-loop"><div class="sba-month-list">
      <div id="post-1" class="type-tribe_events post-1 tribe-events-category-concertos-en tribe-events-category-stand-up-comedy" title="X">
        <h3 class="tribe-events-list-event-title"><a class="tribe-event-url" href="https://x/" title="X">X</a></h3>
        <span class="tribe-event-date-start">1 Setembro, 21:00</span>
      </div>
    </div></div>`,
  );
  assert.equal(filterMusicRecords(records).length, 1);
});

// 6/7. event URL and source URL retained

test("event_url and source_url are retained on every Observation", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, {
    retrievedAt: "2026-08-24T00:00:00.000Z",
    sourceUrl: "https://www.superbockarena.pt/agenda/",
  });
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://www.superbockarena.pt/evento/"));
    assert.equal(o.source_url, "https://www.superbockarena.pt/agenda/");
  }
});

// 8. venue evidence retained (this source is a fixed single venue — resolved by source_id, not per-record)

test("venue_name/location_text are honestly null — this listing covers only one fixed venue, resolved by source_id", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    assert.equal(o.venue_name, null);
    assert.equal(o.location_text, null);
  }
});

// 9. Observation contract valid / no direct Event writes

test("every Observation is a valid Observation, never a canonical Event field", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "super-bock-arena");
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
  }
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

// 10. deterministic rerun

test("adaptation is deterministic against the same retained fixture", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  assert.deepEqual(
    toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" }),
    toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" }),
  );
});

// 12/13. venue resolution is data-driven (venues/source-venue-mappings.json), no new hardcoded resolver branch

test("super-bock-arena Observations resolve to the already-canonical arena venue via the DATA-DRIVEN mapping, not a new hardcoded resolver branch", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    const resolution = resolveObservation(o);
    assert.equal(resolution.resolution_status, "RESOLVED");
    assert.equal(resolution.venue_id, "venue-porto-super-bock-arena-pavilhao-rosa-mota");
    assert.equal(resolution.resolution_method, "DATA_DRIVEN_MAPPING:SOURCE_ID");
  }
});
