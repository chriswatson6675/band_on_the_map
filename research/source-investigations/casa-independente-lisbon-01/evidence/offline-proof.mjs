// Offline, dependency-free, NO-NETWORK deterministic proof for the
// casa-independente-lisbon-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment claims recorded in
// investigation.json:
//
//  - the /agenda/ page is a hand-authored Elementor page (no calendar
//    plugin, no JSON-LD) exposing exactly one month/year heading followed
//    by a sequence of per-event blocks: a weekday/day-month/hour heading,
//    an event-type heading (e.g. "DJ Set"), and an artist-name <h1>;
//  - the day+month text on each event card, combined with the single
//    page-level month/year heading, produces a full calendar date whose
//    day-of-week is then cross-checked by pure calendar math against the
//    source's own weekday label ("SEXTA", "SÁBADO", ...) — this is a
//    mechanical corroboration, not a guess based on today's date;
//  - the contacts page states the venue's street address and email;
//  - the about page states the 1863 building date and the 2012 founding
//    date this investigation used to independently confirm venue identity.
//
// Run with: node evidence/offline-proof.mjs
// Makes zero network requests — reads only local files in this directory.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

function read(name) {
  return readFileSync(join(HERE, name), "utf-8");
}

let failures = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures++;
}

function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. Agenda page: locate the single month/year heading ---

const agendaHtml = read("body-agenda.html");

const monthHeadingRe = /<h1 class="elementor-heading-title elementor-size-default">([^<]+)<\/h1>/g;
const monthHeadings = [...agendaHtml.matchAll(monthHeadingRe)].map((m) => m[1].trim());

console.log(`Month/year headings found on the agenda page: ${JSON.stringify(monthHeadings)}`);
if (monthHeadings.length !== 1) {
  fail(`expected exactly one page-level month/year heading (h1.elementor-heading-title) — found ${monthHeadings.length}`);
} else {
  ok("exactly one month/year heading found — no ambiguity about which heading governs the cards below it");
}

const PT_MONTHS = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const monthHeadingMatch = /^([A-Za-zçÇãÃ]+)\s+(\d{4})$/.exec(monthHeadings[0] || "");
const PT_MONTH_NAMES = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
let headingYear = null;
let headingMonth = null;
if (monthHeadingMatch) {
  const [, monthName, yearStr] = monthHeadingMatch;
  headingMonth = PT_MONTH_NAMES[monthName.toLowerCase()] ?? null;
  headingYear = Number(yearStr);
  console.log(`Parsed page heading -> month=${headingMonth} (${monthName}) year=${headingYear}`);
  if (!headingMonth || !Number.isInteger(headingYear)) {
    fail(`could not parse month/year out of heading text "${monthHeadings[0]}"`);
  } else {
    ok(`page heading "${monthHeadings[0]}" parses cleanly to month=${headingMonth}, year=${headingYear}`);
  }
} else {
  fail(`month/year heading "${monthHeadings[0]}" did not match the expected "<MonthName> <Year>" shape`);
}

// --- 2. Agenda page: extract per-event blocks in document order ---
//
// Each event is: one <h5 class="elementor-heading-title elementor-size-default">
// date block (weekday/day-month/hour, with <span>/<br> markup), followed by
// either a plain <h5 class="elementor-heading-title elementor-size-default">
// event-type block (e.g. "DJ Set") or an artist-name <h1> inside a
// text-editor widget. We walk all matches of both patterns in document
// order and classify each by shape.

const blockRe =
  /<h5 class="elementor-heading-title elementor-size-default">([\s\S]*?)<\/h5>|<div class="elementor-widget-container">\s*<h1>([^<]+)<\/h1>/g;

function htmlBlockToLines(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const DAY_MONTH_RE = /^(\d{1,2})\s+([A-ZÇÃ]{3})$/i;
const HOUR_RE = /^(\d{1,2})H$/i;

const rawBlocks = [];
let bm;
while ((bm = blockRe.exec(agendaHtml)) !== null) {
  if (bm[1] !== undefined) {
    rawBlocks.push({ kind: "h5", lines: htmlBlockToLines(bm[1]) });
  } else {
    rawBlocks.push({ kind: "h1", text: bm[2].trim().replace(/&amp;/g, "&") });
  }
}

// Drop the very first h5 match if it is actually the month/year heading —
// it is emitted by <h1>, not <h5>, so no drop is needed; but defensively
// filter out any h5 block that doesn't look like either a date block or a
// short type label (shouldn't happen, kept for honesty/robustness).

const events = [];
for (let i = 0; i < rawBlocks.length; i++) {
  const b = rawBlocks[i];
  if (b.kind !== "h5") continue;
  const isDateBlock = b.lines.some((l) => DAY_MONTH_RE.test(l));
  if (!isDateBlock) continue; // this h5 is a type label, consumed below

  const weekdayText = b.lines[0] ?? null;
  const dayMonthLine = b.lines.find((l) => DAY_MONTH_RE.test(l)) ?? null;
  const hourLine = b.lines.find((l) => HOUR_RE.test(l)) ?? null;

  const next1 = rawBlocks[i + 1]; // expected: type h5
  const next2 = rawBlocks[i + 2]; // expected: artist h1
  const typeText = next1 && next1.kind === "h5" ? next1.lines.join(" ").trim() : null;
  const titleText = next2 && next2.kind === "h1" ? next2.text : null;

  events.push({ weekdayText, dayMonthLine, hourLine, typeText, titleText });
}

console.log("");
console.log(`Parsed ${events.length} event block(s) from body-agenda.html`);
if (events.length === 0) {
  fail("expected at least one event block on the agenda page — found zero");
} else {
  ok(`found ${events.length} event block(s) (>= 1)`);
}

// --- 3. Per-event field derivation + weekday cross-check ---

const PT_WEEKDAY_TO_JS_DAY = {
  DOMINGO: 0,
  "SEGUNDA": 1, "SEGUNDA FEIRA": 1, "SEGUNDA-FEIRA": 1,
  "TERCA": 2, "TERÇA": 2, "TERCA FEIRA": 2, "TERÇA FEIRA": 2,
  "QUARTA": 3, "QUARTA FEIRA": 3,
  "QUINTA": 4, "QUINTA FEIRA": 4,
  "SEXTA": 5, "SEXTA FEIRA": 5,
  "SABADO": 6, "SÁBADO": 6,
};

console.log("");
console.log("--- Per-event derivation ---");

const results = [];
for (const ev of events) {
  const dmMatch = ev.dayMonthLine ? DAY_MONTH_RE.exec(ev.dayMonthLine) : null;
  const hourMatch = ev.hourLine ? HOUR_RE.exec(ev.hourLine) : null;

  if (!dmMatch) {
    fail(`event with title "${ev.titleText}" has no parseable "DD MES" day/month line`);
    continue;
  }
  const day = Number(dmMatch[1]);
  const monthAbbrev = dmMatch[2].toUpperCase();
  const month = PT_MONTHS[monthAbbrev];
  if (!month) {
    fail(`unrecognised Portuguese month abbreviation "${monthAbbrev}"`);
    continue;
  }
  if (!headingYear || !headingMonth) {
    fail("cannot derive a full date — the page-level month/year heading did not parse (see above)");
    continue;
  }
  if (month !== headingMonth) {
    fail(
      `event day/month "${dmMatch[0]}" is in month ${month}, which does not match the page heading's month ${headingMonth} — this investigation's single-heading-governs-all-cards assumption would be WRONG here`,
    );
  }

  const isoDate = `${headingYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const computedJsDay = new Date(Date.UTC(headingYear, month - 1, day)).getUTCDay();
  const weekdayKey = (ev.weekdayText || "").toUpperCase().replace(/\s+/g, " ").trim();
  const expectedJsDay = PT_WEEKDAY_TO_JS_DAY[weekdayKey];
  const weekdayMatches = expectedJsDay !== undefined && expectedJsDay === computedJsDay;

  const hour = hourMatch ? Number(hourMatch[1]) : null;

  const row = {
    title: ev.titleText,
    type: ev.typeText,
    weekdayText: ev.weekdayText,
    isoDate,
    computedJsDay,
    expectedJsDay,
    weekdayMatches,
    hour,
  };
  results.push(row);

  console.log(
    `"${row.title}" (${row.type}): weekday label="${row.weekdayText}" -> derived date=${isoDate}, ` +
      `computed day-of-week=${computedJsDay}, expected from label=${expectedJsDay}, match=${weekdayMatches}, hour=${hour}H`,
  );

  if (!row.title) fail(`event at "${isoDate}" is missing an artist-name title`);
  if (!row.type) fail(`event at "${isoDate}" is missing an event-type label`);
  if (hour === null) fail(`event at "${isoDate}" is missing a parseable hour`);
  if (weekdayMatches) {
    ok(`"${row.title}": source's own weekday label ("${row.weekdayText}") matches the actual computed day-of-week for ${isoDate} — mechanical corroboration that the year inferred from the single page-level heading is consistent, not merely assumed`);
  } else {
    fail(`"${row.title}": source's own weekday label ("${row.weekdayText}") does NOT match the actual day-of-week computed for ${isoDate} (year taken from the page heading) — the year-from-heading inference would be suspect for this event`);
  }
}

// --- 4. Known, honestly-documented anomaly: weekday-label formatting is
//        inconsistent even within this small sample ("SEXTA FEIRA" vs
//        "SEXTA" for the same weekday), even though it plays no role in
//        date derivation (only the "DD MES" line does). ---

const weekdayLabels = new Set(events.map((e) => (e.weekdayText || "").toUpperCase()));
console.log("");
console.log(`Distinct weekday label spellings observed: ${[...weekdayLabels].join(" | ")}`);
if (weekdayLabels.size > 1) {
  ok(
    "confirmed: the source's own weekday-label text is NOT consistently formatted across cards in this sample (hand-authored page, not template-generated) — recorded honestly as a MAJOR blocker risk, even though it does not affect date parsing since only the numeric day+month line is load-bearing",
  );
} else {
  console.log("NOTE: weekday label formatting was consistent in this run (inconsistency not reproduced).");
}

// --- 5. Contacts page: address + email ---

console.log("");
console.log("--- Contacts page checks ---");
const contactsHtml = read("body-contactos.html");

const addressMatch = /<p>(Largo do Intendente[^<]*)<\/p>/.exec(contactsHtml);
if (addressMatch) {
  ok(`address extracted from contacts page: "${addressMatch[1].trim()}"`);
} else {
  fail("expected to find the venue's street address on the contacts page");
}

const emailMatch = /mailto:([^"]+)"/.exec(contactsHtml);
if (emailMatch) {
  ok(`contact email extracted from contacts page: "${emailMatch[1]}"`);
} else {
  fail("expected to find a mailto: contact email on the contacts page");
}

// --- 6. About page: independently confirm the 1863 building date and 2012
//        founding date (identity corroboration, not taken from the task
//        prompt — re-derived here from retained evidence only). ---

console.log("");
console.log("--- About page checks ---");
const sobreHtml = read("body-sobre.html");

if (/constru[íi]do em 1863/i.test(sobreHtml)) {
  ok('about page states the building was "construído em 1863" — independently corroborates the 1863 building date');
} else {
  fail('expected to find "construído em 1863" on the about page');
}

if (/nasceu em 2012/i.test(sobreHtml)) {
  ok('about page states Casa Independente "nasceu em 2012" — independently corroborates the 2012 founding date');
} else {
  fail('expected to find "nasceu em 2012" on the about page');
}

if (/Largo do Intendente/i.test(sobreHtml)) {
  ok("about page also references Largo do Intendente, consistent with the contacts page address");
} else {
  fail("expected the about page to reference Largo do Intendente");
}

// --- Summary ---

console.log("");
if (failures > 0) {
  process.exitCode = 1;
  console.log(`RESULT: ${failures} check(s) FAILED — see FAIL lines above.`);
} else {
  console.log(
    `RESULT: all checks passed against retained evidence (${results.length} event(s) fully derived and cross-checked; identity independently corroborated from the about + contacts pages).`,
  );
}
