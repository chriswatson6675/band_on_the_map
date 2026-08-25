// BEATMAPPED-DATE-FILTER-LIVE-01 — pure calendar-date math for the
// public "Quick dates" buttons (Tonight / This weekend / Next 7 days /
// This month). Browser-safe, dependency-free, imported by app/page.tsx.
//
// `computeQuickDateRange()` never calls `new Date()` with no arguments —
// the visitor's own current calendar date is read once, at the UI layer
// (see app/page.tsx's getVisitorTodayDateString()), and passed in here
// as `todayDateString`. That keeps this module pure/deterministic and
// testable, matching this repository's existing "never Date.now()/
// new Date() inside a pure function" convention (e.g. ingestion/map/
// publication.mjs's buildPublicationArtifact()).
//
// TIMEZONE SAFETY: every internal date computation below uses
// `Date.UTC(...)`/the `getUTC*()` accessors exclusively — a "YYYY-MM-DD"
// string is treated purely as calendar-date data, never parsed through
// a timezone-sensitive path (e.g. `new Date("YYYY-MM-DD")`, which
// parses as UTC midnight and can then read back as the PREVIOUS local
// calendar day in a negative-UTC-offset timezone once local getters are
// used on it). Mixing UTC and local Date methods is exactly how a
// calendar date silently drifts by one day; this module never mixes
// them — every value in, and every value out, is UTC-computed only.

export const QUICK_DATE_KEYS = ["Tonight", "This weekend", "Next 7 days", "This month"];

function ymdToUtcMillis(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMillisToYmd(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add (or subtract, with a negative count) whole calendar days to a "YYYY-MM-DD" string. */
export function addCalendarDays(dateStr, days) {
  return utcMillisToYmd(ymdToUtcMillis(dateStr) + days * 86400000);
}

/** 0 = Sunday .. 6 = Saturday, derived purely from the calendar date. */
function calendarDayOfWeek(dateStr) {
  return new Date(ymdToUtcMillis(dateStr)).getUTCDay();
}

function firstDayOfMonth(dateStr) {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

function lastDayOfMonth(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return utcMillisToYmd(Date.UTC(y, m, 0)); // day 0 of month m (1-indexed) == last day of month m
}

/**
 * Compute the inclusive {from, to} calendar-date range for one quick-date
 * key, relative to `todayDateString` ("YYYY-MM-DD", the visitor's own
 * current calendar date). Returns {from: null, to: null} for an
 * unrecognised key rather than guessing.
 *
 *   Tonight       -> today only (from === to === todayDateString)
 *   This weekend  -> the Saturday/Sunday of the CURRENT calendar week —
 *                     if today already IS Saturday or Sunday, this is
 *                     today's own weekend, never a jump to next week's
 *   Next 7 days   -> today through today+6 (7 calendar days inclusive)
 *   This month    -> the 1st through the last day of today's month
 */
export function computeQuickDateRange(key, todayDateString) {
  if (key === "Tonight") {
    return { from: todayDateString, to: todayDateString };
  }
  if (key === "This weekend") {
    const daysFromMonday = (calendarDayOfWeek(todayDateString) + 6) % 7; // Mon=0 .. Sun=6
    const saturday = addCalendarDays(todayDateString, 5 - daysFromMonday);
    const sunday = addCalendarDays(saturday, 1);
    return { from: saturday, to: sunday };
  }
  if (key === "Next 7 days") {
    return { from: todayDateString, to: addCalendarDays(todayDateString, 6) };
  }
  if (key === "This month") {
    return { from: firstDayOfMonth(todayDateString), to: lastDayOfMonth(todayDateString) };
  }
  return { from: null, to: null };
}
