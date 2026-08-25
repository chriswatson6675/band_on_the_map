import assert from "node:assert/strict";
import test from "node:test";

import { computeQuickDateRange, addCalendarDays, QUICK_DATE_KEYS } from "../ingestion/map/quick-dates.mjs";

// BEATMAPPED-DATE-FILTER-LIVE-01 — computeQuickDateRange() never calls
// `new Date()` with no arguments; every test here passes an explicit
// `todayDateString`, so results are fully deterministic.

test("QUICK_DATE_KEYS lists exactly the four existing buttons, no new ones added", () => {
  assert.deepEqual(QUICK_DATE_KEYS, ["Tonight", "This weekend", "Next 7 days", "This month"]);
});

test("Tonight: today only", () => {
  assert.deepEqual(computeQuickDateRange("Tonight", "2026-08-26"), { from: "2026-08-26", to: "2026-08-26" });
});

test("Next 7 days: today through today+6 (7 calendar days inclusive)", () => {
  assert.deepEqual(computeQuickDateRange("Next 7 days", "2026-08-26"), { from: "2026-08-26", to: "2026-09-01" });
});

test("Next 7 days crosses a year boundary correctly", () => {
  assert.deepEqual(computeQuickDateRange("Next 7 days", "2026-12-28"), { from: "2026-12-28", to: "2027-01-03" });
});

test("This month: the 1st through the last day of a 31-day month", () => {
  assert.deepEqual(computeQuickDateRange("This month", "2026-08-26"), { from: "2026-08-01", to: "2026-08-31" });
});

test("This month: correctly finds 28 for a non-leap February", () => {
  // 2026 is not a leap year.
  assert.deepEqual(computeQuickDateRange("This month", "2026-02-15"), { from: "2026-02-01", to: "2026-02-28" });
});

test("This weekend from a midweek day (Wednesday): the UPCOMING Saturday/Sunday", () => {
  // 2026-08-26 is a Wednesday.
  assert.deepEqual(computeQuickDateRange("This weekend", "2026-08-26"), { from: "2026-08-29", to: "2026-08-30" });
});

test("This weekend when today IS Saturday: today through tomorrow", () => {
  // 2026-08-29 is a Saturday.
  assert.deepEqual(computeQuickDateRange("This weekend", "2026-08-29"), { from: "2026-08-29", to: "2026-08-30" });
});

test("This weekend when today IS Sunday: yesterday (Saturday) through today — never skips ahead a full week", () => {
  // 2026-08-30 is a Sunday.
  assert.deepEqual(computeQuickDateRange("This weekend", "2026-08-30"), { from: "2026-08-29", to: "2026-08-30" });
});

test("an unrecognised quick-date key returns {null, null} rather than guessing", () => {
  assert.deepEqual(computeQuickDateRange("Next month", "2026-08-26"), { from: null, to: null });
});

test("addCalendarDays: plain forward/backward arithmetic, including across a month boundary", () => {
  assert.equal(addCalendarDays("2026-08-26", 1), "2026-08-27");
  assert.equal(addCalendarDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addCalendarDays("2026-08-26", -1), "2026-08-25");
  assert.equal(addCalendarDays("2026-01-01", -1), "2025-12-31");
});
