import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseParalLel62Date, parseParalLel62Events } from "../ingestion/paral-lel-62/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/paral-lel-62/observation-adapter.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/paral-lel-62/${name}`, import.meta.url), "utf8");
}

test("parseParalLel62Date converts DD-MM-YYYY to YYYY-MM-DD", () => {
  assert.equal(parseParalLel62Date("01-09-2026"), "2026-09-01");
  assert.equal(parseParalLel62Date("04-09-2026"), "2026-09-04");
});

test("parseParalLel62Date returns null for an unrecognised shape, never guessed", () => {
  assert.equal(parseParalLel62Date("September 1"), null);
  assert.equal(parseParalLel62Date(null), null);
});

test("parseParalLel62Events parses the real retained sample", async () => {
  const records = parseParalLel62Events(await loadFixture("sample.json"));
  assert.equal(records.length, 5);
  const first = records[0];
  assert.equal(first.date_iso, "2026-09-01");
  assert.equal(first.time_text, "19:00");
  assert.equal(first.room, "Sala Gran");
  assert.equal(first.event_url, "https://paral-lel62.cat/programacio/julieta-venegas-nortena-2026-cat/");
  assert.equal(first.source_record_id, first.event_url);
});

test("parseParalLel62Events treats an empty array as a legitimate empty result", async () => {
  assert.deepEqual(parseParalLel62Events(await loadFixture("empty-response.json")), []);
});

test("parseParalLel62Events throws for a non-array body", async () => {
  await assert.rejects(async () => parseParalLel62Events(await loadFixture("malformed-response.json")), /did not parse to a JSON array/);
});

test("parseParalLel62Events falls back to a positional id only when url is genuinely missing", () => {
  const records = parseParalLel62Events([{ title: "No URL Event", date: "01-09-2026" }]);
  assert.equal(records[0].source_record_id, "paral-lel-62-index-0");
});

test("toObservation produces FLOATING_LOCAL when a date and time-of-day are both present, DATE_ONLY when time is missing", () => {
  const withTime = toObservation({ source_record_id: "x1", date_text: "01-09-2026", date_iso: "2026-09-01", time_text: "19:00", title: "T" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(withTime.start.certainty, "FLOATING_LOCAL");
  assert.equal(withTime.start.date, "2026-09-01");

  const noTime = toObservation({ source_record_id: "x2", date_text: "01-09-2026", date_iso: "2026-09-01", time_text: null, title: "T" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(noTime.start.certainty, "DATE_ONLY");
});

test("toObservation never fabricates end time (this source exposes none)", () => {
  const observation = toObservation({ source_record_id: "x3", date_iso: "2026-09-01", date_text: "01-09-2026", title: "T" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observation.end.certainty, "UNKNOWN");
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}), /non-empty source_record_id/);
});

test("toObservations maps an array sharing retrieval metadata", async () => {
  const records = parseParalLel62Events(await loadFixture("sample.json"));
  const observations = toObservations(records, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://paral-lel62.cat/wp-json/v1/calendar-events-futurs" });
  assert.equal(observations.length, 5);
  assert.equal(observations[0].source_id, "paral-lel-62-barcelona");
});
