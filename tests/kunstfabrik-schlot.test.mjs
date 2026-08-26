import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractDetailFields, parseDatumField, toObservation } from "../ingestion/kunstfabrik-schlot/observation-adapter.mjs";
import { extractLinksMatching } from "../ingestion/html-link-discovery/discovery.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/kunstfabrik-schlot-berlin/${name}`, import.meta.url), "utf8");
}

test("parseDatumField: real 'Month D, YYYY' values parse to ISO dates", () => {
  assert.equal(parseDatumField("August 26, 2026"), "2026-08-26");
  assert.equal(parseDatumField("August 28, 2026"), "2026-08-28");
  assert.equal(parseDatumField("not a date"), null);
});

test("html-link-discovery reuse: discovers real event links from the list page", async () => {
  const list = await fixture("programm.html");
  const urls = extractLinksMatching(list, /href="(https:\/\/kunstfabrik-schlot\.de\/event\/[a-z0-9-]+\/)"/g, {
    baseUrl: "https://kunstfabrik-schlot.de",
  });
  assert.ok(urls.length >= 1);
  assert.ok(urls.some((u) => u.includes("jazzkollektiv-berlin-kollektiv-nights")));
});

test("extractDetailFields + toObservation: real detail page yields a real Observation", async () => {
  const detail = await fixture("event-detail.html");
  const fields = extractDetailFields(detail);
  assert.equal(fields.date, "2026-08-26");
  assert.equal(fields.time, "20:00 Uhr");

  const obs = toObservation({
    card: { title: "Kollektiv Nights", eventUrl: "https://kunstfabrik-schlot.de/event/jazzkollektiv-berlin-kollektiv-nights/" },
    detailHtml: detail,
    retrievedAt: "2026-08-26T13:00:00Z",
  });
  assert.equal(obs.source_id, "kunstfabrik-schlot-berlin");
  assert.equal(obs.source_record_id, "jazzkollektiv-berlin-kollektiv-nights");
  assert.equal(obs.start.date, "2026-08-26");
  assert.equal(obs.venue_name, "Kunstfabrik Schlot");

  assert.throws(() => extractDetailFields(""), /non-empty/);
});
