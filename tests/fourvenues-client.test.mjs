import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEventsUrl, parseEventsResponse, normalizeEventRecord } from "../ingestion/fourvenues/client.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/fourvenues/${name}`, import.meta.url), "utf8");
}

test("buildEventsUrl requires a non-empty slug", () => {
  assert.throws(() => buildEventsUrl({}), /requires config.slug/);
});

test("buildEventsUrl includes slug and optional start/end window", () => {
  const url = buildEventsUrl({ slug: "opium-barcelona", startUnix: 1756166400, endUnix: 1830297600 });
  assert.ok(url.includes("slug=opium-barcelona"));
  assert.ok(url.includes("start=1756166400"));
  assert.ok(url.includes("end=1830297600"));
});

test("buildEventsUrl omits start/end when not supplied", () => {
  const url = buildEventsUrl({ slug: "opium-barcelona" });
  assert.ok(!url.includes("start="));
  assert.ok(!url.includes("end="));
});

test("parseEventsResponse parses the real retained Opium Barcelona sample", async () => {
  const events = parseEventsResponse(await loadFixture("opium-barcelona-sample.json"));
  assert.equal(events.length, 5);
  assert.equal(events[0].name, "TYGA CRIB");
});

test("parseEventsResponse treats an empty data array as a legitimate empty result", async () => {
  assert.deepEqual(parseEventsResponse(await loadFixture("empty-response.json")), []);
});

test("parseEventsResponse throws for a response with no data array", async () => {
  await assert.rejects(async () => parseEventsResponse(await loadFixture("malformed-response.json")), /no "data" array/);
});

test("parseEventsResponse throws for invalid JSON or empty input", () => {
  assert.throws(() => parseEventsResponse("{ not json"), /not valid JSON/);
  assert.throws(() => parseEventsResponse(""), /non-empty response body/);
});

test("normalizeEventRecord maps every field from a real retained record", async () => {
  const events = parseEventsResponse(await loadFixture("opium-barcelona-sample.json"));
  const record = normalizeEventRecord(events[0]);
  assert.equal(record.source_record_id, "egzkd0em2ehb6sbp6p7wole6qc6t1nck");
  assert.equal(record.title, "TYGA CRIB");
  assert.equal(record.event_url, "https://www.fourvenues.com/opium-barcelona/events/tyga-crib-25-08-2026");
  assert.equal(record.start_unix, 1787693400);
  assert.equal(record.end_unix, 1787713200);
  assert.deepEqual(record.genres, ["hits", "reggaeton"]);
  assert.deepEqual(record.artists, []);
  assert.equal(record.age_restriction, 18);
  assert.equal(record.is_private, false);
});

test("normalizeEventRecord extracts artist names from object or string entries", () => {
  const record = normalizeEventRecord({ _id: "x1", name: "Test", artists: [{ name: "DJ Test" }, "Support Act", { notAName: true }] });
  assert.deepEqual(record.artists, ["DJ Test", "Support Act"]);
});

test("normalizeEventRecord throws for a record with no _id", () => {
  assert.throws(() => normalizeEventRecord({ name: "No Id" }), /non-empty _id/);
});

test("normalizeEventRecord leaves genuinely missing fields as null/empty, never guessed", () => {
  const record = normalizeEventRecord({ _id: "x2" });
  assert.equal(record.title, null);
  assert.equal(record.start_unix, null);
  assert.deepEqual(record.genres, []);
  assert.deepEqual(record.artists, []);
});
