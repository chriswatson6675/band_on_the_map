// End-to-end proof that the GENERIC Events Calendar collector family
// (ingestion/events-calendar-api/) acquires and parses CCB's proven event
// surface into canonical Observations using ONLY configuration
// (ingestion/ccb/config.mjs) — no CCB-specific parsing/acquisition code.
// Entirely offline: fetchAllEvents() is given an injected fetchPage() that
// serves the real, retained, trimmed CCB fixtures
// (fixtures/ccb/events-page-1.json / events-page-2.json, derived from
// research/source-investigations/ccb-lisbon-01/'s own governed evidence).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchAllEvents } from "../ingestion/events-calendar-api/fetch-all.mjs";
import { toObservations } from "../ingestion/events-calendar-api/observation-adapter.mjs";
import { CCB_MUSIC_CONFIG } from "../ingestion/ccb/config.mjs";

async function loadFixture(path) {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
}

function ccbFetchPage(page1Body, page2Body) {
  return async (url) => {
    if (url.includes("page=2")) {
      return { ok: true, status: 200, text: page2Body, url };
    }
    return { ok: true, status: 200, text: page1Body, url };
  };
}

test("CCB proof: generic collector + CCB config alone acquires all sampled events across 2 real pages", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");

  const result = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });

  assert.equal(result.ok, true);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.totalDeclared, 90); // the source's own reported total, not this bounded sample's size
  assert.equal(result.records.length, 5);
});

test("CCB proof: acquired records convert into well-formed, canonical Observations", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");
  const result = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });

  const observations = toObservations(result.records, CCB_MUSIC_CONFIG, {
    retrievedAt: "2026-08-25T09:00:00Z",
    sourceUrl: "https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica",
  });

  assert.equal(observations.length, 5);
  for (const obs of observations) {
    assert.equal(obs.source_id, "ccb-centro-cultural-belem");
    assert.ok(obs.source_record_id.length > 0);
    assert.ok(obs.title);
    assert.equal(obs.venue_name, "Centro Cultural de Belém"); // every sampled event shares CCB's own single venue
    assert.equal(obs.start.certainty, "UTC_INSTANT"); // every sampled event carries a genuine utc_start_date
    assert.ok(obs.event_url.startsWith("https://www.ccb.pt/evento/"));
    // No fabricated canonical event identity anywhere on an Observation.
    assert.equal("event_id" in obs, false);
  }
});

test("CCB proof: the multi-day umbrella event's start/end honestly span the full multi-day run, not one performance", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");
  const result = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });
  const observations = toObservations(result.records, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });

  const festa = observations.find((o) => o.source_record_id === "292314");
  assert.equal(festa.title, "Festa Temporada 2026_2027");
  assert.equal(festa.start.date, "2026-09-11");
  assert.equal(festa.end.date, "2026-09-13");
});

test("CCB proof: a recurring-series member has its own distinct, stable source_record_id (not shared across occurrences)", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");
  const result = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });
  const observations = toObservations(result.records, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });

  const cantar = observations.find((o) => o.source_record_id === "294811");
  assert.equal(cantar.title, "Cantar Juntos pelo Mundo");
  assert.equal(cantar.start.date, "2026-09-12");
});

test("CCB proof: price is honestly null (never fabricated) — the real API never populates cost for CCB", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");
  const result = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });
  const observations = toObservations(result.records, CCB_MUSIC_CONFIG, { retrievedAt: "2026-08-25T09:00:00Z" });

  assert.ok(observations.every((o) => o.price_text === null));
});

test("CCB proof: repeated acquisition of the same fixture set yields the same source_record_id set (stable identity)", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");

  const runA = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });
  const runB = await fetchAllEvents(CCB_MUSIC_CONFIG, { fetchPage: ccbFetchPage(page1, page2) });

  assert.deepEqual(
    runA.records.map((r) => r.source_record_id).sort(),
    runB.records.map((r) => r.source_record_id).sort(),
  );
});
