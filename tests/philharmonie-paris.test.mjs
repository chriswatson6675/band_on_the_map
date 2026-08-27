import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCardMeta, sanitiseJsonLdControlCharacters } from "../ingestion/philharmonie-paris/discovery.mjs";
import { extractDetailEventNode, toObservation } from "../ingestion/philharmonie-paris/observation-adapter.mjs";

async function agendaAjaxFixture() {
  const text = await readFile(new URL("../fixtures/philharmonie-paris/agenda-ajax-place45.json", import.meta.url), "utf8");
  return JSON.parse(text);
}

async function detailHtml() {
  return readFile(new URL("../fixtures/philharmonie-paris/detail-gogopenguin.html", import.meta.url), "utf8");
}

test("extractEventCardMeta finds every genuine schedulable EventCard, excluding the related 'Pre-concert Talks' teaser", async () => {
  const fixture = await agendaAjaxFixture();
  const content = fixture.first_4_article_blocks_verbatim.join("\n");
  const cards = extractEventCardMeta(content);

  // 4 raw <article> blocks are retained; only 3 carry BOTH data-event-eid
  // AND data-timestamp (the "Pre-concert Talks" related-content card,
  // performance-eid 148565, carries neither and is correctly excluded).
  assert.equal(cards.length, 3);
  assert.ok(!cards.some((c) => c.performanceEid === "148565"));

  const gogo = cards.find((c) => c.eventEid === "30097");
  assert.ok(gogo);
  assert.equal(gogo.performanceEid, "149058");
  assert.equal(gogo.timestampSeconds, 1788109200);
  assert.equal(gogo.category, "Concert");
  assert.equal(gogo.title, "GoGo Penguin");
  assert.equal(gogo.detailHref, "/en/activite/30097?itemId=149058");
});

test("extractEventCardMeta throws on empty input", () => {
  assert.throws(() => extractEventCardMeta(""), /non-empty/);
});

test("sanitiseJsonLdControlCharacters lets already-valid JSON-LD parse identically", () => {
  const clean = '<script type="application/ld+json">{"a":"b"}</script>';
  assert.equal(sanitiseJsonLdControlCharacters(clean), clean);
});

test("extractDetailEventNode parses this source's own real JSON-LD, despite its literal control characters", async () => {
  const node = await extractDetailEventNode(await detailHtml());
  assert.equal(node["@type"], "MusicEvent");
  assert.equal(node.name, "GoGo Penguin");
  assert.equal(node.startDate, "2026-08-30T19:00:00+02:00");
  assert.equal(node.endDate, "2026-08-30T21:45:00+02:00");
  assert.equal(node.location.name, "Grande salle Pierre Boulez - Philharmonie");
  assert.equal(node.location.address, "221 avenue Jean-Jaurès, 75019 Paris");
});

test("a real, retained GoGo Penguin card+detail pair adapts correctly, matching the governed investigation's claimed field values", async () => {
  const fixture = await agendaAjaxFixture();
  const content = fixture.first_4_article_blocks_verbatim.join("\n");
  const cards = extractEventCardMeta(content);
  const gogo = cards.find((c) => c.eventEid === "30097");

  const node = await extractDetailEventNode(await detailHtml());
  const obs = toObservation(gogo, node, {
    retrievedAt: "2026-08-26T22:52:00Z",
    fixturePath: "fixtures/philharmonie-paris/detail-gogopenguin.html",
  });

  assert.equal(obs.source_id, "philharmonie-paris");
  assert.equal(obs.source_record_id, "event-eid:30097/performance-eid:149058");
  assert.equal(obs.title, "GoGo Penguin");

  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.start.iso, "2026-08-30T17:00:00.000Z"); // 2026-08-30T19:00:00+02:00
  assert.equal(obs.end.certainty, "UTC_INSTANT");
  assert.equal(obs.end.iso, "2026-08-30T19:45:00.000Z"); // 2026-08-30T21:45:00+02:00

  assert.equal(obs.venue_name, "Grande salle Pierre Boulez - Philharmonie");
  assert.equal(obs.location_text, "221 avenue Jean-Jaurès, 75019 Paris");
  assert.equal(obs.price_text, "45.00 EUR");
  assert.equal(obs.event_url, "https://philharmoniedeparis.fr/en/activite/30097?itemId=149058");

  // Cross-check: the card's own Unix-epoch data-timestamp independently
  // agrees with the detail page's own JSON-LD startDate.
  assert.equal(new Date(gogo.timestampSeconds * 1000).toISOString(), obs.start.iso);
});

test("toObservation throws without cardMeta identity", () => {
  assert.throws(() => toObservation({}, { name: "x" }), /eventEid/);
});
