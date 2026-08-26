import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseJazzsiConcertLinks } from "../ingestion/jazzsi/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservation } from "../ingestion/json-ld/observation-adapter.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../research/source-investigations/jazzsi-barcelona-01/evidence/${name}`, import.meta.url), "utf8");
}

test("parseJazzsiConcertLinks extracts real concert permalinks from the retained RSS feed, excluding the feed's own self-link", async () => {
  const links = parseJazzsiConcertLinks(await loadFixture("concerts-feed.xml"));
  assert.ok(links.length >= 3);
  assert.ok(links.every((l) => /^https:\/\/www\.jazzsi\.com\/concerts\/[a-z0-9-]+\/$/.test(l)));
  assert.ok(links.includes("https://www.jazzsi.com/concerts/manifest/"));
});

test("parseJazzsiConcertLinks deduplicates", () => {
  const rss = `<rss><channel><item><link>https://www.jazzsi.com/concerts/a/</link></item><item><link>https://www.jazzsi.com/concerts/a/</link></item></channel></rss>`;
  assert.equal(parseJazzsiConcertLinks(rss).length, 1);
});

test("a real retained JazzSí concert page carries a genuine MusicEvent JSON-LD block with an explicit startDate", async () => {
  const html = await loadFixture("event-manifest.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]["@type"], "MusicEvent");
  const record = normaliseJsonLdEvent(nodes[0], { deriveId: () => "manifest" });
  assert.equal(record.title, "MANIFEST");
  assert.equal(record.start_raw, "2026-09-18T19:45:00+00:00");

  const observation = toObservation(record, { source_id: "jazzsi-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.start.date, "2026-09-18");
});
