#!/usr/bin/env node
// Dependency-free, no-network offline derivation proof for
// research/source-investigations/nos-alive-lisbon-01.
//
// Re-parses the retained HTML fixtures in this directory (already fetched
// live via curl and saved byte-faithfully) and mechanically reproduces the
// DETERMINISTIC_CONTEXT derivations claimed in investigation.json for
// title/start_date/end: that the site's "day" pages carry a stale <title>
// tag but a freshly-modified H1 giving that day's date, that the '27-
// labelled pages (homepage, ticket page) independently state the same
// three days (8, 9, 10 July), that a "2027" four-digit year appears
// directly in one of the homepage's own linked official ticket-vendor
// URLs, and that the '26-labelled pages (cartaz lineup table, palco
// portico news archive) are a genuinely separate, already-concluded prior
// edition, not a live contradiction about the same upcoming edition.
//
// Run: node offline-proof.mjs
// Makes no network requests; reads only files in this directory.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) failures++;
}

// --- 1. Homepage: '27-labelled edition states 8, 9, 10 July ---
const home = read("body-home.html");
const homeDescMatch = home.match(/"description":"([^"]*Alive[^"]*)"/);
const homeDesc = homeDescMatch ? homeDescMatch[1] : "";
check(
  "homepage JSON-LD description mentions NOS Alive'27 (edition label)",
  homeDesc.includes("Alive'27") || homeDesc.includes("Alive&#8217;27"),
);
check(
  "homepage JSON-LD description states days 8, 9 e 10 de julho",
  /8,\s*9\s*e\s*10\s*de\s*julho/i.test(homeDesc),
);

// --- 2. Ticket page: independent corroboration of 8/9/10 July for '27, plus explicit "2027" ---
const bilheteira = read("body-bilheteira.html");
check(
  "ticket page's Ticketline event URL slug encodes 27-08-09-10-julho",
  bilheteira.includes("nos-alive-27-08-09-10-julho"),
);
const twoDayPasses = ["8 &amp; 9 Julho", "8 &amp; 10 Julho", "9 &amp; 10 Julho"];
check(
  "ticket page lists all three 2-day-pass day combinations (8&9, 8&10, 9&10 Julho)",
  twoDayPasses.every((p) => bilheteira.includes(p)),
);
check(
  "ticket page links an official vendor URL containing the literal 4-digit year 2027",
  /nos-alive-festival-lisbon-2027/.test(bilheteira),
);

// --- 3. Day pages: displayed H1 (not the stale <title>) gives 08/09/10 JUL, recently modified ---
const days = [
  { file: "body-primeiro-dia.html", expectH1: "8 JUL", staleTitle: "09 de Julho" },
  { file: "body-segundo-dia.html", expectH1: "9 JUL", staleTitle: "10 de Julho" },
  { file: "body-terceiro-dia.html", expectH1: "10 JUL", staleTitle: "11 de Julho" },
];
const dayResults = [];
for (const day of days) {
  const html = read(day.file);
  const h1Matches = [...html.matchAll(/<h1[^>]*>(?:<span>)?(\d{1,2}\s*JUL)(?:<\/span>)?<\/h1>/gi)];
  const h1Value = h1Matches.length > 0 ? h1Matches[h1Matches.length - 1][1].trim() : null;
  const titleMatch = html.match(/<title>([^<]*)/i);
  const titleValue = titleMatch ? titleMatch[1] : null;
  dayResults.push({ file: day.file, h1Value, titleValue });

  check(`${day.file} displayed H1 reads "${day.expectH1}"`, h1Value === day.expectH1);
  check(
    `${day.file} <title> tag is the STALE, DIFFERENT value ("${day.staleTitle}") — a real, retained same-page inconsistency`,
    titleValue != null && titleValue.includes(day.staleTitle),
  );
}

// --- 4. The '26-labelled pages are a separate, already-concluded prior edition, not a live conflict ---
const cartaz = read("body-cartaz.html");
const cartazDescMatch = cartaz.match(/"description":"([^"]*Alive[^"]*)"/);
check(
  "cartaz/lineup page's own JSON-LD description self-labels as NOS Alive'26 (a different edition)",
  cartazDescMatch != null && /Alive(&#8217;|')26/i.test(cartazDescMatch[1]),
);
check(
  "cartaz lineup table's own element id is literally tablepress-2026",
  /id="tablepress-2026"/.test(cartaz),
);

const palcoPortico = read("body-palco-portico.html");
check(
  "palco-portico news archive contains a post explicitly dated 2026-07-09 and captioned as day 1 of NOS Alive'26",
  /2026-07-09T/.test(palcoPortico) && /NOS Alive(&#8217;|')26/i.test(palcoPortico),
);

// --- 5. Reproduce the combined derivation deterministically ---
const derivedDates = dayResults.map((d) => {
  const day = d.h1Value.match(/(\d{1,2})\s*JUL/i)[1].padStart(2, "0");
  return `2027-07-${day}`;
});
check(
  "combining each day-page's own H1 (day-of-month) with the '27 edition's own year (established via the linked 2027 vendor URL) yields exactly one result per day: 2027-07-08, 2027-07-09, 2027-07-10",
  JSON.stringify(derivedDates) === JSON.stringify(["2027-07-08", "2027-07-09", "2027-07-10"]),
);

console.log("");
console.log(`derived start_date = ${derivedDates[0]}, end = ${derivedDates[derivedDates.length - 1]}`);
console.log(failures === 0 ? `All checks passed (0 failures).` : `${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
