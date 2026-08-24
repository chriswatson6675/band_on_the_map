import assert from "node:assert/strict";
import test from "node:test";

import {
  NEAR_TERM_TODAY,
  NEAR_TERM_TOMORROW,
  classifyNearTermDate,
  selectNearTermListings,
  formatNearTermLabel,
  buildNearTermLabel,
} from "../ingestion/map/near-term.mjs";

// BOTM-MAP-DISCOVERY-UX-01 — deterministic tests for the automatic
// today/tomorrow gig label logic. `referenceDate` is always passed
// explicitly so nothing here depends on the real wall clock.

const REFERENCE = new Date(2026, 7, 25, 12, 0, 0); // local "today" = 2026-08-25 (August is month index 7)

function startAt(dateStr, overrides = {}) {
  return {
    raw: `${dateStr} raw`,
    date: dateStr,
    iso: null,
    is_utc: null,
    tzid: null,
    certainty: "DATE_ONLY",
    ...overrides,
  };
}

function singleListing(title, dateStr, overrides = {}) {
  return {
    kind: "SINGLE",
    source_id: "test-source",
    source_record_id: `rec-${title}`,
    source_name: "Test Source",
    title,
    start: startAt(dateStr),
    end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
    event_url: null,
    ...overrides,
  };
}

function groupListing(displayTitle, dateStr, sourceCount = 2) {
  return {
    kind: "GROUP",
    display_title: displayTitle,
    start: startAt(dateStr),
    end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
    sources: Array.from({ length: sourceCount }, (_, i) => ({
      source_id: `source-${i}`,
      source_record_id: `rec-${i}`,
      source_name: `Source ${i}`,
      title: displayTitle,
      event_url: null,
    })),
    fact_comparison: {
      sources: ["source-0", "source-1"],
      title: { agree: true, values: [displayTitle, displayTitle] },
      date: { agree: true, values: [dateStr, dateStr] },
      start_time_raw: { agree: true, values: [null, null] },
      venue_text: { agree: true, values: [null, null] },
      price_text: { agree: true, values: [null, null] },
    },
  };
}

test("classifyNearTermDate: includes today", () => {
  assert.equal(classifyNearTermDate(startAt("2026-08-25"), REFERENCE), NEAR_TERM_TODAY);
});

test("classifyNearTermDate: includes tomorrow", () => {
  assert.equal(classifyNearTermDate(startAt("2026-08-26"), REFERENCE), NEAR_TERM_TOMORROW);
});

test("classifyNearTermDate: excludes later gigs (day after tomorrow, next week, etc.)", () => {
  assert.equal(classifyNearTermDate(startAt("2026-08-27"), REFERENCE), null);
  assert.equal(classifyNearTermDate(startAt("2026-09-01"), REFERENCE), null);
});

test("classifyNearTermDate: excludes yesterday (already past)", () => {
  assert.equal(classifyNearTermDate(startAt("2026-08-24"), REFERENCE), null);
});

test("classifyNearTermDate: excludes unknown/unsafe dates rather than guessing — even with a raw string present", () => {
  const unknown = { raw: "sometime in August", date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" };
  assert.equal(classifyNearTermDate(unknown, REFERENCE), null);
});

test("classifyNearTermDate: null/undefined start is excluded, not guessed", () => {
  assert.equal(classifyNearTermDate(null, REFERENCE), null);
  assert.equal(classifyNearTermDate(undefined, REFERENCE), null);
});

test("selectNearTermListings: a GROUP display listing that qualifies counts ONCE, regardless of how many sources it carries", () => {
  const listings = [groupListing("Hot Clube × Capitólio gig", "2026-08-25", 2)];
  const qualifying = selectNearTermListings(listings, REFERENCE);
  assert.equal(qualifying.length, 1);
  assert.equal(qualifying[0].bucket, NEAR_TERM_TODAY);
  assert.equal(qualifying[0].listing.sources.length, 2, "sanity: the group still carries both sources internally");
});

test("selectNearTermListings: mixes SINGLE and GROUP, preserves order, excludes non-qualifying/unsafe entries", () => {
  const listings = [
    singleListing("Past Gig", "2026-08-20"),
    singleListing("Tonight Gig", "2026-08-25"),
    groupListing("Grouped Tomorrow Gig", "2026-08-26"),
    singleListing("Unsafe Gig", null, { start: { raw: "unclear", date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" } }),
    singleListing("Far Future Gig", "2026-12-01"),
  ];
  const qualifying = selectNearTermListings(listings, REFERENCE);
  assert.equal(qualifying.length, 2);
  assert.equal(qualifying[0].listing.title, "Tonight Gig");
  assert.equal(qualifying[0].bucket, NEAR_TERM_TODAY);
  assert.equal(qualifying[1].listing.display_title, "Grouped Tomorrow Gig");
  assert.equal(qualifying[1].bucket, NEAR_TERM_TOMORROW);
});

test("formatNearTermLabel: single qualifying TODAY listing -> concise 'Tonight · Title'", () => {
  const qualifying = selectNearTermListings([singleListing("Julia Piedade", "2026-08-25")], REFERENCE);
  const label = formatNearTermLabel(qualifying);
  assert.deepEqual(label, { count: 1, venueLine: "Tonight · Julia Piedade" });
});

test("formatNearTermLabel: single qualifying TOMORROW listing -> concise 'Tomorrow · Title'", () => {
  const qualifying = selectNearTermListings([singleListing("LUN8", "2026-08-26")], REFERENCE);
  const label = formatNearTermLabel(qualifying);
  assert.deepEqual(label, { count: 1, venueLine: "Tomorrow · LUN8" });
});

test("formatNearTermLabel: several qualifying listings -> a bounded count summary, never a per-title dump", () => {
  const qualifying = selectNearTermListings(
    [
      singleListing("Gig One", "2026-08-25"),
      singleListing("Gig Two", "2026-08-25"),
      singleListing("Gig Three", "2026-08-26"),
      singleListing("Gig Four", "2026-08-26"),
    ],
    REFERENCE,
  );
  const label = formatNearTermLabel(qualifying);
  assert.deepEqual(label, { count: 4, venueLine: "4 gigs today/tomorrow" });
  assert.doesNotMatch(label.venueLine, /Gig (One|Two|Three|Four)/, "must not render individual titles once there are several");
});

test("formatNearTermLabel: no qualifying listings -> null (nothing shown, nothing guessed)", () => {
  assert.equal(formatNearTermLabel([]), null);
  assert.equal(formatNearTermLabel(undefined), null);
});

test("buildNearTermLabel: end-to-end convenience wrapper over one venue's display_listings", () => {
  const displayListings = [
    singleListing("Past Gig", "2026-08-01"),
    singleListing("Touriga", "2026-08-25"),
  ];
  assert.deepEqual(buildNearTermLabel(displayListings, REFERENCE), { count: 1, venueLine: "Tonight · Touriga" });
});

test("buildNearTermLabel: a venue with zero qualifying listings yields null", () => {
  const displayListings = [singleListing("Far Future Gig", "2026-12-01")];
  assert.equal(buildNearTermLabel(displayListings, REFERENCE), null);
});
