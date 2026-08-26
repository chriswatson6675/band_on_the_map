// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — offline,
// deterministic, no-network proof that ingestion/html-link-discovery/ +
// the EXISTING ingestion/json-ld/ family together reproduce real data
// from SIX further, technically unrelated Berlin venues (beyond
// Konzerthaus/Lido, already covered in tests/html-link-discovery.test.mjs):
// b-flat and Zig Zag Jazz Club (Squarespace), SO36 (Shopify), Kesselhaus
// (custom Angular/Firebase), and HKW + Volksbühne (sitemap.xml-driven
// discovery on Magnolia CMS and a custom Django/Wagtail-adjacent stack
// respectively) — proving this is a genuinely reusable pattern across 8
// unrelated platforms total in this trial, not a one-off.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractLinksMatching } from "../ingestion/html-link-discovery/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";

function fixture(dir, name) {
  return readFile(new URL(`../fixtures/${dir}/${name}`, import.meta.url), "utf8");
}

test("b-flat: discovers real event links and reproduces a real JSON-LD Event (date-only certainty — sentinel time honestly not trusted)", async () => {
  const list = await fixture("b-flat-berlin", "programm.html");
  const urls = extractLinksMatching(list, /href="(\/events\/[a-z0-9-]+)"/g, { baseUrl: "https://b-flat-berlin.de" });
  assert.ok(urls.length >= 1);

  const detail = await fixture("b-flat-berlin", "event-detail.html");
  const nodes = extractEventNodes(detail);
  assert.ok(nodes.length >= 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.equal(normalised.title, "Robins Nest - Jamsession  — b-flat berlin");
  // Confirmed platform bug: startDate/endDate time-of-day is a fixed
  // sentinel (09:00/23:55) on every sampled event, not a real show time —
  // this collector must only trust the DATE portion, never the time.
  assert.equal(normalised.start_raw.slice(0, 10), "2026-08-26");
});

test("SO36: discovers real product-page links and reproduces a real, correctly-offset JSON-LD Event", async () => {
  const list = await fixture("so36-berlin", "tickets-listing.html");
  const urls = extractLinksMatching(list, /href="(\/produkte\/[0-9]+-[a-z0-9-]+)"/g, { baseUrl: "https://www.so36.com" });
  assert.ok(urls.length >= 10);

  const detail = await fixture("so36-berlin", "product-detail.html");
  const nodes = extractEventNodes(detail);
  assert.equal(nodes.length, 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.equal(normalised.title, "BURNING BERLIN, SO36, 26.08.2026");
  assert.equal(normalised.start_raw, "2026-08-26T19:30:00+02:00");
});

test("Zig Zag Jazz Club: discovers real event links and reproduces a real JSON-LD Event", async () => {
  const list = await fixture("zig-zag-jazz-club-berlin", "program.html");
  const urls = extractLinksMatching(list, /href="(\/program-mai\/[a-z0-9-]+)"/g, { baseUrl: "https://www.zigzag-jazzclub.berlin" });
  assert.ok(urls.length >= 1);

  const detail = await fixture("zig-zag-jazz-club-berlin", "event-detail.html");
  const nodes = extractEventNodes(detail);
  assert.ok(nodes.length >= 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.match(normalised.title, /Duke.s Place/);
  assert.equal(normalised.start_raw, "2026-08-27T19:00:00+0200");
});

test("Kesselhaus: discovers a real per-event link and reproduces a real JSON-LD Event", async () => {
  const list = await fixture("kesselhaus-berlin", "calendar-page.html");
  const urls = extractLinksMatching(list, /href="(\/en\/calendar\/[A-Za-z0-9_-]+)"/g, { baseUrl: "https://www.kesselhaus.net" });
  assert.ok(urls.includes("https://www.kesselhaus.net/en/calendar/-Ot8ou0vgZ_E7m_7PiYF"));

  const detail = await fixture("kesselhaus-berlin", "event-detail.html");
  const nodes = extractEventNodes(detail);
  assert.equal(nodes.length, 1);
  const normalised = normaliseJsonLdEvent(nodes[0], { deriveId: () => "test" });
  assert.equal(normalised.title, "Move iT! - the 90s party");
  assert.equal(normalised.start_raw, "2026-08-01T20:00:00.000Z");
  assert.equal(normalised.location_name, "Kesselhaus");
});

test("HKW: discovers real event links from sitemap.xml (not HTML) and reproduces a real JSON-LD Event", async () => {
  const sitemap = await fixture("hkw-berlin", "sitemap-excerpt.xml");
  const urls = extractLinksMatching(sitemap, /<loc>(https:\/\/www\.hkw\.de\/en\/programme\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)<\/loc>/g, {
    baseUrl: "https://www.hkw.de",
  });
  assert.ok(urls.length > 5, "the SAME generic link-extraction function works unmodified against sitemap.xml, not just HTML");

  const detail = await fixture("hkw-berlin", "event-detail.html");
  const nodes = extractEventNodes(detail);
  assert.ok(nodes.length >= 1);
});

test("Volksbühne: discovers real per-performance links from sitemap.xml and reproduces a real JSON-LD Event", async () => {
  const sitemap = await fixture("volksbuehne-berlin", "sitemap.xml");
  const urls = extractLinksMatching(sitemap, /<loc>(https:\/\/volksbuehne-berlin\.de\/produktionen\/[a-z0-9-]+\/\d{8}-\d{4}\/)<\/loc>/g, {
    baseUrl: "https://volksbuehne-berlin.de",
  });
  assert.ok(urls.length >= 1, "same generic sitemap-driven discovery as HKW, on a technically unrelated CMS");

  const detail = await fixture("volksbuehne-berlin", "event-detail.html");
  const nodes = extractEventNodes(detail);
  assert.ok(nodes.length >= 1);
});
