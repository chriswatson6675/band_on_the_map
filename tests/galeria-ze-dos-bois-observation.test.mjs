import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isMusicRecord, parseZdbProgramme, filterMusicRecords } from "../ingestion/galeria-ze-dos-bois/discovery.mjs";
import {
  SOURCE_ID,
  parseZdbDayText,
  parseZdbHourText,
  toObservation,
  toObservations,
} from "../ingestion/galeria-ze-dos-bois/observation-adapter.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

async function loadFixtureRecords() {
  const html = await readFile(new URL("../fixtures/galeria-ze-dos-bois/programme-excerpt.html", import.meta.url), "utf8");
  return parseZdbProgramme(html);
}

// 1. fixture acquisition/parsing

test("discovery extracts every real entry on the retained programme excerpt", async () => {
  const records = await loadFixtureRecords();
  assert.equal(records.length, 6);
  assert.deepEqual(
    records.map((r) => r.source_record_id),
    ["mike-tysons-worst-nightmare", "ana-roxanne-apresenta-poem-1", "fatboi-sharif", "ajax", "super-ballet-geordie-greep", "cloud-nothings"],
  );
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseZdbProgramme(""), /non-empty/);
});

test("discovery returns an empty array for a page with no article items, without throwing", () => {
  assert.deepEqual(parseZdbProgramme("<html><body>no programme here</body></html>"), []);
});

test("discovery deduplicates by permalink slug (first occurrence order kept)", () => {
  const html = `<article class="col-md-12 thumb"><a href="https://zedosbois.org/en/programa/dup/">
    <div class='area'>Music</div><div class='categorias'>Concerts</div>
    <h3>First</h3>
    <div class="thumb-date"><span class="week">Mon</span><span class="day">01.09.26</span><span class="hour">09:00PM</span></div>
    <div class="thumb-local">Galeria Zé dos Bois</div>
  </a></article><article class="col-md-12 thumb"><a href="https://zedosbois.org/en/programa/dup/">
    <div class='area'>Music</div><div class='categorias'>Concerts</div>
    <h3>Second</h3>
    <div class="thumb-date"><span class="week">Tue</span><span class="day">02.09.26</span><span class="hour">09:00PM</span></div>
    <div class="thumb-local">Galeria Zé dos Bois</div>
  </a></article>`;
  const records = parseZdbProgramme(html);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "First");
});

// 2. stable ID derivation

test("source_record_id is the permalink slug, and event_url is derived from it", async () => {
  const records = await loadFixtureRecords();
  for (const record of records) {
    assert.ok(record.source_record_id);
    assert.equal(record.event_url, `https://zedosbois.org/en/programa/${record.source_record_id}/`);
  }
});

// entity decoding

test("HTML entities in title text are decoded", async () => {
  const records = await loadFixtureRecords();
  const mike = records.find((r) => r.source_record_id === "mike-tysons-worst-nightmare");
  assert.equal(mike.title, "Mike Tyson’s Worst Nightmare");
});

// 3. full date derivation

test("parseZdbDayText reads this source's own DD.MM.YY as a real ISO calendar date", () => {
  assert.equal(parseZdbDayText("09.09.26"), "2026-09-09");
  assert.equal(parseZdbDayText("21.11.26"), "2026-11-21");
});

test("parseZdbDayText fails closed on an unrecognised shape", () => {
  assert.equal(parseZdbDayText("2026-09-09"), null);
  assert.equal(parseZdbDayText(null), null);
});

test("parseZdbHourText converts this source's own 12-hour text to 24-hour HH:MM", () => {
  assert.equal(parseZdbHourText("09:30PM"), "21:30");
  assert.equal(parseZdbHourText("09:00AM"), "09:00");
  assert.equal(parseZdbHourText("12:00AM"), "00:00");
  assert.equal(parseZdbHourText("12:00PM"), "12:00");
});

test("start.date/certainty are derived correctly end-to-end for real music entries", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  const fatboi = observations.find((o) => o.source_record_id === "fatboi-sharif");
  assert.equal(fatboi.start.date, "2026-09-10");
  assert.equal(fatboi.start.certainty, "FLOATING_LOCAL");
  assert.equal(fatboi.start.raw, "Thu 10.09.26 21:00");
});

// 4. ambiguous/missing dates fail closed

test("a multi-day range with no year on its own leading portion is never fabricated into a date", () => {
  const obs = toObservation(
    {
      source_record_id: "x",
      title: "t",
      area: "Music",
      categories: ["Concerts"],
      day_text: null,
      week_text: null,
      hour_text: null,
      date_range_text: "23.05 — 26.09.26",
      local: "Galeria Zé dos Bois",
      event_url: "https://zedosbois.org/en/programa/x/",
    },
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "TEXT_ONLY");
  assert.equal(obs.start.raw, "23.05 — 26.09.26");
});

test("a genuinely absent date entirely never fabricates a date", () => {
  const obs = toObservation(
    {
      source_record_id: "x",
      title: "t",
      area: "Music",
      categories: ["Concerts"],
      day_text: null,
      date_range_text: null,
      local: "Galeria Zé dos Bois",
      event_url: "https://zedosbois.org/en/programa/x/",
    },
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "UNKNOWN");
});

// 5. music filtering

test("isMusicRecord/filterMusicRecords keep only area=Music + category=Concerts, excluding Exhibitions/Workshops/Theater", async () => {
  const records = await loadFixtureRecords();
  const music = filterMusicRecords(records);
  assert.deepEqual(
    music.map((r) => r.source_record_id).sort(),
    ["ana-roxanne-apresenta-poem-1", "cloud-nothings", "fatboi-sharif", "super-ballet-geordie-greep"],
  );
  for (const record of music) assert.equal(isMusicRecord(record), true);

  const excluded = records.filter((r) => !music.includes(r));
  assert.deepEqual(excluded.map((r) => r.source_record_id).sort(), ["ajax", "mike-tysons-worst-nightmare"]);
  assert.equal(isMusicRecord(excluded.find((r) => r.source_record_id === "ajax")), false);
});

// 6/7. event URL and source URL retained

test("event_url and source_url are retained on every Observation", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, {
    retrievedAt: "2026-08-24T00:00:00.000Z",
    sourceUrl: "https://zedosbois.org/en/programme/",
  });
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://zedosbois.org/en/programa/"));
    assert.equal(o.source_url, "https://zedosbois.org/en/programme/");
  }
});

// 8. venue evidence retained (genuinely multi-location — retained honestly, not merged)

test("venue_name carries this source's own per-entry local text honestly, including off-site venues", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  const byId = Object.fromEntries(observations.map((o) => [o.source_record_id, o]));
  assert.equal(byId["fatboi-sharif"].venue_name, "Galeria Zé dos Bois");
  assert.equal(byId["ana-roxanne-apresenta-poem-1"].venue_name, "Igreja St. George");
  assert.equal(byId["super-ballet-geordie-greep"].venue_name, "LAV - Lisboa Ao Vivo");
});

// 9. Observation contract valid / no direct Event writes

test("every Observation is a valid Observation, never a canonical Event field", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "galeria-ze-dos-bois");
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

// 12/13. venue resolution: only the exact-evidenced "Galeria Zé dos Bois" string resolves; off-site strings stay honestly UNRESOLVED

test("only the exact 'Galeria Zé dos Bois' venue_name resolves, via the DATA-DRIVEN mapping — off-site venue_names stay UNRESOLVED, never guessed", async () => {
  const records = filterMusicRecords(await loadFixtureRecords());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  const byId = Object.fromEntries(observations.map((o) => [o.source_record_id, o]));

  const home = resolveObservation(byId["fatboi-sharif"]);
  assert.equal(home.resolution_status, "RESOLVED");
  assert.equal(home.venue_id, "venue-lisboa-galeria-ze-dos-bois-zdb");
  assert.equal(home.resolution_method, "DATA_DRIVEN_MAPPING:VENUE_NAME");

  const offsite1 = resolveObservation(byId["ana-roxanne-apresenta-poem-1"]);
  assert.equal(offsite1.resolution_status, "UNRESOLVED");
  assert.equal(offsite1.venue_id, null);

  const offsite2 = resolveObservation(byId["super-ballet-geordie-greep"]);
  assert.equal(offsite2.resolution_status, "UNRESOLVED");
});
