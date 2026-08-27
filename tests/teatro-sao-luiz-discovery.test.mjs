import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseTeatroSaoLuizProgrammeLinks,
  extractTeatroSaoLuizSeasonLabel,
  extractTeatroSaoLuizEventFacts,
  deriveSeasonYear,
  combineDateWithSeasonYear,
} from "../ingestion/teatro-sao-luiz/discovery.mjs";

const FIXTURE_DIR = "../fixtures/teatro-sao-luiz";

async function readFixture(name) {
  return readFile(new URL(`${FIXTURE_DIR}/${name}`, import.meta.url), "utf8");
}

async function loadListHtml() {
  return readFixture("list-page-excerpt.html");
}

// ---------------------------------------------------------------------
// 1. parseTeatroSaoLuizProgrammeLinks
// ---------------------------------------------------------------------

test("parseTeatroSaoLuizProgrammeLinks finds every retained event card's own detail-page link", async () => {
  const html = await loadListHtml();
  const links = parseTeatroSaoLuizProgrammeLinks(html);
  assert.deepEqual(links, [
    "https://www.teatrosaoluiz.pt/en/performance/batucadeiras-das-olaias-pt/",
    "https://www.teatrosaoluiz.pt/en/performance/picadeiro-fest-2026/",
    "https://www.teatrosaoluiz.pt/en/performance/o-pai/",
    "https://www.teatrosaoluiz.pt/en/performance/andre-rosinha-trio/",
    "https://www.teatrosaoluiz.pt/en/performance/vacuo/",
  ]);
});

test("parseTeatroSaoLuizProgrammeLinks rejects empty input", () => {
  assert.throws(() => parseTeatroSaoLuizProgrammeLinks(""), /non-empty/);
  assert.throws(() => parseTeatroSaoLuizProgrammeLinks(null), /non-empty/);
});

test("parseTeatroSaoLuizProgrammeLinks returns an empty array (never throws) for a page with no event cards", () => {
  assert.deepEqual(parseTeatroSaoLuizProgrammeLinks("<html><body>no cards here</body></html>"), []);
});

test("parseTeatroSaoLuizProgrammeLinks deduplicates repeated hrefs", () => {
  const html = `
    <div class='card event-item'><a href="https://www.teatrosaoluiz.pt/en/performance/x/">X</a></div>
    <div class='card event-item'><a href="https://www.teatrosaoluiz.pt/en/performance/x/">X again</a></div>
  `;
  assert.deepEqual(parseTeatroSaoLuizProgrammeLinks(html), ["https://www.teatrosaoluiz.pt/en/performance/x/"]);
});

// ---------------------------------------------------------------------
// 2. extractTeatroSaoLuizSeasonLabel
// ---------------------------------------------------------------------

test("extractTeatroSaoLuizSeasonLabel reads the retained list page's own season label, stripping the '-en' language suffix", async () => {
  const html = await loadListHtml();
  assert.equal(extractTeatroSaoLuizSeasonLabel(html), "2026-2027");
});

test("extractTeatroSaoLuizSeasonLabel throws when no data-temporada-actual attribute is present", () => {
  assert.throws(() => extractTeatroSaoLuizSeasonLabel("<html><body>no season here</body></html>"), /season label/);
});

test("extractTeatroSaoLuizSeasonLabel throws on a non-consecutive-year season label, never guesses", () => {
  assert.throws(
    () => extractTeatroSaoLuizSeasonLabel('<body data-temporada-actual="2026-2029">'),
    /consecutive/,
  );
});

// ---------------------------------------------------------------------
// 3. extractTeatroSaoLuizEventFacts (against all 4 real, retained events)
// ---------------------------------------------------------------------

const REAL_EVENTS = [
  {
    key: "batucadeiras",
    title: "Batucadeiras das Olaias (PT)",
    day_month_text: "9 September",
    weekday_text: "Wednesday",
    time_text: "5:30pm",
    venue_text: "Largo do Picadeiro",
    event_url: "https://www.teatrosaoluiz.pt/en/performance/batucadeiras-das-olaias-pt/",
    wp_shortlink_post_id: "35378",
  },
  {
    key: "andre-rosinha",
    title: "André Rosinha Trio",
    day_month_text: "14 January",
    weekday_text: "Thursday",
    time_text: "7pm",
    venue_text: "Sala Bernardo Sassetti",
    event_url: "https://www.teatrosaoluiz.pt/en/performance/andre-rosinha-trio/",
    wp_shortlink_post_id: "35376",
  },
  {
    key: "o-pai",
    title: "O PAI (The Father)",
    day_month_text: "16 to 27 September",
    weekday_text: "Wednesday to Saturday",
    time_text: "8.00 pm; Sunday, 5.30 pm",
    venue_text: "Sala Luis Miguel Cintra",
    event_url: "https://www.teatrosaoluiz.pt/en/performance/o-pai/",
    wp_shortlink_post_id: "35368",
  },
  {
    key: "vacuo",
    title: "VÁCUO",
    day_month_text: "28 to 31 January",
    weekday_text: "Thursday to Saturday",
    time_text: "7:30 pm; Sunday, 4 pm",
    venue_text: "Sala Mário Viegas",
    event_url: "https://www.teatrosaoluiz.pt/en/performance/vacuo/",
    wp_shortlink_post_id: "35306",
  },
];

for (const expected of REAL_EVENTS) {
  test(`extractTeatroSaoLuizEventFacts extracts the real, retained facts for "${expected.title}"`, async () => {
    const html = await readFixture(`detail-${expected.key}.html`);
    const headersText = await readFixture(`detail-${expected.key}-headers.txt`);
    const facts = extractTeatroSaoLuizEventFacts(html, { headersText });
    assert.equal(facts.title, expected.title);
    assert.equal(facts.day_month_text, expected.day_month_text);
    assert.equal(facts.weekday_text, expected.weekday_text);
    assert.equal(facts.time_text, expected.time_text);
    assert.equal(facts.venue_text, expected.venue_text);
    assert.equal(facts.event_url, expected.event_url);
    assert.equal(facts.wp_shortlink_post_id, expected.wp_shortlink_post_id);
  });
}

test("extractTeatroSaoLuizEventFacts's wp_shortlink_post_id is null (not guessed) when no headersText is supplied", async () => {
  const html = await readFixture("detail-batucadeiras.html");
  const facts = extractTeatroSaoLuizEventFacts(html);
  assert.equal(facts.wp_shortlink_post_id, null);
  // every other field is still extracted from the HTML body itself
  assert.equal(facts.title, "Batucadeiras das Olaias (PT)");
});

test("extractTeatroSaoLuizEventFacts anchors on the 'Dates and Schedules' label specifically, not O Pai's unrelated Accessibility/audio-description sub-schedule", async () => {
  const html = await readFixture("detail-o-pai.html");
  const facts = extractTeatroSaoLuizEventFacts(html);
  // The Accessibility block states a DIFFERENT date range ("25 and 27
  // September") for audio-described performances only — the extractor
  // must never pick that up as the event's own day_month_text.
  assert.equal(facts.day_month_text, "16 to 27 September");
  assert.notEqual(facts.day_month_text, "25 and 27 September");
});

test("extractTeatroSaoLuizEventFacts rejects empty input", () => {
  assert.throws(() => extractTeatroSaoLuizEventFacts(""), /non-empty/);
});

test("extractTeatroSaoLuizEventFacts throws when the page has no <title> tag", () => {
  assert.throws(() => extractTeatroSaoLuizEventFacts("<html><body>no title</body></html>"), /title/);
});

test("extractTeatroSaoLuizEventFacts throws when the page has no canonical event URL", () => {
  const html = `<title>X - Teatro São Luiz</title><body>no canonical link</body>`;
  assert.throws(() => extractTeatroSaoLuizEventFacts(html), /canonical/);
});

test("extractTeatroSaoLuizEventFacts throws when the page has no 'Dates and Schedules' field", () => {
  const html = `<title>X - Teatro São Luiz</title><link rel="canonical" href="https://www.teatrosaoluiz.pt/en/performance/x/" />`;
  assert.throws(() => extractTeatroSaoLuizEventFacts(html), /Dates and Schedules/);
});

// ---------------------------------------------------------------------
// 4. deriveSeasonYear — THE central month-8-12/1-7 rule
// ---------------------------------------------------------------------

test("deriveSeasonYear: month 8-12 (Aug-Dec) maps to the season label's own START year", () => {
  assert.equal(deriveSeasonYear("2026-2027", 8), 2026);
  assert.equal(deriveSeasonYear("2026-2027", 9), 2026);
  assert.equal(deriveSeasonYear("2026-2027", 10), 2026);
  assert.equal(deriveSeasonYear("2026-2027", 11), 2026);
  assert.equal(deriveSeasonYear("2026-2027", 12), 2026);
});

test("deriveSeasonYear: month 1-7 (Jan-Jul) maps to the season label's own END year", () => {
  assert.equal(deriveSeasonYear("2026-2027", 1), 2027);
  assert.equal(deriveSeasonYear("2026-2027", 2), 2027);
  assert.equal(deriveSeasonYear("2026-2027", 3), 2027);
  assert.equal(deriveSeasonYear("2026-2027", 4), 2027);
  assert.equal(deriveSeasonYear("2026-2027", 5), 2027);
  assert.equal(deriveSeasonYear("2026-2027", 6), 2027);
  assert.equal(deriveSeasonYear("2026-2027", 7), 2027);
});

test("deriveSeasonYear throws on a malformed season label, never guesses", () => {
  assert.throws(() => deriveSeasonYear("2026", 9), /season label/);
  assert.throws(() => deriveSeasonYear("2026-2028", 9), /consecutive/);
  assert.throws(() => deriveSeasonYear(null, 9), /season label/);
});

test("deriveSeasonYear throws on an out-of-range month number, never guesses", () => {
  assert.throws(() => deriveSeasonYear("2026-2027", 0), /month number/);
  assert.throws(() => deriveSeasonYear("2026-2027", 13), /month number/);
  assert.throws(() => deriveSeasonYear("2026-2027", 9.5), /month number/);
});

// ---------------------------------------------------------------------
// 5. combineDateWithSeasonYear — full YYYY-MM-DD, exercising REAL events
//    from BOTH sides of the year boundary
// ---------------------------------------------------------------------

test("combineDateWithSeasonYear resolves a real month>=8 event (Batucadeiras, 9 September) to the season's START year", () => {
  assert.equal(combineDateWithSeasonYear("9 September", "2026-2027"), "2026-09-09");
});

test("combineDateWithSeasonYear resolves a real month<=7 event (André Rosinha Trio, 14 January) to the season's END year", () => {
  assert.equal(combineDateWithSeasonYear("14 January", "2026-2027"), "2027-01-14");
});

test("combineDateWithSeasonYear resolves a real multi-day month>=8 range (O PAI, 16 to 27 September) to the START day on the season's START year", () => {
  assert.equal(combineDateWithSeasonYear("16 to 27 September", "2026-2027"), "2026-09-16");
});

test("combineDateWithSeasonYear resolves a real multi-day month<=7 range (VÁCUO, 28 to 31 January) to the START day on the season's END year", () => {
  assert.equal(combineDateWithSeasonYear("28 to 31 January", "2026-2027"), "2027-01-28");
});

test("combineDateWithSeasonYear throws on unparseable day_month_text, never guesses", () => {
  assert.throws(() => combineDateWithSeasonYear("sometime in September", "2026-2027"), /parse/);
  assert.throws(() => combineDateWithSeasonYear("", "2026-2027"), /non-empty/);
});

test("combineDateWithSeasonYear throws on an unrecognised month name, never guesses", () => {
  assert.throws(() => combineDateWithSeasonYear("9 Undecember", "2026-2027"), /unrecognised month/);
});

test("combineDateWithSeasonYear throws on a malformed season label, never guesses", () => {
  assert.throws(() => combineDateWithSeasonYear("9 September", "not-a-season"), /season label/);
});

// ---------------------------------------------------------------------
// 6. end-to-end: real list page -> real season label -> real detail pages
// ---------------------------------------------------------------------

test("end-to-end: the retained list page's own season label combines correctly with all 4 real detail pages' own day_month_text", async () => {
  const listHtml = await loadListHtml();
  const seasonLabel = extractTeatroSaoLuizSeasonLabel(listHtml);
  assert.equal(seasonLabel, "2026-2027");

  const expectedDates = {
    batucadeiras: "2026-09-09",
    "andre-rosinha": "2027-01-14",
    "o-pai": "2026-09-16",
    vacuo: "2027-01-28",
  };

  for (const [key, expectedDate] of Object.entries(expectedDates)) {
    const detailHtml = await readFixture(`detail-${key}.html`);
    const facts = extractTeatroSaoLuizEventFacts(detailHtml);
    assert.equal(combineDateWithSeasonYear(facts.day_month_text, seasonLabel), expectedDate);
  }
});
