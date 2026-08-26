import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSalaApoloScheduleLinks } from "../ingestion/sala-apolo/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservation } from "../ingestion/json-ld/observation-adapter.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/sala-apolo/${name}`, import.meta.url), "utf8");
}

test("parseSalaApoloScheduleLinks extracts deduplicated, absolute event URLs from the real retained schedule page", async () => {
  const urls = parseSalaApoloScheduleLinks(await loadFixture("schedule.html"));
  assert.ok(urls.length >= 5, "expected several real event links on the schedule page");
  assert.ok(urls.every((u) => u.startsWith("https://www.sala-apolo.com/en/event/")));
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
});

test("parseSalaApoloScheduleLinks throws for empty input", () => {
  assert.throws(() => parseSalaApoloScheduleLinks(""), /non-empty/);
});

test("parseSalaApoloScheduleLinks returns [] for well-formed HTML with no matching links", () => {
  assert.deepEqual(parseSalaApoloScheduleLinks("<html><body>nothing here</body></html>"), []);
});

test("end-to-end: the real retained Bresh Club event page's JSON-LD parses via the generic json-ld family, including the non-standard CEST date shape", async () => {
  const html = await loadFixture("event-bresh-club.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 1);
  const record = normaliseJsonLdEvent(nodes[0], { deriveId: () => "bresh-club-20260826-7490" });
  assert.equal(record.title, "BRESH CLUB");
  assert.equal(record.start_raw, "2026-08-26 CEST 23:59");

  const observation = toObservation(record, { source_id: "sala-apolo-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://www.sala-apolo.com/en/event/bresh-club-20260826-7490" });
  assert.equal(observation.title, "BRESH CLUB");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.start.iso, "2026-08-26T21:59:00.000Z");
  assert.equal(observation.venue_name, "Sala Apolo"); // present in this source's own JSON-LD; resolved by VENUE_NAME
});
