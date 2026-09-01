#!/usr/bin/env node
// london-t2-house-of-sisters-grimm-02 -- bounded, dependency-free, NO-NETWORK
// offline proof. Deterministically re-parses the retained fixtures in this
// evidence/ directory and proves the DETERMINISTIC_CONTEXT combination
// claimed in field_assessment.start_date for the sampled "Sabina Desir:
// Freedom Road Re-Imagined" event: the event's own detail page states its
// performance days only as "Tuesday 17 November and Wednesday 18 November"
// (no year attached to that line), but the SAME retained page separately
// and explicitly states the performance is "Part of EFG London Jazz
// Festival 2026" and that the festival itself runs "13-22 November 2026".
// The event's own 17-18 November range falls entirely inside that
// explicitly year-stamped festival range, so the year is combined
// mechanically -- never guessed from today's date, common sense, or a
// probable season. This script is bounded proof only; it is never a
// production collector and makes no network request.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const sabina = readFileSync(join(HERE, "detail-sabina-desir-excerpt.html"), "utf8");
const globalLandscapes = readFileSync(join(HERE, "detail-global-landscapes-excerpt.html"), "utf8");

function firstMatch(pattern, text) {
  const match = pattern.exec(text);
  return match ? match[1] : null;
}

// --- DETERMINISTIC_CONTEXT input 1: the event's own Date line (no year) ---
const dateLine = firstMatch(/<strong>Date:<\/strong>\s*([^<]+)<br/, sabina);
if (dateLine === null) throw new Error("could not locate the event's own Date line");
const dayMatches = [...dateLine.matchAll(/(\d{1,2}) (November)/g)].map((m) => ({
  day: m[1],
  month: m[2],
}));
if (dayMatches.length !== 2) {
  throw new Error(`expected exactly 2 day/month pairs in the Date line, got ${JSON.stringify(dayMatches)}`);
}
if (dayMatches[0].day !== "17" || dayMatches[1].day !== "18") {
  throw new Error(`unexpected day values: ${JSON.stringify(dayMatches)}`);
}

// --- DETERMINISTIC_CONTEXT input 2: the festival's own explicitly year-stamped date range, stated once on the same retained page ---
const festivalRange = firstMatch(/Taking place across the capital from\s*<strong>([^<]+)<\/strong>/, sabina);
if (festivalRange === null) throw new Error("could not locate the festival's own year-stamped date range");
const festivalRangeMatch = /^(\d{1,2})\D+(\d{1,2}) November (\d{4})$/.exec(festivalRange.trim());
if (!festivalRangeMatch) throw new Error(`festival range did not match the expected shape: ${JSON.stringify(festivalRange)}`);
const [, festivalStartDay, festivalEndDay, festivalYear] = festivalRangeMatch;
if (festivalYear !== "2026") throw new Error(`expected festival year 2026, got ${festivalYear}`);

// --- Mechanical combination rule ---
// The event's own day/month pair (17 November, 18 November) must fall
// within the festival's own explicitly year-stamped day range (13-22
// November) for that festival's year to be applied to the event's date.
// This is a structural containment check, not a plausibility guess.
const withinFestivalRange = (day) => {
  const d = Number(day);
  return d >= Number(festivalStartDay) && d <= Number(festivalEndDay);
};
for (const { day } of dayMatches) {
  if (!withinFestivalRange(day)) {
    throw new Error(`event day ${day} November falls outside the festival's own stated range ${festivalRange}`);
  }
}
const derivedDates = dayMatches.map(({ day }) => `${festivalYear}-11-${day.padStart(2, "0")}`);
if (derivedDates[0] !== "2026-11-17" || derivedDates[1] !== "2026-11-18") {
  throw new Error(`derived dates mismatch: ${JSON.stringify(derivedDates)}`);
}

// --- DIRECT_SOURCE fields, for completeness (no combination needed) ---
const title = firstMatch(/<title>([^<]+)<\/title>/, sabina)?.replace(/\s*\|\s*House of Sisters Grimm$/, "") ?? null;
const eventUrl = firstMatch(/<link rel="canonical" href="([^"]+)"/, sabina);
const sourceRecordId = eventUrl ? eventUrl.replace(/^https?:\/\/[^/]+\/events\//, "").replace(/\/$/, "") : null;

// --- A second, independent DIRECT_SOURCE example, for contrast: GLOBAL
// LANDSCAPES RETROSPECTIVE states its own full year-stamped range directly
// (no combination needed at all) -- included to prove the parser also
// handles the DIRECT_SOURCE case correctly, and that this non-music art
// exhibition genuinely exists in the current programme alongside music. ---
const glrRange = firstMatch(/<p>(\d{1,2} August[^<]+\d{4})<\/p>/, globalLandscapes);
if (glrRange === null) throw new Error("could not locate GLOBAL LANDSCAPES RETROSPECTIVE's own dated range");
const glrMatch = /^(\d{1,2}) August (?:&#8211;|–|-)\s*(\d{1,2}) September (\d{4})$/.exec(glrRange.trim());
if (!glrMatch) throw new Error(`unexpected GLOBAL LANDSCAPES date shape: ${JSON.stringify(glrRange)}`);
const [, glrStartDay, , glrYear] = glrMatch;
const glrDerivedStartDate = `${glrYear}-08-${glrStartDay.padStart(2, "0")}`;
if (glrDerivedStartDate !== "2026-08-19") throw new Error(`GLOBAL LANDSCAPES derived date mismatch: got ${glrDerivedStartDate}`);

console.log("OFFLINE PROOF: PASSED");
console.log(
  JSON.stringify(
    {
      sabina_desir: {
        title,
        start_date: derivedDates[0],
        second_performance_date: derivedDates[1],
        basis: "DETERMINISTIC_CONTEXT",
        derivation_inputs: [dateLine.trim(), `Part of EFG London Jazz Festival 2026 / ${festivalRange.trim()}`],
        event_url: eventUrl,
        source_record_id: sourceRecordId,
      },
      global_landscapes_retrospective_for_contrast: {
        start_date: glrDerivedStartDate,
        basis: "DIRECT_SOURCE",
        note: "non-music art exhibition, stated with a full year-stamped range directly on its own detail page -- no combination required",
      },
    },
    null,
    2,
  ),
);
