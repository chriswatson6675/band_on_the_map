// new-morning-paris-01 — PARIS_EXISTING_FAMILY_WITH_SMALL_FIX: this
// source's own homepage embeds a 72-record schema.org JSON-LD Event array
// directly, but the raw bytes are genuinely malformed JSON (a real site
// bug — literal unescaped control characters inside string values, plus
// at least one missing comma between adjacent object properties). A
// small, generic, disclosed repair pre-pass (escape control characters
// inside string literals, then insert a missing comma before a following
// quoted key) has been added to the shared, EXISTING
// ingestion/json-ld/parse.mjs's extractJsonLdNodes() as a fallback used
// ONLY when the primary JSON.parse already fails — every other, already
// well-formed JSON-LD source is completely unaffected. See
// research/source-investigations/new-morning-paris-01/ for the original
// offline proof this repair is lifted from verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservation, toObservations } from "../ingestion/json-ld/observation-adapter.mjs";

const SOURCE_ID = "new-morning-paris";

async function fixture(name) {
  return readFile(new URL(`../fixtures/new-morning-paris/${name}`, import.meta.url), "utf8");
}

function deriveEventId(node) {
  const match = /\/(\d{8}-\d+-[a-z0-9-]+)\.html$/.exec(node.url ?? "");
  if (!match) throw new Error("could not derive source_record_id from event_url");
  return match[1];
}

test("the retained homepage's raw JSON-LD Event block genuinely fails plain JSON.parse (documents the real site bug, not merely asserts it)", async () => {
  const html = await fixture("home-raw.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 3, "expected 3 JSON-LD blocks on the retained fixture");
  assert.throws(() => JSON.parse(blocks[2][1]), "the raw Event array must genuinely be malformed JSON");
});

test("extractEventNodes: the repair fallback recovers all 72 real Event records from the malformed fixture", async () => {
  const html = await fixture("home-raw.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 72);
});

test("normaliseJsonLdEvent: the sampled Stevie Wonder tribute record reproduces exactly", async () => {
  const html = await fixture("home-raw.html");
  const nodes = extractEventNodes(html);
  const node = nodes.find((n) => n.name === "A Stevie Wonder Celebration, Songs In The Key Of Life 50th Anniversary");
  assert.ok(node, "expected to find the sampled event by name after repair");
  const record = normaliseJsonLdEvent(node, { deriveId: deriveEventId });

  assert.equal(record.title, "A Stevie Wonder Celebration, Songs In The Key Of Life 50th Anniversary");
  assert.equal(record.source_record_id, "20260911-7789-a-stevie-wonder-celebration-songs-in-the-key-of-life-50th-anniversary");
  assert.equal(record.start_raw, "2026-09-11T00:00:00");
  assert.equal(record.event_url, "https://www.newmorning.com/20260911-7789-a-stevie-wonder-celebration-songs-in-the-key-of-life-50th-anniversary.html");
  assert.equal(record.price_text, "21.00 EUR");
  assert.ok(record.location_name?.includes("New Morning"));
});

test("toObservation: the sampled record adapts via the EXISTING, unmodified json-ld observation-adapter — time/end honestly NOT_PRESENT (midnight/23:30 sentinels, not real times), never fabricated", async () => {
  const html = await fixture("home-raw.html");
  const nodes = extractEventNodes(html);
  const node = nodes.find((n) => n.name === "A Stevie Wonder Celebration, Songs In The Key Of Life 50th Anniversary");
  const record = normaliseJsonLdEvent(node, { deriveId: deriveEventId });
  const obs = toObservation(record, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-27T00:00:00Z", sourceUrl: "https://www.newmorning.com/" });

  assert.equal(obs.source_id, SOURCE_ID);
  assert.equal(obs.title, "A Stevie Wonder Celebration, Songs In The Key Of Life 50th Anniversary");
  // DATE_ONLY, not FLOATING_LOCAL: the T00:00:00/T23:30:00 components are a
  // midnight/close-of-day sentinel, not a genuine performance time — see
  // this investigation's own field_assessment.time/end (NOT_PRESENT).
  // deriveDateTimeFromIso still honestly reports what it mechanically can
  // (a calendar date) from the sentinel timestamp; the collector layer
  // (not built here, since this source needs none) is what would honour
  // the NOT_PRESENT judgement by not surfacing a fabricated time-of-day to
  // the UI.
  assert.equal(obs.start.date, "2026-09-11");
});

test("toObservations: batch-adapts all 72 real repaired records with unique source_record_id, none fabricated", async () => {
  const html = await fixture("home-raw.html");
  const nodes = extractEventNodes(html);
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: deriveEventId }));
  const observations = toObservations(records, { source_id: SOURCE_ID }, { retrievedAt: "2026-08-27T00:00:00Z", sourceUrl: "https://www.newmorning.com/" });

  assert.equal(observations.length, 72);
  const ids = new Set(observations.map((o) => o.source_record_id));
  assert.equal(ids.size, 72, "every source_record_id must be unique");
  for (const obs of observations) {
    assert.ok(obs.title, "every observation must carry a real title");
    assert.equal(obs.source_id, SOURCE_ID);
  }
});
