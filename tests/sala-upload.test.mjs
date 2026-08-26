import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchSalaUploadEventLinks, parseSpanishDate, parseSalaUploadEventPage } from "../ingestion/sala-upload/discovery.mjs";
import { toObservation } from "../ingestion/sala-upload/observation-adapter.mjs";

const EVIDENCE_DIR = "../research/source-investigations/sala-upload-barcelona-01/evidence";

async function loadFixture(name) {
  return readFile(new URL(`${EVIDENCE_DIR}/${name}`, import.meta.url), "utf8");
}

test("parseSpanishDate parses the real retained 'D mes YYYY' shape", () => {
  assert.equal(parseSpanishDate("26 septiembre 2026"), "2026-09-26");
  assert.equal(parseSpanishDate("26 septiembre  2026"), "2026-09-26"); // real retained double-space variant
  assert.equal(parseSpanishDate("3 marzo 2027"), "2027-03-03");
});

test("parseSpanishDate returns null for an unrecognised shape, never guessed", () => {
  assert.equal(parseSpanishDate("September 26"), null);
  assert.equal(parseSpanishDate(null), null);
  assert.equal(parseSpanishDate("2026/26/09"), null);
});

test("fetchSalaUploadEventLinks paginates offline (mocked fetchImpl) and filters to tipo-de-evento-concierto records", async () => {
  const page1 = JSON.parse(await loadFixture("eventos-page-1.json"));
  const nonConcert = { ...page1[0], id: 999999, class_list: ["post-999999", "eventos", "tipo-de-evento-fiesta"] };
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    const page = calls === 1 ? [...page1, nonConcert] : [];
    return { url, status: 200, ok: true, text: JSON.stringify(page), retrievedAt: "2026-08-26T00:00:00.000Z" };
  };
  const { records } = await fetchSalaUploadEventLinks({ fetchImpl });
  assert.equal(calls, 1); // short (< 50) page — the site's own final page, no further request made
  assert.ok(records.length >= 5);
  assert.ok(!records.some((r) => r.source_record_id === "999999"));
});

test("fetchSalaUploadEventLinks throws on a non-2xx, non-400 HTTP response", async () => {
  const fetchImpl = async (url) => ({ url, status: 500, ok: false, text: "", retrievedAt: "2026-08-26T00:00:00.000Z" });
  await assert.rejects(() => fetchSalaUploadEventLinks({ fetchImpl }), /HTTP 500/);
});

test("parseSalaUploadEventPage extracts the real retained FECHA/HORARIO fields", async () => {
  const html = await loadFixture("event-atrexial.html");
  const record = parseSalaUploadEventPage(html);
  assert.equal(record.date_text, "26 septiembre 2026");
  assert.equal(record.date_iso, "2026-09-26");
  assert.equal(record.time_text, "19:30");
});

test("parseSalaUploadEventPage rejects empty input", () => {
  assert.throws(() => parseSalaUploadEventPage(""), /non-empty HTML/);
});

test("toObservation produces FLOATING_LOCAL when date+time both present, never sets venue_name", () => {
  const observation = toObservation(
    { source_record_id: "1", title: "Atrexial", event_url: "https://sala-upload.com/conciertos/atrexial-sala-upload-barcelona-2026/" },
    { date_text: "26 septiembre 2026", date_iso: "2026-09-26", time_text: "19:30" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.date, "2026-09-26");
  assert.equal(observation.venue_name, null);
  assert.equal(observation.source_id, "sala-upload-barcelona");
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}, {}), /non-empty source_record_id/);
});
