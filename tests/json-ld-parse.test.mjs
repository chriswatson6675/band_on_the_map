import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJsonLdNodes,
  extractEventNodes,
  filterMusicEventNodes,
  normaliseJsonLdEvent,
} from "../ingestion/json-ld/parse.mjs";

function html(scripts) {
  return `<html><head>${scripts
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join("\n")}</head><body></body></html>`;
}

test("extractJsonLdNodes flattens a single object per script tag", () => {
  const doc = html([{ "@type": "Organization", name: "Test Org" }, { "@type": "Event", name: "Gig" }]);
  const nodes = extractJsonLdNodes(doc);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[1].name, "Gig");
});

test("extractJsonLdNodes flattens a top-level array within one script tag", () => {
  const raw = `<script type="application/ld+json">${JSON.stringify([
    { "@type": "Event", name: "A" },
    { "@type": "Event", name: "B" },
  ])}</script>`;
  const nodes = extractJsonLdNodes(`<html>${raw}</html>`);
  assert.equal(nodes.length, 2);
});

test("extractJsonLdNodes flattens an @graph-wrapped document", () => {
  const raw = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "Site" },
      { "@type": "MusicEvent", name: "Concert" },
    ],
  })}</script>`;
  const nodes = extractJsonLdNodes(`<html>${raw}</html>`);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[1].name, "Concert");
});

test("extractJsonLdNodes unwraps an ItemList of ListItem->item Events (e.g. Antilla BCN's 'Upcoming Events' block)", () => {
  const raw = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Upcoming Events",
    itemListElement: [
      { "@type": "ListItem", position: 1, item: { "@type": "Event", name: "Antilla School Party" } },
      { "@type": "ListItem", position: 2, item: { "@type": "Event", name: "Sunday Cuban Timba" } },
    ],
  })}</script>`;
  const nodes = extractJsonLdNodes(`<html>${raw}</html>`);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].name, "Antilla School Party");
  assert.equal(nodes[1].name, "Sunday Cuban Timba");
});

test("a malformed JSON-LD block is skipped, not thrown, by default", () => {
  const doc = `<html><script type="application/ld+json">{ not valid json </script>
    <script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Real" })}</script></html>`;
  const nodes = extractJsonLdNodes(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "Real");
});

test("strict mode throws on the first malformed block", () => {
  const doc = `<script type="application/ld+json">{ not valid json </script>`;
  assert.throws(() => extractJsonLdNodes(doc, { strict: true }), /did not parse as valid JSON/);
});

test("extractJsonLdNodes throws for empty input", () => {
  assert.throws(() => extractJsonLdNodes(""), /non-empty HTML/);
});

test("extractEventNodes defaults to Event/MusicEvent and excludes other types", () => {
  const doc = html([
    { "@type": "Organization", name: "Org" },
    { "@type": "TheaterEvent", name: "Play" },
    { "@type": "MusicEvent", name: "Gig" },
    { "@type": "Event", name: "Generic Event" },
  ]);
  const nodes = extractEventNodes(doc);
  assert.deepEqual(
    nodes.map((n) => n.name),
    ["Gig", "Generic Event"],
  );
});

test("extractEventNodes accepts an array @type that includes an accepted type", () => {
  const doc = html([{ "@type": ["Event", "MusicEvent"], name: "Both" }]);
  assert.equal(extractEventNodes(doc).length, 1);
});

test("extractEventNodes honours a custom types set", () => {
  const doc = html([{ "@type": "SocialEvent", name: "Club Night" }]);
  assert.equal(extractEventNodes(doc).length, 0);
  assert.equal(extractEventNodes(doc, { types: new Set(["SocialEvent"]) }).length, 1);
});

test("filterMusicEventNodes always passes an explicit MusicEvent regardless of text", () => {
  const nodes = [{ "@type": "MusicEvent", name: "Untitled Programme Item" }];
  const { musicNodes, rejectedNodes } = filterMusicEventNodes(nodes);
  assert.equal(musicNodes.length, 1);
  assert.equal(rejectedNodes.length, 0);
});

test("filterMusicEventNodes accepts a plain Event whose name/description matches a music keyword", () => {
  const nodes = [
    { "@type": "Event", name: "Concert de Jazz al Poble Sec" },
    { "@type": "Event", name: "Taller de ceràmica" }, // pottery workshop — not music
  ];
  const { musicNodes, rejectedNodes } = filterMusicEventNodes(nodes);
  assert.equal(musicNodes.length, 1);
  assert.equal(musicNodes[0].name, "Concert de Jazz al Poble Sec");
  assert.equal(rejectedNodes.length, 1);
  assert.equal(rejectedNodes[0].name, "Taller de ceràmica");
});

test("filterMusicEventNodes is diacritic- and case-insensitive", () => {
  const nodes = [{ "@type": "Event", name: "MÚSICA EN DIRECTE: Nit de Flamenc" }];
  assert.equal(filterMusicEventNodes(nodes).musicNodes.length, 1);
});

test("filterMusicEventNodes honours extraKeywords for a venue-specific term", () => {
  const nodes = [{ "@type": "Event", name: "Vermut Sessions" }];
  assert.equal(filterMusicEventNodes(nodes).musicNodes.length, 0);
  assert.equal(filterMusicEventNodes(nodes, { extraKeywords: ["vermut sessions"] }).musicNodes.length, 1);
});

test("normaliseJsonLdEvent extracts every mapped field without inventing missing ones", () => {
  const node = {
    "@type": "MusicEvent",
    name: "Test Gig",
    description: "A test gig",
    url: "https://example.cat/evento/test-gig/",
    startDate: "2026-09-17T21:00:00+02:00",
    endDate: "2026-09-17T23:00:00+02:00",
    location: {
      name: "Sala Test",
      address: { streetAddress: "Carrer Test 1", addressLocality: "Barcelona", postalCode: "08001", addressCountry: "ES" },
    },
    performer: [{ "@type": "MusicGroup", name: "Test Band" }],
    offers: { "@type": "Offer", price: "15", priceCurrency: "EUR", url: "https://tickets.example.cat/x" },
  };
  const record = normaliseJsonLdEvent(node, { deriveId: (n) => n.url.split("/").filter(Boolean).pop() });
  assert.equal(record.source_record_id, "test-gig");
  assert.equal(record.title, "Test Gig");
  assert.equal(record.location_name, "Sala Test");
  assert.equal(record.location_address.addressLocality, "Barcelona");
  assert.deepEqual(record.performers, ["Test Band"]);
  assert.equal(record.price_text, "15 EUR");
  assert.equal(record.ticket_url, "https://tickets.example.cat/x");
});

test("normaliseJsonLdEvent leaves fields the node genuinely lacks as null, never guessed", () => {
  const record = normaliseJsonLdEvent({ "@type": "Event", name: "Bare Event" });
  assert.equal(record.description, null);
  assert.equal(record.location_name, null);
  assert.equal(record.location_address, null);
  assert.deepEqual(record.performers, []);
  assert.equal(record.price_text, null);
  assert.equal(record.source_record_id, null); // no deriveId supplied
});

test("normaliseJsonLdEvent handles a plain string performer", () => {
  const record = normaliseJsonLdEvent({ "@type": "MusicEvent", name: "X", performer: "Solo Artist" });
  assert.deepEqual(record.performers, ["Solo Artist"]);
});

test("normaliseJsonLdEvent throws for a non-object node", () => {
  assert.throws(() => normaliseJsonLdEvent(null), /requires a JSON-LD node object/);
});
