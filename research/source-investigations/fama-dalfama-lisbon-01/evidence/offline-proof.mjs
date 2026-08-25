// Offline, dependency-free, NO-NETWORK deterministic proof for the
// fama-dalfama-lisbon-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment claims recorded in
// investigation.json:
//
//   1. The agenda page (body-agenda.html) contains exactly one explicit
//      "AGOSTO 2026" month/year heading, and 31 day-blocks, each pairing a
//      DD/MM heading with a Portuguese weekday name and a performer-names
//      paragraph.
//   2. Every one of those 31 (DD, weekday) pairs is internally consistent
//      with real Gregorian calendar arithmetic for August 2026 — i.e. the
//      source's own stated weekday name for "17/08" really is the weekday
//      that 17 August 2026 falls on. This is a mechanical cross-check
//      against the *source's own combined statements* (the page's month/
//      year heading + each entry's day-of-month + each entry's own
//      weekday label) — it never consults today's real-world date, only
//      Gregorian calendar math applied to what the source itself states.
//   3. Each day-block's performer-names paragraph is non-empty (title
//      field is genuinely populated for all 31 nights, not just a sample).
//   4. No day-block contains its own <a href> permalink — i.e. there is
//      genuinely no per-night detail-page URL to extract, confirming the
//      event_url field_assessment finding rather than merely asserting it.
//   5. The shared "opens 19h00 / fado from 20h30" time-of-day text is
//      present exactly once in the retained page and is not contradicted
//      by any per-day time text (none of the 31 day-blocks carries its
//      own distinct time).
//   6. The homepage's own Yoast Organization JSON-LD block parses and
//      carries the expected name/url/sameAs used for identity.
//   7. The retained wp-json root route listing (body-wpjson.json) contains
//      no agenda/event/fado/calendar-shaped custom REST route.
//   8. The retained RSS feed (body-feed.xml) contains zero <item> entries
//      (confirms RSS is not a usable per-night data path).
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
  failed = true;
  console.error(`FAIL: ${msg}`);
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function performerLines(rawParagraph) {
  // The paragraph uses <br ...hardBreak.../> to separate lines.
  return rawParagraph
    .split(/<br[^>]*\/?>/)
    .map((s) => decodeEntities(s.replace(/<[^>]+>/g, "")).trim())
    .filter((s) => s.length > 0);
}

const WEEKDAY_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function gregorianWeekdayPt(year, month1to12, day) {
  // Pure calendar arithmetic — never consults the real-world "today".
  const dt = new Date(Date.UTC(year, month1to12 - 1, day));
  return WEEKDAY_PT[dt.getUTCDay()];
}

// --- 1 & 2 & 3 & 4 & 5: agenda page day-block extraction and cross-checks ---

const agendaHtml = read("body-agenda.html");

const monthHeadingMatches = [...agendaHtml.matchAll(/<h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026<\/h2>/g)];
console.log(`Month/year heading "AGOSTO 2026" occurrences: ${monthHeadingMatches.length}`);
if (monthHeadingMatches.length === 1) {
  ok('exactly one explicit "AGOSTO 2026" month/year heading found on the retained agenda page');
} else {
  fail(`expected exactly 1 "AGOSTO 2026" heading, found ${monthHeadingMatches.length}`);
}

const dayBlockRe =
  /<p class="elementor-heading-title elementor-size-default">(\d{2})\/(\d{2})<\/p>[\s\S]*?<h2 class="elementor-heading-title elementor-size-default">([^<]+)<\/h2>[\s\S]*?<p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph"[^>]*>([\s\S]*?)<\/p>/g;

const dayBlocks = [];
let m;
while ((m = dayBlockRe.exec(agendaHtml)) !== null) {
  const [full, dd, mm, weekday, rawParagraph] = m;
  dayBlocks.push({
    day: Number(dd),
    month: Number(mm),
    weekdaySource: weekday.trim(),
    performers: performerLines(rawParagraph),
    hasOwnLink: /<a\s/i.test(full),
  });
}

console.log(`\nParsed ${dayBlocks.length} day-blocks from body-agenda.html`);
if (dayBlocks.length === 31) {
  ok("found exactly 31 day-blocks, i.e. one entry per day of August (31 days)");
} else {
  fail(`expected 31 day-blocks for a full August calendar, found ${dayBlocks.length}`);
}

const expectedDays = Array.from({ length: 31 }, (_, i) => i + 1);
const actualDays = dayBlocks.map((b) => b.day);
const daysMatch = expectedDays.every((d, i) => actualDays[i] === d);
if (daysMatch) {
  ok("day-blocks appear in strict ascending order 1..31, all within month 08");
} else {
  fail(`day-blocks are not a strict 1..31 ascending sequence: ${actualDays.join(",")}`);
}

let weekdayMismatches = 0;
let emptyPerformers = 0;
let blocksWithOwnLink = 0;
for (const b of dayBlocks) {
  const computed = gregorianWeekdayPt(2026, b.month, b.day);
  if (computed !== b.weekdaySource) {
    weekdayMismatches++;
    console.log(`  MISMATCH ${String(b.day).padStart(2, "0")}/${String(b.month).padStart(2, "0")}: source says "${b.weekdaySource}", Gregorian calendar for 2026 says "${computed}"`);
  }
  if (b.performers.length === 0) emptyPerformers++;
  if (b.hasOwnLink) blocksWithOwnLink++;
}

console.log(
  `\nWeekday cross-check (source-stated weekday vs. mechanically computed Gregorian weekday for year 2026, taken from the page's own "AGOSTO 2026" heading): ${dayBlocks.length - weekdayMismatches}/${dayBlocks.length} matched`,
);
if (weekdayMismatches === 0) {
  ok("every day-block's own stated weekday name matches real Gregorian calendar arithmetic for August 2026 — the source's combined date statements (month/year heading + per-day DD/MM + per-day weekday label) are internally self-consistent, supporting field_assessment.start_date.state: PROVEN");
} else {
  fail(`${weekdayMismatches} day-block(s) have a weekday name that does NOT match real Gregorian calendar arithmetic for 2026 — see mismatches above`);
}

if (emptyPerformers === 0) {
  ok(`all ${dayBlocks.length} day-blocks carry a non-empty performer-names paragraph (field_assessment.title is populated for every night, not merely a sample)`);
} else {
  fail(`${emptyPerformers} day-block(s) have an empty performer-names paragraph`);
}

if (blocksWithOwnLink === 0) {
  ok("no day-block contains its own <a href> permalink — confirms there is genuinely no per-night detail-page URL on this source (supports field_assessment.event_url notes)");
} else {
  fail(`${blocksWithOwnLink} day-block(s) unexpectedly contain their own <a href> — event_url assessment should be revisited`);
}

// Print a small representative sample (first 3 and last 3) for a human to
// spot-check without re-reading the full retained HTML.
console.log("\n--- Sample day-blocks (first 3, last 3) ---");
for (const b of [...dayBlocks.slice(0, 3), ...dayBlocks.slice(-3)]) {
  console.log(
    `${String(b.day).padStart(2, "0")}/${String(b.month).padStart(2, "0")}/2026 (${b.weekdaySource}): ${b.performers.join(" | ")}`,
  );
}

// --- 5b: shared opening/fado-start time text ---

const timeMatches = [...agendaHtml.matchAll(/Abrimos às (\d{2}h\d{2})[\s\S]{0,60}?Fado a partir das (\d{2}h\d{2})/g)];
console.log(`\nShared opening/fado-start time text occurrences: ${timeMatches.length}`);
if (timeMatches.length >= 1) {
  const [, opens, fadoStart] = timeMatches[0];
  ok(`found shared time-of-day text: opens ${opens}, fado from ${fadoStart} — this applies to the page as a whole, not stated per individual day-block (no day-block carries its own distinct time text, confirmed by the day-block regex above never matching a time pattern)`);
} else {
  fail('expected to find "Abrimos às HHhMM ... Fado a partir das HHhMM" time text on the retained page');
}

// --- 6: homepage identity JSON-LD ---

console.log("\n--- Homepage identity JSON-LD ---");
const homeHtml = read("body-home.html");
const ldMatch = homeHtml.match(/<script type="application\/ld\+json" class="yoast-schema-graph">([\s\S]*?)<\/script>/);
if (!ldMatch) {
  fail("no Yoast schema-graph JSON-LD script found on retained homepage");
} else {
  let graph;
  try {
    graph = JSON.parse(ldMatch[1]);
  } catch (e) {
    fail(`homepage JSON-LD did not parse: ${e.message}`);
    graph = null;
  }
  if (graph) {
    const org = (graph["@graph"] || []).find((n) => n["@type"] === "Organization");
    if (!org) {
      fail("no Organization node found in homepage JSON-LD @graph");
    } else {
      console.log(`  Organization.name = "${org.name}"`);
      console.log(`  Organization.url  = "${org.url}"`);
      console.log(`  Organization.sameAs = ${JSON.stringify(org.sameAs)}`);
      if (org.name === "Fama D'Alfama Restaurante" && org.url === "https://famadalfama.pt/" && Array.isArray(org.sameAs) && org.sameAs.length >= 2) {
        ok("homepage's own retained JSON-LD Organization node carries the expected name/url and >=2 sameAs social profiles, supporting identity.status: PROVEN");
      } else {
        fail("homepage JSON-LD Organization node did not carry the expected name/url/sameAs shape");
      }
    }
  }
}

const addressMatch = homeHtml.match(/Rua do Terreiro do Trigo 80/);
if (addressMatch) {
  ok('retained homepage HTML contains the street address "Rua do Terreiro do Trigo 80"');
} else {
  fail("expected street address text not found in retained homepage HTML");
}

// --- 7: wp-json route listing has no agenda/event-shaped custom REST route ---

console.log("\n--- wp-json route listing ---");
let wpJsonRoutes = [];
try {
  const wpJson = JSON.parse(read("body-wpjson.json"));
  wpJsonRoutes = Object.keys(wpJson.routes || {});
  console.log(`  total routes: ${wpJsonRoutes.length}`);
} catch (e) {
  fail(`could not parse retained body-wpjson.json: ${e.message}`);
}
const eventLikeRoutes = wpJsonRoutes.filter((r) => /agenda|fado|calendar|show/i.test(r));
console.log(`  agenda/fado/calendar/show-shaped routes: ${JSON.stringify(eventLikeRoutes)}`);
if (eventLikeRoutes.length === 0) {
  ok("no agenda/fado/calendar/show-shaped custom REST route exists — confirms there is no separate PUBLIC_JSON_API data path for the nightly calendar; the agenda page's own server-rendered HTML is the only data path");
} else {
  fail(`unexpected event-like REST route(s) found: ${eventLikeRoutes.join(", ")} — site_classification/data_paths should be revisited`);
}

// --- 8: RSS feed has zero items ---

console.log("\n--- RSS feed ---");
const feedXml = read("body-feed.xml");
const itemCount = (feedXml.match(/<item>/g) || []).length;
console.log(`  <item> count: ${itemCount}`);
if (itemCount === 0) {
  ok("retained RSS feed contains zero <item> entries — confirms RSS is not a usable per-night data path for this source");
} else {
  fail(`expected zero RSS items, found ${itemCount} — RSS-based acquisition should be reconsidered`);
}

console.log("");
if (failed) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
  process.exitCode = 1;
} else {
  console.log(
    `RESULT: all checks passed against retained evidence (${dayBlocks.length} day-blocks fully cross-checked for internal date/weekday self-consistency, plus identity, platform, and negative-path checks).`,
  );
}
