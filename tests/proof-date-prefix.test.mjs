// BEATMAPPED-PROOF-DATE-PREFIX-PARSING-01
//
// a-trane-berlin publishes its own real Event dates unpadded —
// `2026-8-31T20:30+2:00` — and the proof clause read them with
// `/^\d{4}-\d{2}-\d{2}/`, which requires a zero-padded month AND day. 47 of
// its 58 observed Event nodes therefore had a source-published date treated as
// ABSENT and were rejected as undated.
//
// These tests pin the widened grammar and, more importantly, everything it
// must still refuse. No hostname, city or source id is special-cased.

import assert from "node:assert/strict";
import test from "node:test";

import { proofDateFromStartDate } from "../ingestion/programme-acquisition/proof-date.mjs";
import { proveCanonicalDetailEvents } from "../ingestion/programme-acquisition/offline-proof.mjs";

// --- §4/§5: the accepted grammar, and padding as the ONLY transformation ---

test("§5 an unpadded month and/or day is zero-padded, and nothing else changes", () => {
  assert.equal(proofDateFromStartDate("2026-8-31"), "2026-08-31");
  assert.equal(proofDateFromStartDate("2026-08-3"), "2026-08-03");
  assert.equal(proofDateFromStartDate("2026-8-3"), "2026-08-03");
  assert.equal(proofDateFromStartDate("2026-08-31"), "2026-08-31");
});

test("§4 the date prefix is read from a full timestamp, in either separator form", () => {
  assert.equal(proofDateFromStartDate("2026-8-31T20:30+2:00"), "2026-08-31");
  assert.equal(proofDateFromStartDate("2026-09-01T20:00:00+01:00"), "2026-09-01");
  assert.equal(proofDateFromStartDate("2026-8-31 20:30"), "2026-08-31");
});

test("§7 the timestamp itself is never repaired or reinterpreted", () => {
  // The proof object keeps the raw published value; this helper only ever
  // reports the date prefix, and never rewrites `+2:00` into `+02:00`.
  const raw = "2026-8-31T20:30+2:00";
  assert.equal(proofDateFromStartDate(raw), "2026-08-31");
  assert.equal(raw, "2026-8-31T20:30+2:00", "the input is not mutated");
});

test("§4 non-ISO orders and natural language remain rejected — this is not a general parser", () => {
  for (const value of [
    "31-8-2026", "31/8/2026", "2026/8/31", "Aug 31 2026", "31 Aug", "31 August 2026",
    "August 31, 2026", "20:30", "1756665000", "2026-W35-1", "20260831",
  ]) {
    assert.equal(proofDateFromStartDate(value), null, `${JSON.stringify(value)} must not parse`);
  }
});

// --- §14: malformed prefixes ---

test("§14 malformed prefixes are rejected", () => {
  for (const value of [
    "2026-8", "2026", "2026--8-31", "2026-008-31", "2026-8-031", "202x-8-31",
    "2026-8-31garbage", "2026-8-", "-2026-8-31", "2026-8-31-", "2026-8-311",
    "", "   ", "2026-8-3x",
  ]) {
    assert.equal(proofDateFromStartDate(value), null, `${JSON.stringify(value)} must not parse`);
  }
});

test("§14 a trailing fragment is never silently truncated into a date", () => {
  // The pre-existing regex had no terminator check, so "2026-08-311" yielded
  // "2026-08-31". A malformed value must not become a confident date.
  assert.equal(proofDateFromStartDate("2026-08-311"), null);
  assert.equal(proofDateFromStartDate("2026-08-31garbage"), null);
});

test("a non-string is rejected without throwing", () => {
  for (const value of [null, undefined, 20260831, {}, [], new Date(0)]) {
    assert.equal(proofDateFromStartDate(value), null);
  }
});

// --- §6: strict calendar validation ---

test("§6 impossible calendar dates are rejected, padded or unpadded", () => {
  for (const value of [
    "2026-00-10", "2026-13-10", "2026-02-30", "2026-04-31", "2026-8-0", "2026-8-32",
    "2026-0-10", "2026-2-30", "2026-6-31", "2026-9-31", "2026-11-31", "2026-1-32",
  ]) {
    assert.equal(proofDateFromStartDate(value), null, `${JSON.stringify(value)} is not a real date`);
  }
});

test("§6 month lengths are enforced exactly", () => {
  assert.equal(proofDateFromStartDate("2026-1-31"), "2026-01-31");
  assert.equal(proofDateFromStartDate("2026-4-30"), "2026-04-30");
  assert.equal(proofDateFromStartDate("2026-4-31"), null);
  assert.equal(proofDateFromStartDate("2026-12-31"), "2026-12-31");
});

// --- §16: leap years, by arithmetic, never by Date rollover ---

test("§16 leap-day validity is decided by the proleptic Gregorian rule", () => {
  assert.equal(proofDateFromStartDate("2028-2-29"), "2028-02-29", "2028 is a leap year");
  assert.equal(proofDateFromStartDate("2027-2-29"), null, "2027 is not");
  assert.equal(proofDateFromStartDate("2024-02-29"), "2024-02-29");
  assert.equal(proofDateFromStartDate("2000-2-29"), "2000-02-29", "a 400-year leap year");
  assert.equal(proofDateFromStartDate("1900-2-29"), null, "a century that is NOT a leap year");
  assert.equal(proofDateFromStartDate("2100-2-29"), null);
});

test("§16 an invalid date never rolls over into the next month", () => {
  // `new Date("2026-02-30")`-style handling would silently yield 2 March.
  assert.equal(proofDateFromStartDate("2026-2-30"), null);
  assert.equal(proofDateFromStartDate("2026-2-31"), null);
});

// --- §8: no clock, locale or timezone dependence ---

test("§8 the result depends only on the input string", () => {
  const before = proofDateFromStartDate("2026-8-31T20:30+2:00");
  const originalTz = process.env.TZ;
  try {
    for (const tz of ["UTC", "Pacific/Kiritimati", "Pacific/Niue"]) {
      process.env.TZ = tz;
      assert.equal(proofDateFromStartDate("2026-8-31T20:30+2:00"), before);
      // A timezone far enough east/west to shift a naive Date-based reading.
      assert.equal(proofDateFromStartDate("2026-1-1T00:00+14:00"), "2026-01-01");
      assert.equal(proofDateFromStartDate("2026-12-31T23:59-11:00"), "2026-12-31");
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

test("§8 the source-published offset never shifts the calendar date", () => {
  // Whatever the offset says, the date proved is the date the source wrote.
  assert.equal(proofDateFromStartDate("2026-8-31T23:30+2:00"), "2026-08-31");
  assert.equal(proofDateFromStartDate("2026-8-31T00:30-5:00"), "2026-08-31");
});

// --- §9: existing padded behaviour is preserved ---

test("§9 every padded ISO form this layer already accepted still yields the same date", () => {
  for (const [value, expected] of [
    ["2026-09-01T20:00:00+01:00", "2026-09-01"],
    ["2026-09-01T20:00:00", "2026-09-01"],
    ["2026-09-01", "2026-09-01"],
    ["2026-09-01 20:00", "2026-09-01"],
    ["2026-12-31T23:59:59Z", "2026-12-31"],
  ]) {
    assert.equal(proofDateFromStartDate(value), expected);
    assert.equal(/^\d{4}-\d{2}-\d{2}/.exec(value)?.[0], expected, "and the previous predicate agreed");
  }
});

// --- §15: cutoff semantics are identical for padded and unpadded forms ---

const ORIGIN = "https://arbitrary-venue.example";
const eventDoc = (startDate, path = "/events/a") => {
  const url = `${ORIGIN}${path}`;
  return {
    url,
    body: `<link rel="canonical" href="${url}">` +
      `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", name: "Gig", startDate, url })}</script>`,
  };
};

test("§15 an unpadded date is compared against the cutoff exactly as its padded twin is", () => {
  for (const [unpadded, padded] of [["2026-9-1T20:30+2:00", "2026-09-01T20:30+2:00"]]) {
    for (const cutoff of ["2026-08-31", "2026-09-01", "2026-09-02"]) {
      const fromUnpadded = proveCanonicalDetailEvents([eventDoc(unpadded)], { cutoffDate: cutoff });
      const fromPadded = proveCanonicalDetailEvents([eventDoc(padded)], { cutoffDate: cutoff });
      assert.equal(fromUnpadded.length, fromPadded.length, `cutoff ${cutoff}: unpadded and padded must agree`);
    }
  }
});

test("§15 before / equal to / after the cutoff behave identically in both forms", () => {
  const cutoff = "2026-09-01";
  const cases = [
    ["2026-8-31T20:30+2:00", "2026-08-31T20:30+2:00", 0, "before the cutoff is rejected"],
    ["2026-9-1T20:30+2:00", "2026-09-01T20:30+2:00", 1, "equal to the cutoff is accepted"],
    ["2026-9-2T20:30+2:00", "2026-09-02T20:30+2:00", 1, "after the cutoff is accepted"],
  ];
  for (const [unpadded, padded, expected, label] of cases) {
    assert.equal(proveCanonicalDetailEvents([eventDoc(unpadded)], { cutoffDate: cutoff }).length, expected, `unpadded: ${label}`);
    assert.equal(proveCanonicalDetailEvents([eventDoc(padded)], { cutoffDate: cutoff }).length, expected, `padded: ${label}`);
  }
});

test("§15 the cutoff is not weakened — an unpadded PAST date is still rejected", () => {
  assert.deepEqual(proveCanonicalDetailEvents([eventDoc("2026-1-5T20:30+2:00")], { cutoffDate: "2026-09-01" }), []);
});

// --- §10/§17: the a-trane shape now proves, with provenance intact ---

test("§10 the real a-trane published form now proves, keeping its raw startDate", () => {
  const [proof] = proveCanonicalDetailEvents([eventDoc("2026-8-31T20:30+2:00")], { cutoffDate: "2026-08-30" });
  assert.ok(proof, "an unpadded source date must no longer read as absent");
  assert.equal(proof.start_raw, "2026-8-31T20:30+2:00", "§17: the source-published value is retained verbatim, never rewritten as padded ISO");
  assert.equal(proof.source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL", "§11: identity is unchanged by a date fix");
});

test("§11 an unpadded date does not change WHICH identity basis is used", () => {
  // Same document with no canonical at all: still the self-referential basis.
  const url = `${ORIGIN}/events/b`;
  const [proof] = proveCanonicalDetailEvents([{
    url,
    body: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", name: "Gig", startDate: "2026-8-31T20:30+2:00", url })}</script>`,
  }], { cutoffDate: "2026-08-30" });
  assert.equal(proof.source_record_id_basis, "SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL");
  assert.equal(proof.source_record_id, url);
});

test("§6 a document whose only Event carries an impossible date proves nothing", () => {
  assert.deepEqual(proveCanonicalDetailEvents([eventDoc("2026-2-30T20:30+2:00")], { cutoffDate: "2026-01-01" }), []);
});
