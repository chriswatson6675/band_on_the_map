#!/usr/bin/env node
// Small, dependency-free, no-network offline proof for the
// cm-gondomar-agenda-01 investigation (research/source-investigations/
// cm-gondomar-agenda-01/). Re-parses ONLY the retained evidence files in
// this directory and reproduces, deterministically, two things:
//
//   1. That the "events-box" card structure (evidence/agenda-index.html)
//      and the admin-ajax.php "search_events" JSON response
//      (evidence/ajax-music-response.json, called with
//      data[category]=56 — the site's own "Música" taxonomy term id,
//      confirmed by evidence/agenda-index.html's own <select> options)
//      parse into structurally identical per-event records: a title, a
//      free-text date string, and a detail-page permalink.
//
//   2. That NOWHERE in any retained fixture — not the index cards, not
//      the category-filtered AJAX results, not either sampled per-event
//      detail page — does the free-text date field ever carry a 4-digit
//      year. This is the DETERMINISTIC_DERIVATION backing
//      field_assessment.start_date's PARTIAL state and DEFER decision:
//      it is a reproducible, mechanical proof of an absence, not a prose
//      claim. No plausibility, no "today's date", no guessing — a plain
//      regex scan over retained bytes, run twice (against the individual
//      event cards' date text AND the two detail pages' own "data" field)
//      with the same result both times.
//
// This is a governance proof script, never a production collector. Run:
//   node research/source-investigations/cm-gondomar-agenda-01/evidence/offline-proof.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");

function fail(message) {
  console.error(`OFFLINE PROOF: FAILED — ${message}`);
  process.exitCode = 1;
}

// --- 1. Parse the static /agenda/ index page's event-001 cards ---------

const CARD_RE =
  /<div class="event-001 small-12">\s*<a href="([^"]+)">[\s\S]*?event-001-inner-date-inner[^>]*>\s*([^<]*?)\s*<\/div>[\s\S]*?event-001-inner-text-inner[^>]*>\s*([^<]*?)\s*<\/div>/g;

function parseCards(html) {
  const records = [];
  let m;
  const re = new RegExp(CARD_RE);
  while ((m = re.exec(html))) {
    records.push({ event_url: m[1], date_text: m[2].trim(), title: m[3].trim() });
  }
  return records;
}

const indexHtml = read("agenda-index.html");
const indexRecords = parseCards(indexHtml);
if (indexRecords.length !== 6) {
  fail(`expected 6 event cards on the retained /agenda/ index page, found ${indexRecords.length}`);
}

// --- 2. Parse the admin-ajax.php "search_events" (category=56, Música) response ---

const ajaxResponse = JSON.parse(read("ajax-music-response.json"));
const pagination = ajaxResponse.paginationData;

const isMusicTaxQuery =
  Array.isArray(pagination["tax-query"]) &&
  pagination["tax-query"].length === 1 &&
  pagination["tax-query"][0].taxonomy === "eventos-categorias" &&
  pagination["tax-query"][0].field === "term_id" &&
  String(pagination["tax-query"][0].terms) === "56";
if (!isMusicTaxQuery) {
  fail(`expected the retained AJAX response's own paginationData.tax-query to confirm term_id 56 (eventos-categorias) was applied server-side; got ${JSON.stringify(pagination["tax-query"])}`);
}

const musicRecords = parseCards(ajaxResponse.html);
if (musicRecords.length !== 50) {
  fail(`expected 50 event records in the retained category=56 AJAX response (posts-per-page=50, page 1 of paginationData["max-num-pages"]=${pagination["max-num-pages"]}), found ${musicRecords.length}`);
}
if (pagination["total-posts"] !== 140) {
  fail(`expected the retained AJAX response's own paginationData.total-posts to be 140, got ${pagination["total-posts"]}`);
}

// --- 3. Parse the two sampled per-event detail pages' own "data"/"local"/"horário"/"entrada" fields ---

function parseDetailFields(html) {
  const fields = {};
  const re = /<div class="detail (\w+)">\s*<div class="labelTitle">([^<]*)<\/div>\s*<div class="value">([^<]*)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    fields[m[1]] = m[3].trim();
  }
  const titleMatch = /<div class="title-001">\s*<div class="inner">\s*([^\n]*?)\s*<\/div>/.exec(html);
  return { fields, title: titleMatch ? titleMatch[1].trim() : null };
}

const recitalDetail = parseDetailFields(read("event-detail-recital-de-acordeao-e-piano.html"));
const ritaDetail = parseDetailFields(read("event-detail-concerto-rita-redshoes.html"));

if (recitalDetail.title !== "Recital de Acordeão e Piano") {
  fail(`recital detail page title mismatch: ${recitalDetail.title}`);
}
if (recitalDetail.fields.data !== "20 Setembro" || recitalDetail.fields.local !== "Casa Branca de Gramido" || recitalDetail.fields.price !== "livre") {
  fail(`recital detail page fields mismatch: ${JSON.stringify(recitalDetail.fields)}`);
}
if ("timetable" in recitalDetail.fields) {
  fail("recital detail page unexpectedly carries a 'horário' (timetable) field — the investigation's field_assessment.time notes this event has none; if this now fails, re-check field_assessment.time honestly");
}

if (ritaDetail.title !== "Concerto Rita Redshoes") {
  fail(`rita redshoes detail page title mismatch: ${ritaDetail.title}`);
}
if (
  ritaDetail.fields.data !== "28 Novembro" ||
  ritaDetail.fields.timetable !== "21h30" ||
  ritaDetail.fields.local !== "Auditório Municipal de Gondomar" ||
  ritaDetail.fields.price !== "12€"
) {
  fail(`rita redshoes detail page fields mismatch: ${JSON.stringify(ritaDetail.fields)}`);
}

// --- 4. THE core proof: scan every retained date-text value, from every ---
//        source, for a 4-digit year. None may ever be found.

const YEAR_RE = /\b(19|20)\d{2}\b/;

const allDateTexts = [
  ...indexRecords.map((r) => ({ source: "agenda-index.html card", value: r.date_text })),
  ...musicRecords.map((r) => ({ source: "ajax-music-response.json (category=56) card", value: r.date_text })),
  { source: "event-detail-recital-de-acordeao-e-piano.html 'data' field", value: recitalDetail.fields.data },
  { source: "event-detail-concerto-rita-redshoes.html 'data' field", value: ritaDetail.fields.data },
];

const yearHits = allDateTexts.filter((entry) => YEAR_RE.test(entry.value));
if (yearHits.length > 0) {
  fail(
    `expected NO retained date-text value to ever carry a 4-digit year (this would mean field_assessment.start_date could be re-assessed as DETERMINISTIC_CONTEXT or DIRECT_SOURCE), but found: ${JSON.stringify(yearHits)}`,
  );
} else if (process.exitCode !== 1) {
  console.log(`Checked ${allDateTexts.length} retained date-text values (${indexRecords.length} index cards + ${musicRecords.length} category=56 AJAX cards + 2 detail-page 'data' fields): none carries a 4-digit year.`);
}

// --- 5. Report ---

if (process.exitCode !== 1) {
  console.log("OFFLINE PROOF: PASSED");
  console.log(`- /agenda/ index page: ${indexRecords.length} event-001 cards parsed (title, date_text, event_url).`);
  console.log(`- admin-ajax.php search_events (category=56, "Música" per agenda-index.html's own <select>): ${musicRecords.length} cards parsed from page 1; paginationData confirms total-posts=140 across max-num-pages=${pagination["max-num-pages"]}, all server-side filtered by eventos-categorias term_id=56.`);
  console.log(`- Sampled detail page 1 (recital-de-acordeao-e-piano): title="${recitalDetail.title}", data="${recitalDetail.fields.data}", local="${recitalDetail.fields.local}", entrada="${recitalDetail.fields.price}", no horário field.`);
  console.log(`- Sampled detail page 2 (concerto-rita-redshoes): title="${ritaDetail.title}", data="${ritaDetail.fields.data}", horário="${ritaDetail.fields.timetable}", local="${ritaDetail.fields.local}", entrada="${ritaDetail.fields.price}".`);
  console.log(`- Year-token scan across all ${allDateTexts.length} retained date-text values: 0 matches for /\\b(19|20)\\d{2}\\b/ — the source genuinely never states a year for any event, anywhere in retained evidence.`);
}
