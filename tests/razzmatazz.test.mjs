import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFutureLiveQuery, buildRazzmatazzQueryUrl, parseRazzmatazzLiveEvents } from "../ingestion/razzmatazz/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/razzmatazz/observation-adapter.mjs";

async function loadFixture() {
  return readFile(new URL("../research/source-investigations/razzmatazz-barcelona-01/evidence/live-events-sample.json", import.meta.url), "utf8");
}

test("buildFutureLiveQuery requires a YYYY-MM-DD fromDate", () => {
  assert.throws(() => buildFutureLiveQuery("26-08-2026"), /YYYY-MM-DD/);
  assert.match(buildFutureLiveQuery("2026-08-26"), /date >= "2026-08-26"/);
});

test("buildRazzmatazzQueryUrl targets the real, retained Sanity project/dataset", () => {
  const url = buildRazzmatazzQueryUrl("2026-08-26");
  assert.match(url, /^https:\/\/7jg0n68u\.apicdn\.sanity\.io\/v2024-02-01\/data\/query\/production\?query=/);
});

test("parseRazzmatazzLiveEvents parses the real retained sample (10 real upcoming records)", async () => {
  const records = parseRazzmatazzLiveEvents(await loadFixture());
  assert.equal(records.length, 10);
  const first = records[0];
  assert.equal(first.title, "Compota de Manana");
  assert.equal(first.date_iso, "2026-08-29");
  assert.equal(first.room, "Sala 2");
  assert.equal(first.event_url, "https://www.salarazzmatazz.com/en/agenda/2026-08-29-compota-de-manana-masimas-festival-2026/");
});

test("parseRazzmatazzLiveEvents falls back to dereferenced artist titles only when the doc's own title is absent", async () => {
  const records = parseRazzmatazzLiveEvents(await loadFixture());
  const oslo = records.find((r) => r.source_record_id === "c07da0ab-ca50-4daf-8506-96f087a738c8");
  assert.equal(oslo.title, "Oslo Ovnies");
});

test("parseRazzmatazzLiveEvents throws on a rejected/malformed Sanity envelope", () => {
  assert.throws(() => parseRazzmatazzLiveEvents(JSON.stringify({ error: { description: "boom" } })), /Sanity query rejected/);
  assert.throws(() => parseRazzmatazzLiveEvents(JSON.stringify({ result: "not-an-array" })), /did not return a JSON array/);
});

test("parseRazzmatazzLiveEvents treats an empty result as a legitimate empty list", () => {
  assert.deepEqual(parseRazzmatazzLiveEvents(JSON.stringify({ result: [] })), []);
});

test("toObservation produces FLOATING_LOCAL when a date and start time are both present", () => {
  const observation = toObservation(
    { source_record_id: "x1", date_iso: "2026-08-29", start_time_text: "20:30", title: "T" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.date, "2026-08-29");
});

test("toObservation combines title + subtitle, never fabricates an end time, and never sets venue_name", () => {
  const observation = toObservation(
    { source_record_id: "x2", date_iso: "2026-08-29", title: "Compota de Manana", subtitle: " - MASiMAS Festival 2026" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.title, "Compota de Manana - MASiMAS Festival 2026");
  assert.equal(observation.end.certainty, "UNKNOWN");
  assert.equal(observation.venue_name, null);
  assert.equal(observation.source_id, "razzmatazz-barcelona");
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}), /non-empty source_record_id/);
});

test("toObservations maps the real retained sample, sharing retrieval metadata", async () => {
  const records = parseRazzmatazzLiveEvents(await loadFixture());
  const observations = toObservations(records, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://7jg0n68u.apicdn.sanity.io/v2024-02-01/data/query/production" });
  assert.equal(observations.length, 10);
  assert.equal(observations[0].source_id, "razzmatazz-barcelona");
});
