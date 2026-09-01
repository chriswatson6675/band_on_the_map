// Offline, dependency-free, no-network derivation proof for
// london-t2-eventim-apollo-02 (policy v1.2, "Offline derivation proof").
//
// This is NOT a production collector. It exists only to prove that
// title/start_date can be mechanically, reproducibly re-derived from the
// RETAINED fixture (event-detail-pages.json in this same directory) --
// never from the network, the clock, or model judgement. Run with:
//   node research/source-investigations/london-t2-eventim-apollo-02/evidence/derive-fields.mjs
//
// Every value here is DIRECT_SOURCE: each event's own hero block states a
// complete day+month+year in one place ("Monday 21st September 2026"), so
// no cross-context combination is required -- unlike the
// DETERMINISTIC_CONTEXT case, no `derivation` object is produced. This
// script's job is only to prove the parse-out itself is mechanical and
// reproducible against the retained fixture.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "event-detail-pages.json"), "utf8"));

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** Extract H1 text from a retained hero_block fragment (title). */
function extractTitle(heroBlock) {
  const m = /event-hero__title(?:\s[^"]*)?">([^<]+)<\/h1>/.exec(heroBlock);
  if (!m) return null;
  return m[1].replace(/&#039;/g, "'").trim();
}

/** Extract a complete day+month+year date from a retained hero_block's own <p class="date variable-color"> text -- DIRECT_SOURCE only, never combined with anything else. */
function extractDate(heroBlock) {
  const m = /class="date[^"]*">\s*(?:[A-Za-z]+\s+)?([0-9]{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+([0-9]{4})/.exec(heroBlock);
  if (!m) return null;
  const [, day, monthName, year] = m;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const expected = {
  "judas-priest": { title: "Judas Priest", start_date: "2026-09-21" },
  europe: { title: "Europe", start_date: "2026-10-03" },
  "amon-amarth": { title: "Amon Amarth", start_date: "2026-10-10" },
};

const results = {};
let allMatch = true;
for (const [slug, event] of Object.entries(fixture.events)) {
  const derivedTitle = extractTitle(event.hero_block);
  const derivedDate = extractDate(event.hero_block);
  const ok = derivedTitle === expected[slug].title && derivedDate === expected[slug].start_date;
  if (!ok) allMatch = false;
  results[slug] = { derivedTitle, derivedDate, expected: expected[slug], match: ok };
}

const output = { ran_at: new Date().toISOString(), fixture_file: "event-detail-pages.json", all_match: allMatch, results };
console.log(JSON.stringify(output, null, 2));
