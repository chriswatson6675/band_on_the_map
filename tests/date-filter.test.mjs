import assert from "node:assert/strict";
import test from "node:test";

import { listingWithinDateRange, filterMarkersByDateRange, resolveDefaultFromDate } from "../ingestion/map/date-filter.mjs";

// BEATMAPPED-DATE-FILTER-LIVE-01 — mirrors tests/artist-genre-search.test.mjs's
// own conventions for the sibling Genre/Artist filters.

function listing(dateStr, overrides = {}) {
  return {
    kind: "SINGLE",
    source_id: "meo-arena",
    source_record_id: "x",
    title: "Test Event",
    start: { raw: null, date: dateStr, iso: null, is_utc: null, tzid: null, certainty: dateStr ? "DATE_ONLY" : "UNKNOWN" },
    end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
    event_url: null,
    ...overrides,
  };
}

function marker(venueId, listings) {
  return { venue_id: venueId, canonical_name: venueId, latitude: 1, longitude: 2, address: null, display_listings: listings };
}

// --- listingWithinDateRange: the core predicate ---

test("no From and no To: every listing matches", () => {
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "", ""), true);
  assert.equal(listingWithinDateRange(listing("2026-10-04"), null, null), true);
  assert.equal(listingWithinDateRange(listing("2026-10-04"), undefined, undefined), true);
});

test("From only: on or after From", () => {
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "2026-10-01", ""), true);
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "2026-10-04", ""), true, "exactly on From is inclusive");
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "2026-10-05", ""), false);
});

test("To only: on or before To", () => {
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "", "2026-10-31"), true);
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "", "2026-10-04"), true, "exactly on To is inclusive");
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "", "2026-10-03"), false);
});

test("inclusive From/To range", () => {
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "2026-10-01", "2026-10-31"), true);
  assert.equal(listingWithinDateRange(listing("2026-09-30"), "2026-10-01", "2026-10-31"), false, "just before From");
  assert.equal(listingWithinDateRange(listing("2026-11-01"), "2026-10-01", "2026-10-31"), false, "just after To");
});

test("same-day range (From === To)", () => {
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "2026-10-04", "2026-10-04"), true);
  assert.equal(listingWithinDateRange(listing("2026-10-03"), "2026-10-04", "2026-10-04"), false);
  assert.equal(listingWithinDateRange(listing("2026-10-05"), "2026-10-04", "2026-10-04"), false);
});

test("a listing with a genuinely unknown date always matches any range — never silently dropped", () => {
  assert.equal(listingWithinDateRange(listing(null), "2026-10-01", "2026-10-31"), true);
  assert.equal(listingWithinDateRange({ kind: "SINGLE", start: {} }, "2026-10-01", "2026-10-31"), true);
});

test("no timezone day drift: comparison is plain calendar-text equality, never a constructed/parsed Date", () => {
  // A boundary date must compare equal to itself and unequal to its
  // immediate neighbours purely as text — this module never constructs
  // a Date object from a "YYYY-MM-DD" string at all (see its own doc
  // comment), so there is no local-timezone parse step that could shift
  // "2026-10-04" to "2026-10-03"/"2026-10-05" depending on the runtime's
  // own UTC offset.
  assert.equal(listingWithinDateRange(listing("2026-10-04"), "2026-10-04", "2026-10-04"), true);
  assert.equal(listingWithinDateRange(listing("2026-10-03"), "2026-10-04", "2026-10-04"), false);
  assert.equal(listingWithinDateRange(listing("2026-10-05"), "2026-10-04", "2026-10-04"), false);
});

// --- filterMarkersByDateRange: marker/listing composition ---

test("filterMarkersByDateRange with no bounds returns markers unchanged", () => {
  const markers = [marker("v1", [listing("2026-10-04")])];
  assert.deepEqual(filterMarkersByDateRange(markers, "", ""), markers);
});

test("a venue with multiple Events, only one inside range: marker kept, only the matching Event survives", () => {
  const markers = [
    marker("v1", [
      listing("2026-09-01", { title: "Too early" }),
      listing("2026-10-04", { title: "Evanescence" }),
      listing("2026-12-01", { title: "Too late" }),
    ]),
  ];
  const filtered = filterMarkersByDateRange(markers, "2026-10-01", "2026-10-31");
  assert.equal(filtered.length, 1, "the venue marker survives");
  assert.equal(filtered[0].display_listings.length, 1, "only the matching Event remains");
  assert.equal(filtered[0].display_listings[0].title, "Evanescence");
});

test("a venue whose Events ALL fall outside the range is removed entirely — no stale marker left behind", () => {
  const markers = [marker("v1", [listing("2026-09-01"), listing("2026-12-01")])];
  const filtered = filterMarkersByDateRange(markers, "2026-10-01", "2026-10-31");
  assert.deepEqual(filtered, []);
});

test("date range composes with an already-applied Genre/Artist narrowing (AND semantics) — operates on whatever listings it receives", () => {
  const alreadyGenreFiltered = [
    marker("v1", [
      listing("2026-10-04", { title: "Evanescence" }), // Metal, October
      listing("2026-11-15", { title: "Amon Amarth" }), // Metal, November
    ]),
  ];
  const octoberOnly = filterMarkersByDateRange(alreadyGenreFiltered, "2026-10-01", "2026-10-31");
  assert.equal(octoberOnly[0].display_listings.length, 1);
  assert.equal(octoberOnly[0].display_listings[0].title, "Evanescence");

  const novemberOnly = filterMarkersByDateRange(alreadyGenreFiltered, "2026-11-01", "2026-11-30");
  assert.equal(novemberOnly[0].display_listings.length, 1);
  assert.equal(novemberOnly[0].display_listings[0].title, "Amon Amarth");

  const octToNov = filterMarkersByDateRange(alreadyGenreFiltered, "2026-10-01", "2026-11-30");
  assert.equal(octToNov[0].display_listings.length, 2, "both survive an inclusive Oct-Nov range");
});

test("invalid/empty date state: an inverted range (From after To) matches no KNOWN date, but still never drops an unknown-date listing", () => {
  // A real visitor can't construct this via the native picker (see
  // app/page.tsx's min/max cross-constraints on the From/To inputs), but
  // nothing here should crash or behave surprisingly if it happens —
  // e.g. a manually-typed value on a browser that doesn't enforce it.
  const markers = [marker("v1", [listing("2026-10-04", { title: "Known date" }), listing(null, { title: "Unknown date" })])];
  const filtered = filterMarkersByDateRange(markers, "2026-10-04", "2026-08-30");
  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0].display_listings.map((l) => l.title), ["Unknown date"]);
});

test("invalid/empty date state: an empty string bound behaves exactly like an absent one", () => {
  const markers = [marker("v1", [listing("2026-10-04")])];
  assert.deepEqual(filterMarkersByDateRange(markers, "", ""), markers);
  const filtered = filterMarkersByDateRange(markers, "", "2026-10-04");
  assert.equal(filtered.length, 1);
});

// --- resolveDefaultFromDate: BAND-ON-THE-MAP-BARCELONA-PRE-INTEGRATION-DATE-AUDIT-01 ---
// app/page.tsx's own default-to-"upcoming" fix — see this function's doc
// comment in ingestion/map/date-filter.mjs for the full defect this closes.

test("an untouched (empty) From date defaults to today", () => {
  assert.equal(resolveDefaultFromDate("", "2026-08-26"), "2026-08-26");
});

test("an explicit From date — typed, or set by a Quick dates preset — is never overridden", () => {
  assert.equal(resolveDefaultFromDate("2026-09-01", "2026-08-26"), "2026-09-01");
  // Including one deliberately BEFORE today — an explicit visitor choice
  // to look backward (e.g. a Quick dates preset, or manually typed) is
  // always respected, exactly like every other From/To value in this
  // module — only the genuinely-untouched "" state ever gets a default.
  assert.equal(resolveDefaultFromDate("2026-01-01", "2026-08-26"), "2026-01-01");
});

test("null/undefined From is treated the same as empty string", () => {
  assert.equal(resolveDefaultFromDate(null, "2026-08-26"), "2026-08-26");
  assert.equal(resolveDefaultFromDate(undefined, "2026-08-26"), "2026-08-26");
});
