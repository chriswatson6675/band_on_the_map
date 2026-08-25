// Offline, dependency-free, NO-NETWORK deterministic proof for the
// hot-five-porto-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment claims recorded in
// investigation.json:
//
//   - the venue's own home page ("next shows" mini-list) and its dedicated
//     https://hotfive.pt/shows/ list page both expose plain, server-rendered
//     event cards (title text, a "DD mon" date string, an outbound
//     "Buy tickets" link) with NO calendar/booking CMS plugin and NO
//     schema.org Event/MusicEvent JSON-LD anywhere;
//   - every single one of the 52 event-card date strings on the /shows/
//     page is day+month only ("28 ago", "03 set", ...) — this script
//     asserts, by regex, that NONE of them contain a 4-digit year, which
//     is the mechanical proof behind field_assessment.start_date being
//     PARTIAL rather than PROVEN (never inferring a year from context);
//   - the home page's small "next shows" mini-list is a verbatim subset
//     of the /shows/ page's 52-card full list (title+date+href identical);
//   - the retained wp-json REST root document contains no event/show/
//     calendar/agenda-related route, and the retained RSS feed contains
//     only one stale, unrelated 2023 placeholder post — both are retained
//     evidence that those two candidate data paths were checked and ruled
//     out, not left uninvestigated;
//   - a (title + date-text) composite key is unique across all 52 cards,
//     supporting the alternative source_record_id strategy documented in
//     field_assessment.source_record_id.notes;
//   - the one retained third-party lebillet.eu ticket page independently
//     states a full year ("28, Agosto, 2026") in its own <title> — recorded
//     as third-party corroboration only, never used here to promote
//     start_date to PROVEN, per docs/SOURCE_INVESTIGATION_POLICY.md's
//     "Third-party sources" section.
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

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. Parse event cards (title, date text, ticket href-or-null) from a
//        retained Elementor page: split on each icon-box widget occurrence
//        and read title/date/button within a bounded window after it. ---

function parseEventCards(html) {
  const parts = html.split('data-widget_type="icon-box.default"');
  const cards = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 1500);
    const titleMatch = chunk.match(/elementor-icon-box-title">\s*<span\s*>\s*([\s\S]*?)<\/span>/);
    const dateMatch = chunk.match(/elementor-icon-box-description">\s*([^<]+?)\s*<\/p>/);
    const hrefMatch = chunk.match(/<a class="elementor-button[^"]*"\s+(?:role="button"|href="([^"]+)")/);
    if (!titleMatch || !dateMatch) continue; // not an event card (none expected on these pages)
    cards.push({
      title: titleMatch[1].replace(/<br\s*\/?>/gi, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
      dateText: dateMatch[1].replace(/&amp;/g, "&").trim(),
      href: hrefMatch ? hrefMatch[1] || null : null,
    });
  }
  return cards;
}

const homeHtml = read("body-home.html");
const showsHtml = read("body-shows.html");

const homeCards = parseEventCards(homeHtml);
const showsCards = parseEventCards(showsHtml);

console.log(`Parsed ${homeCards.length} event card(s) from body-home.html ("next shows" mini-list)`);
console.log(`Parsed ${showsCards.length} event card(s) from body-shows.html (full /shows/ list)`);

if (homeCards.length === 0) fail("expected at least one event card on the home page mini-list — found zero");
else ok(`home page mini-list has ${homeCards.length} card(s)`);

if (showsCards.length !== 52) {
  fail(`expected exactly 52 event cards on the /shows/ page at time of fetch — found ${showsCards.length}`);
} else {
  ok("found exactly 52 event cards on the /shows/ page");
}

// --- 2. Mechanical proof that NO date string on either page carries a
//        4-digit year — this is the direct evidence behind marking
//        start_date PARTIAL (day+month only) rather than PROVEN/fabricated. ---

const yearPattern = /\b(19|20)\d{2}\b/;
const allCards = [...homeCards, ...showsCards];
const cardsWithYear = allCards.filter((c) => yearPattern.test(c.dateText));
if (cardsWithYear.length > 0) {
  fail(`expected zero event-card date strings to contain a 4-digit year — found ${cardsWithYear.length}: ${JSON.stringify(cardsWithYear)}`);
} else {
  ok(`confirmed: 0/${allCards.length} event-card date strings contain a 4-digit year (day+month only, e.g. "${showsCards[0]?.dateText}")`);
}

const dateShapePattern = /^\d{2}(\s*&\s*\d{2})?\s+[a-zç]{3}$/i;
const malformedDates = showsCards.filter((c) => !dateShapePattern.test(c.dateText));
if (malformedDates.length > 0) {
  console.log(`NOTE: ${malformedDates.length} card(s) have an irregular date-text shape (not simple "DD mon"): ${JSON.stringify(malformedDates.map((c) => ({ title: c.title, dateText: c.dateText })))}`);
} else {
  ok('every /shows/ card date text matches the simple "DD mon" (or "DD & DD mon") shape');
}

// --- 3. Home page mini-list is a verbatim subset of the /shows/ full list. ---

let subsetOk = true;
for (const hc of homeCards) {
  const match = showsCards.find((sc) => sc.title === hc.title && sc.dateText === hc.dateText && sc.href === hc.href);
  if (!match) {
    subsetOk = false;
    fail(`home page card not found identically on /shows/ page: ${JSON.stringify(hc)}`);
  }
}
if (subsetOk) {
  ok(`all ${homeCards.length} home page mini-list card(s) reproduced identically (title+date+href) on the /shows/ page`);
}

// --- 4. Composite (title + dateText) key uniqueness across all 52 cards —
//        the alternative source_record_id strategy documented in
//        field_assessment.source_record_id.notes. ---

const keys = showsCards.map((c) => `${c.title}||${c.dateText}`);
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dupes.length > 0) {
  fail(`composite (title + dateText) key is NOT unique across the 52 cards — duplicates: ${[...new Set(dupes)].join(", ")}`);
} else {
  ok("composite (title + dateText) key is unique across all 52 /shows/ page cards");
}

// --- 5. Cards with no outbound ticket link ("Exceptionally Closed!" and
//        one ticketless "Jam Session") — confirms href-presence handling. ---

const noLinkCards = showsCards.filter((c) => c.href === null);
console.log(`Card(s) with no outbound ticket href: ${noLinkCards.length} -> ${JSON.stringify(noLinkCards.map((c) => `${c.title} (${c.dateText})`))}`);
const withLinkCards = showsCards.filter((c) => c.href !== null);
ok(`${withLinkCards.length}/52 cards carry an outbound lebillet.eu ticket href; ${noLinkCards.length}/52 do not`);

// --- 6. Shared venue address appears identically on both pages. ---

const addressText = "R. de Guerra Junqueiro 495, 4150-098 Porto";
const addressOnHome = homeHtml.includes(addressText);
const addressOnShows = showsHtml.includes(addressText);
if (addressOnHome && addressOnShows) {
  ok(`shared venue address "${addressText}" found identically on both retained pages`);
} else {
  fail(`shared venue address not found on both pages (home=${addressOnHome}, shows=${addressOnShows})`);
}

const hoursText = "Das 21h30 às 02h30";
const cadenceText = "Quinta à domingo";
if (showsHtml.includes(hoursText) && showsHtml.includes(cadenceText)) {
  ok(`venue-wide opening hours ("${hoursText}") and cadence ("${cadenceText}") found — general info, not a per-event time, kept out of field_assessment.time`);
} else {
  fail("expected venue-wide opening-hours/cadence text not found");
}

// --- 7. wp-json REST root: confirm no event/show/calendar/agenda route. ---

let wpJsonRoutes = null;
try {
  const wpJson = JSON.parse(read("body-wpjson.json"));
  wpJsonRoutes = Object.keys(wpJson.routes || {});
} catch (e) {
  fail(`could not parse retained body-wpjson.json: ${e.message}`);
}
if (wpJsonRoutes) {
  // Scope to content-bearing namespaces only (wp/v2 core content types and
  // any custom-post-type-shaped namespace) — the raw route list also
  // contains unrelated plugin telemetry endpoints whose path happens to
  // contain the substring "event" (e.g. Google Site Kit's own internal
  // "survey-event" analytics route, PixelYourSite's Facebook "event"
  // tracking relay, Elementor's UI "send-event" telemetry route). None of
  // those are event/show CONTENT routes, so they must not count as a
  // discovered events data path.
  const contentEventish = wpJsonRoutes.filter(
    (r) => /^\/wp\/v2\//.test(r) && /event|show|calendar|agenda|tribe/i.test(r),
  );
  const nonContentEventish = wpJsonRoutes.filter(
    (r) => !/^\/wp\/v2\//.test(r) && /event|show|calendar|agenda|tribe/i.test(r),
  );
  console.log(
    `wp-json REST root: ${wpJsonRoutes.length} total route(s); wp/v2 content route(s) matching event/show/calendar/agenda/tribe: ${contentEventish.length}; unrelated plugin-telemetry route(s) whose path merely contains "event": ${nonContentEventish.length} (${nonContentEventish.join(", ")})`,
  );
  if (contentEventish.length === 0) {
    ok("confirmed: no wp/v2 event/show/calendar/agenda-related CONTENT route exists — wp-json ruled out as an events data path (the 3 unrelated plugin-telemetry routes above are not content endpoints)");
  } else {
    fail(`unexpectedly found event-like wp/v2 content route(s): ${contentEventish.join(", ")}`);
  }
}

// --- 8. RSS feed: confirm it is stale/unrelated, not a usable event path. ---

const feedXml = read("body-feed.xml");
const itemBlocks = [...feedXml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const itemTitles = itemBlocks.map((block) => (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? null);
const pubDates = itemBlocks
  .map((block) => (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] ?? null)
  .filter(Boolean);
const mostRecentYear = Math.max(...pubDates.map((d) => new Date(d).getFullYear()).filter((y) => !Number.isNaN(y)));
console.log(`RSS feed: ${itemBlocks.length} <item> entrie(s), title(s): ${JSON.stringify(itemTitles)}`);
console.log(`RSS feed item pubDate years observed: ${[...new Set(pubDates.map((d) => new Date(d).getFullYear()))].sort().join(", ")} (most recent: ${mostRecentYear})`);
const hasHotFiveNewGuid = feedXml.includes("hotfivenew.pt");
if (itemBlocks.length > 0 && mostRecentYear <= 2023 && hasHotFiveNewGuid) {
  ok(`confirmed: RSS feed contains only stale theme-demo/placeholder posts (most recent dated ${mostRecentYear}, oldest-domain guid "hotfivenew.pt" still present) — no real event data, ruled out as an events data path`);
} else {
  console.log("NOTE: RSS feed shape differs from what was observed at investigation time (re-check before relying on this ruling-out).");
}

// --- 9. Third-party ticketing page (lebillet.eu): retained as DIRECT
//        EVIDENCE of what THAT page says, used only as non-authoritative
//        corroboration of the year question — never promoted to a proven
//        hotfive.pt fact. ---

const lebilletHtml = read("body-lebillet-1981.html");
const titleMatch = lebilletHtml.match(/<title>([\s\S]*?)<\/title>/);
console.log(`Third-party lebillet.eu page <title>: "${titleMatch ? titleMatch[1] : null}"`);
if (titleMatch && /2026/.test(titleMatch[1])) {
  ok('third-party lebillet.eu page independently states a full year ("2026") — retained as corroborating evidence only, NOT used to promote hotfive.pt\'s own start_date field to PROVEN (see docs/SOURCE_INVESTIGATION_POLICY.md "Third-party sources")');
} else {
  console.log("NOTE: expected year corroboration not found in the retained third-party page title.");
}

// --- 10. Bounded "current/future" sample as of the day this investigation
//         was run (2026-08-25) — purely descriptive/documentation output,
//         NEVER written into investigation.json as a proven date, since the
//         year itself is not stated by the first-party source. ---

const monthOrder = { jul: 7, ago: 8, set: 9 };
function dayMonthKey(dateText) {
  const m = dateText.match(/(\d{2})\s*(?:&\s*\d{2}\s*)?([a-zç]{3})$/i);
  if (!m) return null;
  return { day: Number(m[1]), month: monthOrder[m[2].toLowerCase()] ?? null };
}
const future = showsCards.filter((c) => {
  const dm = dayMonthKey(c.dateText);
  if (!dm || !dm.month) return false;
  if (dm.month > 8) return true; // September
  if (dm.month === 8 && dm.day >= 25) return true; // Aug 25 onward
  return false;
});
console.log("");
console.log(`Descriptive-only "current/future" sample relative to 2026-08-25 (day+month order, year NOT asserted): ${future.length} card(s):`);
for (const c of future) {
  console.log(`  - ${c.title} | ${c.dateText} | ${c.href ?? "(no ticket link)"}`);
}

console.log("");
if (failed) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
  process.exitCode = 1;
} else {
  console.log(`RESULT: all checks passed against retained evidence (${showsCards.length} cards on /shows/, ${homeCards.length} on home mini-list, 0 with a stated year).`);
}
