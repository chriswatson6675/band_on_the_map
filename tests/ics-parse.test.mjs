import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDateTimeValue,
  parseICS,
  parsePropertyLine,
  unescapeText,
  unfoldLines,
} from "../ingestion/ics/parse.mjs";

// This suite tests the GENERIC parser only — no source-specific names or
// URLs. Fixture-backed proof against the real Hot Clube payloads lives in
// tests/hot-clube-fixtures.test.mjs.

test("unfoldLines merges a continuation line beginning with a single space", () => {
  // Per RFC 5545 §3.1, unfolding removes the CRLF and exactly the one
  // whitespace character that marks the fold, inserting no space of its
  // own — so a producer that wants a visible space at the fold point must
  // include it before folding, as this fixture does ("wraps " + " across").
  const text = "BEGIN:VEVENT\r\nSUMMARY:Long title that wraps \r\n across two lines\r\nEND:VEVENT";
  const lines = unfoldLines(text);
  assert.deepEqual(lines, [
    "BEGIN:VEVENT",
    "SUMMARY:Long title that wraps across two lines",
    "END:VEVENT",
  ]);
});

test("unfoldLines merges a continuation line beginning with a single tab", () => {
  const text = "SUMMARY:Part one\n\tpart two";
  assert.deepEqual(unfoldLines(text), ["SUMMARY:Part onepart two"]);
});

test("unfoldLines handles bare LF, CRLF, and a mix of both within one input", () => {
  const text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//EN\nBEGIN:VEVENT\nEND:VEVENT\r\nEND:VCALENDAR";
  const lines = unfoldLines(text);
  assert.deepEqual(lines, [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//x//EN",
    "BEGIN:VEVENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
});

test("unfoldLines drops empty physical lines", () => {
  const text = "A:1\r\n\r\nB:2\n\nC:3";
  assert.deepEqual(unfoldLines(text), ["A:1", "B:2", "C:3"]);
});

test("unescapeText handles \\\\ \\, \\; \\n \\N", () => {
  assert.equal(unescapeText("a\\,b"), "a,b");
  assert.equal(unescapeText("a\\;b"), "a;b");
  assert.equal(unescapeText("a\\\\b"), "a\\b");
  assert.equal(unescapeText("a\\nb"), "a\nb");
  assert.equal(unescapeText("a\\Nb"), "a\nb");
  assert.equal(unescapeText("plain text"), "plain text");
});

test("unescapeText leaves an unrecognised escape's character intact, dropping only the backslash", () => {
  assert.equal(unescapeText("a\\zb"), "azb");
});

test("parsePropertyLine splits name, params, and value on the first unquoted colon", () => {
  assert.deepEqual(parsePropertyLine("SUMMARY:Hello World"), {
    name: "SUMMARY",
    params: {},
    value: "Hello World",
  });

  assert.deepEqual(parsePropertyLine("DTSTART;TZID=Europe/Lisbon:20260101T120000"), {
    name: "DTSTART",
    params: { TZID: "Europe/Lisbon" },
    value: "20260101T120000",
  });
});

test("parsePropertyLine does not split on a colon inside a quoted param value", () => {
  const parsed = parsePropertyLine('ATTENDEE;CN="Time: 5pm":mailto:test@example.com');
  assert.equal(parsed.name, "ATTENDEE");
  assert.equal(parsed.params.CN, "Time: 5pm");
  assert.equal(parsed.value, "mailto:test@example.com");
});

test("parseDateTimeValue recognises UTC form and produces a real ISO instant", () => {
  const result = parseDateTimeValue({}, "20260802T183000Z");
  assert.equal(result.isUTC, true);
  assert.equal(result.isDate, false);
  assert.equal(result.tzid, null);
  assert.equal(result.iso, "2026-08-02T18:30:00Z");
});

test("parseDateTimeValue recognises VALUE=DATE all-day values without inventing a time", () => {
  const result = parseDateTimeValue({ VALUE: "DATE" }, "20260101");
  assert.equal(result.isDate, true);
  assert.equal(result.iso, "2026-01-01");
});

test("parseDateTimeValue records TZID but does not fabricate a UTC instant", () => {
  const result = parseDateTimeValue({ TZID: "Europe/Lisbon" }, "20260101T120000");
  assert.equal(result.tzid, "Europe/Lisbon");
  assert.equal(result.isUTC, false);
  assert.equal(result.iso, null, "must not guess a UTC offset for a TZID-relative time");
});

test("parseDateTimeValue leaves a bare floating local time with iso: null", () => {
  const result = parseDateTimeValue({}, "20260823T182144");
  assert.equal(result.isUTC, false);
  assert.equal(result.tzid, null);
  assert.equal(result.iso, null, "must not assume UTC for an unqualified floating time");
});

test("parseICS extracts the correct VEVENT count from a minimal calendar", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:abc123",
    "DTSTART:20260101T100000Z",
    "DTEND:20260101T110000Z",
    "SUMMARY:Event One",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:def456",
    "DTSTART:20260102T100000Z",
    "DTEND:20260102T110000Z",
    "SUMMARY:Event Two",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const { calendarCount, events } = parseICS(ics);
  assert.equal(calendarCount, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0].uid, "abc123");
  assert.equal(events[1].uid, "def456");
});

test("parseICS preserves absent optional fields as null rather than inventing them", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:only-required-fields",
    "DTSTART:20260101T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  const { events } = parseICS(ics);
  assert.equal(events[0].summary, null);
  assert.equal(events[0].description, null);
  assert.equal(events[0].location, null);
  assert.equal(events[0].url, null);
  assert.equal(events[0].status, null);
  assert.equal(events[0].organizer, null);
  assert.equal(events[0].dtend, null);
});

test("parseICS preserves an unmodelled property (e.g. a future RRULE) verbatim rather than dropping it", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:recurring",
    "DTSTART:20260101T100000Z",
    "RRULE:FREQ=WEEKLY;COUNT=5",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  const { events } = parseICS(ics);
  assert.equal(events[0].otherProperties.RRULE, "FREQ=WEEKLY;COUNT=5");
});

test("unfoldedBlock is normalized parser-level text, not byte-identical raw evidence", () => {
  // A folded DESCRIPTION, CRLF property terminators, and a blank physical
  // line together demonstrate everything unfoldedBlock cannot preserve:
  // the fold structure, the original terminator bytes, and the blank line.
  const rawVeventBlock =
    "UID:abc\r\n" +
    "SUMMARY:Folded \r\n" + // trailing space belongs to the value itself
    " description\r\n" + // continuation; its own leading space is the fold marker, removed on unfold
    "\r\n" + // a blank physical line, dropped during unfolding
    "DTSTART:20260101T100000Z";
  const ics =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VEVENT\r\n" +
    rawVeventBlock +
    "\r\nEND:VEVENT\r\nEND:VCALENDAR";

  const { events } = parseICS(ics);
  const { unfoldedBlock } = events[0];

  assert.equal(unfoldedBlock, "UID:abc\nSUMMARY:Folded description\nDTSTART:20260101T100000Z");
  // The fold is gone (one logical line instead of two), CRLF has become
  // "\n", and the blank line is gone — none of that is the original bytes.
  assert.notEqual(unfoldedBlock, rawVeventBlock);
  assert.equal(unfoldedBlock.includes("\r"), false, "original CRLF terminators are not preserved");
});

test("parseICS's returned record carries no canonical Event identity", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:abc123",
    "DTSTART:20260101T100000Z",
    "SUMMARY:Event One",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  const { events } = parseICS(ics);
  const keys = Object.keys(events[0]);

  // A parsed ICS event is source material for a future Observation
  // (docs/ARCHITECTURE.md), never a canonical Band on the Map Event.
  for (const forbidden of ["id", "eventId", "event_id", "canonicalEventId", "canonicalId"]) {
    assert.equal(keys.includes(forbidden), false, `unexpected canonical-identity key: ${forbidden}`);
  }
});

test("parseICS rejects empty input rather than silently returning zero events", () => {
  assert.throws(() => parseICS(""), /non-empty ICS text/);
  assert.throws(() => parseICS("   "), /non-empty ICS text/);
});
