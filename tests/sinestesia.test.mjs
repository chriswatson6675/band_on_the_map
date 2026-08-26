import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractEventNodes, filterMusicEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservations } from "../ingestion/json-ld/observation-adapter.mjs";

async function loadFixture() {
  return readFile(new URL("../research/source-investigations/sinestesia-barcelona-01/evidence/homepage.html", import.meta.url), "utf8");
}

test("Sinestesia's real retained homepage carries 20 Event nodes, ~5 passing the shared music-relevance filter", async () => {
  const html = await loadFixture();
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 20);
  const { musicNodes, rejectedNodes } = filterMusicEventNodes(nodes);
  assert.ok(musicNodes.length >= 3);
  assert.ok(rejectedNodes.length > 0);
  assert.ok(musicNodes.some((n) => n.name.includes("BALKAN ROOTS")));
  assert.ok(rejectedNodes.some((n) => /semana \d+\/\d{4}/.test(n.name))); // generic weekly placeholder, correctly rejected
});

test("a music-filtered Sinestesia node normalises + adapts to a DATE_ONLY Observation, resolved by source_id", async () => {
  const html = await loadFixture();
  const { musicNodes } = filterMusicEventNodes(extractEventNodes(html));
  const records = musicNodes.map((n) => normaliseJsonLdEvent(n, { deriveId: (node) => node.url }));
  const observations = toObservations(records, { source_id: "sinestesia-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.ok(observations.length >= 3);
  for (const o of observations) {
    assert.equal(o.source_id, "sinestesia-barcelona");
    assert.ok(o.source_record_id);
  }
});
