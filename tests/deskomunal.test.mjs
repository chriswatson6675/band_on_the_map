import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractEventNodes, filterMusicEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservations } from "../ingestion/json-ld/observation-adapter.mjs";

async function loadFixture() {
  return readFile(new URL("../research/source-investigations/deskomunal-barcelona-01/evidence/homepage.html", import.meta.url), "utf8");
}

test("Deskomunal's real retained homepage carries real Event nodes, most passing the shared music-relevance filter", async () => {
  const html = await loadFixture();
  const nodes = extractEventNodes(html);
  assert.ok(nodes.length >= 8);
  const { musicNodes, rejectedNodes } = filterMusicEventNodes(nodes);
  assert.ok(musicNodes.length >= 5);
  assert.ok(musicNodes.some((n) => n.name.includes("TECHNO-ACID")));
  assert.ok(rejectedNodes.some((n) => n.name.includes("ASSEMBLEA DOCENT"))); // non-music community meeting, correctly rejected
});

test("a music-filtered Deskomunal node normalises + adapts to an Observation, resolved by source_id", async () => {
  const html = await loadFixture();
  const { musicNodes } = filterMusicEventNodes(extractEventNodes(html));
  const records = musicNodes.map((n) => normaliseJsonLdEvent(n, { deriveId: (node) => node.url }));
  const observations = toObservations(records, { source_id: "deskomunal-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.ok(observations.length >= 5);
  for (const o of observations) {
    assert.equal(o.source_id, "deskomunal-barcelona");
    assert.ok(o.source_record_id);
  }
});
