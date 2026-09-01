#!/usr/bin/env node
// Bounded, dependency-free, NO-NETWORK offline proof for
// research/source-investigations/london-t2-roller-nation-02. Deterministically
// re-parses the retained excerpt file (level2-events-page-excerpt.html) and
// proves that title, start_date (including year), time, price, and
// venue_location are each extractable directly (basis: DIRECT_SOURCE) for
// the "You Got The Love" sample event, with zero AI judgement or invented
// values. This is retained as supporting evidence for a
// READY_FOR_OFFLINE_PROOF decision -- NOT a claim of READY_FOR_ACTIVATION
// (see investigation.json's decision.reasons for why source_record_id and
// sample freshness keep this at OFFLINE_PROOF rather than ACTIVATION).
// Never a production collector; makes no network request.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const excerpt = readFileSync(join(HERE, "level2-events-page-excerpt.html"), "utf8");

function firstMatch(pattern, text, label) {
  const match = pattern.exec(text);
  if (!match) throw new Error(`could not find ${label} in retained fixture`);
  return match[1];
}

// Isolate the first event block (id="event-2531") only.
const blockStart = excerpt.indexOf('id="event-2531"');
const blockEnd = excerpt.indexOf('id="event-2299"');
const block = excerpt.slice(blockStart, blockEnd);

// --- title (DIRECT_SOURCE) ---
const title = firstMatch(/event-title\s+h4 d-none d-xl-block px-3 py-2 mb-0">\s*([^<]+?)\s*<\/h3>/, block, "title").trim();
if (title !== "You Got The Love") throw new Error(`unexpected title: ${title}`);

// --- start_date (DIRECT_SOURCE: "When:" states a full date, including year, directly) ---
const rawWhen = firstMatch(/<span>When:<\/span>\s*([^<]+?)\s*<\/li>/, block, "When");
if (rawWhen !== "Friday, 21st August 2026") throw new Error(`unexpected When text: ${rawWhen}`);
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const dateMatch = /(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})/.exec(rawWhen);
if (!dateMatch) throw new Error(`could not parse date text: ${rawWhen}`);
const [, day, monthName, year] = dateMatch;
const monthIndex = MONTHS.indexOf(monthName);
if (monthIndex === -1) throw new Error(`unrecognised month: ${monthName}`);
const startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
if (startDate !== "2026-08-21") throw new Error(`derived start_date mismatch: ${startDate}`);

// --- time (DIRECT_SOURCE) ---
const rawTime = firstMatch(/<span>Time:<\/span>\s*([^<]+?)\s*<\/li>/, block, "Time");
if (rawTime !== "7pm - 2am") throw new Error(`unexpected time text: ${rawTime}`);

// --- price (DIRECT_SOURCE) ---
const rawPrice = firstMatch(/<span>Price:<\/span>\s*([^<]+?)\s*<\/li>/, block, "Price");
if (rawPrice !== "17  Per Person") throw new Error(`unexpected price text: ${rawPrice}`);

// --- venue_location (DIRECT_SOURCE: address stated directly in the event's own prose body) ---
const addressMatch = /Roller Nation, (117 Bruce Grove, London N17 6UR)/.exec(block);
if (!addressMatch) throw new Error("could not find venue address in event body");
const venueLocation = addressMatch[1];

console.log("OFFLINE PROOF: PASSED");
console.log(JSON.stringify(
  {
    title,
    start_date: startDate,
    start_date_raw_input: rawWhen,
    time_raw: rawTime,
    price_raw: rawPrice,
    venue_location: `Roller Nation, ${venueLocation}`,
    note: "source_record_id NOT derived here -- the DOM id (event-2531) is a plausible WordPress post ID but its stability is neither documented by the source nor empirically confirmed across repeated fetches within this bounded probe; see investigation.json field_assessment.source_record_id.",
  },
  null,
  2,
));
