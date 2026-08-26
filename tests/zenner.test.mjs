import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { toObservation, toObservations } from "../ingestion/zenner/observation-adapter.mjs";

async function realNodes() {
  const text = await readFile(new URL("../fixtures/zenner-berlin/programm-page-data.json", import.meta.url), "utf8");
  const d = JSON.parse(text);
  return d.result.data.queryKultur.nodes;
}

test("a real, future, real-titled Zenner event adapts correctly", async () => {
  const nodes = await realNodes();
  const record = nodes.find((n) => n.id === "-3de1d1a3-591c-50c9-86c9-69f8bd55a4e8");
  const obs = toObservation(record, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.title, "180 min w/ Barker (live)");
  assert.equal(obs.start.iso, "2026-09-24T17:00:00.000Z");
  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.venue_name, "Zenner");
  assert.equal(obs.location_text, "Saal");
  assert.equal(obs.event_url, "https://ra.co/events/2378121");
});

test("toObservations excludes the source's own literal 'XXXXX' placeholder titles", async () => {
  const nodes = await realNodes();
  const observations = toObservations(nodes, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.ok(observations.length > 0);
  assert.ok(observations.every((o) => o.title && o.title !== "XXXXX"));
  assert.ok(observations.length < nodes.length, "the real dataset genuinely contains placeholder-titled nodes to exclude");
});

test("toObservation throws without record.id", () => {
  assert.throws(() => toObservation({}), /record.id/);
});
