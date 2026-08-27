import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractGulbenkianPriceText,
  parseGulbenkianAgendaLinks,
  parseGulbenkianEventDetail,
} from "../ingestion/gulbenkian/discovery.mjs";

async function fixture(relativePath) {
  return readFile(new URL(`../fixtures/gulbenkian/${relativePath}`, import.meta.url), "utf8");
}

test("discovery finds real, deduplicated detail-page links from the agenda list-page excerpt", async () => {
  const html = await fixture("discovery/agenda-index-excerpt.html");
  const links = parseGulbenkianAgendaLinks(html);

  assert.ok(links.length >= 5, "expected at least 5 distinct event links");
  for (const link of links) {
    assert.match(link, /^https:\/\/gulbenkian\.pt\/musica\/agenda\/[a-z0-9-]+\/$/);
  }
  assert.equal(new Set(links).size, links.length, "no duplicates");

  assert.ok(links.includes("https://gulbenkian.pt/musica/agenda/vale-do-silencio-3/"));
  assert.ok(links.includes("https://gulbenkian.pt/musica/agenda/kafka-fragmente/"));
  assert.ok(links.includes("https://gulbenkian.pt/musica/agenda/quarteto-diotima/"));
  assert.ok(links.includes("https://gulbenkian.pt/musica/agenda/beatrice-rana-4/"));
});

test("a two-date production listed twice on the agenda (Oedipus Rex) still dedupes to one URL", async () => {
  const html = await fixture("discovery/agenda-index-excerpt.html");
  const links = parseGulbenkianAgendaLinks(html);
  const oedipusLinks = links.filter((link) => link === "https://gulbenkian.pt/musica/agenda/oedipus-rex/");
  assert.equal(oedipusLinks.length, 1, "the same href appearing on two cards must dedupe to a single link");
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseGulbenkianAgendaLinks(""), /non-empty/);
  assert.throws(() => parseGulbenkianAgendaLinks(null), /non-empty/);
});

test("the agenda list-page's own bare /agenda/ URL is never mistaken for a detail-page link", async () => {
  const html = await fixture("discovery/agenda-index-excerpt.html");
  const links = parseGulbenkianAgendaLinks(html);
  assert.equal(links.includes("https://gulbenkian.pt/musica/agenda/"), false);
});

test("parseGulbenkianEventDetail: Vale do Silêncio (off-site, free admission)", async () => {
  const html = await fixture("pages/vale-do-silencio-3.html");
  const record = parseGulbenkianEventDetail(html);

  assert.equal(record.source_record_id, "106594");
  assert.equal(record.title, "Vale do Silêncio");
  assert.equal(record.description, "Coro e Orquestra Gulbenkian");
  assert.equal(record.start_iso, "2026-09-05T21:30:00");
  assert.equal(record.end_iso, "2026-09-05T23:00:00");
  assert.equal(record.location_name, "Parque Vale do Silêncio");
  assert.equal(record.event_url, "https://gulbenkian.pt/musica/agenda/vale-do-silencio-3/");
  assert.equal(record.price_text, "Entrada Livre");
});

test("parseGulbenkianEventDetail: Kafka-Fragmente (Grande Auditório, free admission)", async () => {
  const html = await fixture("pages/kafka-fragmente.html");
  const record = parseGulbenkianEventDetail(html);

  assert.equal(record.source_record_id, "106787");
  assert.equal(record.title, "Kafka-Fragmente");
  assert.equal(record.start_iso, "2026-09-09T20:00:00");
  assert.equal(record.end_iso, "2026-09-09T21:00:00");
  assert.equal(record.location_name, "Grande Auditório");
  assert.equal(record.event_url, "https://gulbenkian.pt/musica/agenda/kafka-fragmente/");
  assert.equal(record.price_text, "Entrada gratuita");
});

test("parseGulbenkianEventDetail: Beatrice Rana (Grande Auditório, priced range, no JSON-LD description at all)", async () => {
  const html = await fixture("pages/beatrice-rana-4.html");
  const record = parseGulbenkianEventDetail(html);

  assert.equal(record.source_record_id, "106821");
  assert.equal(record.title, "Beatrice Rana");
  assert.equal(record.description, null, "this source's own JSON-LD genuinely omits description here — must be null, not guessed");
  assert.equal(record.start_iso, "2026-10-11T18:00:00");
  assert.equal(record.end_iso, "2026-10-11T20:00:00");
  assert.equal(record.location_name, "Grande Auditório");
  assert.equal(record.price_text, "24,00 € – 46,00 €");
});

test("parseGulbenkianEventDetail: Quarteto Diotima (Grande Auditório, free admission)", async () => {
  const html = await fixture("pages/quarteto-diotima.html");
  const record = parseGulbenkianEventDetail(html);

  assert.equal(record.source_record_id, "106799");
  assert.equal(record.title, "Quarteto Diotima");
  assert.equal(record.location_name, "Grande Auditório");
  assert.equal(record.price_text, "Entrada gratuita");
});

test("the off-site Vale do Silêncio location_name is genuinely different from every Grande Auditório event's location_name", async () => {
  const [vale, kafka, diotima, beatrice] = await Promise.all([
    fixture("pages/vale-do-silencio-3.html").then(parseGulbenkianEventDetail),
    fixture("pages/kafka-fragmente.html").then(parseGulbenkianEventDetail),
    fixture("pages/quarteto-diotima.html").then(parseGulbenkianEventDetail),
    fixture("pages/beatrice-rana-4.html").then(parseGulbenkianEventDetail),
  ]);

  assert.equal(vale.location_name, "Parque Vale do Silêncio");
  for (const grandeAuditorioEvent of [kafka, diotima, beatrice]) {
    assert.equal(grandeAuditorioEvent.location_name, "Grande Auditório");
    assert.notEqual(vale.location_name, grandeAuditorioEvent.location_name);
  }
});

test("extractGulbenkianPriceText reads the static DOM node directly, independent of JSON-LD", async () => {
  const html = await fixture("pages/vale-do-silencio-3.html");
  assert.equal(extractGulbenkianPriceText(html), "Entrada Livre");
});

test("parseGulbenkianEventDetail rejects empty input", () => {
  assert.throws(() => parseGulbenkianEventDetail(""), /non-empty/);
});

test("parseGulbenkianEventDetail throws (never guesses) when no JSON-LD MusicEvent/Event node is present", () => {
  assert.throws(
    () => parseGulbenkianEventDetail("<html><body><h1>No structured data here</h1></body></html>"),
    /JSON-LD/,
  );
});

test("parseGulbenkianEventDetail throws when the JSON-LD is present but missing a usable price DOM node", () => {
  const html = `
    <script type="application/ld+json">
      {"@graph":[{"@type":"MusicEvent","@id":"https://gulbenkian.pt/musica/MusicEvent/999999","name":"Test Event","url":"https://gulbenkian.pt/musica/agenda/test-event/","startDate":"2026-01-01 20:00:00","endDate":"2026-01-01 21:00:00","location":[{"@type":"Place","name":"Grande Auditório"}]}]}
    </script>
  `;
  assert.throws(() => parseGulbenkianEventDetail(html), /price/);
});
