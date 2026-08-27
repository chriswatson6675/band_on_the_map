import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractMuseuDoFadoEventFacts,
  parseMuseuDoFadoAgendaLinks,
  parseMuseuDoFadoDateToIso,
} from "../ingestion/museu-do-fado/discovery.mjs";

async function fixture(relPath) {
  return readFile(new URL(`../fixtures/museu-do-fado/${relPath}`, import.meta.url), "utf8");
}

test("discovery finds every real, deduplicated /evento/ link from the events-list excerpt", async () => {
  const html = await fixture("pages/eventos-list-excerpt.html");
  const links = parseMuseuDoFadoAgendaLinks(html);

  assert.equal(links.length, 7, "6 ordinary cards + 1 highlighted/featured card");
  for (const link of links) {
    assert.match(link, /^https:\/\/museudofado\.pt\/evento\/[a-z0-9-]+$/);
  }
  assert.equal(new Set(links).size, links.length, "no duplicates");

  assert.deepEqual(links, [
    "https://museudofado.pt/evento/o-fado-sou-eu",
    "https://museudofado.pt/evento/marco-rodrigues-canta-carlos-do-carmo",
    "https://museudofado.pt/evento/sul",
    "https://museudofado.pt/evento/pop-up-fado-4",
    "https://museudofado.pt/evento/a-descoberta-do-fado",
    "https://museudofado.pt/evento/visitas-cantadas-8",
    "https://museudofado.pt/evento/a-todas-as-mulheres",
  ]);
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseMuseuDoFadoAgendaLinks(""), /non-empty/);
  assert.throws(() => parseMuseuDoFadoAgendaLinks("   "), /non-empty/);
});

test("extractor re-derives the SAME facts as evidence/offline-proof-output.txt for Marco Rodrigues canta Carlos do Carmo", async () => {
  const html = await fixture("pages/detail-marco-rodrigues-canta-carlos-do-carmo.html");
  const facts = extractMuseuDoFadoEventFacts(html);

  assert.equal(facts.title, "Marco Rodrigues canta Carlos do Carmo");
  assert.equal(facts.date_text, "7 novembro, 2026");
  assert.equal(facts.date_iso, "2026-11-07");
  assert.equal(facts.time_text, "19:00");
  assert.equal(facts.end_date_text, "7 novembro, 2026");
  assert.equal(facts.end_time_text, "20:30");
  assert.equal(facts.venue_location_text, "Centro Cultural de Belém - Grande Auditório");
  assert.equal(facts.event_url, "https://museudofado.pt/evento/marco-rodrigues-canta-carlos-do-carmo");
  assert.equal(facts.price_text, "12,50€-25,00€");
});

test("extractor re-derives the SAME facts as evidence/offline-proof-output.txt for SUL", async () => {
  const html = await fixture("pages/detail-sul.html");
  const facts = extractMuseuDoFadoEventFacts(html);

  assert.equal(facts.title, "SUL");
  assert.equal(facts.date_text, "30 outubro, 2026");
  assert.equal(facts.date_iso, "2026-10-30");
  assert.equal(facts.time_text, "20:00");
  assert.equal(facts.end_date_text, "30 outubro, 2026");
  assert.equal(facts.end_time_text, "21:30");
  assert.equal(facts.venue_location_text, "Centro Cultural de Belém - Pequeno Auditório");
  assert.equal(facts.event_url, "https://museudofado.pt/evento/sul");
  assert.equal(facts.price_text, "12,00€-15,00€");
});

test("the &euro; HTML entity is decoded, not treated as literal text (Pop-Up Fado)", async () => {
  const html = await fixture("pages/detail-pop-up-fado-4.html");
  const facts = extractMuseuDoFadoEventFacts(html);

  assert.equal(facts.title, "Pop-Up Fado");
  assert.equal(facts.price_text, "3 € por pessoa");
  assert.doesNotMatch(facts.price_text, /&euro;/);
  assert.equal(facts.venue_location_text, "Museu do Fado");
});

test("the one highlighted/featured card's own detail page (O Fado Sou Eu!) extracts the same way as an ordinary card's", async () => {
  const html = await fixture("pages/detail-o-fado-sou-eu.html");
  const facts = extractMuseuDoFadoEventFacts(html);

  assert.equal(facts.title, "O Fado Sou Eu!");
  assert.equal(facts.date_iso, "2026-08-26");
  assert.equal(facts.price_text, "3€ por pessoa");
});

test("extractMuseuDoFadoEventFacts rejects HTML with no <h1>", () => {
  assert.throws(() => extractMuseuDoFadoEventFacts("<html><body>no title here</body></html>"), /h1/);
});

test("extractMuseuDoFadoEventFacts rejects HTML missing the structured field block", () => {
  const html = '<html><body><h1>Some Event</h1><meta property="og:url" content="https://museudofado.pt/evento/some-event" /></body></html>';
  assert.throws(() => extractMuseuDoFadoEventFacts(html), /wraps-description/);
});

test("extractMuseuDoFadoEventFacts rejects empty input", () => {
  assert.throws(() => extractMuseuDoFadoEventFacts(""), /non-empty/);
});

test("parseMuseuDoFadoDateToIso mechanically parses a single 'D month, YYYY' date, never guesses on other shapes", () => {
  assert.equal(parseMuseuDoFadoDateToIso("7 novembro, 2026"), "2026-11-07");
  assert.equal(parseMuseuDoFadoDateToIso("3 setembro, 2026"), "2026-09-03");

  // A multi-date range, as seen on the list page's own "Visitas Cantadas" card
  // — deliberately not parsed into any single date.
  assert.equal(parseMuseuDoFadoDateToIso("25 julho - 5 setembro, 2026"), null);

  assert.equal(parseMuseuDoFadoDateToIso("not a date"), null);
  assert.equal(parseMuseuDoFadoDateToIso(null), null);
  assert.equal(parseMuseuDoFadoDateToIso(undefined), null);
});
