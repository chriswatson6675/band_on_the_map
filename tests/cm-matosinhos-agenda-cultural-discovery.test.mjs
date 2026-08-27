import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractMatosinhosEventDetailFacts,
  extractPriceLines,
  hasMusicCategoryTag,
  parseMatosinhosMusicaListing,
  parseMatosinhosMusicaNextPageUrl,
} from "../ingestion/cm-matosinhos-agenda-cultural/discovery.mjs";

async function fixture(relPath) {
  return readFile(new URL(`../fixtures/cm-matosinhos-agenda-cultural/${relPath}`, import.meta.url), "utf8");
}

test("parseMatosinhosMusicaListing finds all 12 real, deduplicated event cards on page 1", async () => {
  const html = await fixture("pages/musica-listing-page1-excerpt.html");
  const records = parseMatosinhosMusicaListing(html);

  assert.equal(records.length, 12);
  for (const record of records) {
    assert.match(record.event_url, /^https:\/\/www\.cm-matosinhos\.pt\/evento\/[a-z0-9-]+$/);
    assert.ok(record.title, "every record has a title");
    assert.equal(record.has_music_tag, true, "every item on the /musica listing carries the source's own 'Eventos | Música' tag");
  }
  assert.equal(new Set(records.map((r) => r.event_url)).size, records.length, "no duplicates");

  const first = records[0];
  assert.equal(first.event_url, "https://www.cm-matosinhos.pt/evento/choro-no-nery-46");
  assert.equal(first.title, "Choro no Nery");
  assert.equal(first.date_text, "2026/11/04");
  assert.equal(first.location_text, "Teatro Municipal de Matosinhos Constantino Nery");
  assert.ok(first.category_tags.includes("Eventos | Música"));
});

test("parseMatosinhosMusicaListing reads a fully-qualified date even for multi-day/day-only-start cards", async () => {
  const html = await fixture("pages/musica-listing-page1-excerpt.html");
  const records = parseMatosinhosMusicaListing(html);

  const hospitalarios = records.find((r) => r.event_url.endsWith("/os-hospitalarios-no-caminho-de-santiago-4"));
  assert.ok(hospitalarios, "multi-day event card is present");
  // The card's own text is "<span class=dia>08</span> a 2026/09/13" — a
  // day-only start plus a fully-qualified end/anchor date. This module
  // extracts the one literal fully-qualified YYYY/MM/DD substring the
  // source itself states, never completing/guessing the day-only start.
  assert.equal(hospitalarios.date_text, "2026/09/13");
});

test("parseMatosinhosMusicaListing yields distinct real venue location_text strings across page 1", async () => {
  const html = await fixture("pages/musica-listing-page1-excerpt.html");
  const records = parseMatosinhosMusicaListing(html);
  const distinctVenues = new Set(records.map((r) => r.location_text));

  assert.deepEqual(
    [...distinctVenues].sort(),
    [
      "Largo da Viscondessa",
      "Mosteiro de Leça do Balio",
      "Praia de Matosinhos",
      "Praia do Cabo do Mundo, Perafita",
      "São Mamede de Infesta",
      "Teatro Municipal de Matosinhos Constantino Nery",
    ].sort(),
  );
});

test("parseMatosinhosMusicaListing on page 2 yields 5 further distinct real venues", async () => {
  const html = await fixture("pages/musica-listing-page2-excerpt.html");
  const records = parseMatosinhosMusicaListing(html);

  assert.equal(records.length, 12);
  const distinctVenues = new Set(records.map((r) => r.location_text));
  assert.deepEqual(
    [...distinctVenues].sort(),
    [
      "Custóias",
      "Guifões",
      "Jardins do Senhor do Padrão, Matosinhos",
      "Lavra",
      "Praça da Cidadania, São Mamede de Infesta",
    ].sort(),
  );
});

test("parseMatosinhosMusicaListing rejects empty input", () => {
  assert.throws(() => parseMatosinhosMusicaListing(""), /non-empty/);
  assert.throws(() => parseMatosinhosMusicaListing("   "), /non-empty/);
});

test("parseMatosinhosMusicaListing returns an empty array (never throws) when no event cards are present", () => {
  assert.deepEqual(parseMatosinhosMusicaListing("<html><body>no events here</body></html>"), []);
});

test("parseMatosinhosMusicaNextPageUrl reads the real rel=next pagination link from page 1", async () => {
  const html = await fixture("pages/musica-listing-page1-excerpt.html");
  const next = parseMatosinhosMusicaNextPageUrl(html);
  assert.equal(
    next,
    "https://www.cm-matosinhos.pt/servicos/comunicacao-e-imagem/eventos/musica?events_list_64_page=2",
  );
});

test("parseMatosinhosMusicaNextPageUrl reads page 2's own next link to page 3 (never constructs a page-N URL itself)", async () => {
  const html = await fixture("pages/musica-listing-page2-excerpt.html");
  const next = parseMatosinhosMusicaNextPageUrl(html);
  assert.equal(
    next,
    "https://www.cm-matosinhos.pt/servicos/comunicacao-e-imagem/eventos/musica?events_list_64_page=3",
  );
});

test("parseMatosinhosMusicaNextPageUrl returns null when no pagination is present, never fabricated", () => {
  assert.equal(parseMatosinhosMusicaNextPageUrl("<html><body>no pagination here</body></html>"), null);
  assert.equal(parseMatosinhosMusicaNextPageUrl(null), null);
  assert.equal(parseMatosinhosMusicaNextPageUrl(undefined), null);
});

test("extractMatosinhosEventDetailFacts re-derives the SAME facts as evidence/offline-proof-output.txt for the single-instant event", async () => {
  const html = await fixture("pages/detail-quarteto-cordas.html");
  const facts = extractMatosinhosEventDetailFacts(html);

  assert.equal(facts.title, "Quarteto de Cordas de Matosinhos com João Reis");
  assert.equal(facts.event_url, "https://www.cm-matosinhos.pt/evento/quarteto-de-cordas-de-matosinhos-com-joao-reis");
  assert.equal(facts.date_start_text, "2026-04-02 21:30:00");
  assert.equal(facts.date_end_text, "2026-04-02 21:30:00");
  assert.equal(facts.date_start_text, facts.date_end_text, "the source's own single-instant statement, not inferred");
  assert.equal(facts.timezone, "Europe/Lisbon");
  assert.equal(facts.location_text, "Teatro Municipal de Matosinhos Constantino Nery");
  assert.equal(facts.atc_location, "Teatro Municipal de Matosinhos Constantino Nery");
  assert.equal(facts.schedule_text, "21h30");
  assert.equal(facts.organizer_text, null, "atc_organizer is genuinely empty on this event");
  assert.ok(hasMusicCategoryTag(facts.category_tags));
  assert.equal(facts.page_id, "2805");
  assert.ok(facts.price_lines.length > 0, "this event's own text states a 'Preços' section");
  assert.ok(facts.price_lines.some((line) => line.includes("Preço Inteiro")));
});

test("extractMatosinhosEventDetailFacts re-derives the SAME facts for the genuine multi-day event", async () => {
  const html = await fixture("pages/detail-hospitalarios.html");
  const facts = extractMatosinhosEventDetailFacts(html);

  assert.equal(facts.title, "Os Hospitalários no Caminho de Santiago");
  assert.equal(facts.event_url, "https://www.cm-matosinhos.pt/evento/os-hospitalarios-no-caminho-de-santiago-4");
  assert.equal(facts.date_start_text, "2026-09-08 14:00:00");
  assert.equal(facts.date_end_text, "2026-09-13 23:00:00");
  assert.notEqual(facts.date_start_text, facts.date_end_text, "a real, source-stated multi-day span, not copied");
  assert.equal(facts.timezone, "Europe/Lisbon");
  assert.equal(facts.location_text, "Mosteiro de Leça do Balio");
  assert.equal(facts.schedule_text, null, "this event's own detail page states no 'Horário:' field at all — never guessed");
  assert.equal(facts.organizer_text, null);
  assert.ok(hasMusicCategoryTag(facts.category_tags));
  assert.equal(facts.page_id, "2805");
  assert.deepEqual(facts.price_lines, [], "this event's own text states no price information anywhere — never fabricated");
});

test("both sampled detail pages carry the IDENTICAL wm:page_id for two DIFFERENT events — the internal numeric id is genuinely not unique", async () => {
  const html1 = await fixture("pages/detail-quarteto-cordas.html");
  const html2 = await fixture("pages/detail-hospitalarios.html");
  const facts1 = extractMatosinhosEventDetailFacts(html1);
  const facts2 = extractMatosinhosEventDetailFacts(html2);

  assert.equal(facts1.page_id, facts2.page_id, "both real, retained detail pages literally state wm:page_id 2805");
  assert.notEqual(facts1.event_url, facts2.event_url, "but they are unambiguously two different events");
});

test("extractMatosinhosEventDetailFacts rejects HTML with no canonical meta tag", () => {
  assert.throws(() => extractMatosinhosEventDetailFacts("<html><body><h1 class=\"pageTitle\">Some Event</h1></body></html>"), /canonical/);
});

test("extractMatosinhosEventDetailFacts rejects HTML missing the add-to-calendar microformat", () => {
  const html =
    '<html><body><meta name="canonical" content="https://www.cm-matosinhos.pt/evento/some-event" /><h1 class="pageTitle">Some Event</h1></body></html>';
  assert.throws(() => extractMatosinhosEventDetailFacts(html), /add-to-calendar microformat/);
});

test("extractMatosinhosEventDetailFacts rejects HTML missing the 'Local:' location field", () => {
  const html = `<html><body>
    <meta name="canonical" content="https://www.cm-matosinhos.pt/evento/some-event" />
    <h1 class="pageTitle">Some Event</h1>
    <var class="atc_date_start">2026-01-01 20:00:00</var>
    <var class="atc_date_end">2026-01-01 20:00:00</var>
    <var class="atc_timezone">Europe/Lisbon</var>
  </body></html>`;
  assert.throws(() => extractMatosinhosEventDetailFacts(html), /Local:/);
});

test("extractMatosinhosEventDetailFacts rejects empty input", () => {
  assert.throws(() => extractMatosinhosEventDetailFacts(""), /non-empty/);
});

test("extractPriceLines returns an empty array (never null) when no 'Preços' heading is present", () => {
  assert.deepEqual(extractPriceLines("<p>Just some prose, no prices here.</p>"), []);
  assert.deepEqual(extractPriceLines(null), []);
  assert.deepEqual(extractPriceLines(undefined), []);
});

test("extractPriceLines splits, decodes, and trims every real price line", () => {
  const html =
    '<p><strong>Pre&ccedil;os<br /></strong>Pre&ccedil;o Inteiro &ndash; 7,50&euro;<br />S&eacute;nior &ndash; 5,00&euro;</p>';
  assert.deepEqual(extractPriceLines(html), ["Preço Inteiro – 7,50€", "Sénior – 5,00€"]);
});

test("hasMusicCategoryTag only true when the source's own literal 'Eventos | Música' tag is present", () => {
  assert.equal(hasMusicCategoryTag(["Agenda | Geral", "Eventos | Música"]), true);
  assert.equal(hasMusicCategoryTag(["Agenda | Geral", "Eventos | Teatro"]), false);
  assert.equal(hasMusicCategoryTag([]), false);
  assert.equal(hasMusicCategoryTag(null), false);
  assert.equal(hasMusicCategoryTag(undefined), false);
});
