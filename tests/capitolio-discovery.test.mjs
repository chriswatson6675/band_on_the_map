import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractCapitolioEventFacts, parseCapitolioAgendaLinks } from "../ingestion/capitolio/discovery.mjs";
import { toObservation } from "../ingestion/capitolio/observation-adapter.mjs";

test("discovery finds real, deduplicated /evento/ links from the agenda index", async () => {
  const html = await readFile(
    new URL("../fixtures/capitolio/discovery/agenda-index-excerpt.html", import.meta.url),
    "utf8",
  );
  const links = parseCapitolioAgendaLinks(html);
  assert.ok(links.length >= 5);
  for (const link of links) {
    assert.match(link, /^https:\/\/teatrovariedades-capitolio\.pt\/evento\/[a-z0-9-]+\/$/);
  }
  assert.equal(new Set(links).size, links.length, "no duplicates");
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseCapitolioAgendaLinks(""), /non-empty/);
});

test("extractor re-derives the SAME facts as the already-governed fixtures/capitolio/events.json record (Hugo Lobo Trio, post 2908)", async () => {
  const html = await readFile(
    new URL(
      "../fixtures/capitolio/pages/hugo-lobo-trio-convida-madalena-caldeira.html",
      import.meta.url,
    ),
    "utf8",
  );
  const facts = extractCapitolioEventFacts(html);
  const governed = JSON.parse(await readFile(new URL("../fixtures/capitolio/events.json", import.meta.url), "utf8"));
  const record = governed.records.find((r) => r.wp_shortlink_post_id === "2908");

  assert.equal(facts.title, record.title);
  assert.equal(facts.series_tagline, record.series_tagline);
  assert.equal(facts.date_text, record.date_text);
  assert.equal(facts.date_iso, record.date_iso);
  assert.equal(facts.time_text, record.time_text);
  assert.equal(facts.venue_text, record.venue_text);
  assert.equal(facts.duration_minutes, record.duration_minutes);
  assert.equal(facts.age_rating, record.age_rating);
  assert.equal(facts.price_text, record.price_text);
  assert.equal(facts.ticket_url, record.ticket_url);
});

test("a page-specific ticket CTA and price are captured when present, bounded to that page's own block (Bode Wilson)", async () => {
  const html = await readFile(new URL("../fixtures/capitolio/pages/bode-wilson.html", import.meta.url), "utf8");
  const facts = extractCapitolioEventFacts(html);
  assert.equal(facts.title, "Bode Wilson");
  assert.equal(facts.price_text, "5€");
  assert.equal(facts.ticket_url, "https://hajazznoparquemayer.bol.pt/Comprar/Bilhetes/180745-bode_wilson-capitolio/");
});

test("fields genuinely absent from a page (e.g. no series tagline, no venue text) are null, never guessed", async () => {
  const html = await readFile(new URL("../fixtures/capitolio/pages/ibeyi.html", import.meta.url), "utf8");
  const facts = extractCapitolioEventFacts(html);
  assert.equal(facts.title, "IBEYI");
  assert.equal(facts.series_tagline, null);
  assert.equal(facts.venue_text, null);
  assert.equal(facts.duration_minutes, null);
});

test("extractCapitolioEventFacts feeds directly into the existing, unchanged observation-adapter", async () => {
  const html = await readFile(new URL("../fixtures/capitolio/pages/bode-wilson.html", import.meta.url), "utf8");
  const facts = extractCapitolioEventFacts(html);
  const observation = toObservation({
    wp_shortlink_post_id: "2915",
    url: "https://teatrovariedades-capitolio.pt/evento/bode-wilson/",
    retrieved_at: "2026-08-24T00:00:00Z",
    http_status: 200,
    content_type: "text/html; charset=UTF-8",
    ...facts,
  });
  assert.equal(observation.source_id, "teatro-variedades-capitolio");
  assert.equal(observation.source_record_id, "2915");
  assert.equal(observation.price_text, "5€");
});

test("extractCapitolioEventFacts rejects HTML with no <h1>", () => {
  assert.throws(() => extractCapitolioEventFacts("<html><body>no title here</body></html>"), /h1/);
});
