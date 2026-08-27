import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractCcoSintraEventFacts,
  parseCcoSintraAgendaLinks,
  parseCcoSintraNextPageUrl,
} from "../ingestion/cco-sintra/discovery.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/cco-sintra/${name}`, import.meta.url), "utf8");
}

test("discovery finds every real, deduplicated event-detail permalink on list page 1", async () => {
  const html = await fixture("agenda-page-1-excerpt.html");
  const links = parseCcoSintraAgendaLinks(html);
  assert.deepEqual(links, [
    "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00",
    "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00",
    "https://ccolgacadaval.pt/agenda/544-ciclo-de-teatro-as-guerreiras-do-k-pop/2026-09-06-15-00",
    "https://ccolgacadaval.pt/agenda/519-gnr/2026-09-11-21-00",
    "https://ccolgacadaval.pt/agenda/524-elisa/2026-09-12-21-00",
  ]);
  assert.equal(new Set(links).size, links.length, "no duplicates despite each row linking its permalink 3 times");
});

test("discovery finds every real, deduplicated event-detail permalink on list page 2 (including id 551, no start time)", async () => {
  const html = await fixture("agenda-page-2-excerpt.html");
  const links = parseCcoSintraAgendaLinks(html);
  assert.deepEqual(links, [
    "https://ccolgacadaval.pt/agenda/539-orquestra-d-fernando-ii-2/2026-09-13-16-00",
    "https://ccolgacadaval.pt/agenda/573-violas-encantadas-a-viola-beiroa-tradicao-e-identidade-da-beira-baixa/2026-09-17-21-00",
    "https://ccolgacadaval.pt/agenda/577-o-meu-filho-e-um-urso-ou-a-fealdade-de-matar-mongos/2026-09-19-16-00",
    "https://ccolgacadaval.pt/agenda/551-orquestra-sinfonica-portuguesa-obras-de-mozart-e-ravel/2026-09-20-17-00",
    "https://ccolgacadaval.pt/agenda/518-ricardo-ribeiro/2026-09-25-21-00",
  ]);
});

test("discovery rejects empty/non-string input", () => {
  assert.throws(() => parseCcoSintraAgendaLinks(""), /non-empty/);
  assert.throws(() => parseCcoSintraAgendaLinks(null), /non-empty/);
});

test("discovery returns an empty array (never throws) for a list page with no event rows", () => {
  assert.deepEqual(parseCcoSintraAgendaLinks("<html><body>no events here</body></html>"), []);
});

test("pagination: page 1's own rel=\"next\" link points to page 2", async () => {
  const html = await fixture("agenda-page-1-excerpt.html");
  assert.equal(parseCcoSintraNextPageUrl(html), "https://ccolgacadaval.pt/agenda?page=2");
});

test("pagination: page 2's own rel=\"next\" link points to page 3 (following continues past page 1)", async () => {
  const html = await fixture("agenda-page-2-excerpt.html");
  assert.equal(parseCcoSintraNextPageUrl(html), "https://ccolgacadaval.pt/agenda?page=3");
});

test("pagination: returns null, never a guessed URL, when no next link is present", () => {
  assert.equal(parseCcoSintraNextPageUrl("<html><body>last page, no ic-next div</body></html>"), null);
  assert.equal(parseCcoSintraNextPageUrl(null), null);
});

test("extractCcoSintraEventFacts (GNR): full start time, free-text Duração + multi-tier Preço present", async () => {
  const html = await fixture("event-gnr.html");
  const facts = extractCcoSintraEventFacts(html);
  assert.equal(facts.title, "GNR");
  assert.equal(facts.date_iso, "2026-09-11");
  assert.equal(facts.time_text, "21:00");
  assert.equal(facts.venue_text, "Auditório Jorge Sampaio");
  assert.equal(facts.price_text, "1ª e 2ª Plateia: 25,00 € | Balcão e Galerias: 20,00 €");
  assert.equal(facts.permalink, "https://ccolgacadaval.pt/agenda/519-gnr/2026-09-11-21-00");
});

test("extractCcoSintraEventFacts (Evita, first date 2026-09-03): shares bare id 543 with the second date", async () => {
  const html = await fixture("event-evita1.html");
  const facts = extractCcoSintraEventFacts(html);
  assert.equal(facts.title, "Evita, com Sofia Escobar e Diogo Morgado");
  assert.equal(facts.date_iso, "2026-09-03");
  assert.equal(facts.time_text, "21:00");
  assert.equal(facts.venue_text, "Auditório Jorge Sampaio");
  assert.equal(facts.price_text, null); // no Preço text on this sampled detail page
  assert.equal(
    facts.permalink,
    "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00",
  );
});

test("extractCcoSintraEventFacts (Evita, second date 2026-09-04): SAME bare id 543, DIFFERENT permalink/date", async () => {
  const html = await fixture("event-evita2.html");
  const facts = extractCcoSintraEventFacts(html);
  assert.equal(facts.title, "Evita, com Sofia Escobar e Diogo Morgado");
  assert.equal(facts.date_iso, "2026-09-04");
  assert.equal(facts.time_text, "21:00");
  assert.equal(facts.venue_text, "Auditório Jorge Sampaio");
  assert.equal(
    facts.permalink,
    "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00",
  );
});

test("extractCcoSintraEventFacts (orquestra, id 551): no start time, no Duração/Preço text — honestly null, never guessed", async () => {
  const html = await fixture("event-orquestra.html");
  const facts = extractCcoSintraEventFacts(html);
  assert.equal(facts.title, "Concerto inaugural  | Coro Teatro Nacional S. Carlos e Orquestra Sinfónica Portuguesa");
  assert.equal(facts.date_iso, "2026-09-20");
  assert.equal(facts.time_text, null);
  assert.equal(facts.venue_text, "Auditório Jorge Sampaio");
  assert.equal(facts.price_text, null);
  assert.equal(
    facts.permalink,
    "https://ccolgacadaval.pt/agenda/551-orquestra-sinfonica-portuguesa-obras-de-mozart-e-ravel/2026-09-20-17-00",
  );
});

test("extractCcoSintraEventFacts rejects empty/non-string input", () => {
  assert.throws(() => extractCcoSintraEventFacts(""), /non-empty/);
});

test("extractCcoSintraEventFacts throws when no <h1> title is present", () => {
  const html = `
    <link rel="canonical" href="https://ccolgacadaval.pt/agenda/1-x/2026-01-01-20-00">
    <div class="ic-event-date"><span class="ic-single-next">2026-01-01</span></div>
    <p><span class="iCicon iCicon-location"></span>&nbsp; Some Room</p>
  `;
  assert.throws(() => extractCcoSintraEventFacts(html), /h1/i);
});

test("extractCcoSintraEventFacts throws when no canonical permalink is present", () => {
  const html = `<h1>Title</h1><div class="ic-event-date"><span class="ic-single-next">2026-01-01</span></div>`;
  assert.throws(() => extractCcoSintraEventFacts(html), /canonical/i);
});

test("extractCcoSintraEventFacts throws when no ic-single-next date is present", () => {
  const html = `
    <link rel="canonical" href="https://ccolgacadaval.pt/agenda/1-x/2026-01-01-20-00">
    <h1>Title</h1>
    <div class="ic-event-date"></div>
  `;
  assert.throws(() => extractCcoSintraEventFacts(html), /ic-single-next/i);
});

test("extractCcoSintraEventFacts throws when no venue (iCicon-location) line is present", () => {
  const html = `
    <link rel="canonical" href="https://ccolgacadaval.pt/agenda/1-x/2026-01-01-20-00">
    <h1>Title</h1>
    <div class="ic-event-date"><span class="ic-single-next">2026-01-01</span></div>
  `;
  assert.throws(() => extractCcoSintraEventFacts(html), /venue/i);
});
