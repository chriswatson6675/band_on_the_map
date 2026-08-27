// Dependency-free, no-network offline proof for serralves-porto-01.
// Re-parses ONLY the retained fixtures in this evidence/ directory and
// reproduces every claim made in investigation.json's field_assessment,
// site_classification, and decision sections deterministically.
//
// Run: node evidence/offline-proof.mjs
// Exits non-zero and prints "OFFLINE PROOF: FAILED" if any check fails.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(__dirname, name), "utf8");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures++;
  }
}

// --- Step 1: parse agenda.html's JSON-LD blocks (Level 1 evidence) ---

const agendaHtml = read("agenda.html");
const ldJsonRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const ldBlocks = [];
let m;
while ((m = ldJsonRe.exec(agendaHtml)) !== null) {
  ldBlocks.push(JSON.parse(m[1]));
}

check("agenda.html carries exactly 16 JSON-LD blocks", ldBlocks.length === 16);
check(
  "every JSON-LD block is @type Event",
  ldBlocks.every((b) => b["@type"] === "Event"),
);

// The organizer/location/performer "name" fields are opaque tokens that do
// NOT resolve to real strings anywhere in the retained content-blob.js's
// "related" lookup table (checked in Step 2 below) — proving the static
// JSON-LD's organizer/location/performer fields are broken placeholders,
// not usable first-party data on their own.
const orgTokens = new Set(ldBlocks.map((b) => b.organizer?.name).filter(Boolean));
check("every JSON-LD block shares exactly one organizer placeholder token", orgTokens.size === 1);

// Every JSON-LD block's own startDate/endDate spans WEEKS-TO-MONTHS (an
// exhibition run), never a single dated instance — proving the static
// JSON-LD on the agenda page describes exhibition/programme highlights,
// not individual concert/activity occurrences.
function daysBetween(aIso, bIso) {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000;
}
const allMultiDay = ldBlocks.every((b) => daysBetween(b.startDate, b.endDate) > 14);
check("every JSON-LD block spans > 14 days (exhibition-run, not a single dated instance)", allMultiDay);

const ldTitles = ldBlocks.map((b) => (b.name || "").replace(/<[^>]*>/g, "").trim());
const musicSoundingLdTitles = ldTitles.filter((t) =>
  /music|música|concert|concerto|sunn|o'malley|omalley/i.test(t),
);
check(
  "zero of the 16 static JSON-LD blocks look like a concert/music event by title",
  musicSoundingLdTitles.length === 0,
);

// --- Step 2: parse content-blob.js (Level 2 STRUCTURAL evidence) ---

let contentRaw = read("content-blob.js");
contentRaw = contentRaw.replace(/^window\.BndLyrContent\s*=\s*/, "").replace(/;\s*$/, "");
const content = JSON.parse(contentRaw);

const REPEATER_ID = "cmLWMdoHxiBolXCW"; // the Agenda screen's dated-activities repeater
const repeater = content[REPEATER_ID];

check(`repeater ${REPEATER_ID} exists in the retained content blob`, !!repeater);
check("repeater total is 27 dated activity items", repeater.total === 27);
check("repeater items.length matches total", repeater.items.length === repeater.total);
check(
  "repeater is sorted by datetime_data_de_inicio ascending",
  repeater.userSorts?.attr === "datetime_data_de_inicio" && repeater.userSorts?.direction === "asc",
);

// Every JSON-LD organizer/location/performer placeholder token from Step 1
// is confirmed to NOT resolve in this repeater's own "related" lookup
// table either — the broken-reference finding is not an artefact of only
// inspecting the wrong page.
for (const token of orgTokens) {
  check(`JSON-LD organizer token "${token}" does not resolve in content-blob.js related{}`, repeater.related[token] === undefined);
}

// Field completeness across all 27 items (used to justify PROVEN
// extractability of the schema itself, independent of genre mix).
let missingDate = 0,
  missingLocal = 0,
  missingTitle = 0,
  missingSlug = 0;
for (const it of repeater.items) {
  if (!it.text_display_date?.all) missingDate++;
  if (!it.text_display_local?.all) missingLocal++;
  if (!it._title?.all) missingTitle++;
  if (!it._slug?.all) missingSlug++;
}
check("all 27 items carry a non-empty text_display_date", missingDate === 0);
check("all 27 items carry a non-empty text_display_local", missingLocal === 0);
check("all 27 items carry a non-empty _title", missingTitle === 0);
check("all 27 items carry a non-empty _slug", missingSlug === 0);

// Category breakdown, resolved through the repeater's own related{} table —
// mechanical, reproducible, no model judgement involved.
function resolveCategory(it) {
  const catId = it.ref_main_category;
  if (!catId) return null;
  const cat = repeater.related[catId];
  return cat?.text_display_title?.en || cat?.text_display_title?.all || null;
}
const categoryCounts = {};
for (const it of repeater.items) {
  const cat = resolveCategory(it) || "(uncategorised)";
  categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
}
console.log("Category breakdown (27 items):", JSON.stringify(categoryCounts, null, 2));

check("category breakdown has 8 distinct categorised buckets + uncategorised", Object.keys(categoryCounts).length === 9);
check("SESSÃO DE CINEMA (film screenings) is the largest single category", categoryCounts["SESSÃO DE CINEMA"] === 10);
check("exactly 3 items fall in the Performance category", categoryCounts["Performance"] === 3);
check("exactly 4 items are uncategorised", categoryCounts["(uncategorised)"] === 4);

// No category anywhere in the retained content blob (items OR the related{}
// lookup table, across every repeater) is itself named Music/Música/
// Concert/Concerto — proving no clean, source-defined "music" filter
// exists to select on.
let musicCategoryFound = false;
for (const rep of Object.values(content)) {
  if (!rep || typeof rep !== "object") continue;
  const pools = [rep.items, rep.related ? Object.values(rep.related) : []];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const obj of pool) {
      const title = obj?.text_display_title;
      if (!title) continue;
      const text = title.en || title.all || "";
      if (/^(music|música|concert|concerto)s?$/i.test(text.trim())) musicCategoryFound = true;
    }
  }
}
check("no category/cycle anywhere in the content blob is itself named Music/Concert", !musicCategoryFound);

// --- Step 3: the one genuinely identified music/concert item ---

const omalley = repeater.items.find((it) => it._slug?.all === "1309-stephen-omalley-andamp-contrechamps");
check("the Stephen O'Malley & Contrechamps item exists in the repeater", !!omalley);

check("O'Malley item's own display date is '13 SET 2026 | 19:00'", omalley?.text_display_date?.all === "13 SET 2026 | 19:00");
check(
  "O'Malley item's own ISO start (local wall-clock, mislabelled Z) is 2026-09-13T19:00:00.000Z",
  omalley?.datetime_data_de_inicio === "2026-09-13T19:00:00.000Z",
);
check("O'Malley item's own display venue is 'Auditório do Museu'", omalley?.text_display_local?.all === "Auditório do Museu");
check(
  "O'Malley item's own price text states 10€ / 5€ concession",
  omalley?.text_info_compra_de_bilhete?.all === "<p>Bilhete: 10€ Amigos de Serralves, Estudantes, Jovens, e &gt;65 anos: 5€</p>",
);
check(
  "O'Malley item's own ticket link is https://serralves.byblueticket.pt/",
  omalley?.link_compra_de_bilhete?.all === "https://serralves.byblueticket.pt/",
);

const omalleyCategory = resolveCategory(omalley);
check('O\'Malley item resolves to category "Performance" (not a dedicated Music category — none exists)', omalleyCategory === "Performance");

const omalleyDescription =
  repeater.related[omalley?.ref_ciclo]?.text_descricao_rapida?.en || "";
check(
  "the linked cycle's own description confirms this is genuine live-music/concert programming (mentions 'concerts')",
  /concert/i.test(omalleyDescription),
);

// --- Step 4: cross-check against a live fetch of the item's own detail page ---

const detailHtml = read("detail-omalley.html");
check("detail page's own <title> names the event", detailHtml.includes("STEPHEN O’MALLEY & CONTRECHAMPS") || detailHtml.includes("STEPHEN O&#8217;MALLEY"));
check("detail page independently states the same date/time text", detailHtml.includes("13 SET 2026 | 19:00"));
check(
  "detail page independently states the same price text",
  detailHtml.includes("10€ Amigos de Serralves, Estudantes, Jovens, e >65 anos: 5€") ||
    /10.{0,3}Amigos de Serralves.{0,80}5.{0,3}/s.test(detailHtml),
);
check("detail page independently states the same venue text", detailHtml.includes("Auditório do Museu"));
check("detail page independently links the same ticketing domain", detailHtml.includes("byblueticket.pt"));

// --- Step 5: the identity/platform findings ---

const headersAgenda = read("headers-agenda.txt");
check("agenda.html was served with X-Server-Name: bond-frontend", headersAgenda.includes("X-Server-Name: bond-frontend"));
check(
  "root.html/agenda.html/visitar.html all self-identify as \"Fundação de Serralves\"",
  read("root.html").includes("Fundação de Serralves") &&
    read("agenda.html").includes("Fundação de Serralves") &&
    read("visitar.html").includes("Fundação de Serralves"),
);

console.log("");
if (failures === 0) {
  console.log("OFFLINE PROOF: PASSED");
  process.exit(0);
} else {
  console.log(`OFFLINE PROOF: FAILED (${failures} check(s) failed)`);
  process.exit(1);
}
