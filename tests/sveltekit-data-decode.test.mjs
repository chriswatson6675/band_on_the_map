// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — offline,
// deterministic, no-network proof that ingestion/sveltekit-data/decode.mjs
// genuinely decodes a real, retained SvelteKit __data.json response
// (Bi Nuu's own /de/events/__data.json) into real event records.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { decodeSvelteKitData, resolveDevalueRef } from "../ingestion/sveltekit-data/decode.mjs";

test("decodeSvelteKitData: the real retained Bi Nuu __data.json decodes into 46 real events", async () => {
  const text = await readFile(new URL("../fixtures/bi-nuu-berlin/events-listing-data.json", import.meta.url), "utf8");
  const decoded = decodeSvelteKitData(text);
  assert.equal(decoded.events.length, 46);
  const first = decoded.events[0];
  assert.equal(first.id, "fko44tarc3g5wlv");
  assert.equal(first.title, "Oidorno");
  assert.equal(first.start, "2026-08-28 18:00:00.000Z");
  // the exact real per-record venue-override case this investigation flagged:
  assert.equal(first.locationNew, "Festsaal Kreuzberg");
});

test("resolveDevalueRef: a primitive value at the given index is returned as-is", () => {
  assert.equal(resolveDevalueRef(["hello", 42, true, null], 0), "hello");
  assert.equal(resolveDevalueRef(["hello", 42, true, null], 1), 42);
  assert.equal(resolveDevalueRef(["hello", 42, true, null], 3), null);
});

test("resolveDevalueRef: throws on a genuine circular reference rather than looping forever", () => {
  const flat = [{ self: 0 }];
  assert.throws(() => resolveDevalueRef(flat, 0), /circular/);
});

test("decodeSvelteKitData: throws on malformed input", async () => {
  assert.throws(() => decodeSvelteKitData(""), /non-empty/);
  assert.throws(() => decodeSvelteKitData('{"type":"not-data"}'), /envelope/);
});
