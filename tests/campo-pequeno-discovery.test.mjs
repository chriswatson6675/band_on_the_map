import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractCampoPequenoEventFacts,
  parseCampoPequenoAgendaLinks,
  parseCampoPequenoDate,
} from "../ingestion/campo-pequeno/discovery.mjs";

async function fixture(relPath) {
  return readFile(new URL(`../fixtures/campo-pequeno/${relPath}`, import.meta.url), "utf8");
}

test("discovery finds every real, deduplicated canonical detail-page URL from the agenda-list excerpt", async () => {
  const html = await fixture("pages/agenda-list-excerpt.html");
  const links = parseCampoPequenoAgendaLinks(html);

  assert.equal(links.length, 19, "19 of the agenda page's 28 real cards are present in this bounded excerpt");
  for (const link of links) {
    assert.match(link, /^https:\/\/www\.sagrescampopequeno\.pt\/pt\/[a-z0-9-]+$/);
  }
  assert.equal(new Set(links).size, links.length, "no duplicates");

  // Normalised to the PROVEN-stable short canonical form, never the raw
  // agenda-relative /pt/agenda/{slug} href the markup itself uses.
  assert.ok(links.includes("https://www.sagrescampopequeno.pt/pt/alphaville"));
  assert.ok(links.includes("https://www.sagrescampopequeno.pt/pt/megadeth"));
  assert.ok(links.includes("https://www.sagrescampopequeno.pt/pt/the-nutcracker-ice-show"));
  assert.ok(links.includes("https://www.sagrescampopequeno.pt/pt/brandi-carlile---cancelado"));
  assert.ok(!links.some((l) => l.includes("/agenda/")), "never the agenda-relative form");
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseCampoPequenoAgendaLinks(""), /non-empty/);
  assert.throws(() => parseCampoPequenoAgendaLinks("   "), /non-empty/);
});

test("extractor re-derives the SAME facts as evidence/offline-proof-output.txt for Alphaville", async () => {
  const html = await fixture("pages/detail-alphaville.html");
  const facts = extractCampoPequenoEventFacts(html);

  assert.equal(facts.title, "Alphaville");
  assert.equal(facts.date_text, "16 outubro 2026 , sexta-feira");
  assert.equal(facts.date_iso, "2026-10-16");
  assert.equal(facts.weekday_text, "sexta-feira");
  assert.equal(facts.time_text, "Início de espetáculo: 21H30 · Abertura de portas: 20H30");
  assert.equal(facts.venue_text, "Lisboa - Sagres Campo Pequeno");
  assert.equal(facts.event_url, "https://www.sagrescampopequeno.pt/pt/alphaville");
  assert.equal(facts.price_tiers.length, 7);
  assert.deepEqual(facts.price_tiers[0], { area: "Plateia VIP", price: "60€" });
  assert.equal(facts.is_cancelled, false);
});

test("extractor handles pattern B (megadeth) — reversed doors/start order, no colon, no accent", async () => {
  const html = await fixture("pages/detail-megadeth.html");
  const facts = extractCampoPequenoEventFacts(html);

  assert.equal(facts.title, "Megadeth");
  assert.equal(facts.date_text, "13 abril 2027 , terça-feira");
  assert.equal(facts.date_iso, "2027-04-13");
  assert.equal(facts.weekday_text, "terça-feira");
  // Normalised to a consistent start-then-doors order regardless of the
  // source's own pattern-B reversed ordering.
  assert.equal(facts.time_text, "Início de espetáculo: 19h30 · Abertura de portas: 18h30");
  assert.equal(facts.price_tiers.length, 5);
  assert.equal(facts.is_cancelled, false);
});

test("extractor re-derives the SAME facts for The Nutcracker Ice Show (pattern A)", async () => {
  const html = await fixture("pages/detail-nutcracker.html");
  const facts = extractCampoPequenoEventFacts(html);

  assert.equal(facts.title, "The Nutcracker Ice Show");
  assert.equal(facts.date_text, "14 novembro 2026 , sábado");
  assert.equal(facts.date_iso, "2026-11-14");
  assert.equal(facts.weekday_text, "sábado");
  assert.equal(facts.time_text, "Início de espetáculo: 19H30 · Abertura de portas: 18H30");
  assert.equal(facts.venue_text, "Lisboa - Sagres Campo Pequeno");
  assert.equal(facts.price_tiers.length, 9);
  assert.equal(facts.is_cancelled, false);
});

test("the cancelled event (Brandi Carlile) is extracted honestly: is_cancelled true, all other fields still present, price tiers retained pre-cancellation", async () => {
  const html = await fixture("pages/detail-cancelado.html");
  const facts = extractCampoPequenoEventFacts(html);

  assert.equal(facts.title, "Brandi Carlile - cancelado");
  assert.equal(facts.is_cancelled, true, "derived from the title's own '- cancelado' AND the Sessões tab's own 'Evento Cancelado' text");
  assert.equal(facts.date_iso, "2026-11-01");
  assert.equal(facts.weekday_text, "domingo");
  assert.equal(facts.venue_text, "Lisboa - Sagres Campo Pequeno");
  assert.equal(facts.time_text, "Início de espetáculo: 20H00 · Abertura de portas: 19H00");
  assert.equal(facts.price_tiers.length, 10, "the 10-tier price list is retained even though cancelled — never dropped");
  assert.equal(facts.event_url, "https://www.sagrescampopequeno.pt/pt/brandi-carlile---cancelado");
});

test("extractCampoPequenoEventFacts rejects HTML with no matching <h1>", () => {
  assert.throws(() => extractCampoPequenoEventFacts("<html><body>no title here</body></html>"), /h1/);
});

test("extractCampoPequenoEventFacts rejects HTML missing the canonical link", () => {
  const html = '<html><body><h1 class="font-bold">Some Event</h1></body></html>';
  assert.throws(() => extractCampoPequenoEventFacts(html), /canonical/);
});

test("extractCampoPequenoEventFacts rejects HTML missing the event-header-info block", () => {
  const html =
    '<html><body><h1 class="font-bold">Some Event</h1><link rel="canonical" href="https://www.sagrescampopequeno.pt/pt/some-event"></body></html>';
  assert.throws(() => extractCampoPequenoEventFacts(html), /event-header-info/);
});

test("extractCampoPequenoEventFacts rejects HTML missing any priced admission tier", () => {
  const html = `<html><body>
    <h1 class="font-bold">Some Event</h1>
    <link rel="canonical" href="https://www.sagrescampopequeno.pt/pt/some-event">
    <div class="row align-items-center event-header-info">
      <div class="col-auto">
        <div class="date">1 janeiro 2027 , sexta-feira</div>
        <div class="location">Lisboa - Sagres Campo Pequeno</div>
      </div>
    </div>
  </body></html>`;
  assert.throws(() => extractCampoPequenoEventFacts(html), /priced admission tier/);
});

test("extractCampoPequenoEventFacts rejects empty input", () => {
  assert.throws(() => extractCampoPequenoEventFacts(""), /non-empty/);
});

test("parseCampoPequenoDate mechanically parses a single 'D month YYYY , weekday' date, never guesses on other shapes", () => {
  assert.deepEqual(parseCampoPequenoDate("16 outubro 2026 , sexta-feira"), {
    date_iso: "2026-10-16",
    weekday_text: "sexta-feira",
  });
  assert.deepEqual(parseCampoPequenoDate("13 abril 2027 , terça-feira"), {
    date_iso: "2027-04-13",
    weekday_text: "terça-feira",
  });

  assert.deepEqual(parseCampoPequenoDate("not a date"), { date_iso: null, weekday_text: null });
  assert.deepEqual(parseCampoPequenoDate(null), { date_iso: null, weekday_text: null });
  assert.deepEqual(parseCampoPequenoDate(undefined), { date_iso: null, weekday_text: null });
});
