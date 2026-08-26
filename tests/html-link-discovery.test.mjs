// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — offline,
// deterministic, no-network proof that ingestion/html-link-discovery/
// genuinely generalises across TWO real, technically unrelated Berlin
// venues (Konzerthaus Berlin: custom in-house CMS; Lido Berlin: Ruby on
// Rails) — the same one function, given each venue's own pattern.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractLinksMatching } from "../ingestion/html-link-discovery/discovery.mjs";

function fixture(dir, name) {
  return readFile(new URL(`../fixtures/${dir}/${name}`, import.meta.url), "utf8");
}

test("extractLinksMatching: real Konzerthaus Berlin day-list page yields real, absolute event detail URLs", async () => {
  const html = await fixture("konzerthaus-berlin", "programme-listing.html");
  const urls = extractLinksMatching(html, /href="(\/en\/programm\/[a-z0-9-]+\/\d+)"/g, {
    baseUrl: "https://www.konzerthaus.de",
  });
  assert.ok(urls.length > 5, "expected many real event links from the retained listing page");
  assert.ok(urls.every((u) => u.startsWith("https://www.konzerthaus.de/en/programm/")));
  assert.ok(urls.includes("https://www.konzerthaus.de/en/programm/akademie-fur-alte-musik-berlin/12471"));
  // deduplication: every URL appears exactly once even though the site links to
  // the same event from multiple places on the page (image + title + button).
  assert.equal(new Set(urls).size, urls.length);
});

test("extractLinksMatching: real Lido Berlin homepage yields real, absolute event detail URLs", async () => {
  const html = await fixture("lido-berlin", "homepage-excerpt.html");
  const urls = extractLinksMatching(html, /href="(\/events\/[a-z0-9-]+)"/g, {
    baseUrl: "https://www.lido-berlin.de",
  });
  assert.ok(urls.length > 0);
  assert.ok(urls.every((u) => u.startsWith("https://www.lido-berlin.de/events/")));
  assert.ok(urls.includes("https://www.lido-berlin.de/events/2026-08-26-shakey-graves"));
});

test("extractLinksMatching: a genuinely empty result is a legitimate outcome, not an error", async () => {
  const urls = extractLinksMatching("<html><body>nothing here</body></html>", /href="(\/events\/[a-z0-9-]+)"/g, {
    baseUrl: "https://example.com",
  });
  assert.deepEqual(urls, []);
});

test("extractLinksMatching: throws on empty input, a non-global pattern, or a missing baseUrl", async () => {
  assert.throws(() => extractLinksMatching("", /x/g, { baseUrl: "https://example.com" }), /non-empty/);
  assert.throws(
    () => extractLinksMatching("<a href='/x'>x</a>", /href='(\/x)'/, { baseUrl: "https://example.com" }),
    /global RegExp/,
  );
  assert.throws(() => extractLinksMatching("<a href='/x'>x</a>", /href='(\/x)'/g, {}), /baseUrl/);
});

test("extractLinksMatching + the EXISTING generic JSON-LD parser: end-to-end reproduction against a real Konzerthaus event detail page discovered this way", async () => {
  const { extractEventNodes, normaliseJsonLdEvent } = await import("../ingestion/json-ld/parse.mjs");
  const listHtml = await fixture("konzerthaus-berlin", "programme-listing.html");
  const urls = extractLinksMatching(listHtml, /href="(\/en\/programm\/[a-z0-9-]+\/\d+)"/g, {
    baseUrl: "https://www.konzerthaus.de",
  });
  assert.ok(urls.includes("https://www.konzerthaus.de/en/programm/konzerthausorchester-berlin-ivan-fischer/12461"));

  const detailHtml = await fixture("konzerthaus-berlin", "event-detail-1.html");
  const nodes = extractEventNodes(detailHtml);
  assert.equal(nodes.length, 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "12461" });
  assert.equal(normalised.title, "Konzerthausorchester Berlin, Iván Fischer");
  assert.equal(normalised.start_raw, "2026-09-25T19:00");
});
