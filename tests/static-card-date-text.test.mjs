// BEATMAPPED-STATIC-CARD-TEXT-DATE-ACQUISITION-01 — the date-resolution
// hierarchy for static event cards, and the anti-guessing guards that make
// it safe.
//
// The single most important property proven here: a card whose year cannot
// be established from FIRST-PARTY RETAINED EVIDENCE is REJECTED, and that
// rejection is identical no matter what the system clock says. A collector
// that quietly supplied "the current year" would look correct in production
// for most of the year and silently fabricate dates around every new year —
// exactly the failure this project's date policy forbids.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { collectStaticCardEvents } from "../ingestion/static-cards/collector.mjs";
import { deriveContextualCardDate, extractMonthYearHeadings, inferNumericDateOrder, parseCompleteCardDate, resolveCardDate } from "../ingestion/static-cards/card-date.mjs";

const CARD_DATE_MODULE = fileURLToPath(new URL("../ingestion/static-cards/card-date.mjs", import.meta.url));

const doc = (body) => ({ url: "https://venue.example/programme", at: "2026-08-01T10:00:00.000Z", status: 200, content_type: "text/html", body });
const card = (inner) => `<article class="event-card">${inner}</article>`;
const link = (slug, title) => `<a href="/events/${slug}">${title}</a>`;
const collect = (body, cutoffDate = "2026-01-01") => collectStaticCardEvents(doc(body), { sourceId: "venue-test", venueName: "Venue", cutoffDate });

// ---------------------------------------------------------------------------
// §6 — the pre-existing machine-readable path is untouched
// ---------------------------------------------------------------------------

test("machine-readable <time datetime> still wins, and is still recorded as such", () => {
  const result = collect(card(`<time datetime="2026-09-17T20:00:00+02:00"></time>${link("a", "Machine Readable Night")}`));
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].start_raw, "2026-09-17T20:00:00+02:00", "the machine-readable value must be preserved verbatim, not reduced to a date");
  assert.equal(result.records[0].date_provenance.source, "MACHINE_READABLE_DATETIME");
  assert.equal(result.routing_provenance.date_sources.MACHINE_READABLE_DATETIME, 1);
});

test("a machine-readable date takes precedence over conflicting text in the same card", () => {
  const result = collect(card(`<time datetime="2026-09-17"></time><p>26 08 2026</p>${link("a", "Precedence")}`));
  assert.equal(result.records[0].start_raw, "2026-09-17");
  assert.equal(result.records[0].date_provenance.source, "MACHINE_READABLE_DATETIME");
});

// ---------------------------------------------------------------------------
// §15 — complete text dates, including the real Radialsystem pattern
// ---------------------------------------------------------------------------

test("15: the real Radialsystem card pattern yields a canonical date, title and detail link", () => {
  const result = collect(card(`<p>We 26 08 2026 19:00 h</p>${link("sasha-waltz", "Sasha Waltz &amp; Guests")}`));
  assert.equal(result.records.length, 1);
  const [record] = result.records;
  assert.equal(record.start_raw, "2026-08-26");
  assert.equal(record.title, "Sasha Waltz &amp; Guests");
  assert.equal(record.event_url, "https://venue.example/events/sasha-waltz", "the card's own detail link must survive");
  assert.equal(record.source_record_id, record.event_url);
  assert.equal(record.date_provenance.source, "COMPLETE_TEXT_DATE");
  assert.deepEqual(record.date_provenance.inputs, ["26 08 2026"]);
});

test("15: every complete text-date form found in real retained evidence resolves identically", () => {
  for (const [text, expected] of [
    ["We 26 08 2026 19:00 h", "2026-08-26"],
    ["26.08.2026", "2026-08-26"],
    ["26/08/2026", "2026-08-26"],
    ["26 Aug 2026", "2026-08-26"],
    ["26. August 2026", "2026-08-26"],
    ["August 26, 2026", "2026-08-26"],
    ["2026-08-26", "2026-08-26"],
    ["31. Dezember 2026", "2026-12-31"],
  ]) {
    assert.equal(parseCompleteCardDate(text)?.iso, expected, `"${text}" must resolve to ${expected}`);
  }
});

test("15: a complete text date is used even when the page also has month/year headings", () => {
  const result = collect(`<h2>September 2026</h2>${card(`<p>26 Aug 2026</p>${link("a", "Explicit Beats Context")}`)}`);
  assert.equal(result.records[0].start_raw, "2026-08-26", "the card's own complete date must win over a heading that would say otherwise");
  assert.equal(result.records[0].date_provenance.source, "COMPLETE_TEXT_DATE");
});

// ---------------------------------------------------------------------------
// §16 — yearless dates WITH deterministic first-party context
// ---------------------------------------------------------------------------

test("16: 'Aug 29' under a heading that states August 2026 yields 2026-08-29, with the year traced to that heading", () => {
  const body = `<h2>August 2026</h2>${card(`<p>Aug 29</p>${link("zig", "Trio Night")}`)}`;
  const result = collect(body);
  assert.equal(result.records.length, 1);
  const [record] = result.records;
  assert.equal(record.start_raw, "2026-08-29");
  assert.equal(record.date_provenance.source, "DETERMINISTIC_CONTEXT_YEAR");
  assert.ok(record.date_provenance.derivation.inputs.includes("August 2026"), "the governing heading must be cited as a derivation input");
  assert.match(record.date_provenance.derivation.rule, /nearest preceding/i);
});

test("16: the real Huxley's pattern — '01 Sep' under 'September 2026' — resolves from the heading", () => {
  const result = collect(`<h3>September 2026</h3>${card(`<p>01 Sep Beginn: 19:30 | Einlass: 18:30</p>${link("kard", "KARD")}`)}`);
  assert.equal(result.records[0].start_raw, "2026-09-01");
  assert.equal(result.records[0].date_provenance.source, "DETERMINISTIC_CONTEXT_YEAR");
});

test("16: only the NEAREST PRECEDING heading governs — a later section cannot reach backwards", () => {
  const body = [
    "<h2>September 2026</h2>", card(`<p>03 Sep</p>${link("a", "Under September")}`),
    "<h2>October 2026</h2>", card(`<p>04 Oct</p>${link("b", "Under October")}`),
  ].join("");
  const result = collect(body);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].start_raw, "2026-09-03");
  assert.equal(result.records[1].start_raw, "2026-10-04");
});

test("16: a heading spanning a year boundary governs its own cards only", () => {
  const body = [
    "<h2>December 2026</h2>", card(`<p>31 Dec</p>${link("a", "NYE")}`),
    "<h2>January 2027</h2>", card(`<p>01 Jan</p>${link("b", "New Year")}`),
  ].join("");
  const result = collect(body);
  assert.equal(result.records[0].start_raw, "2026-12-31");
  assert.equal(result.records[1].start_raw, "2027-01-01", "the year must come from each card's own governing heading, never from a single page-wide guess");
});

// ---------------------------------------------------------------------------
// §17 — yearless dates WITHOUT context must be rejected, clock-independently
// ---------------------------------------------------------------------------

test("17: 'Aug 29' with no year context anywhere is REJECTED, not dated", () => {
  const result = collect(card(`<p>Aug 29</p>${link("zig", "Trio Night")}`));
  assert.equal(result.records.length, 0, "a card whose year is unknowable must never become a record");
  assert.equal(result.routing_provenance.cards_rejected_no_resolvable_date, 1);
  assert.equal(result.routing_provenance.month_year_headings_found, 0);
});

test("17: the real Tresor pattern 'Mo 31.08' with no year context is REJECTED", () => {
  const result = collect(card(`<p>Mo 31.08</p>${link("t", "Singularity")}`));
  assert.equal(result.records.length, 0);
});

test("17: rejection of a yearless card is IDENTICAL under wildly different system clocks", () => {
  const body = card(`<p>Aug 29</p>${link("zig", "Trio Night")}`);
  const RealDate = globalThis.Date;
  const results = [];
  try {
    for (const pretendNow of ["2026-08-30T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2031-06-15T00:00:00.000Z"]) {
      class FrozenDate extends RealDate {
        constructor(...args) { super(...(args.length ? args : [pretendNow])); }
        static now() { return new RealDate(pretendNow).getTime(); }
      }
      globalThis.Date = FrozenDate;
      results.push(JSON.stringify(collect(body, "2026-01-01").records));
    }
  } finally {
    globalThis.Date = RealDate;
  }
  assert.deepEqual([...new Set(results)], ["[]"], "the same fixture must produce the same (empty) result under every clock — a year must never come from 'now'");
});

test("17: a resolvable card is also clock-independent — same fixture, same date, any clock", () => {
  const body = `<h2>August 2026</h2>${card(`<p>Aug 29</p>${link("zig", "Trio Night")}`)}`;
  const RealDate = globalThis.Date;
  const dates = [];
  try {
    for (const pretendNow of ["2026-08-30T00:00:00.000Z", "2029-02-02T00:00:00.000Z"]) {
      class FrozenDate extends RealDate {
        constructor(...args) { super(...(args.length ? args : [pretendNow])); }
        static now() { return new RealDate(pretendNow).getTime(); }
      }
      globalThis.Date = FrozenDate;
      dates.push(collect(body, "2026-01-01").records[0].start_raw);
    }
  } finally {
    globalThis.Date = RealDate;
  }
  assert.deepEqual(dates, ["2026-08-29", "2026-08-29"]);
});

// ---------------------------------------------------------------------------
// §18 — ambiguity fails closed
// ---------------------------------------------------------------------------

test("18: a genuinely ambiguous numeric date is rejected when the document cannot settle its order", () => {
  assert.equal(parseCompleteCardDate("05.06.2026"), null, "5 June and 6 May are both readable — reject rather than pick one");
  const result = collect(card(`<p>05.06.2026</p>${link("a", "Ambiguous")}`));
  assert.equal(result.records.length, 0);
  assert.equal(result.routing_provenance.numeric_date_order_proven, null);
});

test("18: an ambiguous numeric date IS accepted once the same document proves its own order", () => {
  const body = [
    card(`<p>26 08 2026</p>${link("a", "Unambiguous Day First")}`),
    card(`<p>09 11 2026</p>${link("b", "Ambiguous Until Now")}`),
  ].join("");
  const result = collect(body);
  assert.equal(result.routing_provenance.numeric_date_order_proven, "DAY_FIRST");
  assert.equal(result.records.length, 2);
  assert.equal(result.records[1].start_raw, "2026-11-09");
  assert.equal(result.records[1].date_provenance.source, "DETERMINISTIC_CONTEXT_NUMERIC_ORDER");
  assert.ok(result.records[1].date_provenance.derivation.inputs.some((input) => input.includes("DAY_FIRST")));
});

test("18: a document whose unambiguous instances CONTRADICT each other proves nothing and rejects", () => {
  const body = [
    card(`<p>26 08 2026</p>${link("a", "Day First Evidence")}`),
    card(`<p>08 26 2026</p>${link("b", "Month First Evidence")}`),
    card(`<p>05 06 2026</p>${link("c", "Still Ambiguous")}`),
  ].join("");
  const result = collect(body);
  assert.equal(result.routing_provenance.numeric_date_order_proven, null, "contradictory evidence must prove nothing");
  assert.ok(!result.records.some((record) => record.title === "Still Ambiguous"), "the ambiguous card must stay rejected");
});

test("18: a card whose month contradicts its governing heading is rejected, never re-dated", () => {
  const result = collect(`<h2>September 2026</h2>${card(`<p>29 Aug</p>${link("a", "Wrong Section")}`)}`);
  assert.equal(result.records.length, 0, "a card filed under a contradicting heading must be rejected, not silently moved to the heading's month");
});

test("18: conflicting year contexts do not merge — each card takes only its own governing heading", () => {
  const body = ["<h2>September 2026</h2>", "<h2>September 2027</h2>", card(`<p>03 Sep</p>${link("a", "Which Year")}`)].join("");
  const result = collect(body);
  assert.equal(result.records[0].start_raw, "2027-09-03", "the nearest preceding heading governs — no averaging, no earliest-wins, no guessing");
});

test("18: malformed and impossible dates are rejected", () => {
  for (const text of ["32 Aug 2026", "29 Feb 2027", "00 09 2026", "Smarch 4 2026", "just some words", "19:30", ""]) {
    assert.equal(parseCompleteCardDate(text), null, `"${text}" must not parse`);
  }
});

test("18: a card with a perfect title and link but no resolvable date is still rejected", () => {
  const result = collect(card(`<p>Coming soon</p>${link("tbc", "Announced Later")}`));
  assert.equal(result.records.length, 0);
  assert.equal(result.routing_provenance.cards_rejected_no_resolvable_date, 1);
});

test("18: a resolvable date with no same-origin title link is still rejected", () => {
  const result = collect(card(`<p>26 Aug 2026</p><a href="https://tickets.example/x">Buy</a>`));
  assert.equal(result.records.length, 0, "widening date extraction must not relax the link requirement");
});

// ---------------------------------------------------------------------------
// §19 — the clock is not an input to date derivation
// ---------------------------------------------------------------------------

test("19: card-date.mjs contains no clock, calendar or current-year reference at all", async () => {
  const source = await readFile(CARD_DATE_MODULE, "utf8");
  const executable = source.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
  for (const forbidden of [/new Date\b/, /Date\.now/, /getFullYear/, /toISOString/, /Intl\./]) {
    assert.doesNotMatch(executable, forbidden, `date derivation must never reference ${forbidden}`);
  }
});

test("19: date derivation runs correctly even when Date is made unusable entirely", () => {
  const RealDate = globalThis.Date;
  try {
    globalThis.Date = function Forbidden() { throw new Error("date derivation must not touch the clock"); };
    globalThis.Date.now = () => { throw new Error("date derivation must not touch the clock"); };
    assert.equal(parseCompleteCardDate("26 Aug 2026").iso, "2026-08-26");
    assert.equal(deriveContextualCardDate("Aug 29", { headings: extractMonthYearHeadings("<h2>August 2026</h2>"), cardIndex: 999 }).iso, "2026-08-29");
    assert.equal(resolveCardDate({ cardText: "Aug 29", headings: [], cardIndex: 0 }), null);
    assert.equal(inferNumericDateOrder("<p>26 08 2026</p>").order, "DAY_FIRST");
  } finally {
    globalThis.Date = RealDate;
  }
});

// ---------------------------------------------------------------------------
// §12 — provenance is explicit, never disguised
// ---------------------------------------------------------------------------

test("12: a context-derived date is never presented as though the source stated it machine-readably", () => {
  const result = collect(`<h2>August 2026</h2>${card(`<p>Aug 29</p>${link("a", "Derived")}`)}`);
  const { date_provenance: provenance } = result.records[0];
  assert.notEqual(provenance.source, "MACHINE_READABLE_DATETIME");
  assert.equal(provenance.source, "DETERMINISTIC_CONTEXT_YEAR");
  assert.ok(provenance.derivation.rule.length > 0);
  assert.ok(provenance.derivation.inputs.length >= 2, "a deterministic-context derivation must cite at least two retained inputs");
  // Every cited input must be real retained text — an undefined or empty
  // input would make the derivation unreproducible while still looking valid.
  for (const input of provenance.derivation.inputs) {
    assert.equal(typeof input, "string", "every derivation input must be a retained string");
    assert.ok(input.trim().length > 0);
  }
  assert.deepEqual(provenance.derivation.inputs, ["August 2026", "Aug 29"], "the derivation must cite the governing heading AND the card's own day/month text");
});

test("12: routing provenance reports every date source and every rejection, per document", () => {
  const body = [
    "<h2>September 2026</h2>",
    card(`<time datetime="2026-09-02"></time>${link("a", "Machine")}`),
    card(`<p>03 Sep 2026</p>${link("b", "Complete")}`),
    card(`<p>04 Sep</p>${link("c", "Contextual")}`),
    card(`<p>no date here</p>${link("d", "Rejected")}`),
  ].join("");
  const { routing_provenance: provenance } = collect(body);
  assert.equal(provenance.card_candidates_inspected, 4);
  assert.equal(provenance.card_records_accepted, 3);
  assert.equal(provenance.cards_rejected_no_resolvable_date, 1);
  assert.deepEqual(provenance.date_sources, { MACHINE_READABLE_DATETIME: 1, COMPLETE_TEXT_DATE: 1, DETERMINISTIC_CONTEXT_YEAR: 1, DETERMINISTIC_CONTEXT_NUMERIC_ORDER: 0 });
});

// ---------------------------------------------------------------------------
// §11 / §13 — acceptance thresholds and card DETECTION are unchanged
// ---------------------------------------------------------------------------

test("13: widening date extraction does not widen card DETECTION — markup with no event/card class still yields nothing", () => {
  const body = `<div class="listing-row"><p>26 Aug 2026</p>${link("a", "Not A Card")}</div>`;
  const result = collect(body);
  assert.equal(result.routing_provenance.card_candidates_inspected, 0, "RC-B (card detection) is explicitly out of scope and must not change");
  assert.equal(result.records.length, 0);
});

test("11: the pre-existing cutoff, title and duplicate rules still apply unchanged", () => {
  assert.equal(collect(card(`<p>26 Aug 2026</p>${link("a", "Past")}`), "2026-09-01").records.length, 0, "past events must still be filtered");
  assert.equal(collect(card(`<p>26 Aug 2026</p>${link("a", "Events")}`)).records.length, 0, "generic navigation titles must still be rejected");
  const duplicated = collect([card(`<p>26 Aug 2026</p>${link("same", "One")}`), card(`<p>27 Aug 2026</p>${link("same", "Two")}`)].join(""));
  assert.equal(duplicated.records.length, 1, "records must still deduplicate on the canonical detail URL");
});
