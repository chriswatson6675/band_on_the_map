import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEventsUrl, normalizeEventRecord, parseEventsPage } from "../ingestion/events-calendar-api/client.mjs";

async function loadFixture(path) {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
}

// --- buildEventsUrl ---

test("buildEventsUrl builds the plugin's default events endpoint from baseUrl alone", () => {
  const url = buildEventsUrl({ baseUrl: "https://example.test" });
  assert.equal(url, "https://example.test/wp-json/tribe/events/v1/events/");
});

test("buildEventsUrl applies category/perPage/startDate/endDate as query parameters, never baked into the path", () => {
  const url = buildEventsUrl({
    baseUrl: "https://example.test",
    category: "musica",
    perPage: 10,
    startDate: "2026-09-01 00:00:00",
    endDate: "2026-12-01 00:00:00",
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("categories"), "musica");
  assert.equal(parsed.searchParams.get("per_page"), "10");
  assert.equal(parsed.searchParams.get("start_date"), "2026-09-01 00:00:00");
  assert.equal(parsed.searchParams.get("end_date"), "2026-12-01 00:00:00");
});

test("buildEventsUrl omits startDate/endDate entirely when not supplied — never fabricates a 'now'", () => {
  const url = buildEventsUrl({ baseUrl: "https://example.test", category: "musica" });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.has("start_date"), false);
  assert.equal(parsed.searchParams.has("end_date"), false);
});

test("buildEventsUrl honours a non-default restPath for a differently-configured install", () => {
  const url = buildEventsUrl({ baseUrl: "https://example.test", restPath: "/custom/tribe/events/v1/events/" });
  assert.equal(url, "https://example.test/custom/tribe/events/v1/events/");
});

test("buildEventsUrl throws on a missing/empty baseUrl", () => {
  assert.throws(() => buildEventsUrl({}), /baseUrl/);
  assert.throws(() => buildEventsUrl({ baseUrl: "" }), /baseUrl/);
});

// --- parseEventsPage ---

test("parseEventsPage parses a real retained CCB page into events + pagination pointers", async () => {
  const body = await loadFixture("ccb/events-page-1.json");
  const page = parseEventsPage(body);
  assert.equal(page.events.length, 3);
  assert.equal(page.total, 90);
  assert.equal(page.nextRestUrl, "https://www.ccb.pt/wp-json/tribe/events/v1/events/?page=2&per_page=3&categories=musica");
});

test("parseEventsPage reports nextRestUrl as null on the final page", async () => {
  const body = await loadFixture("ccb/events-page-2.json");
  const page = parseEventsPage(body);
  assert.equal(page.events.length, 2);
  assert.equal(page.nextRestUrl, null);
});

test("parseEventsPage throws on a malformed/error response body (no events array), never treats it as an empty page", async () => {
  const body = await loadFixture("events-calendar-api/malformed-response.json");
  assert.throws(() => parseEventsPage(body), /no "events" array/);
});

test("parseEventsPage throws on invalid JSON", () => {
  assert.throws(() => parseEventsPage("{not valid json"), /not valid JSON/);
});

test("parseEventsPage throws on empty/non-string input", () => {
  assert.throws(() => parseEventsPage(""), /non-empty/);
  assert.throws(() => parseEventsPage(null), /non-empty/);
});

// --- normalizeEventRecord ---

test("normalizeEventRecord extracts every generic field from a real CCB event", async () => {
  const body = await loadFixture("ccb/events-page-1.json");
  const { events } = parseEventsPage(body);
  const sinfonia = events.find((e) => e.id === 281912);
  const record = normalizeEventRecord(sinfonia);

  assert.equal(record.source_record_id, "281912");
  assert.equal(record.title, "Sinfonia n.º 5 de Beethoven");
  assert.equal(record.start_local, "2026-09-27 17:00:00");
  assert.equal(record.start_utc, "2026-09-27 16:00:00");
  assert.equal(record.end_local, "2026-09-27 18:30:00");
  assert.equal(record.end_utc, "2026-09-27 17:30:00");
  assert.equal(record.timezone, "Europe/Lisbon");
  assert.equal(record.event_url, "https://www.ccb.pt/evento/sinfonia-n-o-5-de-beethoven/");
  assert.equal(record.venue.name, "Centro Cultural de Belém");
  assert.equal(record.venue.city, "Lisboa");
  assert.equal(record.venue.zip, "1449-003");
  assert.equal(record.cost_text, null); // real CCB events never populate this field
  assert.ok(record.categories.includes("musica"));
});

test("normalizeEventRecord handles a genuinely sparse compatible record without fabricating any field", async () => {
  const body = await loadFixture("events-calendar-api/missing-optional-fields.json");
  const { events } = parseEventsPage(body);
  const record = normalizeEventRecord(events[0]);

  assert.equal(record.source_record_id, "500001");
  assert.equal(record.title, "Untitled Sparse Event");
  assert.equal(record.description, null);
  assert.equal(record.start_local, "2026-11-05 19:00:00");
  assert.equal(record.start_utc, null);
  assert.equal(record.end_local, null);
  assert.equal(record.timezone, null);
  assert.equal(record.venue, null); // venue: [] on the source — normalized to null, not []
  assert.equal(record.cost_text, null);
  assert.deepEqual(record.categories, []);
  assert.deepEqual(record.tags, []);
});

test("normalizeEventRecord extracts a populated cost field verbatim when the source supplies one", async () => {
  const body = await loadFixture("events-calendar-api/price-populated.json");
  const { events } = parseEventsPage(body);
  const record = normalizeEventRecord(events[0]);
  assert.equal(record.cost_text, "15€ - 30€");
  assert.equal(record.venue.name, "Example Compatible Venue");
});

test("normalizeEventRecord throws on a record with no id", () => {
  assert.throws(() => normalizeEventRecord({ title: "No id" }), /non-null id/);
});
