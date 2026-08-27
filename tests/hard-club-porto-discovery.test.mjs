import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deriveDateFromSlugYearAndDayMonth,
  parseHardClubAgendaFragment,
  parseHardClubEventPrice,
} from "../ingestion/hard-club-porto/discovery.mjs";

async function loadAgendaExcerpt() {
  const html = await readFile(new URL("../fixtures/hard-club-porto/agenda-warm-excerpt.html", import.meta.url), "utf8");
  return parseHardClubAgendaFragment(html);
}

async function loadAnomalyExcerpt() {
  return readFile(new URL("../fixtures/hard-club-porto/archive-anomaly-excerpt.html", import.meta.url), "utf8");
}

// 1. fixture acquisition/parsing

test("discovery extracts every real event on the retained warm agenda excerpt", async () => {
  const records = await loadAgendaExcerpt();
  assert.equal(records.length, 5);
  assert.deepEqual(
    records.map((r) => r.source_record_id),
    [
      "351-festival-urbano-11-e-12-de-setembro-2026",
      "johnny-hooker-euro-tour-2026-2026",
      "moonspell-invicta-halloween-2026",
      "u-d-o-porto-hard-club-2027",
      "fresno-eurotour-2027-carta-de-adeus-2027",
    ],
  );
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseHardClubAgendaFragment(""), /non-empty/);
});

test("discovery throws when no event blocks are present, never returns an empty guess", () => {
  assert.throws(() => parseHardClubAgendaFragment("<html><body>no listing here</body></html>"), /event block/);
});

test("source_record_id is the event's own canonical URL-path slug", async () => {
  const records = await loadAgendaExcerpt();
  const johnny = records.find((r) => r.source_record_id === "johnny-hooker-euro-tour-2026-2026");
  assert.ok(johnny);
  assert.equal(johnny.event_url, "https://www.hardclubporto.com/PT/evento/johnny-hooker-euro-tour-2026-2026/");
});

test("title/subtitle are extracted from the <h3> heading and its nested <p class=\"demi\"> subtitle", async () => {
  const records = await loadAgendaExcerpt();
  const johnny = records.find((r) => r.source_record_id === "johnny-hooker-euro-tour-2026-2026");
  assert.equal(johnny.title, "JOHNNY HOOKER");
  assert.equal(johnny.subtitle, "EURO TOUR 2026");

  const moonspell = records.find((r) => r.source_record_id === "moonspell-invicta-halloween-2026");
  assert.equal(moonspell.title, "MOONSPELL");
  assert.equal(moonspell.subtitle, "INVICTA HALLOWEEN");

  // U.D.O.'s own <h3> title spans a real embedded newline in the source's
  // own markup (evidence/ajax-agenda-warm.html) — must still be trimmed to
  // a clean single-line title with no subtitle.
  const udo = records.find((r) => r.source_record_id === "u-d-o-porto-hard-club-2027");
  assert.equal(udo.title, "U.D.O. PORTO. HARD CLUB.");
  assert.equal(udo.subtitle, null);
});

test("room_label/time_text are split from the local_hora field", async () => {
  const records = await loadAgendaExcerpt();
  const johnny = records.find((r) => r.source_record_id === "johnny-hooker-euro-tour-2026-2026");
  assert.equal(johnny.room_label, "Sala 2");
  assert.equal(johnny.time_text, "20H00");
});

// 2. the DETERMINISTIC_CONTEXT date-derivation rule (deriveDateFromSlugYearAndDayMonth)

test("deriveDateFromSlugYearAndDayMonth reproduces the investigation's own worked example exactly", () => {
  assert.equal(
    deriveDateFromSlugYearAndDayMonth("johnny-hooker-euro-tour-2026-2026", "12 Set"),
    "2026-09-12",
  );
});

test("deriveDateFromSlugYearAndDayMonth crosses the real 2026/2027 year boundary correctly using the two real 2027-slug events from retained evidence", () => {
  // Both are genuine events from research/source-investigations/hard-club-porto-02/evidence/ajax-agenda-warm.html
  // (not synthetic): U.D.O. (slug "u-d-o-porto-hard-club-2027", data "29 Jan")
  // and Fresno (slug "fresno-eurotour-2027-carta-de-adeus-2027", data "12 Fev"),
  // both correctly resolving into 2027 despite every other event in the
  // 22-event sample resolving into 2026.
  assert.equal(deriveDateFromSlugYearAndDayMonth("u-d-o-porto-hard-club-2027", "29 Jan"), "2027-01-29");
  assert.equal(
    deriveDateFromSlugYearAndDayMonth("fresno-eurotour-2027-carta-de-adeus-2027", "12 Fev"),
    "2027-02-12",
  );
});

test("date_iso is derived correctly end-to-end for every real record in the fixture, across the year boundary", async () => {
  const records = await loadAgendaExcerpt();
  const byId = Object.fromEntries(records.map((r) => [r.source_record_id, r]));
  assert.equal(byId["351-festival-urbano-11-e-12-de-setembro-2026"].date_iso, "2026-09-11");
  assert.equal(byId["johnny-hooker-euro-tour-2026-2026"].date_iso, "2026-09-12");
  assert.equal(byId["moonspell-invicta-halloween-2026"].date_iso, "2026-10-31");
  assert.equal(byId["u-d-o-porto-hard-club-2027"].date_iso, "2027-01-29");
  assert.equal(byId["fresno-eurotour-2027-carta-de-adeus-2027"].date_iso, "2027-02-12");
});

// 3. the rule must fail loudly, never guess, when the slug carries no trailing -YYYY segment

test("deriveDateFromSlugYearAndDayMonth throws on a slug with no trailing -YYYY segment, never guesses", () => {
  assert.throws(
    () => deriveDateFromSlugYearAndDayMonth("2020", "17 Out"),
    /no trailing "-YYYY" segment/,
  );
});

test("parsing the real genuine anomalous archive record (slug \"2020\", no hyphen-prefixed year) throws rather than resolving a guessed date", async () => {
  const html = await loadAnomalyExcerpt();
  // Sanity: this really is the anomalous record, not a well-formed one.
  assert.match(html, /id="2020" class="post_rel"/);
  assert.match(html, /<p class="data">17 Out<\/p>/);
  assert.throws(() => parseHardClubAgendaFragment(html), /no trailing "-YYYY" segment/);
});

test("deriveDateFromSlugYearAndDayMonth throws on malformed day+month text, never guesses", () => {
  assert.throws(
    () => deriveDateFromSlugYearAndDayMonth("some-event-2026", "sometime in September"),
    /not in the expected "DD Mon" shape/,
  );
});

test("deriveDateFromSlugYearAndDayMonth throws on an unrecognised month abbreviation, never guesses", () => {
  assert.throws(
    () => deriveDateFromSlugYearAndDayMonth("some-event-2026", "12 Xyz"),
    /unrecognised Portuguese month abbreviation/,
  );
});

// 4. price (separate per-event loadevent AJAX fragment)

test("parseHardClubEventPrice extracts the real price from the retained Johnny Hooker loadevent fixture", async () => {
  const html = await readFile(
    new URL("../fixtures/hard-club-porto/loadevent-johnny-hooker-euro-tour-2026-2026.html", import.meta.url),
    "utf8",
  );
  assert.deepEqual(parseHardClubEventPrice(html), { price_text: "25€- 55€" });
});

test("parseHardClubEventPrice extracts the real price from the retained Fresno (2027) loadevent fixture", async () => {
  const html = await readFile(
    new URL("../fixtures/hard-club-porto/loadevent-fresno-eurotour-2027-carta-de-adeus-2027.html", import.meta.url),
    "utf8",
  );
  assert.deepEqual(parseHardClubEventPrice(html), { price_text: "30€-120€" });
});

test("parseHardClubEventPrice rejects empty input", () => {
  assert.throws(() => parseHardClubEventPrice(""), /non-empty/);
});

test("parseHardClubEventPrice throws when no price element is present, never guesses", () => {
  assert.throws(() => parseHardClubEventPrice("<div class=\"evento_detalhe\">no price here</div>"), /preco/);
});

// 5. deterministic rerun

test("parsing is deterministic against the same retained fixture", async () => {
  const html = await readFile(new URL("../fixtures/hard-club-porto/agenda-warm-excerpt.html", import.meta.url), "utf8");
  assert.deepEqual(parseHardClubAgendaFragment(html), parseHardClubAgendaFragment(html));
});
