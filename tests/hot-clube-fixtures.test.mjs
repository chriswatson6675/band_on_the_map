import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseICS } from "../ingestion/ics/parse.mjs";

const EVENTS_DIR = new URL("../fixtures/hot-clube/events/", import.meta.url);
const METADATA_PATH = new URL("../fixtures/hot-clube/metadata.json", import.meta.url);
const RETAINED_EVENT_IDS = ["3786", "3788", "3790", "3793", "3794", "3795", "3797", "3799", "3801"];

async function loadFixtureFiles() {
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const files = [];
  for (const name of names) {
    files.push({ name, text: await readFile(new URL(name, EVENTS_DIR), "utf8") });
  }
  return files;
}

test("exactly the 9 retained event fixtures are present", async () => {
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).map((f) => f.replace(/\.ics$/, ""));
  assert.deepEqual(names.sort(), [...RETAINED_EVENT_IDS].sort());
});

test("every retained fixture parses into exactly one real VEVENT", async () => {
  const files = await loadFixtureFiles();
  assert.equal(files.length, 9);

  let total = 0;
  for (const { name, text } of files) {
    const { events } = parseICS(text);
    assert.equal(events.length, 1, `${name} should contain exactly one VEVENT`);
    total += events.length;
  }
  assert.equal(total, 9, "9 fixtures should yield exactly 9 VEVENTs in total");
});

test("UID is preserved verbatim from each retained fixture", async () => {
  const files = await loadFixtureFiles();
  for (const { name, text } of files) {
    const { events } = parseICS(text);
    const rawUidLine = text.split(/\r\n|\n/).find((l) => l.startsWith("UID:"));
    assert.equal(events[0].uid, rawUidLine.slice("UID:".length), `${name} UID must be preserved as-is`);
    assert.ok(events[0].uid.length > 0);
  }
});

test("SUMMARY (title) parses correctly and is unescaped", async () => {
  const text = await readFile(new URL("3794.ics", EVENTS_DIR), "utf8");
  const { events } = parseICS(text);
  assert.equal(
    events[0].summary,
    "Hugo Lobo Trio convida Madalena Caldeira – Há Jazz no Parque Mayer",
  );
});

test("DTSTART/DTEND parse correctly for a UTC-form event", async () => {
  const text = await readFile(new URL("3794.ics", EVENTS_DIR), "utf8");
  const { events } = parseICS(text);
  assert.equal(events[0].dtstart.iso, "2026-08-02T18:30:00Z");
  assert.equal(events[0].dtend.iso, "2026-08-02T22:50:00Z");
  assert.equal(events[0].dtstart.isUTC, true);
  assert.equal(events[0].dtend.isUTC, true);
});

test("the observed timezone quirk (UTC DTSTART/DTEND, floating DTSTAMP) is handled without guessing", async () => {
  const files = await loadFixtureFiles();
  for (const { name, text } of files) {
    const { events } = parseICS(text);
    const [event] = events;
    assert.equal(event.dtstart.isUTC, true, `${name} DTSTART should be UTC form in this source`);
    assert.equal(event.dtstart.tzid, null);
    assert.equal(
      event.dtstamp.iso,
      null,
      `${name} DTSTAMP lacks a UTC marker in this source and must not be assumed UTC`,
    );
  }
});

test("escaped commas in DESCRIPTION are unescaped, and unfoldedBlock keeps them escaped", async () => {
  const text = await readFile(new URL("3794.ics", EVENTS_DIR), "utf8");
  const { events } = parseICS(text);
  assert.ok(events[0].description.includes("Madalena Caldeira- voz,"));
  assert.equal(events[0].description.includes("\\,"), false, "parsed field must be unescaped");
  assert.ok(
    events[0].unfoldedBlock.includes("\\,"),
    "unfoldedBlock must retain the original property-value escaping (it is pre-field-decoding text, not a fully decoded field)",
  );
});

test("fields confirmed absent from this source (URL, STATUS, ORGANIZER, recurrence) are null/empty, not fabricated", async () => {
  const files = await loadFixtureFiles();
  for (const { name, text } of files) {
    const { events } = parseICS(text);
    const [event] = events;
    assert.equal(event.url, null, `${name}`);
    assert.equal(event.status, null, `${name}`);
    assert.equal(event.organizer, null, `${name}`);
    assert.equal(Object.keys(event.otherProperties).length, 0, `${name} should have no unmodelled properties`);
  }
});

test("parsing does not mutate the raw fixture file on disk", async () => {
  const path = new URL("3786.ics", EVENTS_DIR);
  const before = await readFile(path, "utf8");
  parseICS(before);
  const after = await readFile(path, "utf8");
  assert.equal(after, before);
});

test("parsing does not mutate the input string, and unfoldedBlock still contains every original property value", async () => {
  const text = await readFile(new URL("3786.ics", EVENTS_DIR), "utf8");
  const snapshot = text;
  const { events } = parseICS(text);
  assert.equal(text, snapshot, "input string must be unchanged after parsing");
  // unfoldedBlock is a rejoin of already-unfolded lines with "\n" — a
  // normalized parser-level view, not a byte-identical copy of the file
  // (see the parseVEvent() doc comment) — but every original property
  // value must still be present in it.
  assert.ok(events[0].unfoldedBlock.includes(events[0].uid));
});

test("no returned parser property is misleadingly named `raw`; unfoldedBlock is explicitly not treated as raw_payload/source-of-record evidence", async () => {
  const text = await readFile(new URL("3786.ics", EVENTS_DIR), "utf8");
  const { events } = parseICS(text);
  const keys = Object.keys(events[0]);

  assert.equal(keys.includes("raw"), false, "no property named simply `raw` should exist");
  assert.equal(keys.includes("raw_payload"), false, "unfoldedBlock must not be exposed under a raw_payload-style name either");
  assert.ok(keys.includes("unfoldedBlock"), "unfoldedBlock must exist");

  // Concretely demonstrate non-byte-identity: unfoldedBlock is rejoined
  // with a hardcoded "\n", so it cannot reflect the file's own original
  // terminator bytes even when those happen to already be bare LF, and it
  // silently drops any blank physical line encountered while unfolding
  // (see unfoldLines()). The fixture file itself — read as `text` above,
  // byte-for-byte as committed under .gitattributes (*.ics -text) — is
  // the actual raw, source-of-record evidence; unfoldedBlock is derived,
  // convenience text only.
  assert.notEqual(
    events[0].unfoldedBlock,
    text,
    "unfoldedBlock must not equal the raw file text (it excludes BEGIN/END markers, calendar-level properties, and any original terminator bytes)",
  );
});

test("no canonical Event identity is generated from any retained fixture", async () => {
  const files = await loadFixtureFiles();
  for (const { text } of files) {
    const { events } = parseICS(text);
    const keys = Object.keys(events[0]);
    for (const forbidden of ["id", "eventId", "event_id", "canonicalEventId"]) {
      assert.equal(keys.includes(forbidden), false);
    }
  }
});

test("fixtures/hot-clube/metadata.json records PER_EVENT_ICS with no central feed found, and 9 retained VEVENTs", async () => {
  const metadata = JSON.parse(await readFile(METADATA_PATH, "utf8"));
  assert.equal(metadata.source_id, "hot-clube-de-portugal");
  assert.equal(metadata.acquisition_shape, "PER_EVENT_ICS");
  assert.equal(metadata.central_feed_found, false);
  assert.equal(metadata.vevents_retained, 9);
  assert.deepEqual(
    [...metadata.retained_event_ids].sort((a, b) => a - b),
    RETAINED_EVENT_IDS.map(Number).sort((a, b) => a - b),
  );
});

test("metadata.json documents the UID-instability finding that the parser itself cannot detect from a single fixture", async () => {
  const metadata = JSON.parse(await readFile(METADATA_PATH, "utf8"));
  assert.match(metadata.findings.uid_stability, /NOT STABLE/);
  assert.match(metadata.findings.stable_identifier, /event_id/);
});

test("the registry's hot-clube-de-portugal entry reflects the proven technical path without touching rights", async () => {
  const registry = JSON.parse(
    await readFile(new URL("../sources/lisbon.json", import.meta.url), "utf8"),
  );
  const entries = registry.entries.filter((e) => e.id === "hot-clube-de-portugal");
  assert.equal(entries.length, 1, "hot-clube-de-portugal must appear exactly once");

  const [entry] = entries;
  assert.equal(entry.monitoring_status, "TECHNICAL_PATH_PROVEN");
  assert.equal(entry.lifecycle_status, "TECHNICALLY_REVIEWED");
  assert.equal(entry.rights_status, "UNKNOWN", "technical proof must not change rights_status");
  assert.equal(entry.acquisition_method, "ICS_CALENDAR", "acquisition_method must not change in this task");
});

test("sources/lisbon.json contains 27 entries (the original 25 plus BOTM-MULTISOURCE-LINKS-01's Capitólio addition and LISBON-PORTO-P1-SOURCE-AUTOMATION-01's LAV addition)", async () => {
  const registry = JSON.parse(
    await readFile(new URL("../sources/lisbon.json", import.meta.url), "utf8"),
  );
  assert.equal(registry.entries.length, 27);
});
