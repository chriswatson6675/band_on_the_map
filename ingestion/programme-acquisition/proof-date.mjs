// BEATMAPPED-PROOF-DATE-PREFIX-PARSING-01
//
// The proof layer needs exactly one thing from a source-published `startDate`:
// the calendar date it names, so it can be compared against the cutoff. It
// previously took that with `/^\d{4}-\d{2}-\d{2}/`, which requires a
// zero-padded month AND day.
//
// a-trane-berlin publishes its own real Event dates unpadded —
// `2026-8-31T20:30+2:00` — so 47 of its 58 observed Event nodes had their
// source-published date read as ABSENT and were rejected as undated. That is a
// parsing defect in this layer, not missing data at the source.
//
// This module widens WHICH source-published prefixes are readable. It widens
// nothing else:
//
//  - Only a numeric `YYYY-M-D` prefix is accepted, with one or two digits for
//    month and day. Nothing reordered, nothing localised, nothing
//    natural-language. `31-8-2026`, `31/8/2026`, `2026/8/31` and `Aug 31 2026`
//    are all rejected, as before.
//  - The date must be followed by end-of-string, `T`, or a space — the forms a
//    schema.org date/dateTime actually takes. A trailing fragment is not
//    silently truncated into a date.
//  - Only zero-padding is performed. No year, month, day, timezone, locale or
//    date order is ever inferred.
//  - The calendar date is validated strictly, including leap years, using pure
//    arithmetic. Nothing here consults the clock, the runtime locale or the
//    system timezone, and nothing is round-tripped through `Date`, whose
//    rollover would silently turn 2026-02-30 into March.
//
// The timestamp itself is never altered or repaired — a published `+2:00`
// offset stays exactly as the source wrote it. Only the date prefix is read.

const DATE_PREFIX = /^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[T ])/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Proleptic Gregorian leap year, by arithmetic — never via `Date`. */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/**
 * The calendar date a source published, as `YYYY-MM-DD`, or null when the
 * value does not begin with a valid one.
 *
 * Returns the padded form so every existing comparison — including the
 * lexicographic cutoff comparison the proof layer already relies on — behaves
 * for an unpadded source value exactly as it would have for the same date
 * published padded.
 */
export function proofDateFromStartDate(startDate) {
  if (typeof startDate !== "string") return null;
  const match = DATE_PREFIX.exec(startDate.trim());
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
