import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseTeatroMunicipalPortoAgenda } from "../ingestion/teatro-municipal-porto/discovery.mjs";
import {
  SOURCE_ID,
  parseMonthYear,
  toObservation,
  toObservations,
} from "../ingestion/teatro-municipal-porto/observation-adapter.mjs";
import { resolveObservation, resolveTeatroMunicipalPortoObservation } from "../ingestion/venue/resolver.mjs";

async function loadRecords() {
  const html = await readFile(
    new URL("../fixtures/teatro-municipal-porto/programa-musica-setembro-excerpt.html", import.meta.url),
    "utf8",
  );
  return parseTeatroMunicipalPortoAgenda(html);
}

test("discovery extracts real, distinct entries with a permalink-derived source_record_id", async () => {
  const records = await loadRecords();
  assert.equal(records.length, 5);
  for (const record of records) {
    assert.ok(record.source_record_id);
    assert.ok(record.event_url.startsWith("https://www.teatromunicipaldoporto.pt/pt/programa/"));
    assert.ok(record.event_url.endsWith(`${record.source_record_id}/`));
    assert.equal(record.month_year, "Setembro 2026");
    assert.ok(record.occurrences.length >= 1);
  }
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseTeatroMunicipalPortoAgenda(""), /non-empty/);
});

test("an entry with multiple dated occurrences retains every one of them, in document order", async () => {
  const records = await loadRecords();
  const multi = records.find((r) => r.source_record_id === "slide-bones-symbiosis");
  assert.ok(multi);
  assert.deepEqual(multi.occurrences, [
    { time: "15:00", weekday: "Sáb", day: "19" },
    { time: "17:00", weekday: "Sáb", day: "19" },
    { time: "19:00", weekday: "Sáb", day: "19" },
  ]);
});

test("an off-site entry keeps its own venue_name text honestly, distinct from the theatre's own poles", async () => {
  const records = await loadRecords();
  const offSite = records.find((r) => r.source_record_id.startsWith("quintas-de-leitura"));
  assert.equal(offSite.venue_name, "Biblioteca Municipal Almeida Garrett");
  assert.equal(offSite.sub_location, null);

  const rivoli = records.find((r) => r.source_record_id.startsWith("luciana-acu"));
  assert.equal(rivoli.venue_name, "Rivoli");
  assert.equal(rivoli.sub_location, "Praça D. João I");
});

test("parseMonthYear parses real Portuguese month names; rejects unrecognised shapes", () => {
  assert.deepEqual(parseMonthYear("Setembro 2026"), { year: "2026", month: "09" });
  assert.deepEqual(parseMonthYear("Dezembro 2026"), { year: "2026", month: "12" });
  assert.equal(parseMonthYear("not a month"), null);
  assert.equal(parseMonthYear(null), null);
});

test("every retained live entry adapts to an Observation", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, {
    retrievedAt: "2026-08-24T01:33:47.000Z",
    sourceUrl: "https://www.teatromunicipaldoporto.pt/pt/programa/?categoria=musica",
  });
  assert.equal(observations.length, records.length);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "teatro-municipal-do-porto");
  }
});

test("start is derived from the FIRST occurrence only; certainty FLOATING_LOCAL; end stays empty", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:33:47.000Z" });
  const multi = observations.find((o) => o.source_record_id === "slide-bones-symbiosis");
  assert.equal(multi.start.date, "2026-09-19");
  assert.equal(multi.start.certainty, "FLOATING_LOCAL");
  assert.deepEqual(multi.end, { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" });
  // The full schedule is preserved honestly, not discarded.
  assert.equal(multi.source_fields.occurrences.length, 3);
});

test("no time-of-day is ever fabricated into a false UTC instant", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:33:47.000Z" });
  for (const o of observations) {
    assert.equal(o.start.is_utc, null);
    assert.equal(o.start.iso, null);
  }
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

test("Rivoli entries resolve to the canonical Teatro Rivoli venue; off-site entries stay UNRESOLVED", async () => {
  const records = await loadRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T01:33:47.000Z" });

  const rivoli = observations.find((o) => o.source_record_id.startsWith("luciana-acu"));
  const rivoliResult = resolveTeatroMunicipalPortoObservation(rivoli);
  assert.equal(rivoliResult.resolution_status, "RESOLVED");
  assert.equal(rivoliResult.venue_id, "venue-porto-teatro-rivoli");
  assert.deepEqual(resolveObservation(rivoli), rivoliResult);

  const offSite = observations.find((o) => o.source_record_id.startsWith("quintas-de-leitura"));
  const offSiteResult = resolveTeatroMunicipalPortoObservation(offSite);
  assert.equal(offSiteResult.resolution_status, "UNRESOLVED");
  assert.equal(offSiteResult.venue_id, null);
});

test("an unmapped venue_name never resolves via the Teatro Municipal do Porto mapping (exact-string, non-fuzzy)", () => {
  assert.equal(resolveTeatroMunicipalPortoObservation({ venue_name: "rivoli" }).resolution_status, "UNRESOLVED"); // case mismatch
  assert.equal(resolveTeatroMunicipalPortoObservation({ venue_name: "Campo Alegre" }).resolution_status, "UNRESOLVED");
  assert.equal(resolveTeatroMunicipalPortoObservation({ venue_name: null }).resolution_status, "UNRESOLVED");
});

test("adaptation is deterministic against the same retained fixture", async () => {
  const records = await loadRecords();
  assert.deepEqual(
    toObservations(records, { retrievedAt: "2026-08-24T01:33:47.000Z" }),
    toObservations(records, { retrievedAt: "2026-08-24T01:33:47.000Z" }),
  );
});
