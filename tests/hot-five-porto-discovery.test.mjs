import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseHotFiveShows } from "../ingestion/hot-five-porto/discovery.mjs";

async function loadFixtureHtml() {
  return readFile(new URL("../fixtures/hot-five-porto/shows-excerpt.html", import.meta.url), "utf8");
}

test("parses every real event card on the retained fixture excerpt", async () => {
  const html = await loadFixtureHtml();
  const records = parseHotFiveShows(html);
  assert.equal(records.length, 6);
  assert.deepEqual(
    records.map((r) => r.title),
    [
      "All About... Blues",
      "Amy Winehouse (Back to Amy)",
      "The House of Gatsby",
      "Jam Session",
      "Exceptionally Closed!",
      "Live Jazz",
    ],
  );
});

test("date_text is retained verbatim, no year, exactly as printed on the source", async () => {
  const html = await loadFixtureHtml();
  const records = parseHotFiveShows(html);
  assert.deepEqual(
    records.map((r) => r.date_text),
    ["02 jul", "03 jul", "10 & 11 jul", "12 jul", "06 ago", "28 ago"],
  );
  for (const record of records) {
    assert.doesNotMatch(record.date_text, /\b(19|20)\d{2}\b/, `date_text "${record.date_text}" must never contain a year`);
  }
});

test("a <br>-joined title is decoded into a single normalized string", async () => {
  const html = await loadFixtureHtml();
  const records = parseHotFiveShows(html);
  const amy = records.find((r) => r.date_text === "03 jul");
  assert.equal(amy.title, "Amy Winehouse (Back to Amy)");
});

test("a card with a lebillet.eu ticket href extracts both the URL and its numeric id", async () => {
  const html = await loadFixtureHtml();
  const records = parseHotFiveShows(html);
  const allAboutBlues = records.find((r) => r.title === "All About... Blues");
  assert.equal(allAboutBlues.ticketing_url, "https://lebillet.eu/event/1877/all-about-blues-02-julho-Porto-POR");
  assert.equal(allAboutBlues.ticketing_numeric_id, "1877");

  const liveJazz = records.find((r) => r.title === "Live Jazz");
  assert.equal(liveJazz.ticketing_url, "https://lebillet.eu/event/1981/live-jazz-28-agosto-Porto-POR");
  assert.equal(liveJazz.ticketing_numeric_id, "1981");
});

test("a card with two ticket buttons (combined multi-day date) keeps only the first href/id", async () => {
  const html = await loadFixtureHtml();
  const records = parseHotFiveShows(html);
  const gatsby = records.find((r) => r.title === "The House of Gatsby");
  assert.equal(gatsby.date_text, "10 & 11 jul");
  assert.equal(gatsby.ticketing_url, "https://lebillet.eu/event/1919");
  assert.equal(gatsby.ticketing_numeric_id, "1919");
});

test("a card whose button carries no href produces null ticketing_url and null ticketing_numeric_id", async () => {
  const html = await loadFixtureHtml();
  const records = parseHotFiveShows(html);
  const jamSession = records.find((r) => r.title === "Jam Session");
  assert.equal(jamSession.ticketing_url, null);
  assert.equal(jamSession.ticketing_numeric_id, null);

  const closed = records.find((r) => r.title === "Exceptionally Closed!");
  assert.equal(closed.ticketing_url, null);
  assert.equal(closed.ticketing_numeric_id, null);
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseHotFiveShows(""), /non-empty/);
  assert.throws(() => parseHotFiveShows(null), /non-empty/);
});

test("discovery throws when no event-card marker is present, never guesses", () => {
  assert.throws(() => parseHotFiveShows("<html><body>no listing here</body></html>"), /icon-box/);
});

test("discovery throws on a card missing its required title, never guesses", () => {
  const malformed = `<div data-widget_type="icon-box.default"><p class="elementor-icon-box-description">02 jul</p></div>`;
  assert.throws(() => parseHotFiveShows(malformed), /title/);
});

test("discovery throws on a card missing its required date text, never guesses", () => {
  const malformed = `<div data-widget_type="icon-box.default"><h3 class="elementor-icon-box-title"><span >A Show</span></h3></div>`;
  assert.throws(() => parseHotFiveShows(malformed), /date text/);
});

test("discovery is deterministic against the same retained fixture", async () => {
  const html = await loadFixtureHtml();
  assert.deepEqual(parseHotFiveShows(html), parseHotFiveShows(html));
});
