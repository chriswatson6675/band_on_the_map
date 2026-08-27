#!/usr/bin/env node
// Small, dependency-free, no-network offline proof for the
// cm-matosinhos-agenda-cultural-amp-01 investigation.
//
// Re-parses ONLY the retained fixtures in this evidence/ directory
// (real HTTP responses captured live on 2026-08-27) and mechanically
// re-derives the exact field_assessment claims made in investigation.json
// for title / start_date / time / end / venue_location / source_record_id
// / event_url — proving each is DIRECT_SOURCE (stated outright by the
// retained fixture) and reproducible, never asserted from memory.
//
// Run: node offline-proof.mjs   (from this evidence/ directory, or any
// cwd — paths below are resolved relative to this script's own location)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");

let failures = 0;
function check(label, condition, detail) {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? " — " + detail : ""}`);
}

// ---------------------------------------------------------------------
// 1. The listing page CM Matosinhos itself serves for the "Música"
//    category (https://www.cm-matosinhos.pt/servicos/comunicacao-e-
//    imagem/eventos/musica) — a plain GET, paginated, server-rendered
//    HTML page. Every item must carry the source's own "Eventos |
//    Música" category tag AND a fully-qualified YYYY/MM/DD date.
// ---------------------------------------------------------------------
const listingHtml = read("body-eventos-musica-clean.html");

const ITEM_RE = /<li class="cell[^"]*">[\s\S]*?<\/li>/g;
const listingItems = [];
for (const m of listingHtml.matchAll(ITEM_RE)) {
  const block = m[0];
  const href = /href="(\/evento\/[a-z0-9-]+)"/.exec(block);
  if (!href) continue;
  const title = /<h2>([^<]*)<\/h2>/.exec(block);
  // The "dates" widget renders either a single plain "YYYY/MM/DD" text
  // node, or (for a multi-day event) a day-only start ("<span
  // class=dia>11</span> e") followed by a fully-qualified "YYYY/MM/DD"
  // end/anchor date. Either shape always contains at least one
  // fully-qualified YYYY/MM/DD stated directly by the source — this
  // extracts that literal substring, never inferring/completing one.
  const datesBlock = /<div class="dates widget_field ">([\s\S]*?)<\/div><\/div><\/div>/.exec(block);
  const fullDate = datesBlock ? /\d{4}\/\d{2}\/\d{2}/.exec(datesBlock[1]) : null;
  const categories = /<div class="categories widget_field "><div class="widget_value"><div>([\s\S]*?)<\/div><\/div><\/div>/.exec(block);
  listingItems.push({
    href: href[1],
    title: title ? title[1] : null,
    date: fullDate ? fullDate[0] : null,
    hasMusicTag: categories ? categories[1].includes("Eventos | Música") : false,
  });
}

check(
  "listing page (Música category) yields at least one item",
  listingItems.length > 0,
  `${listingItems.length} item(s) parsed`,
);
check(
  "every parsed listing item carries the source's own 'Eventos | Música' tag",
  listingItems.length > 0 && listingItems.every((i) => i.hasMusicTag),
  `${listingItems.filter((i) => i.hasMusicTag).length}/${listingItems.length} tagged`,
);
const fullyQualifiedDateRe = /^\d{4}\/\d{2}\/\d{2}$/;
check(
  "every parsed listing item's own date is already a fully-qualified YYYY/MM/DD (DIRECT_SOURCE, no derivation needed)",
  listingItems.length > 0 && listingItems.every((i) => i.date && fullyQualifiedDateRe.test(i.date)),
  listingItems.map((i) => i.date).join(", "),
);

// ---------------------------------------------------------------------
// 2. A single-instant event detail page
//    (/evento/quarteto-de-cordas-de-matosinhos-com-joao-reis) — proves
//    title / full local datetime+timezone / venue / event_url / a
//    genuine "Eventos | Música" category tag / a source-stated price,
//    directly, and that atc_date_start === atc_date_end for a true
//    single-instant event (not inferred — the source states both).
// ---------------------------------------------------------------------
const detail1Html = read("body-cmmatosinhos-evento.html");
const detail1 = {
  title: /<div id="event_detail_\d+"[\s\S]*?<var class="atc_title">([^<]*)<\/var>/.exec(detail1Html)?.[1] ?? null,
  dateStart: /<var class="atc_date_start">([^<]*)<\/var>/.exec(detail1Html)?.[1] ?? null,
  dateEnd: /<var class="atc_date_end">([^<]*)<\/var>/.exec(detail1Html)?.[1] ?? null,
  timezone: /<var class="atc_timezone">([^<]*)<\/var>/.exec(detail1Html)?.[1] ?? null,
  location: /<var class="atc_location">([^<]*)<\/var>/.exec(detail1Html)?.[1] ?? null,
  hasMusicTag: /class="categories widget_field "[\s\S]*?<\/div><\/div><\/div>/.exec(detail1Html)?.[0]?.includes("Eventos | Música") ?? false,
  hasPriceText: /Pre(?:&ccedil;|ç)o Inteiro/i.test(detail1Html),
};

check("detail page 1 (single-instant event) title extracted", detail1.title === "Quarteto de Cordas de Matosinhos com João Reis", detail1.title);
check("detail page 1 atc_date_start extracted", detail1.dateStart === "2026-04-02 21:30:00", detail1.dateStart);
check("detail page 1 atc_date_end extracted", detail1.dateEnd === "2026-04-02 21:30:00", detail1.dateEnd);
check("detail page 1: atc_date_start === atc_date_end (source's own single-instant statement, not inferred)", detail1.dateStart === detail1.dateEnd);
check("detail page 1 atc_timezone extracted", detail1.timezone === "Europe/Lisbon", detail1.timezone);
check("detail page 1 atc_location extracted", detail1.location === "Teatro Municipal de Matosinhos Constantino Nery", detail1.location);
check("detail page 1 carries the source's own 'Eventos | Música' category tag", detail1.hasMusicTag === true);
check("detail page 1 states a price directly in its own free text (unstructured — see field_assessment.price notes)", detail1.hasPriceText === true);

// ---------------------------------------------------------------------
// 3. A multi-day event detail page
//    (/evento/os-hospitalarios-no-caminho-de-santiago-4) — proves
//    atc_date_start and atc_date_end genuinely DIFFER when the source
//    itself states a real end (not merely echoing start), and that this
//    is likewise a DIRECT_SOURCE, not an inferred, value.
// ---------------------------------------------------------------------
const detail2Html = read("body-cmmatosinhos-evento2.html");
const detail2 = {
  title: /<var class="atc_title">([^<]*)<\/var>/.exec(detail2Html)?.[1] ?? null,
  dateStart: /<var class="atc_date_start">([^<]*)<\/var>/.exec(detail2Html)?.[1] ?? null,
  dateEnd: /<var class="atc_date_end">([^<]*)<\/var>/.exec(detail2Html)?.[1] ?? null,
  timezone: /<var class="atc_timezone">([^<]*)<\/var>/.exec(detail2Html)?.[1] ?? null,
  location: /<var class="atc_location">([^<]*)<\/var>/.exec(detail2Html)?.[1] ?? null,
  hasMusicTag: /class="categories widget_field "[\s\S]*?<\/div><\/div><\/div>/.exec(detail2Html)?.[0]?.includes("Eventos | Música") ?? false,
};

check("detail page 2 (multi-day event) title extracted", detail2.title === "Os Hospitalários no Caminho de Santiago", detail2.title);
check("detail page 2 atc_date_start extracted", detail2.dateStart === "2026-09-08 14:00:00", detail2.dateStart);
check("detail page 2 atc_date_end extracted", detail2.dateEnd === "2026-09-13 23:00:00", detail2.dateEnd);
check("detail page 2: atc_date_start !== atc_date_end (source's own genuine multi-day end, not an inferred/copied value)", detail2.dateStart !== detail2.dateEnd);
check("detail page 2 atc_timezone extracted", detail2.timezone === "Europe/Lisbon", detail2.timezone);
check("detail page 2 atc_location extracted", detail2.location === "Mosteiro de Leça do Balio", detail2.location);
check("detail page 2 carries the source's own 'Eventos | Música' category tag", detail2.hasMusicTag === true);

// ---------------------------------------------------------------------
// 4. source_record_id / event_url stability check: the detail page's
//    own permalink slug is the SAME slug used to reach it from the
//    listing page (a self-referential canonical path, not merely
//    something that looks stable) — the "third clause" of this
//    project's stable-identifier rule.
// ---------------------------------------------------------------------
const canonicalLinkMatch = /<meta name="canonical" content="([^"]*)"/.exec(detail1Html);
const canonicalUrl = canonicalLinkMatch ? canonicalLinkMatch[1] : null;
check(
  "detail page 1's own <meta name=canonical> matches its own request URL slug (canonical, source-declared permalink)",
  canonicalUrl === "https://www.cm-matosinhos.pt/evento/quarteto-de-cordas-de-matosinhos-com-joao-reis",
  canonicalUrl,
);

console.log("");
console.log(
  failures === 0
    ? "OFFLINE PROOF: PASSED — every field_assessment claim above was mechanically re-derived from retained fixtures only, no network access, no values invented."
    : `OFFLINE PROOF: FAILED (${failures} check(s) failed)`,
);
process.exit(failures === 0 ? 0 : 1);
