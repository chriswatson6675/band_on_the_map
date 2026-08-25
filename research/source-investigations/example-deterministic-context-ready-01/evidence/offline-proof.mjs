#!/usr/bin/env node
// SYNTHETIC FIXTURE — bounded, dependency-free, NO-NETWORK offline proof
// for research/source-investigations/example-deterministic-context-ready-01.
// Deterministically re-parses evidence/programme.html and proves that the
// month/year heading ("September 2026") and the event row's own
// day-of-month ("17") combine to exactly one date (2026-09-17), that the
// venue-section heading ("Sala X") and the row's structural containment
// combine to exactly one venue, and that the price-section heading
// ("Entrada livre") and the same structural containment combine to
// exactly one price (FREE) — each a DETERMINISTIC_CONTEXT derivation, not
// AI plausibility. Never a production collector; makes no network request.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "programme.html"), "utf8");

function firstMatch(pattern, text) {
  const match = pattern.exec(text);
  return match ? match[1] : null;
}

// --- DETERMINISTIC_CONTEXT input 1: the month/year heading governing this row ---
const monthHeading = firstMatch(/<h2 class="month-heading">([^<]+)<\/h2>/, html);
if (monthHeading !== "September 2026") {
  throw new Error(`expected month heading "September 2026", got ${JSON.stringify(monthHeading)}`);
}

// --- DETERMINISTIC_CONTEXT input 2: the event row's own day-of-month ---
const day = firstMatch(/<span class="event-day">(\d+)<\/span>/, html);
if (day !== "17") {
  throw new Error(`expected event day "17", got ${JSON.stringify(day)}`);
}

// Mechanical combination rule: "<Month> <Year>" + "<Day>" -> "<Year>-<MM>-<DD>",
// zero AI judgement, exactly one possible result given these two inputs.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const [monthName, year] = monthHeading.split(" ");
const monthIndex = MONTHS.indexOf(monthName);
if (monthIndex === -1) throw new Error(`unrecognised month name ${JSON.stringify(monthName)}`);
const derivedStartDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
if (derivedStartDate !== "2026-09-17") {
  throw new Error(`derived start_date mismatch: got ${derivedStartDate}, expected 2026-09-17`);
}

// --- DETERMINISTIC_CONTEXT: venue inherited from the enclosing section ---
const venueSectionMatch = /<section id="sala-x" class="venue-section" data-venue-name="([^"]+)">([\s\S]*?)<\/section>\s*<\/main>/.exec(html);
if (!venueSectionMatch) throw new Error("could not locate the venue section wrapping the event row");
const venueName = venueSectionMatch[1];
const venueSectionBody = venueSectionMatch[2];
if (!venueSectionBody.includes('data-event-id="synthetic-contextual-concert-night-2026"')) {
  throw new Error("event row is not structurally contained within the venue section — inheritance not proven");
}
if (venueName !== "Sala X") throw new Error(`derived venue mismatch: got ${venueName}`);

// --- DETERMINISTIC_CONTEXT: price inherited from the enclosing price section ---
const priceSectionMatch = /<section class="price-section" data-price-label="([^"]+)">([\s\S]*?)<\/section>/.exec(html);
if (!priceSectionMatch) throw new Error("could not locate the price section wrapping the event row");
const priceLabel = priceSectionMatch[1];
const priceSectionBody = priceSectionMatch[2];
if (!priceSectionBody.includes('data-event-id="synthetic-contextual-concert-night-2026"')) {
  throw new Error("event row is not structurally contained within the price section — inheritance not proven");
}
if (priceLabel !== "Entrada livre") throw new Error(`derived price label mismatch: got ${priceLabel}`);
const derivedPrice = "FREE"; // "Entrada livre" is this source's own explicit free-admission label

// --- DIRECT_SOURCE fields, for completeness (no combination needed) ---
const title = firstMatch(/<h2 class="event-title">([^<]+)<\/h2>/, html);
const sourceRecordId = firstMatch(/data-event-id="([^"]+)"/, html);
const eventUrl = firstMatch(/<a class="event-link" href="([^"]+)">/, html);

console.log("OFFLINE PROOF: PASSED");
console.log(JSON.stringify(
  {
    title,
    start_date: derivedStartDate,
    start_date_derivation_inputs: [monthHeading, day],
    venue: venueName,
    venue_derivation_inputs: [`${venueName} (section heading)`, "event row structurally nested inside that section"],
    price: derivedPrice,
    price_derivation_inputs: [priceLabel, "event row structurally nested inside that section"],
    source_record_id: sourceRecordId,
    event_url: eventUrl,
  },
  null,
  2,
));
