import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MUSIC_TAG,
  parseCmGaiaEventosAgenda,
  filterMusicRecords,
  parseCmGaiaEventosNextPageUrl,
} from "../ingestion/cm-gaia-eventos/discovery.mjs";
import {
  SOURCE_ID,
  parseGaiaDateText,
  toObservation,
  toObservations,
} from "../ingestion/cm-gaia-eventos/observation-adapter.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/cm-gaia-eventos/${name}`, import.meta.url), "utf8");
}

async function loadPage1Records() {
  return parseCmGaiaEventosAgenda(await loadFixture("eventos-page-1-excerpt.html"));
}

async function loadPage2Records() {
  return parseCmGaiaEventosAgenda(await loadFixture("eventos-page-2-excerpt.html"));
}

// 1. fixture acquisition/parsing

test("discovery extracts every real item on the retained page-1 excerpt, every category honestly", async () => {
  const records = await loadPage1Records();
  assert.equal(records.length, 5);
  assert.deepEqual(
    records.map((r) => r.tag),
    ["desporto", "música", "infância", "música", "música"],
  );
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseCmGaiaEventosAgenda(""), /non-empty/);
});

test("discovery returns an empty array for a page with no events-list block, without throwing", () => {
  assert.deepEqual(parseCmGaiaEventosAgenda("<html><body>no listing here</body></html>"), []);
});

// 2. stable ID derivation

test("source_record_id is the permalink slug, and event_url is derived from it", async () => {
  const records = await loadPage1Records();
  for (const record of records) {
    assert.ok(record.source_record_id);
    assert.equal(record.event_url, `https://www.cm-gaia.pt/pt/eventos/${record.source_record_id}/`);
  }
});

test("discovery deduplicates by slug (first occurrence order kept)", () => {
  const html = `<ul class="blocoEventosList -events">
    <li><a href="/pt/eventos/dup/"><img/></a><span><span class="tag"><a># música</a></span><span class="data">01 Set 2026</span><span class="titulo"><a>First</a></span><span class="descricao">d</span></span></li>
    <li><a href="/pt/eventos/dup/"><img/></a><span><span class="tag"><a># música</a></span><span class="data">02 Set 2026</span><span class="titulo"><a>Second</a></span><span class="descricao">d</span></span></li>
  </ul>`;
  const records = parseCmGaiaEventosAgenda(html);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "First");
});

// entity decoding (real evidence: titles/alt text on this source are
// HTML-entity-encoded, e.g. "&amp;")

test("HTML entities in title text are decoded", async () => {
  const records = await loadPage1Records();
  const douroBridges = records.find((r) => r.source_record_id === "douro-bridges-porto-gaia-open-water-2026");
  assert.equal(douroBridges.title, "Douro Bridges - Porto & Gaia Open Water 2026");
});

// 3. full date derivation — every real shape this source uses

test("parseGaiaDateText handles every real shape observed live", () => {
  assert.deepEqual(parseGaiaDateText("20 Set 2026"), { day: "20", month: "09", year: "2026" });
  assert.deepEqual(parseGaiaDateText("11 e 12 Set 2026"), { day: "11", month: "09", year: "2026" });
  assert.deepEqual(parseGaiaDateText("01 a 31 Ago 2026"), { day: "01", month: "08", year: "2026" });
  assert.deepEqual(parseGaiaDateText("19 Set a 17 Out 2026"), { day: "19", month: "09", year: "2026" });
  assert.deepEqual(parseGaiaDateText("24 Abr 2026 a 30 Abr 2027"), { day: "24", month: "04", year: "2026" });
});

test("start.date/certainty are derived correctly for a single-day música record", async () => {
  const records = await loadPage1Records();
  const nunca = records.find((r) => r.source_record_id === "nunca-mates-o-mandarim");
  const [obs] = toObservations([nunca], { retrievedAt: "2026-08-24T12:38:27.000Z" });
  assert.equal(obs.start.date, "2026-08-29");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  // This source's own "&nbsp;"-joined date text decodes (via the shared
  // ingestion/rss/parse.mjs entity table) to real U+00A0 characters, not
  // plain spaces — retained faithfully rather than silently normalised.
  assert.equal(obs.start.raw, "29 Ago 2026");
});

test("start.date is the FIRST day of a cross-month range", async () => {
  const records = await loadPage1Records();
  const fimg = records.find((r) => r.source_record_id === "32-festival-internacional-de-musica-de-gaia");
  const [obs] = toObservations([fimg], { retrievedAt: "2026-08-24T12:38:27.000Z" });
  assert.equal(obs.start.date, "2026-09-19");
  assert.equal(obs.start.certainty, "DATE_ONLY");
});

test("start.date is the FIRST day of a cross-year range (year taken from the range's own first year, not its last)", async () => {
  const records = await loadPage2Records();
  const incendios = records.find((r) => r.source_record_id === "incendios-rurais-o-que-fazer-antes-durante-e-depois");
  const [obs] = toObservations([incendios], { retrievedAt: "2026-08-24T12:38:27.000Z" });
  assert.equal(obs.start.date, "2026-04-24");
  assert.equal(obs.start.certainty, "DATE_ONLY");
});

// 4. missing/ambiguous dates fail closed

test("a genuinely empty date field never fabricates a date: start.date stays null, certainty UNKNOWN", async () => {
  const records = await loadPage2Records();
  const marciano = records.find((r) => r.source_record_id === "colecao-marciano-azuaga-2");
  assert.equal(marciano.date_text, "");
  const [obs] = toObservations([marciano], { retrievedAt: "2026-08-24T12:38:27.000Z" });
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "UNKNOWN");
  assert.equal(obs.start.raw, null);
});

test("an unrecognised date shape never fabricates a date", () => {
  const obs = toObservation(
    { source_record_id: "x", title: "t", tag: "música", date_text: "algures em setembro", event_url: "https://x" },
    { retrievedAt: "2026-08-24T12:38:27.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "TEXT_ONLY");
  assert.equal(obs.start.raw, "algures em setembro");
});

test("no time-of-day is ever fabricated: is_utc/iso stay null, certainty is never FLOATING_LOCAL", async () => {
  const records = await loadPage1Records();
  const observations = toObservations(filterMusicRecords(records), { retrievedAt: "2026-08-24T12:38:27.000Z" });
  for (const o of observations) {
    assert.equal(o.start.is_utc, null);
    assert.equal(o.start.iso, null);
    assert.notEqual(o.start.certainty, "FLOATING_LOCAL");
  }
});

// 5. music filtering

test("filterMusicRecords keeps only the source's own '# música' tag, honestly, nothing else", async () => {
  const records = await loadPage1Records();
  const music = filterMusicRecords(records);
  assert.equal(music.length, 3);
  for (const record of music) assert.equal(record.tag, MUSIC_TAG);
  assert.deepEqual(
    music.map((r) => r.source_record_id).sort(),
    ["32-festival-internacional-de-musica-de-gaia", "miguel-arau-jo-e-experiencia-queen-arra-bida-music", "nunca-mates-o-mandarim"],
  );
});

test("non-music categories (desporto, infância, artes, formação, exposições) are genuinely excluded, not just relabelled", async () => {
  const page1 = await loadPage1Records();
  const page2 = await loadPage2Records();
  const allMusic = filterMusicRecords([...page1, ...page2]);
  const excludedTags = new Set(
    [...page1, ...page2].filter((r) => !allMusic.includes(r)).map((r) => r.tag),
  );
  assert.deepEqual([...excludedTags].sort(), ["artes", "desporto", "exposições", "formação", "infância"]);
});

// 6. source URL retained

test("event_url and source_url are retained on every Observation", async () => {
  const records = filterMusicRecords(await loadPage1Records());
  const observations = toObservations(records, {
    retrievedAt: "2026-08-24T12:38:27.000Z",
    sourceUrl: "https://www.cm-gaia.pt/pt/eventos/",
  });
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://www.cm-gaia.pt/pt/eventos/"));
    assert.equal(o.source_url, "https://www.cm-gaia.pt/pt/eventos/");
  }
});

// 7. source venue evidence retained (honestly: none exists for this source)

test("venue_name/location_text are honestly null — this listing exposes no venue field at all", async () => {
  const records = filterMusicRecords(await loadPage1Records());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T12:38:27.000Z" });
  for (const o of observations) {
    assert.equal(o.venue_name, null);
    assert.equal(o.location_text, null);
  }
});

// 8. no direct Event creation / 9. Observation contract valid

test("every Observation is a valid Observation, never a canonical Event field", async () => {
  const records = filterMusicRecords(await loadPage1Records());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T12:38:27.000Z" });
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "cm-gaia-eventos");
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
  }
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

// 10. deterministic rerun

test("adaptation is deterministic against the same retained fixtures", async () => {
  const records = filterMusicRecords(await loadPage1Records());
  assert.deepEqual(
    toObservations(records, { retrievedAt: "2026-08-24T12:38:27.000Z" }),
    toObservations(records, { retrievedAt: "2026-08-24T12:38:27.000Z" }),
  );
});

// pagination discovery

test("parseCmGaiaEventosNextPageUrl finds the real next-page link on page 1, and correctly finds none on the terminal page 2", async () => {
  const page1Html = await loadFixture("eventos-page-1-excerpt.html");
  const page2Html = await loadFixture("eventos-page-2-excerpt.html");
  assert.equal(parseCmGaiaEventosNextPageUrl(page1Html), "https://www.cm-gaia.pt/pt/eventos/pagina-2/");
  assert.equal(parseCmGaiaEventosNextPageUrl(page2Html), null);
});

// 15/16. existing data-driven venue resolution stays valid; no new resolver branch

test("cm-gaia-eventos Observations resolve UNRESOLVED — no hardcoded or data-driven venue mapping exists for this source", async () => {
  const records = filterMusicRecords(await loadPage1Records());
  const observations = toObservations(records, { retrievedAt: "2026-08-24T12:38:27.000Z" });
  for (const o of observations) {
    const resolution = resolveObservation(o);
    assert.equal(resolution.resolution_status, "UNRESOLVED");
    assert.equal(resolution.venue_id, null);
  }
});
