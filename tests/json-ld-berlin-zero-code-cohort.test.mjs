// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — offline,
// deterministic, no-network proof that FIVE Berlin venues acquire real
// events through EXISTING collector families with genuinely zero new
// per-venue code (Tempodrom, Waldbühne, A-Trane, Privatclub: a single
// JSON-LD page fetch via ingestion/json-ld/; Yaam: the Tribe Events
// Calendar REST family, ingestion/events-calendar-api/, unchanged since
// Barcelona's Jamboree). Tempodrom's own real page also exposed one
// genuine parser gap (an unquoted `type=application/ld+json` attribute) —
// fixed as a small, backward-compatible widening of the EXISTING parser
// regex, covered here too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventNodes, extractJsonLdNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { parseEventsPage, normalizeEventRecord } from "../ingestion/events-calendar-api/client.mjs";

function fixture(dir, name) {
  return readFile(new URL(`../fixtures/${dir}/${name}`, import.meta.url), "utf8");
}

test("Tempodrom: real page's unquoted <script type=application/ld+json> now parses (150 real events)", async () => {
  const html = await fixture("tempodrom-berlin", "programm.html");
  assert.match(html, /<script type=application\/ld\+json>/, "the real retained page genuinely has no quotes around the type attribute");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 150);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.equal(normalised.title, "Berlin Salsacongress 2026");
});

test("extractJsonLdNodes: quoted and unquoted script type attributes both still work (backward compatible)", () => {
  const quoted = '<script type="application/ld+json">{"@type":"Event","name":"Quoted"}</script>';
  const singleQuoted = "<script type='application/ld+json'>{\"@type\":\"Event\",\"name\":\"SingleQuoted\"}</script>";
  const unquoted = '<script type=application/ld+json>{"@type":"Event","name":"Unquoted"}</script>';
  assert.equal(extractJsonLdNodes(quoted)[0].name, "Quoted");
  assert.equal(extractJsonLdNodes(singleQuoted)[0].name, "SingleQuoted");
  assert.equal(extractJsonLdNodes(unquoted)[0].name, "Unquoted");
});

test("Waldbühne: real page's JSON-LD array reproduces real events", async () => {
  const html = await fixture("waldbuehne-berlin", "events-page.html");
  const nodes = extractEventNodes(html);
  assert.ok(nodes.length >= 10);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.equal(normalised.title, "Gianna Nannini");
});

test("A-Trane: real programme page's per-event JSON-LD blocks reproduce real events", async () => {
  const html = await fixture("a-trane-berlin", "programm.html");
  const nodes = extractEventNodes(html);
  assert.ok(nodes.length >= 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.match(normalised.title, /A-TRANE/);
});

test("Privatclub: real homepage's retained JSON-LD MusicEvent blocks reproduce real events", async () => {
  const text = await fixture("privatclub-berlin", "homepage-ldjson.html");
  // This bounded fixture retains several real, separate per-event JSON-LD
  // arrays (script tags stripped by the investigator), delimited by the
  // investigator's own "---NEXT EVENT---" marker (not real page content) —
  // parse the first block only for this offline-proof check.
  const firstBlock = text.split("---NEXT EVENT---")[0].trim();
  const nodes = JSON.parse(firstBlock);
  assert.equal(nodes.length, 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.equal(normalised.title, "BROTHER WALLACE");
  assert.equal(nodes[0]["@type"], "MusicEvent");
});

test("Yaam: real Tribe Events REST API sample reproduces via the EXISTING events-calendar-api family (unchanged since Barcelona)", async () => {
  const text = await fixture("yaam-berlin", "tribe-events-sample.json");
  const parsed = parseEventsPage(text);
  assert.ok(parsed.events.length >= 1);
  const normalised = normalizeEventRecord(parsed.events[0]);
  assert.equal(normalised.source_record_id, "2278");
  assert.match(normalised.event_url ?? "", /yaam\.de/);
});
