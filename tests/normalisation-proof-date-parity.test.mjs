// BEATMAPPED-NORMALISATION-DATE-PREFIX-PARITY-01
//
// `collectAndProve()` decides an acquisition by INTERSECTING the normalized
// record set with the detail-proof set. Those two sides each read the same
// source-published `startDate`, and each used to carry its own copy of the
// calendar-date predicate. Once the proof side learned to read an unpadded
// month/day and the normalisation side did not, the two sides disagreed about
// which events exist — a-trane-berlin's own events were proven by their detail
// documents and simultaneously discarded during normalisation, so the sets
// could not intersect and the source stayed at 0 proven despite 8 valid
// proofs.
//
// The guard below is therefore not "does each helper work" but "do the two
// sides agree". One source-published startDate must have exactly one governed
// calendar-date reading.

import assert from "node:assert/strict";
import test from "node:test";

import { proveJsonLdEvents } from "../ingestion/programme-acquisition/discovery.mjs";
import { proveCanonicalDetailEvents } from "../ingestion/programme-acquisition/offline-proof.mjs";
import { proofDateFromStartDate } from "../ingestion/programme-acquisition/proof-date.mjs";

const ORIGIN = "https://arbitrary-venue.example";
const URL_A = `${ORIGIN}/events/a`;

/** One document that is simultaneously a valid normalisation input and a valid
 * detail-proof input, so both sides see the identical source-published value. */
function document(startDate) {
  return {
    url: URL_A,
    at: "2026-08-30T00:00:00Z",
    status: 200,
    content_type: "text/html",
    body:
      `<link rel="canonical" href="${URL_A}">` +
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org", "@type": "Event",
        name: "Parity Gig", startDate, url: URL_A,
      })}</script>`,
  };
}

const normalisationAccepts = (startDate, cutoffDate) =>
  proveJsonLdEvents([document(startDate)], { sourceId: "arbitrary-source", venueName: "Arbitrary Venue", retrievedAt: "2026-08-30T00:00:00Z", cutoffDate }).records.length > 0;

const proofAccepts = (startDate, cutoffDate) =>
  proveCanonicalDetailEvents([document(startDate)], { cutoffDate }).length > 0;

/** Every shape either side is asked to read, valid and invalid. */
const MATRIX = [
  // unpadded — the whole reason this package exists
  "2026-8-31T20:30+2:00", "2026-9-1T20:30+2:00", "2026-8-3", "2026-08-3", "2026-8-03",
  // padded — must be untouched
  "2026-08-31T20:30:00+02:00", "2026-09-01T20:00:00", "2026-12-31", "2026-09-01 20:00",
  // impossible calendar dates
  "2026-00-10", "2026-13-10", "2026-02-30", "2027-02-29", "2026-04-31", "2026-8-32", "2026-8-0",
  // leap years
  "2028-2-29", "2027-2-29", "2000-2-29", "1900-2-29",
  // malformed / out of grammar
  "2026-8", "2026", "2026--8-31", "2026-008-31", "2026-8-031", "202x-8-31",
  "2026-8-31garbage", "2026-08-311", "31-8-2026", "2026/8/31", "Aug 31 2026", "20260831", "",
];

// --- §15: the core regression guard ---

test("§15 normalisation and detail proof accept or reject every startDate identically", () => {
  const disagreements = [];
  for (const startDate of MATRIX) {
    // A cutoff early enough that only the date's VALIDITY decides the outcome.
    const normalised = normalisationAccepts(startDate, "1900-01-01");
    const proved = proofAccepts(startDate, "1900-01-01");
    if (normalised !== proved) disagreements.push({ startDate, normalised, proved });
  }
  assert.deepEqual(disagreements, [], "the two sides must never disagree about whether a source-published date is readable");
});

test("§15 both sides agree on the exact calendar date, not merely on acceptance", () => {
  // Probing with the cutoff proves WHICH date each side derived: accepted at a
  // cutoff equal to the expected date, rejected one day later.
  const nextDay = (date) => {
    const [y, m, d] = date.split("-").map(Number);
    const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d < days[m - 1]
      ? `${y}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`
      : m < 12 ? `${y}-${String(m + 1).padStart(2, "0")}-01` : `${y + 1}-01-01`;
  };

  for (const startDate of MATRIX) {
    const expected = proofDateFromStartDate(startDate);
    if (!expected) continue;
    assert.equal(normalisationAccepts(startDate, expected), true, `${startDate}: normalisation must accept at cutoff ${expected}`);
    assert.equal(proofAccepts(startDate, expected), true, `${startDate}: proof must accept at cutoff ${expected}`);
    const after = nextDay(expected);
    assert.equal(normalisationAccepts(startDate, after), false, `${startDate}: normalisation must reject at cutoff ${after}`);
    assert.equal(proofAccepts(startDate, after), false, `${startDate}: proof must reject at cutoff ${after}`);
  }
});

// --- §8: cutoff parity, padded vs unpadded, in both layers ---

test("§8 before / equal / after the cutoff behave identically in both layers and both forms", () => {
  const cutoff = "2026-09-01";
  const cases = [
    ["2026-8-31T20:30+2:00", "2026-08-31T20:30:00+02:00", false, "before the cutoff"],
    ["2026-9-1T20:30+2:00", "2026-09-01T20:30:00+02:00", true, "equal to the cutoff"],
    ["2026-9-2T20:30+2:00", "2026-09-02T20:30:00+02:00", true, "after the cutoff"],
  ];
  for (const [unpadded, padded, expected, label] of cases) {
    for (const [form, value] of [["unpadded", unpadded], ["padded", padded]]) {
      assert.equal(normalisationAccepts(value, cutoff), expected, `normalisation, ${form}, ${label}`);
      assert.equal(proofAccepts(value, cutoff), expected, `proof, ${form}, ${label}`);
    }
  }
});

// --- §12: padded JSON-LD normalisation is unchanged ---

test("§12 a padded date produces exactly the normalized record it produced before", () => {
  const { records } = proveJsonLdEvents([document("2026-08-31T20:30:00+02:00")], {
    sourceId: "arbitrary-source", venueName: "Arbitrary Venue", retrievedAt: "2026-08-30T00:00:00Z", cutoffDate: "2026-08-30",
  });
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.title, "Parity Gig");
  assert.equal(record.event_url, URL_A);
  assert.equal(record.source_record_id, URL_A);
  assert.equal(record.start_raw, "2026-08-31T20:30:00+02:00", "the raw published value is retained verbatim");
  assert.equal(record.source_document_url, URL_A);
});

// --- §7: raw evidence is never rewritten as padded ISO ---

test("§7 an unpadded source value is retained verbatim through normalisation", () => {
  const { records, observations } = proveJsonLdEvents([document("2026-8-31T20:30+2:00")], {
    sourceId: "arbitrary-source", venueName: "Arbitrary Venue", retrievedAt: "2026-08-30T00:00:00Z", cutoffDate: "2026-08-30",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].start_raw, "2026-8-31T20:30+2:00", "normalisation must not rewrite the source's own value as padded ISO");
  assert.equal(observations.length, 1);
  // And identity is untouched by a date fix.
  assert.equal(records[0].source_record_id, URL_A);
});

// --- §6: the two sides share ONE calendar validation ---

test("§6 an impossible date is rejected by both sides, never normalized into existence", () => {
  for (const impossible of ["2026-02-30", "2026-2-30", "2027-02-29", "2026-04-31", "2026-13-10", "2026-00-10"]) {
    assert.equal(normalisationAccepts(impossible, "1900-01-01"), false, `${impossible} must not normalize`);
    assert.equal(proofAccepts(impossible, "1900-01-01"), false, `${impossible} must not prove`);
  }
});

test("§6 a valid leap day is accepted by both sides", () => {
  assert.equal(normalisationAccepts("2028-2-29", "1900-01-01"), true);
  assert.equal(proofAccepts("2028-2-29", "1900-01-01"), true);
});

// --- §16: the duplicate predicate is gone, and stays gone ---

test("§16 normalisation derives its calendar date from the shared helper, not a private copy", () => {
  // A value only the shared helper can read. If normalisation ever grows its
  // own predicate again, this is the first thing that breaks.
  assert.equal(proofDateFromStartDate("2026-8-31T20:30+2:00"), "2026-08-31");
  assert.equal(normalisationAccepts("2026-8-31T20:30+2:00", "2026-08-31"), true);
  // ...and a value the shared helper deliberately refuses.
  assert.equal(proofDateFromStartDate("2026-08-311"), null);
  assert.equal(normalisationAccepts("2026-08-311", "1900-01-01"), false);
});
