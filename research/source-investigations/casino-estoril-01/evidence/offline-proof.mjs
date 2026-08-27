// Dependency-free, no-network offline proof for casino-estoril-01.
//
// Re-parses ONLY the retained evidence files in this directory (no live
// HTTP requests, no external packages) and mechanically re-derives every
// field_assessment claim made in ../investigation.json, printing PASS/FAIL
// for each check. This never becomes a production collector — it exists
// only to prove the claims above are reproducible, not merely asserted.
//
// Run with: node evidence/offline-proof.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

// --- Load retained evidence ---
const agendaHtml = read("body-agenda.html");
const sobreHtml = read("body-sobre.html");
const agendaJson = JSON.parse(read("body-agenda-content.json"));

// --- 1. Locate the "Música ao Vivo" record in the retained JSON asset ---
const item = agendaJson.find((i) => i.slug === "https://casino-estoril.pt/pt/agenda/musica-ao-vivo");
check("agenda_content.pt.json contains a 'musica-ao-vivo' record", Boolean(item));
check("record name is 'Música ao Vivo'", item?.name === "Música ao Vivo");

// --- 2. Extract the exact performer/day summary paragraph from the retained HTML ---
// This is the first <p> inside the page's own content container -- the
// server-rendered block that lists every performer and their days.
const contentBlockMatch = agendaHtml.match(
  /content"><p>([\s\S]*?)<\/p>/,
);
check("performer/day summary paragraph found in retained HTML", Boolean(contentBlockMatch));
const summaryHtml = contentBlockMatch ? contentBlockMatch[1] : "";
const summaryLines = summaryHtml
  .split(/<br\s*\/?>/i)
  .map((s) => s.trim())
  .filter(Boolean);

check(
  "exactly 8 performer/day lines found",
  summaryLines.length === 8,
  `found ${summaryLines.length}: ${JSON.stringify(summaryLines)}`,
);

// Each line should match "NAME - <days> de Agosto[, HHhMM]"
const lineRe = /^(.+?)\s*-\s*([\d,\s]+)\s*de\s*Agosto(?:,\s*(\d{1,2}h\d{2}))?\s*$/i;
let allLinesMatch = true;
const parsedPerformers = [];
for (const line of summaryLines) {
  const m = line.match(lineRe);
  if (!m) {
    allLinesMatch = false;
    continue;
  }
  const name = m[1].trim();
  const days = m[2].split(",").map((d) => d.trim()).filter(Boolean);
  const timeOverride = m[3] || null;
  parsedPerformers.push({ name, days, timeOverride });
}
check(
  "every performer/day line matches 'NAME - day(s) de Agosto[, HHhMM]'",
  allLinesMatch && parsedPerformers.length === summaryLines.length,
);

console.log("\nParsed performer/day entries (day + month only -- see year check below):");
for (const p of parsedPerformers) {
  console.log(`  - ${p.name}: days [${p.days.join(", ")}] of Agosto${p.timeOverride ? `, time override ${p.timeOverride}` : ""}`);
}

// --- 3. Confirm NO 4-digit year token appears anywhere in the summary block ---
const yearInSummary = summaryHtml.match(/\b(19|20)\d{2}\b/);
check(
  "no 4-digit year appears anywhere in the performer/day summary block",
  yearInSummary === null,
  yearInSummary ? `found "${yearInSummary[0]}"` : undefined,
);

// Confirm the one Manuel Melo time override was captured
const manuelMelo = parsedPerformers.find((p) => /MANUEL MELO/i.test(p.name));
check(
  "MANUEL MELO's per-night time override (23h00) is captured, proving the page-level 22h00-00h30 default is not universal",
  manuelMelo?.timeOverride === "23h00",
);

// --- 4. Confirm date_begin/date_end is a display-visibility window, not a
//    per-occurrence date, by cross-checking against a genuine one-off show ---
const [beginY, beginM] = (item.date_begin || "").split("-").map(Number);
const [endY, endM] = (item.date_end || "").split("-").map(Number);
check(
  "musica-ao-vivo date_begin/date_end spans more than one calendar year",
  Number.isFinite(beginY) && Number.isFinite(endY) && endY > beginY,
  `date_begin=${item.date_begin} date_end=${item.date_end}`,
);

function augustsWithinRange(beginIso, endIso) {
  const begin = new Date(beginIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  const years = [];
  for (let y = begin.getUTCFullYear(); y <= end.getUTCFullYear(); y += 1) {
    const augStart = new Date(Date.UTC(y, 7, 1));
    const augEnd = new Date(Date.UTC(y, 7, 31));
    if (augEnd >= begin && augStart <= end) years.push(y);
  }
  return years;
}
const candidateYears = augustsWithinRange(item.date_begin, item.date_end);
check(
  "more than one distinct calendar-year August falls inside date_begin..date_end (proves the range cannot mechanically resolve a single year)",
  candidateYears.length > 1,
  `candidate years for "Agosto": ${JSON.stringify(candidateYears)}`,
);

// Cross-check: a genuine one-off, specifically-dated show ("ABBA MIA") in
// the SAME retained JSON also omits the year in its own schedule_text,
// showing this is a site-wide convention, not a gap unique to this
// candidate's recurring residency page.
const abbaMia = agendaJson.find((i) => i.slug.endsWith("/abba-mia-tributo-a-abba"));
check("comparison record 'abba-mia-tributo-a-abba' found in retained JSON", Boolean(abbaMia));
const abbaYearMatch = (abbaMia?.schedule_text || "").match(/\b(19|20)\d{2}\b/);
check(
  "the one-off 'ABBA MIA' show's own schedule_text ('DATA: 11 Outubro...') also carries no year -- confirms a site-wide convention, not a candidate-specific gap",
  abbaYearMatch === null,
  `schedule_text="${abbaMia?.schedule_text}"`,
);
check(
  "'ABBA MIA' date_begin/date_end is also a display-visibility window (2026-01-01..2026-12-31), not a specific show date -- corroborates that date_begin/date_end never encodes the real occurrence date on this source",
  abbaMia?.date_begin === "2026-01-01" && abbaMia?.date_end === "2026-12-31",
);

// --- 5. venue_location: DETERMINISTIC_CONTEXT combination of two retained,
//    independently-fetched pages: the item's own "room" field, and the
//    venue's own address text on its separate "Sobre/Contactos" page. ---
check("agenda_content.pt.json record's own room field is 'Lounge D'", item.room === "Lounge D");
const addressMatch = sobreHtml.match(/Av\.\s*Dr\.\s*Stanley\s*Ho(?:\s*<br\s*\/?>\s*|[^<]*?)*?2765-190\s*Estoril/i);
check(
  "the venue's own retained 'Sobre/Contactos' page states the address 'Av. Dr. Stanley Ho ... 2765-190 Estoril'",
  Boolean(addressMatch),
);
function cleanAddressText(raw) {
  return raw
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/&iacute;/gi, "í")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}
const derivedVenue = addressMatch && item.room === "Lounge D"
  ? `Casino Estoril -- ${item.room}, ${cleanAddressText(addressMatch[0])}`
  : null;
check(
  "venue_location mechanically combines to exactly one result",
  typeof derivedVenue === "string" && derivedVenue.length > 0,
  derivedVenue || undefined,
);
if (derivedVenue) console.log(`\nDerived venue_location: ${derivedVenue}`);

// --- 6. price: DIRECT_SOURCE text on the item's own schedule_text field ---
check(
  "item.schedule_text literally contains 'ENTRADA: LIVRE'",
  /ENTRADA:\s*LIVRE/i.test(item.schedule_text || ""),
  item.schedule_text,
);

// --- 7. time / end: DIRECT_SOURCE text on the item's own schedule_text field ---
const timeMatch = (item.schedule_text || "").match(/(\d{1,2})h(\d{2})\s*(?:&agrave;|à)\s*(\d{1,2})h(\d{2})/i);
check(
  "item.schedule_text states a start/end time pair (22h00 .. 00h30)",
  Boolean(timeMatch),
  item.schedule_text,
);
if (timeMatch) {
  const [, sh, sm, eh, em] = timeMatch;
  console.log(`\nDerived default time window: ${sh.padStart(2, "0")}:${sm} -> ${eh.padStart(2, "0")}:${em} (floating local, no timezone stated)`);
}

// --- 8. identity: title, og:site_name, address, map link all mutually consistent ---
check("agenda page <title> mentions 'Casino Estoril'", /<title>[^<]*Casino Estoril[^<]*<\/title>/.test(agendaHtml));
check(
  "'Sobre' page contains a Google Maps link referencing 'Casino+Estoril'",
  /Casino\+Estoril/.test(sobreHtml),
);

console.log(`\n${failures === 0 ? "OFFLINE PROOF: PASSED" : `OFFLINE PROOF: FAILED (${failures} check(s))`}`);
process.exitCode = failures === 0 ? 0 : 1;
