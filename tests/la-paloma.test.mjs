import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseLaPalomaCatalanDate, parseLaPalomaEvents } from "../ingestion/la-paloma/discovery.mjs";
import { fetchLaPalomaMonth } from "../ingestion/la-paloma/client.mjs";
import { toObservation, toObservations } from "../ingestion/la-paloma/observation-adapter.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/la-paloma/${name}`, import.meta.url), "utf8");
}

test("parseLaPalomaCatalanDate parses the exact real-observed shape", () => {
  const parsed = parseLaPalomaCatalanDate("divendres 4 de setembre de 2026 a les 23:59");
  assert.deepEqual(parsed, { date: "2026-09-04", time: "23:59" });
});

test("parseLaPalomaCatalanDate handles every Catalan month name", () => {
  const months = [
    ["1 de gener de 2026", "01"], ["1 de febrer de 2026", "02"], ["1 de març de 2026", "03"],
    ["1 de abril de 2026", "04"], ["1 de maig de 2026", "05"], ["1 de juny de 2026", "06"],
    ["1 de juliol de 2026", "07"], ["1 de agost de 2026", "08"], ["1 de setembre de 2026", "09"],
    ["1 de octubre de 2026", "10"], ["1 de novembre de 2026", "11"], ["1 de desembre de 2026", "12"],
  ];
  for (const [text, expectedMonth] of months) {
    assert.equal(parseLaPalomaCatalanDate(text).date, `2026-${expectedMonth}-01`);
  }
});

test("parseLaPalomaCatalanDate returns null for an unrecognised shape or unknown month, never guessed", () => {
  assert.equal(parseLaPalomaCatalanDate("September 4th 2026"), null);
  assert.equal(parseLaPalomaCatalanDate("4 de mesinventat de 2026"), null);
  assert.equal(parseLaPalomaCatalanDate(null), null);
});

test("parseLaPalomaCatalanDate tolerates a date with no time-of-day", () => {
  assert.deepEqual(parseLaPalomaCatalanDate("4 de setembre de 2026"), { date: "2026-09-04", time: null });
});

test("parseLaPalomaEvents parses the real retained September 2026 sample", async () => {
  const records = parseLaPalomaEvents(await loadFixture("september-2026-sample.json"));
  assert.equal(records.length, 6);
  const first = records[0];
  assert.equal(first.title, "LA PALOMA PRES.");
  assert.equal(first.subtitle, "TSHA");
  assert.equal(first.date_iso, "2026-09-04");
  assert.equal(first.time_text, "23:59");
  assert.equal(first.event_url, "https://ra.co/events/2499602");
});

test("parseLaPalomaEvents treats an empty array as a legitimate empty result", async () => {
  assert.deepEqual(parseLaPalomaEvents(await loadFixture("empty-month.json")), []);
});

test("parseLaPalomaEvents throws for a non-array body", async () => {
  await assert.rejects(async () => parseLaPalomaEvents(await loadFixture("malformed-response.json")), /did not parse to a JSON array/);
});

test("fetchLaPalomaMonth POSTs the correct Catalan mes/any params and returns text+metadata", async () => {
  let capturedUrl, capturedInit;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await fetchLaPalomaMonth(9, 2026, { fetchImpl: fakeFetch });
  assert.equal(capturedUrl, "https://lapaloma.com/wp-admin/admin-ajax.php");
  assert.equal(capturedInit.method, "POST");
  assert.ok(capturedInit.body.includes("mes=9"));
  assert.ok(capturedInit.body.includes("any=2026"));
  assert.ok(capturedInit.body.includes("action=event_controller"));
  assert.equal(result.text, "[]");
});

test("fetchLaPalomaMonth throws on a non-2xx response", async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, text: async () => "" });
  await assert.rejects(() => fetchLaPalomaMonth(9, 2026, { fetchImpl: fakeFetch }), /HTTP 500/);
});

test("fetchLaPalomaMonth validates month/year bounds", async () => {
  await assert.rejects(() => fetchLaPalomaMonth(13, 2026), /month to be 1-12/);
  await assert.rejects(() => fetchLaPalomaMonth(9, 99), /plausible 4-digit year/);
});

test("toObservation combines name+subtitle into one honest title and is FLOATING_LOCAL", () => {
  const observation = toObservation(
    { source_record_id: "284", title: "LA PALOMA PRES.", subtitle: "TSHA", date_iso: "2026-09-04", date_text: "divendres 4 de setembre de 2026 a les 23:59", time_text: "23:59", event_url: "https://ra.co/events/2499602" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.title, "LA PALOMA PRES. — TSHA");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.date, "2026-09-04");
  assert.equal(observation.venue_name, null);
});

test("toObservation leaves title unchanged when there is no subtitle", () => {
  const observation = toObservation({ source_record_id: "279", title: "POLENTA", date_iso: "2026-09-05" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observation.title, "POLENTA");
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}), /non-empty source_record_id/);
});

test("toObservations maps every parsed record from the real sample", async () => {
  const records = parseLaPalomaEvents(await loadFixture("september-2026-sample.json"));
  const observations = toObservations(records, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observations.length, 6);
  assert.ok(observations.every((o) => o.source_id === "la-paloma-barcelona"));
});
