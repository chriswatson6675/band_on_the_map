import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { proveMicrodataEvents } from "../ingestion/microdata/parse.mjs";

test("generic schema.org microdata reaches the existing normalized Observation contract", () => {
  const html = `<main itemscope itemtype="https://schema.org/Event"><h1 itemprop="name">Test Concert</h1><time itemprop="startDate" content="2026-09-17T20:00+02:00">17 September</time><a itemprop="url" href="/events/test">Details</a></main>`;
  const proof = proveMicrodataEvents(html, { documentUrl: "https://venue.example/programme", sourceId: "test", venueName: "Test Venue", retrievedAt: "2026-08-27T00:00:00.000Z", cutoffDate: "2026-08-27" });
  assert.equal(proof.observations.length, 1);
  assert.equal(proof.observations[0].title, "Test Concert");
  assert.equal(proof.observations[0].start.date, "2026-09-17");
  assert.equal(proof.observations[0].event_url, "https://venue.example/events/test");
});

test("retained Loci Loft evidence proves a real future event through the same generic path", async () => {
  const evidencePath = new URL("../research/source-investigations/deep-osm-node-4523367790-berlin-02/evidence/level-1.json", import.meta.url);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const page = evidence.captures.find((capture) => capture.role === "PROGRAMME_OR_OFFICIAL");
  const proof = proveMicrodataEvents(page.body, { documentUrl: page.final_url, sourceId: "research-loci-loft", venueName: "Loci Loft", retrievedAt: page.acquired_at, cutoffDate: "2026-08-27" });
  assert.equal(proof.observations.length, 1);
  assert.match(proof.observations[0].title, /La Grande Notte Italiana/);
  assert.equal(proof.observations[0].start.date, "2026-08-28");
});
