#!/usr/bin/env node
// Offline, dependency-free, NO-NETWORK proof that the retained evidence
// fixtures for hard-club-porto-01 can be deterministically parsed into the
// sample event fields claimed in ../investigation.json.
//
// This is analysis of already-retained bytes only -- it makes no HTTP
// requests of its own. Run with: node evidence/offline-proof.mjs
//
// It proves three separate things, each tied to a specific claim in
// investigation.json:
//   1. The session-gated event-list AJAX fragment (ajax-agenda-session.html)
//      parses into 22 structured event entries with title, source_record_id
//      (URL slug), day+month text, and room+time text.
//   2. A per-event "loadevent" AJAX fragment (ajax-loadevent-johnny-hooker.html)
//      parses into a price field.
//   3. The un-warmed fetch (ajax-noprior.html, same endpoint/params, but
//      without a prior page load establishing a PHPSESSID first) shows
//      day-only date text with NO month -- corroborating, from a second
//      independently retained fixture, that month text is gated behind an
//      established session rather than always present.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEvidence(name) {
  return readFileSync(join(__dirname, name), "utf8");
}

let failed = false;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "OK" : "FAIL"}: ${label} = ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
  if (!ok) failed = true;
}

// --- 1. Parse the session-gated event-list AJAX fragment -----------------
const listHtml = readEvidence("ajax-agenda-session.html");

const ITEM_RE =
  /<li class="items[^"]*">\s*<a href="([^"]+)"[^>]*id="([^"]+)"[^>]*>[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<p class="data">([^<]*)<\/p>\s*<p class="local_hora">([^<]*)<\/p>/g;

const events = [];
let m;
while ((m = ITEM_RE.exec(listHtml)) !== null) {
  const [, href, id, titleBlockRaw, dataText, localHoraText] = m;
  const titleBlock = titleBlockRaw
    .replace(/<p class="demi">/g, " | ")
    .replace(/<p>|<\/p>/g, "")
    .trim();
  events.push({
    event_url_path: href,
    source_record_id: id,
    title: titleBlock,
    day_month: dataText.trim(),
    room_time: localHoraText.trim(),
  });
}

console.log(`Parsed ${events.length} event entries from ajax-agenda-session.html`);
check("event count", events.length, 22);

const johnny = events.find((e) => e.source_record_id === "johnny-hooker-euro-tour-2026-2026");
console.log("Johnny Hooker parsed entry:", johnny);
if (!johnny) {
  console.error("FAIL: could not find johnny-hooker-euro-tour-2026-2026 in parsed events");
  failed = true;
} else {
  check("event_url_path", johnny.event_url_path, "/PT/evento/johnny-hooker-euro-tour-2026-2026/");
  check("title", johnny.title, "JOHNNY HOOKER | EURO TOUR 2026");
  check("day_month", johnny.day_month, "12 Set");
  check("room_time", johnny.room_time, "Sala 2 : 20H00");
}

// The field_assessment.start_date claim is specifically that day+month is
// present but year never is, for every sampled event -- prove that
// deterministically across the whole retained fragment, not just one event.
const yearInDayMonth = events.filter((e) => /\d{4}/.test(e.day_month));
console.log(`Events whose day_month field contains a 4-digit year: ${yearInDayMonth.length} (expected 0 of ${events.length})`);
if (yearInDayMonth.length !== 0) {
  console.error("FAIL: expected no year digits in any event's day_month field");
  failed = true;
}
const allHaveMonthAbbrev = events.every((e) => /^[0-9]{2} [A-Za-zÀ-ú]{3}$/.test(e.day_month));
console.log(`All ${events.length} events have a "DD Mon" shaped day_month value: ${allHaveMonthAbbrev}`);
if (!allHaveMonthAbbrev) {
  console.error("FAIL: expected every event's day_month to match the DD Mon shape in the session-gated fragment");
  failed = true;
}

// --- 2. Parse a per-event detail (loadevent) fragment for price ----------
const detailHtml = readEvidence("ajax-loadevent-johnny-hooker.html");
const priceMatch = detailHtml.match(/preco"\s*>([^<]*)<\/p>/);
const price = priceMatch ? priceMatch[1].trim() : null;
check("price (Johnny Hooker, ajax-loadevent-johnny-hooker.html)", price, "25€- 55€");

const udoHtml = readEvidence("ajax-loadevent-udo.html");
const udoPriceMatch = udoHtml.match(/preco"\s*>([^<]*)<\/p>/);
const udoPrice = udoPriceMatch ? udoPriceMatch[1].trim() : null;
check("price (U.D.O., ajax-loadevent-udo.html)", udoPrice, "45€");
const udoTextMatch = udoHtml.match(/<div class="texto">([\s\S]*?)<\/div>/);
const udoText = udoTextMatch ? udoTextMatch[1] : "";
const udoMentions2027 = /2027/.test(udoText);
console.log(`U.D.O. free-text description mentions "2027": ${udoMentions2027}`);
if (!udoMentions2027) {
  console.error('FAIL: expected the U.D.O. description text to mention "2027" (corroborating, not proving, its slug year suffix)');
  failed = true;
}

// --- 3. Confirm the session-gating claim against a SEPARATE fixture ------
// evidence/ajax-noprior.html was retained from the identical endpoint and
// query parameters as ajax-agenda-session.html, but WITHOUT first loading
// /PT/agenda/ in the same cookie jar. If the two-step session-gating claim
// is real, this separately retained fixture must show day-only data text
// (no month letters) for every event.
const noPriorHtml = readEvidence("ajax-noprior.html");
const NOPRIOR_DATA_RE = /<p class="data">([^<]*)<\/p>/g;
const noPriorDataValues = [];
let m2;
while ((m2 = NOPRIOR_DATA_RE.exec(noPriorHtml)) !== null) noPriorDataValues.push(m2[1]);
console.log(`Un-warmed fetch (ajax-noprior.html): ${noPriorDataValues.length} data values, first 5 = ${JSON.stringify(noPriorDataValues.slice(0, 5))}`);
const anyHasMonthText = noPriorDataValues.some((v) => /[A-Za-zÀ-ú]/.test(v));
if (anyHasMonthText || noPriorDataValues.length === 0) {
  console.error("FAIL: expected the un-warmed fetch to show day-only data with no month letters, for a non-empty set of events");
  failed = true;
} else {
  console.log("OK: un-warmed fetch is day-only (no month) for all entries -- corroborates the session-gating finding from a second, independently retained fixture");
}

console.log(failed ? "\nOFFLINE PROOF: FAILED" : "\nOFFLINE PROOF: PASSED");
process.exit(failed ? 1 : 0);
