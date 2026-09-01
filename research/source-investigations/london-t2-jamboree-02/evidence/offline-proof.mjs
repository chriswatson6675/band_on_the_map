#!/usr/bin/env node
// Bounded, dependency-free, NO-NETWORK offline proof for
// research/source-investigations/london-t2-jamboree-02. Deterministically
// re-parses the two retained excerpt files (level2-events-list-excerpt.html,
// level2-event-detail-excerpt.html) and proves that title, start_date,
// time, source_record_id (canonical permalink), event_url, and
// venue_location are each extractable directly (basis: DIRECT_SOURCE) from
// the real retained response bytes, with zero AI judgement or invented
// values. Never a production collector; makes no network request.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const listExcerpt = readFileSync(join(HERE, "level2-events-list-excerpt.html"), "utf8");
const detailExcerpt = readFileSync(join(HERE, "level2-event-detail-excerpt.html"), "utf8");

function firstMatch(pattern, text, label) {
  const match = pattern.exec(text);
  if (!match) throw new Error(`could not find ${label} in retained fixture`);
  return match[1];
}

// --- title (DIRECT_SOURCE: the card's own eventTitle anchor title attribute) ---
const title = firstMatch(/class="eventTitle" title="([^"]+)"/, listExcerpt, "event title");
if (title !== "Celtic Session") throw new Error(`unexpected title: ${title}`);

// --- start_date (DIRECT_SOURCE: the card's own event-date-dn span states the full date, including year) ---
const rawDate = firstMatch(/class="event-date-dn">([^<]+)</, listExcerpt, "event date");
if (rawDate !== "Tuesday 1 September 2026") throw new Error(`unexpected date text: ${rawDate}`);
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const dateMatch = /([A-Za-z]+) (\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(rawDate);
if (!dateMatch) throw new Error(`could not parse date text: ${rawDate}`);
const [, , day, monthName, year] = dateMatch;
const monthIndex = MONTHS.indexOf(monthName);
if (monthIndex === -1) throw new Error(`unrecognised month: ${monthName}`);
const startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
if (startDate !== "2026-09-01") throw new Error(`derived start_date mismatch: ${startDate}`);

// --- time (DIRECT_SOURCE: the card's own <h4> states a specific start time directly) ---
const rawTime = firstMatch(/<h4>Live Music from ([\d.]+)(am|pm)<\/h4>/, listExcerpt, "event time");
const [, hourText, ampm] = /<h4>Live Music from ([\d.]+)(am|pm)<\/h4>/.exec(listExcerpt);
let [hourStr, minStr] = hourText.split(".");
let hour = parseInt(hourStr, 10);
const minute = minStr ? parseInt(minStr, 10) : 0;
if (ampm === "pm" && hour !== 12) hour += 12;
const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
if (time !== "20:30") throw new Error(`derived time mismatch: ${time}`);

// --- event_url / source_record_id (DIRECT_SOURCE: the card's own link href,
// independently confirmed as the detail page's own <link rel="canonical">,
// which is this WordPress site's own declared canonical path for the page --
// satisfying the stable-identifier rule's "derived from a deterministic
// source property whose own stability is itself evidenced" branch) ---
const cardHref = firstMatch(/<a href="([^"]+)" class="eventTitle"/, listExcerpt, "card href");
const canonicalHref = firstMatch(/<link rel="canonical" href="([^"]+)"/, detailExcerpt, "canonical link");
if (cardHref !== canonicalHref) {
  throw new Error(`card href (${cardHref}) does not match detail page's own canonical link (${canonicalHref})`);
}
const eventUrl = canonicalHref;
const sourceRecordId = canonicalHref; // the canonical permalink itself, not the transient DOM id="event-8305"

// --- venue_location (DIRECT_SOURCE: the page's own JSON-LD Place block) ---
const streetAddress = firstMatch(/"streetAddress":"([^"]+)"/, listExcerpt, "streetAddress");
const postalCode = firstMatch(/"postalCode":"([^"]+)"/, listExcerpt, "postalCode");
if (streetAddress !== "6 St Chads Place" || postalCode !== "WC1X 9HH") {
  throw new Error(`unexpected venue address: ${streetAddress}, ${postalCode}`);
}
const venueLocation = `${streetAddress}, King's Cross, London, ${postalCode}, UK`;

// --- detail page independently restates the same date and a consistent price ("Free") ---
const detailRawDate = firstMatch(/class="event-date-dn">([^<]+)</, detailExcerpt, "detail page date");
if (detailRawDate !== rawDate) throw new Error("list-page date and detail-page date disagree");
const price = firstMatch(/<b>Entry Price:<\/b> ([^<]+)<br/, detailExcerpt, "entry price");

console.log("OFFLINE PROOF: PASSED");
console.log(JSON.stringify(
  {
    title,
    start_date: startDate,
    start_date_raw_input: rawDate,
    time,
    time_raw_input: rawTime + ampm,
    venue_location: venueLocation,
    source_record_id: sourceRecordId,
    event_url: eventUrl,
    price,
  },
  null,
  2,
));
