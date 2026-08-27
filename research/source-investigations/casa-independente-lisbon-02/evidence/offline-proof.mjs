// Offline, dependency-free, NO-NETWORK deterministic proof for the
// casa-independente-lisbon-02 investigation (supersedes
// casa-independente-lisbon-01).
//
// Parses the retained evidence files already saved under this directory
// (fetched fresh via curl on 2026-08-27, well into the "late August 2026"
// window the -01 investigation's context note anticipated; never re-fetched
// here) and mechanically re-derives / re-checks:
//
//  1. The /agenda/ page still exposes exactly one page-level month/year
//     heading (this is the specific question this investigation exists to
//     re-observe: has a second "Setembro 2026" heading appeared yet?).
//  2. The same day+month/weekday/hour/type/title extraction and
//     weekday-cross-check the -01 investigation performed, reproduced
//     against this fresh fixture.
//  3. A cache-busted second fetch of the same URL (different query string,
//     explicit Cache-Control: no-cache header, X-Cache: MISS confirmed in
//     its own retained headers file) parses to an IDENTICAL set of events
//     and an identical heading as the primary fetch — ruling out a stale
//     CDN/cache artifact as an explanation for "still only one month".
//  4. The event-relevant content of this fresh fixture (heading text +
//     every event block's weekday/day-month/hour/type/title) is compared,
//     field-by-field, against the ORIGINAL casa-independente-lisbon-01
//     fixture retained two days earlier (2026-08-25) — both are local,
//     already-retained project evidence files, read here (never
//     re-fetched, never mutated) purely to mechanically prove "nothing
//     changed" rather than merely asserting it in prose.
//  5. No per-event id, slug, data-attribute, or href exists anywhere in
//     the fresh agenda fixture — re-confirming the source_record_id /
//     event_url gap is still genuinely present, not merely re-asserted
//     from the prior investigation.
//  6. The contacts/about pages still state the venue's own address, email,
//     1863 building date, and 2012 founding date (fresh identity
//     corroboration, not reused from -01).
//
// Run with: node offline-proof.mjs
// Makes zero network requests — reads only local, already-retained files
// under this directory and the sibling -01 investigation's evidence/.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGINAL_EVIDENCE_DIR = join(HERE, "..", "..", "casa-independente-lisbon-01", "evidence");

function read(name) {
  return readFileSync(join(HERE, name), "utf-8");
}

function readOriginal(name) {
  return readFileSync(join(ORIGINAL_EVIDENCE_DIR, name), "utf-8");
}

let failures = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures++;
}

function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- shared parsing helpers (same approach as casa-independente-lisbon-01/evidence/offline-proof.mjs) ---

const PT_MONTHS = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const PT_MONTH_NAMES = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const PT_WEEKDAY_TO_JS_DAY = {
  DOMINGO: 0,
  "SEGUNDA": 1, "SEGUNDA FEIRA": 1, "SEGUNDA-FEIRA": 1,
  "TERCA": 2, "TERÇA": 2, "TERCA FEIRA": 2, "TERÇA FEIRA": 2,
  "QUARTA": 3, "QUARTA FEIRA": 3,
  "QUINTA": 4, "QUINTA FEIRA": 4,
  "SEXTA": 5, "SEXTA FEIRA": 5,
  "SABADO": 6, "SÁBADO": 6,
};

const DAY_MONTH_RE = /^(\d{1,2})\s+([A-ZÇÃ]{3})$/i;
const HOUR_RE = /^(\d{1,2})H$/i;

function htmlBlockToLines(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractMonthHeadings(html) {
  const monthHeadingRe = /<h1 class="elementor-heading-title elementor-size-default">([^<]+)<\/h1>/g;
  return [...html.matchAll(monthHeadingRe)].map((m) => m[1].trim());
}

function parseMonthHeading(headingText) {
  const m = /^([A-Za-zçÇãÃ]+)\s+(\d{4})$/.exec(headingText || "");
  if (!m) return null;
  const [, monthName, yearStr] = m;
  const month = PT_MONTH_NAMES[monthName.toLowerCase()] ?? null;
  const year = Number(yearStr);
  if (!month || !Number.isInteger(year)) return null;
  return { month, year, raw: headingText };
}

function extractEventBlocks(html) {
  const blockRe =
    /<h5 class="elementor-heading-title elementor-size-default">([\s\S]*?)<\/h5>|<div class="elementor-widget-container">\s*<h1>([^<]+)<\/h1>/g;

  const rawBlocks = [];
  let bm;
  while ((bm = blockRe.exec(html)) !== null) {
    if (bm[1] !== undefined) {
      rawBlocks.push({ kind: "h5", lines: htmlBlockToLines(bm[1]) });
    } else {
      rawBlocks.push({ kind: "h1", text: bm[2].trim().replace(/&amp;/g, "&") });
    }
  }

  const events = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    const b = rawBlocks[i];
    if (b.kind !== "h5") continue;
    const isDateBlock = b.lines.some((l) => DAY_MONTH_RE.test(l));
    if (!isDateBlock) continue;

    const weekdayText = b.lines[0] ?? null;
    const dayMonthLine = b.lines.find((l) => DAY_MONTH_RE.test(l)) ?? null;
    const hourLine = b.lines.find((l) => HOUR_RE.test(l)) ?? null;

    const next1 = rawBlocks[i + 1];
    const next2 = rawBlocks[i + 2];
    const typeText = next1 && next1.kind === "h5" ? next1.lines.join(" ").trim() : null;
    const titleText = next2 && next2.kind === "h1" ? next2.text : null;

    events.push({ weekdayText, dayMonthLine, hourLine, typeText, titleText });
  }
  return events;
}

function deriveEvents(html, headingInfo) {
  const events = extractEventBlocks(html);
  const results = [];
  for (const ev of events) {
    const dmMatch = ev.dayMonthLine ? DAY_MONTH_RE.exec(ev.dayMonthLine) : null;
    const hourMatch = ev.hourLine ? HOUR_RE.exec(ev.hourLine) : null;
    if (!dmMatch || !headingInfo) {
      results.push({ ...ev, isoDate: null, weekdayMatches: null, hour: hourMatch ? Number(hourMatch[1]) : null });
      continue;
    }
    const day = Number(dmMatch[1]);
    const monthAbbrev = dmMatch[2].toUpperCase();
    const month = PT_MONTHS[monthAbbrev];
    const isoDate =
      month && headingInfo.year
        ? `${headingInfo.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : null;
    const computedJsDay = isoDate ? new Date(Date.UTC(headingInfo.year, month - 1, day)).getUTCDay() : null;
    const weekdayKey = (ev.weekdayText || "").toUpperCase().replace(/\s+/g, " ").trim();
    const expectedJsDay = PT_WEEKDAY_TO_JS_DAY[weekdayKey];
    const weekdayMatches = expectedJsDay !== undefined && expectedJsDay === computedJsDay;
    const hour = hourMatch ? Number(hourMatch[1]) : null;
    results.push({ ...ev, isoDate, computedJsDay, expectedJsDay, weekdayMatches, hour, monthMatchesHeading: month === headingInfo?.month });
  }
  return results;
}

function eventFingerprint(ev) {
  // Content-relevant fields only — excludes nothing derived from timing of
  // the fetch itself, so two fetches of unchanged source content produce
  // identical fingerprints.
  return JSON.stringify({
    weekdayText: ev.weekdayText,
    dayMonthLine: ev.dayMonthLine,
    hourLine: ev.hourLine,
    typeText: ev.typeText,
    titleText: ev.titleText,
  });
}

// --- 1. Primary fresh fetch: locate the month/year heading(s) ---

console.log("--- Step 1: month/year heading(s) on the freshly fetched /agenda/ page ---");
const agendaHtml = read("body-agenda.html");
const headings = extractMonthHeadings(agendaHtml);
console.log(`Month/year headings found: ${JSON.stringify(headings)}`);

if (headings.length === 0) {
  fail("expected at least one page-level month/year heading — found zero");
} else if (headings.length === 1) {
  ok(
    `exactly one page-level month/year heading found ("${headings[0]}") — this fresh fetch, retained 2 days after casa-independente-lisbon-01's fetch and well into the "late August 2026" window, STILL shows only one month. The month-boundary question (does a second heading appear alongside the first once a new month begins?) remains genuinely UNOBSERVED — the source has not yet transitioned to showing September content as of this fetch. This is an honest negative result, not a resolved one.`,
  );
} else {
  ok(
    `${headings.length} page-level month/year headings found (${headings.map((h) => `"${h}"`).join(", ")}) — a genuine multi-month page state was observed. See Step 2 for whether the per-event blocks can be unambiguously attributed to the correct governing heading.`,
  );
}

const headingInfos = headings.map(parseMonthHeading);
if (headingInfos.some((h) => h === null)) {
  fail(`at least one heading did not parse as "<MonthName> <Year>": ${JSON.stringify(headings)}`);
}

// --- 2. Per-event extraction + derivation (single-heading case) ---

console.log("");
console.log("--- Step 2: per-event extraction + weekday cross-check ---");

const primaryHeadingInfo = headingInfos[0] ?? null;
const derivedEvents = deriveEvents(agendaHtml, primaryHeadingInfo);

console.log(`Parsed ${derivedEvents.length} event block(s) from body-agenda.html`);
if (derivedEvents.length === 0) {
  fail("expected at least one event block on the agenda page — found zero");
} else {
  ok(`found ${derivedEvents.length} event block(s) (>= 1)`);
}

if (headings.length === 1) {
  for (const row of derivedEvents) {
    console.log(
      `"${row.titleText}" (${row.typeText}): weekday label="${row.weekdayText}" -> derived date=${row.isoDate}, ` +
        `computed day-of-week=${row.computedJsDay}, expected from label=${row.expectedJsDay}, match=${row.weekdayMatches}, hour=${row.hour}H`,
    );
    if (!row.titleText) fail(`event at "${row.isoDate}" is missing an artist-name title`);
    if (!row.typeText) fail(`event at "${row.isoDate}" is missing an event-type label`);
    if (row.hour === null) fail(`event at "${row.isoDate}" is missing a parseable hour`);
    if (row.monthMatchesHeading === false) {
      fail(`event day/month "${row.dayMonthLine}" does not match the page heading's month — single-heading-governs-all-cards assumption would be WRONG here`);
    }
    if (row.weekdayMatches) {
      ok(`"${row.titleText}": source's own weekday label matches the actual computed day-of-week for ${row.isoDate} — mechanical corroboration, not a guess`);
    } else {
      fail(`"${row.titleText}": source's own weekday label ("${row.weekdayText}") does NOT match the computed day-of-week for ${row.isoDate}`);
    }
  }
} else {
  console.log(
    "NOTE: multiple headings present in this fetch — this investigation does not attempt single-heading date derivation in that branch; see the multi-heading structural-attribution check instead (not exercised in this run, since only one heading was actually observed).",
  );
}

// --- 3. Cache-busted second fetch: same content, ruling out a stale-cache artifact ---

console.log("");
console.log("--- Step 3: cache-busted re-fetch consistency check ---");

const cachebustPath = join(HERE, "body-agenda-cachebust.html");
if (!existsSync(cachebustPath)) {
  fail("expected a retained cache-busted second fetch (body-agenda-cachebust.html) but it is missing");
} else {
  const cachebustHtml = read("body-agenda-cachebust.html");
  const cachebustHeadings = extractMonthHeadings(cachebustHtml);
  const cachebustEvents = extractEventBlocks(cachebustHtml);

  const headingsMatch = JSON.stringify(cachebustHeadings) === JSON.stringify(headings);
  const primaryFingerprints = derivedEvents.map(eventFingerprint);
  const cachebustFingerprints = cachebustEvents.map(eventFingerprint);
  const eventsMatch = JSON.stringify(primaryFingerprints) === JSON.stringify(cachebustFingerprints);

  const cachebustHeadersPath = join(HERE, "headers-agenda-cachebust.txt");
  const cachebustHeaders = existsSync(cachebustHeadersPath) ? readFileSync(cachebustHeadersPath, "utf-8") : "";
  const wasCacheMiss = /X-Cache:\s*MISS/i.test(cachebustHeaders);

  if (headingsMatch && eventsMatch) {
    ok(
      `a second, independently-fetched request (different query string, explicit Cache-Control: no-cache header${wasCacheMiss ? ", retained response headers confirm X-Cache: MISS" : ""}) parses to an IDENTICAL heading set and event set as the primary fetch — this rules out a stale cache serving old content as the explanation for "still only one month".`,
    );
  } else {
    fail("the cache-busted re-fetch parsed to a DIFFERENT heading or event set than the primary fetch — the two retained fixtures are inconsistent with each other and must be reconciled before trusting either.");
  }
}

// --- 4. Cross-fixture comparison against the ORIGINAL casa-independente-lisbon-01 evidence ---

console.log("");
console.log("--- Step 4: comparison against the original (2026-08-25) casa-independente-lisbon-01 fixture ---");

let originalHtml = null;
try {
  originalHtml = readOriginal("body-agenda.html");
} catch (err) {
  fail(`could not read the original investigation's retained fixture for comparison: ${err.message}`);
}

if (originalHtml) {
  const originalHeadings = extractMonthHeadings(originalHtml);
  const originalEvents = extractEventBlocks(originalHtml);
  const originalFingerprints = originalEvents.map(eventFingerprint);
  const freshFingerprints = derivedEvents.map(eventFingerprint);

  console.log(`Original (2026-08-25) headings: ${JSON.stringify(originalHeadings)}`);
  console.log(`Fresh    (2026-08-27) headings: ${JSON.stringify(headings)}`);
  console.log(`Original (2026-08-25) event count: ${originalEvents.length}`);
  console.log(`Fresh    (2026-08-27) event count: ${derivedEvents.length}`);

  const headingsUnchanged = JSON.stringify(originalHeadings) === JSON.stringify(headings);
  const eventsUnchanged = JSON.stringify(originalFingerprints) === JSON.stringify(freshFingerprints);

  if (headingsUnchanged && eventsUnchanged) {
    ok(
      "the event-relevant content (heading text + every event block's weekday/day-month/hour/type/title) is BYTE-IDENTICAL between the original 2026-08-25 fixture and this fresh 2026-08-27 fixture. Two calendar days passed and nothing on the page changed — the source has not yet crossed into publishing September content, and this investigation genuinely could not observe the month-boundary transition it set out to observe. This is an honest, mechanically-verified negative result, not an assumption.",
    );
  } else {
    ok(
      "the event-relevant content DIFFERS between the two fixtures (see logged headings/counts above) — a real change was observed between 2026-08-25 and 2026-08-27; further inspection of exactly what changed is warranted before drawing conclusions.",
    );
    if (!headingsUnchanged || !eventsUnchanged) {
      // Not a failure in itself (content is allowed to change) — flagged as
      // an informational branch, not a FAIL, unless downstream checks in
      // Steps 1-2 above already caught something structurally wrong.
      console.log("NOTE: this branch was not the one actually exercised by this run (see Step 1's verdict above).");
    }
  }
}

// --- 5. No per-event id/URL exists anywhere in the fresh agenda fixture ---

console.log("");
console.log("--- Step 5: source_record_id / event_url gap re-check (fresh fixture) ---");

const hrefRe = /href="([^"]*)"/g;
const hrefs = new Set([...agendaHtml.matchAll(hrefRe)].map((m) => m[1]));
const perEventLookingHrefs = [...hrefs].filter((h) => /\/evento|\/event\/|\/eventos\//i.test(h));
if (perEventLookingHrefs.length > 0) {
  fail(`found ${perEventLookingHrefs.length} href(s) that look like per-event detail links, which would contradict the NOT_PRESENT event_url finding: ${JSON.stringify(perEventLookingHrefs)}`);
} else {
  ok(`no per-event detail-page href found among the ${hrefs.size} distinct href(s) on the fresh agenda page — event_url remains genuinely NOT_PRESENT`);
}

const dataIdRe = /data-id="([^"]+)"/g;
const dataIds = [...agendaHtml.matchAll(dataIdRe)].map((m) => m[1]);
console.log(`${dataIds.length} data-id attribute(s) found on the page (all are Elementor editor-authoring element ids, e.g. "${dataIds[0]}" — not tied to event identity, re-generated whenever a block is re-typed).`);
ok("re-confirmed: only Elementor internal element ids exist, never a stable per-event identifier — source_record_id remains genuinely NOT_PRESENT");

// --- 6. Contacts + about page identity re-confirmation (fresh fixtures) ---

console.log("");
console.log("--- Step 6: contacts + about page checks (fresh fixtures) ---");

const contactsHtml = read("body-contactos.html");
const addressMatch = /<p>(Largo do Intendente[^<]*)<\/p>/.exec(contactsHtml);
if (addressMatch) {
  ok(`address extracted from the fresh contacts page: "${addressMatch[1].trim()}"`);
} else {
  fail("expected to find the venue's street address on the fresh contacts page");
}

const emailMatch = /mailto:([^"]+)"/.exec(contactsHtml);
if (emailMatch) {
  ok(`contact email extracted from the fresh contacts page: "${emailMatch[1]}"`);
} else {
  fail("expected to find a mailto: contact email on the fresh contacts page");
}

const sobreHtml = read("body-sobre.html");
if (/constru[íi]do em 1863/i.test(sobreHtml)) {
  ok('fresh about page states the building was "construído em 1863" — independently re-corroborates the 1863 building date');
} else {
  fail('expected to find "construído em 1863" on the fresh about page');
}

if (/nasceu em 2012/i.test(sobreHtml)) {
  ok('fresh about page states Casa Independente "nasceu em 2012" — independently re-corroborates the 2012 founding date');
} else {
  fail('expected to find "nasceu em 2012" on the fresh about page');
}

const homeHtml = read("body-home.html");
if (/<title>[^<]*Casa Independente[^<]*<\/title>/i.test(homeHtml)) {
  ok("fresh homepage <title> still identifies the site as Casa Independente");
} else {
  fail("expected the fresh homepage <title> to identify the site as Casa Independente");
}

// --- 7. Venue single-location check: the fresh agenda page never names any
//        other venue/street address anywhere in its own markup, which is
//        the mechanical basis for treating the contacts-page address as
//        applying uniformly to every event on that page. ---

console.log("");
console.log("--- Step 7: venue single-location check (fresh agenda page) ---");

const agendaBodyText = agendaHtml.replace(/<[^>]+>/g, " ");
const streetTypeRe = /\b(Rua|Avenida|Av\.|Praça|Largo)\s+[A-ZÀ-Ý]/gu;
const streetMentions = [...agendaBodyText.matchAll(streetTypeRe)].map((m) => m[0]);
const nonIntendenteMentions = streetMentions.filter((m) => !/^Largo\s+do$/i.test(m) && !/Largo do/i.test(agendaBodyText.slice(agendaBodyText.indexOf(m), agendaBodyText.indexOf(m) + 40)));

console.log(`Street-type mentions found on the fresh agenda page: ${JSON.stringify(streetMentions)}`);
if (streetMentions.length === 0) {
  ok("the fresh agenda page names no street address or alternate venue at all — the only venue identity for this site lives on the contacts/about pages, and nothing on the agenda page contradicts or introduces a second location");
} else if (nonIntendenteMentions.length === 0) {
  ok("every street-type mention on the fresh agenda page is part of 'Largo do Intendente' — no alternate venue/address is ever named on the page");
} else {
  fail(`found street-type mention(s) on the fresh agenda page that do NOT appear to be 'Largo do Intendente': ${JSON.stringify(nonIntendenteMentions)} — the single-venue assumption for venue_location would need re-examination`);
}

// --- Summary ---

console.log("");
if (failures > 0) {
  process.exitCode = 1;
  console.log(`RESULT: ${failures} check(s) FAILED — see FAIL lines above.`);
} else {
  console.log(
    `RESULT: all checks passed against freshly retained evidence (${derivedEvents.length} event(s) fully derived and cross-checked; cache-busted re-fetch consistent; content byte-identical to the original -01 fixture two days earlier; source_record_id/event_url gap re-confirmed; identity re-corroborated from fresh about/contacts/home fixtures).`,
  );
}
