import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractCmSintraEventFacts,
  parseCmSintraAgendaMusicRecords,
  parseCmSintraNextPageUrl,
} from "../ingestion/cm-sintra-agenda-cultural/discovery.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/cm-sintra-agenda-cultural/${name}`, import.meta.url), "utf8");
}

test("discovery finds every real event row on the combined filter_from+filter_category=3 result, in document order", async () => {
  const html = await fixture("agenda-musica-upcoming-excerpt.html");
  const records = parseCmSintraAgendaMusicRecords(html);
  assert.equal(records.length, 3);
  assert.deepEqual(
    records.map((r) => r.permalink),
    [
      "https://cm-sintra.pt/agenda/evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00",
      "https://cm-sintra.pt/agenda/evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00",
      "https://cm-sintra.pt/agenda/sintra-celebra-musica-e-mitologia-nas-noites-de-orfeu/2026-10-17-21-00",
    ],
  );
});

test("REGRESSION: two Evita rows share internal id 148 (same class attribute) but the parser keys nothing off it — both rows produce their own full record with distinct dates/permalinks", async () => {
  const html = await fixture("agenda-musica-upcoming-excerpt.html");
  const records = parseCmSintraAgendaMusicRecords(html);
  const [evita1, evita2, orfeu] = records;

  assert.equal(evita1.title, "Evita no Olga Cadaval com Sofia Escobar e Diogo Morgado");
  assert.equal(evita1.date_iso, "2026-09-03");
  assert.equal(evita1.time_text, "21:00");
  assert.equal(evita1.venue_text, "Centro Cultural Olga Cadaval");
  assert.equal(evita1.category_text, "Música");
  assert.equal(evita1.price_text, null);

  assert.equal(evita2.title, "Evita no Olga Cadaval com Sofia Escobar e Diogo Morgado");
  assert.equal(evita2.date_iso, "2026-09-04");
  assert.equal(evita2.time_text, "21:00");
  assert.equal(evita2.venue_text, "Centro Cultural Olga Cadaval");

  assert.notEqual(evita1.permalink, evita2.permalink, "the two Evita dates must have distinct permalinks despite sharing internal id 148");

  assert.equal(orfeu.title, "Sintra celebra música e mitologia nas “Noites de Orfeu”");
  assert.equal(orfeu.date_iso, "2026-10-17");
  assert.equal(orfeu.venue_text, "Museu Arqueológico de São Miguel de Odrinhas");
});

test("discovery rejects empty/non-string input", () => {
  assert.throws(() => parseCmSintraAgendaMusicRecords(""), /non-empty/);
  assert.throws(() => parseCmSintraAgendaMusicRecords(null), /non-empty/);
});

test("discovery returns an empty array (never throws) for a list page with no event rows", () => {
  assert.deepEqual(parseCmSintraAgendaMusicRecords("<html><body>no events here</body></html>"), []);
});

test("pagination: returns null, never a guessed URL, when no ic-next div is present (the retained filtered result never paginates)", async () => {
  const html = await fixture("agenda-musica-upcoming-excerpt.html");
  assert.equal(parseCmSintraNextPageUrl(html), null);
  assert.equal(parseCmSintraNextPageUrl("<html><body>no ic-next div</body></html>"), null);
  assert.equal(parseCmSintraNextPageUrl(null), null);
});

test("extractCmSintraEventFacts (Evita, 2026-09-03): og:url self-match used as permalink (no <link rel=\"canonical\"> on this platform), no price label present", async () => {
  const html = await fixture("event-evita.html");
  const facts = extractCmSintraEventFacts(html);
  assert.equal(facts.title, "Evita no Olga Cadaval com Sofia Escobar e Diogo Morgado");
  assert.equal(facts.date_iso, "2026-09-03");
  assert.equal(facts.time_text, "21:00");
  assert.equal(facts.venue_text, "Centro Cultural Olga Cadaval");
  assert.equal(facts.category_text, "Música");
  assert.equal(facts.price_text, null); // only an external Ticketline link is present, no "Preço:" label
  assert.equal(
    facts.permalink,
    "https://cm-sintra.pt/agenda/evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00",
  );
});

test("extractCmSintraEventFacts (Orfeu, 2026-10-17): free-admission prose is honestly NOT promoted to a structured price_text", async () => {
  const html = await fixture("event-orfeu.html");
  const facts = extractCmSintraEventFacts(html);
  assert.equal(facts.title, "Sintra celebra música e mitologia nas “Noites de Orfeu”");
  assert.equal(facts.date_iso, "2026-10-17");
  assert.equal(facts.time_text, "21:00");
  assert.equal(facts.venue_text, "Museu Arqueológico de São Miguel de Odrinhas");
  assert.equal(facts.category_text, "Música");
  // The page's own prose says "proposta cultural gratuita" but never behind
  // a "Preço:" label — this module must not guess that means a confirmed
  // free price.
  assert.equal(facts.price_text, null);
  assert.equal(
    facts.permalink,
    "https://cm-sintra.pt/agenda/sintra-celebra-musica-e-mitologia-nas-noites-de-orfeu/2026-10-17-21-00",
  );
});

test("extractCmSintraEventFacts rejects empty/non-string input", () => {
  assert.throws(() => extractCmSintraEventFacts(""), /non-empty/);
});

test("extractCmSintraEventFacts throws when no og:url is present (this platform has no <link rel=\"canonical\">, so og:url is the only self-declared permalink)", () => {
  const html = `
    <h1>Title</h1>
    <div class="ic-event-date"><span class="ic-single-next">2026-01-01</span></div>
    <span class="iCicon iCicon-location"></span>&nbsp; Some Room</p>
  `;
  assert.throws(() => extractCmSintraEventFacts(html), /og:url/);
});

test("extractCmSintraEventFacts throws when no <h1> title is present", () => {
  const html = `
    <meta property="og:url" content="https://cm-sintra.pt/agenda/x/2026-01-01-20-00" />
    <div class="ic-event-date"><span class="ic-single-next">2026-01-01</span></div>
    <span class="iCicon iCicon-location"></span>&nbsp; Some Room</p>
  `;
  assert.throws(() => extractCmSintraEventFacts(html), /h1/i);
});

test("extractCmSintraEventFacts throws when no ic-single-next date is present", () => {
  const html = `
    <meta property="og:url" content="https://cm-sintra.pt/agenda/x/2026-01-01-20-00" />
    <h1>Title</h1>
    <div class="ic-event-date"></div>
  `;
  assert.throws(() => extractCmSintraEventFacts(html), /ic-single-next/i);
});

test("extractCmSintraEventFacts throws when no venue (iCicon-location) line is present", () => {
  const html = `
    <meta property="og:url" content="https://cm-sintra.pt/agenda/x/2026-01-01-20-00" />
    <h1>Title</h1>
    <div class="ic-event-date"><span class="ic-single-next">2026-01-01</span></div>
  `;
  assert.throws(() => extractCmSintraEventFacts(html), /venue/i);
});

test("no fabricated end/duration field is ever produced by either extraction path", async () => {
  const listRecords = parseCmSintraAgendaMusicRecords(await fixture("agenda-musica-upcoming-excerpt.html"));
  const detailFacts = extractCmSintraEventFacts(await fixture("event-evita.html"));
  for (const record of [...listRecords, detailFacts]) {
    assert.equal(Object.prototype.hasOwnProperty.call(record, "end"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(record, "end_iso"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(record, "duration"), false);
  }
});
