// Dependency-free, no-network offline proof for teatro-sao-luiz-lisbon-02.
//
// Re-parses every retained fixture in this directory and mechanically
// reproduces every claim made in investigation.json's field_assessment and
// decision blocks -- in particular the DETERMINISTIC_CONTEXT derivation for
// start_date, which this investigation establishes for the FIRST time (the
// superseded teatro-sao-luiz-lisbon-01 left start_date PARTIAL).
//
// The core question: does the site's own theme JavaScript state an
// EXPLICIT, mechanical season -> calendar-year mapping, and does that
// mapping hold with ZERO contradictions across every month (01-12) of the
// season's own auxiliary calendar API? If -- and only if -- both are true,
// combining that mapping with each event's own day+month text (from the
// retained static programme list) yields exactly one full date per event,
// with no plausibility/prediction involved anywhere.
//
// Run with: node offline-proof.mjs
// Exits 0 and prints "OFFLINE PROOF: PASSED" only if every check holds.
// Exits 1 (never silently passes) on any contradiction.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

let failures = 0;
function check(label, condition) {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}`);
  if (!condition) failures++;
}

console.log("=== teatro-sao-luiz-lisbon-02 offline proof ===\n");

// --- Step 1: season label ------------------------------------------------
const programmeEn = read("body-programme-en.html");
const programmePt = read("body-programme-pt.html");

const seasonMatch = programmeEn.match(/data-temporada-actual="([0-9]{4})-([0-9]{4})/);
check("Step 1a: EN programme page's own data-temporada-actual attribute states a two-year season label", !!seasonMatch);
const seasonStartYear = seasonMatch ? Number(seasonMatch[1]) : null;
const seasonEndYear = seasonMatch ? Number(seasonMatch[2]) : null;
check(
  `Step 1b: season label parses to seasonStartYear=${seasonStartYear}, seasonEndYear=${seasonEndYear} (consecutive years)`,
  seasonStartYear !== null && seasonEndYear === seasonStartYear + 1,
);

const seasonMatchPt = programmePt.match(/data-temporada-actual="([0-9]{4})-([0-9]{4})"/);
check(
  "Step 1c: PT programme page independently states the identical season label (cross-language consistency, not a translation artefact)",
  !!seasonMatchPt && seasonMatchPt[1] === String(seasonStartYear) && seasonMatchPt[2] === String(seasonEndYear),
);

// --- Step 2: search every retained static/plain-text page for an EXPLICIT
// prose statement of the season's month boundaries (the strongest possible
// form of evidence -- a first-party sentence, not merely a label) ---------
const staticPagesChecked = [
  "body-programme-en.html",
  "body-programme-pt.html",
  "body-home-en.html",
  "body-home-pt.html",
  "body-seasons-pt.html",
  "body-seasons-en.html",
  "body-bilheteira.html",
];
let explicitProseFound = false;
for (const name of staticPagesChecked) {
  const html = read(name);
  // A direct sentence such as "decorre de setembro a julho" would match this.
  if (/decorre\s+de\s+(setembro|september)[^.]*?(julho|july|agosto|august)/i.test(html)) {
    explicitProseFound = true;
  }
}
check(
  "Step 2: NO retained static page contains a single explicit prose sentence stating the season's month-to-month span (e.g. 'decorre de setembro a julho') -- confirms this rule is not stated as marketing prose anywhere sampled",
  explicitProseFound === false,
);

// --- Step 3: the box office (bilheteira) page's own operational-hours text,
// retained as independent corroborating first-party context (NOT itself the
// basis of the derivation -- see Step 4/5 for the actual mechanical rule) -
const bilheteira = read("body-bilheteira.html");
const opensSept1 = /a partir de 1 de setembro/i.test(bilheteira);
const closedAugust = /entre 1 a 31 de agosto/i.test(bilheteira);
check(
  "Step 3: bilheteira (box office) page states its own opening hours run 'a partir de 1 de setembro' (from 1 September) and that it closes 'entre 1 a 31 de agosto' (1-31 August) -- first-party corroboration that the venue's own operating year turns over at the Aug/Sep boundary",
  opensSept1 && closedAugust,
);

// --- Step 4: the theme's own public JavaScript states an EXPLICIT,
// non-time-dependent season -> year mapping rule ---------------------------
const mainJs = read("body-theme-main-js.js");

// This is the literal source line found in the retained bundle. It does NOT
// call new Date() anywhere in this branch -- "currentMonth" here is read
// from the currently-selected <select> value in the DOM, not today's real
// calendar date, so this is a fixed, source-authored comparison, not a
// today's-date-dependent computation.
const ruleMatch = mainJs.match(
  /if\s*\(\s*currentMonth\s*>=\s*(\d+)\s*&&\s*currentMonth\s*<=\s*(\d+)\s*\)\s*\{\s*selectedMonth\s*=\s*`\$\{selectedSeason\.split\("-"\)\[0\]\}-\$\{currentMonth\}`/,
);
check(
  "Step 4a: retained theme main.js contains the literal, fixed comparison 'if (currentMonth >= N && currentMonth <= M) { selectedMonth = `${selectedSeason.split(\"-\")[0]}-...` }' -- i.e. a month-number range mapped explicitly to the season's OWN start-year component, hardcoded in the site's own public source, not inferred",
  !!ruleMatch,
);
const ruleLowMonth = ruleMatch ? Number(ruleMatch[1]) : null;
const ruleHighMonth = ruleMatch ? Number(ruleMatch[2]) : null;
check(
  `Step 4b: the retained rule's own literal boundary numbers are ${ruleLowMonth}-${ruleHighMonth} (expected 8-12, i.e. August-December mapped to the season's start year; by elimination January-July map to the season's end year, confirmed by the same code's else branch using selectedSeason.split("-")[1])`,
  ruleLowMonth === 8 && ruleHighMonth === 12,
);
const elseBranchMatch = mainJs.match(
  /\}\s*else\s*\{\s*selectedMonth\s*=\s*`\$\{selectedSeason\.split\("-"\)\[1\]\}-\$\{currentMonth\}`\s*;\s*\}/,
);
check(
  "Step 4c: retained theme main.js's own else-branch confirms the complementary case: any month NOT in 8-12 maps to selectedSeason.split(\"-\")[1] -- the season's own end-year component -- completing the full, unconditional, two-branch mapping (never a today's-date lookup, never an assumption)",
  !!elseBranchMatch,
);

/** Mechanical, source-derived rule: month number (1-12) -> calendar year. */
function yearForMonth(monthNumber) {
  if (monthNumber >= ruleLowMonth && monthNumber <= ruleHighMonth) return seasonStartYear;
  return seasonEndYear;
}

// --- Step 5: empirically re-confirm the SAME mapping against every month
// (01-12) of the season's own auxiliary calendar API -- not merely the 6
// months the superseded -01 investigation sampled ------------------------
const MONTH_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);
const apiMonthResults = {};
let apiContradiction = null;
let monthsWithData = 0;
let monthsEmpty = 0;
let totalApiEntries = 0;

for (const monthNumber of MONTH_NUMBERS) {
  const mm = String(monthNumber).padStart(2, "0");
  const fileName = `body-espetaculos-${mm}.json`;
  if (!existsSync(join(HERE, fileName))) {
    apiContradiction = `missing retained fixture for month ${mm}`;
    continue;
  }
  const raw = read(fileName).trim();
  const parsed = raw === "[]" ? {} : JSON.parse(raw);
  const dateKeys = Object.keys(parsed);
  apiMonthResults[mm] = dateKeys;
  if (dateKeys.length === 0) {
    monthsEmpty++;
    continue;
  }
  monthsWithData++;
  const expectedYear = yearForMonth(monthNumber);
  for (const dateKey of dateKeys) {
    totalApiEntries += parsed[dateKey].length;
    const [yearStr, monthStr] = dateKey.split("-");
    const actualYear = Number(yearStr);
    const actualMonth = Number(monthStr);
    if (actualMonth !== monthNumber) {
      apiContradiction = `month=${mm} query returned a date key "${dateKey}" whose own month (${actualMonth}) does not match the queried month (${monthNumber})`;
    }
    if (actualYear !== expectedYear) {
      apiContradiction = `month=${mm} query returned date "${dateKey}" with year ${actualYear}, but the rule (Step 4) predicts year ${expectedYear} for month ${monthNumber}`;
    }
  }
}

check(
  `Step 5a: all 12 months (01-12) of season=${seasonStartYear}-${seasonEndYear} were queried and retained (${monthsWithData} months returned real dated entries, ${monthsEmpty} months returned an empty result -- never an error)`,
  MONTH_NUMBERS.every((m) => apiMonthResults[String(m).padStart(2, "0")] !== undefined),
);
check(
  `Step 5b: every single date entry returned across all 12 months (${totalApiEntries} entries total, across ${monthsWithData} non-empty months) matches the Step 4 rule's predicted year for its own month -- ZERO contradictions found`,
  apiContradiction === null,
);
if (apiContradiction) console.log(`       contradiction: ${apiContradiction}`);

// --- Step 6: parse the full static 26-event list and apply the proven rule
const cardRe = /<div class='card event-item'>[\s\S]*?<\/div>\s*<\/a>\s*<\/div>/g;
const cards = programmeEn.match(cardRe) || [];
check(`Step 6a: the retained static EN programme page contains 26 event cards (found ${cards.length})`, cards.length === 26);

const MONTH_NUMBER_BY_NAME = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

const events = [];
for (const card of cards) {
  const hrefM = card.match(/href="([^"]+)"/);
  const titleM = card.match(/class="title">([^<]+)</);
  const dateM = card.match(/darkblue data.>\s*([^<]+?)<abbr title="([^"]+)"/);
  if (!hrefM || !titleM || !dateM) {
    events.push({ title: titleM ? titleM[1] : "UNKNOWN", href: hrefM ? hrefM[1] : null, error: "could not parse date text" });
    continue;
  }
  const dayText = dateM[1].trim();
  const monthName = dateM[2];
  const monthNumber = MONTH_NUMBER_BY_NAME[monthName];
  const dayParts = dayText.split("-").map((s) => s.trim()).filter(Boolean);
  const year = yearForMonth(monthNumber);
  const isoDates = dayParts.map((d) => `${year}-${pad2(monthNumber)}-${pad2(Number(d))}`);
  events.push({
    title: titleM[1],
    href: hrefM[1],
    monthName,
    monthNumber,
    dayText,
    year,
    isoDates,
    isRange: dayParts.length > 1,
  });
}

check(
  "Step 6b: every one of the 26 static events' day+month text was successfully parsed (no card defeated the parser)",
  events.every((e) => !e.error),
);

const resolvableEvents = events.filter((e) => !e.error);
const yearCounts = resolvableEvents.reduce((acc, e) => {
  acc[e.year] = (acc[e.year] || 0) + 1;
  return acc;
}, {});

console.log("\n--- Step 6c: full derived date table (all 26 static events) ---");
for (const e of resolvableEvents) {
  console.log(
    `  ${e.isoDates.join(" .. ")}  [${e.monthName} ${e.dayText}]  ${e.title}`,
  );
}
console.log(`\n  year distribution across 26 events: ${JSON.stringify(yearCounts)}`);

check(
  `Step 6d: all 26 events resolve to exactly one of the season's two calendar years (${seasonStartYear} or ${seasonEndYear}) -- none fall outside the season`,
  resolvableEvents.every((e) => e.year === seasonStartYear || e.year === seasonEndYear),
);

// --- Step 7: best-effort cross-check of the derived dates against the
// auxiliary API's own independently-returned dates, where the API happens
// to cover the same month (bonus corroboration, not required for the proof
// to pass -- the API's sparse coverage was already documented as a MAJOR
// blocker in the superseded -01 investigation and remains true here) -----
let apiCrossCheckMatches = 0;
let apiCrossCheckChecked = 0;
for (const e of resolvableEvents) {
  const mm = pad2(e.monthNumber);
  const apiDates = apiMonthResults[mm] || [];
  for (const isoDate of e.isoDates) {
    apiCrossCheckChecked++;
    if (apiDates.includes(isoDate)) apiCrossCheckMatches++;
  }
}
console.log(
  `\nStep 7: of ${apiCrossCheckChecked} individual derived dates checked against the auxiliary API's own same-month results, ${apiCrossCheckMatches} were independently confirmed present in the API's own data (the API's sparse, inconsistent coverage -- documented in the superseded -01 investigation -- means a low match count here is expected and is not itself a contradiction; a genuine YEAR contradiction, checked separately in Step 5, would be).`,
);

// --- Step 8: source_record_id stability (WordPress shortlink), re-proven
// independently in this investigation ---------------------------------
const detail1 = read("body-detail-batucadeiras.html");
const detail2 = read("body-detail-batucadeiras-recheck.html");
const headers1 = read("headers-detail-batucadeiras.txt");
const headers2 = read("headers-detail-batucadeiras-recheck.txt");
const id1 = (headers1.match(/rel=shortlink/) && headers1.match(/\?p=(\d+)>;\s*rel=shortlink/)) || null;
const id2 = (headers2.match(/rel=shortlink/) && headers2.match(/\?p=(\d+)>;\s*rel=shortlink/)) || null;
check(
  `Step 8a: two independent fetches of the same event detail page reproduce the identical WordPress shortlink post id (${id1 ? id1[1] : "?"} vs ${id2 ? id2[1] : "?"})`,
  !!id1 && !!id2 && id1[1] === id2[1],
);
check("Step 8b: the two independent fetches' HTML bodies are byte-identical", detail1 === detail2);

const originalId = "35378";
check(
  `Step 8c: the id reproduced in THIS investigation (${id1 ? id1[1] : "?"}) matches the id the superseded -01 investigation recorded for the same event (${originalId}) -- id stability confirmed not just within one investigation, but across investigations days apart`,
  !!id1 && id1[1] === originalId,
);

// --- Summary ---------------------------------------------------------------
console.log("\n=== SUMMARY ===");
if (failures === 0) {
  console.log("OFFLINE PROOF: PASSED -- every check above passed. The season-boundary rule is genuinely explicit (retained in the site's own public theme JavaScript), fully mechanical (no today's-date lookup, no plausibility), and empirically exhaustive (confirmed against literal every month, 01-12, of the season's own auxiliary API with zero contradictions).");
  process.exit(0);
} else {
  console.log(`OFFLINE PROOF: FAILED -- ${failures} check(s) failed. See [FAIL] lines above.`);
  process.exit(1);
}
