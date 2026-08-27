// Parses genuinely retrieved Fama D'Alfama "Agenda de Fados" monthly
// calendar page HTML (https://famadalfama.pt/agenda-de-fados-em-lisboa/)
// into small, structured per-night discovery records.
//
// Built entirely from research/source-investigations/fama-dalfama-lisbon-01/
// (decision: READY_FOR_ACTIVATION) — see that investigation's
// investigation.json and evidence/offline-proof.mjs, which this module's
// parsing regexes and date-derivation rule are directly and deliberately
// modelled on (the exact same day-block shape, mechanically re-proven
// there against the full retained 31-day page). This module performs NO
// network I/O and is never re-fetched from the live site; it only parses
// HTML handed to it by a caller (a retained fixture in tests, or a future
// governed collector run).
//
// Page shape: the page states its own month/year exactly ONCE, in a
// page-level heading (e.g. "AGOSTO 2026" — always fully upper-case,
// distinguishing it structurally from every per-day weekday heading,
// which is title-case, e.g. "Sábado", "Segunda-feira"). Every day-block
// beneath that heading pairs its own "DD/MM" heading with its own
// Portuguese weekday name and a performer-names paragraph — but never
// restates the year, and never repeats the month/year heading itself.
//
// DETERMINISTIC_CONTEXT date derivation (matches
// docs/SOURCE_INVESTIGATION_POLICY.md's "Field-value basis (v1.2)"
// model, and this investigation's own field_assessment.start_date):
// the page's own single month/year heading mechanically governs every
// day-block on the page — never today's real-world date, never a
// plausibility guess. This module requires EXACTLY ONE such heading
// (matching this investigation's own retained, mechanically-proven
// finding for this source) and fails closed (throws) rather than
// guessing if that invariant does not hold, or if a day-block's own
// "DD/MM" month digits ever disagree with the heading's month.
//
// As an extra, deterministic self-consistency check (the same one
// evidence/offline-proof.mjs already performed against the full 31-day
// page), every day-block's own stated Portuguese weekday name is
// cross-checked against real Gregorian calendar arithmetic for the
// heading's own stated year — never against "today". A mismatch is
// treated as malformed/self-contradictory source data and throws, rather
// than being silently trusted.
//
// Stable identifier: field_assessment.source_record_id.state is honestly
// NOT_PRESENT — this source exposes no id token, no per-night permalink,
// and no JSON-LD @id for any individual night. Per that same field's
// documented ALTERNATIVE IDENTITY STRATEGY, this module synthesizes a
// composite (venue key + derived calendar date) key as
// `source_record_id`, e.g. "fama-dalfama:2026-08-17" — safe because the
// source's own structure guarantees at most one day-block per calendar
// date (mechanically confirmed for all 31 real day-blocks: strictly
// ascending 1..31, no duplicate dates). This module defensively re-checks
// that no two day-blocks in the same parse ever produce the same date,
// and throws rather than silently overwriting one.
//
// Shared page-level time: field_assessment.time.state is PROVEN, but
// only as a single page-level constant ("Fado a partir das 20h30"),
// stated once in the page's shared footer text, never repeated per
// day-block. This module retains it as `time_text` on every returned
// record (the same value on all of them) — never a per-night value, and
// null when the page genuinely does not carry this text at all (never
// guessed).

export const VENUE_KEY = "fama-dalfama"; // matches ingestion/fama-dalfama/observation-adapter.mjs's SOURCE_ID

const MONTH_HEADING_RE =
  /<h2 class="elementor-heading-title elementor-size-default">([A-ZÇÃÕÁÉÍÓÚÀÂÊÎÔÛ]+) (\d{4})<\/h2>/g;

const DAY_BLOCK_RE =
  /<p class="elementor-heading-title elementor-size-default">(\d{2})\/(\d{2})<\/p>[\s\S]*?<h2 class="elementor-heading-title elementor-size-default">([^<]+)<\/h2>[\s\S]*?<p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph"[^>]*>([\s\S]*?)<\/p>/g;

const TIME_TEXT_RE = /Abrimos às (\d{2}h\d{2})[\s\S]{0,120}?Fado a partir das (\d{2}h\d{2})/;

const PT_MONTHS_UPPER = {
  JANEIRO: "01",
  FEVEREIRO: "02",
  MARÇO: "03",
  ABRIL: "04",
  MAIO: "05",
  JUNHO: "06",
  JULHO: "07",
  AGOSTO: "08",
  SETEMBRO: "09",
  OUTUBRO: "10",
  NOVEMBRO: "11",
  DEZEMBRO: "12",
};

// Portuguese weekday names indexed the same way JavaScript's own
// Date#getUTCDay() indexes them (0 = Sunday .. 6 = Saturday) — used only
// to cross-check the source's OWN stated weekday text against real
// Gregorian calendar arithmetic for the source's OWN stated year/month/
// day, never to derive a date from "today".
const WEEKDAY_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function gregorianWeekdayPt(year, month1to12, day) {
  const dt = new Date(Date.UTC(year, month1to12 - 1, day));
  return WEEKDAY_PT[dt.getUTCDay()];
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Split one day-block's raw performer paragraph (which uses <br
 * ...hardBreak.../> to separate performer lines) into individual,
 * entity-decoded, trimmed lines, dropping any genuinely empty ones.
 */
function performerLines(rawParagraph) {
  return rawParagraph
    .split(/<br[^>]*\/?>/)
    .map((line) => decodeEntities(line.replace(/<[^>]+>/g, "")).trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse one Fama D'Alfama "Agenda de Fados" monthly-calendar HTML document
 * into discovery records, one per day-block (source order preserved).
 *
 * Throws on empty/non-string input, on anything other than exactly one
 * page-level month/year heading, on a month name this module does not
 * recognise, on zero day-blocks found at all, on a day-block whose own
 * "DD/MM" month digits disagree with the page heading's month, on a
 * day-block whose own stated weekday name does not match real Gregorian
 * calendar arithmetic, on a day-block with no performer text, and on two
 * day-blocks that would otherwise collide on the same derived date — never
 * guesses past any of these.
 *
 * Each record: `{ source_record_id, title, date_iso, weekday_text,
 * performers_text, time_text, raw_day_block_text }`.
 */
export function parseFamaDAlfamaAgenda(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Fama D'Alfama agenda HTML");
  }

  const monthHeadingMatches = [...html.matchAll(MONTH_HEADING_RE)];
  if (monthHeadingMatches.length !== 1) {
    throw new Error(
      `Expected exactly one page-level month/year heading (e.g. "AGOSTO 2026"), found ${monthHeadingMatches.length} — cannot mechanically derive a governing month/year without guessing`,
    );
  }
  const [, monthNameUpper, yearText] = monthHeadingMatches[0];
  const monthNumber = PT_MONTHS_UPPER[monthNameUpper];
  if (!monthNumber) {
    throw new Error(`Unrecognised Portuguese month name "${monthNameUpper}" in page heading`);
  }
  const year = Number(yearText);

  const timeMatch = TIME_TEXT_RE.exec(html);
  const timeText = timeMatch ? timeMatch[2] : null;
  const opensTimeText = timeMatch ? timeMatch[1] : null;

  const seenDates = new Set();
  const records = [];

  DAY_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = DAY_BLOCK_RE.exec(html)) !== null) {
    const [rawDayBlockText, dd, mm, weekdayRaw, rawParagraph] = match;

    if (mm !== monthNumber) {
      throw new Error(
        `Day-block "${dd}/${mm}" disagrees with the page heading's month (${monthNumber}) — cannot mechanically resolve without guessing`,
      );
    }

    const weekdayText = weekdayRaw.trim();
    const day = Number(dd);
    const computedWeekday = gregorianWeekdayPt(year, Number(monthNumber), day);
    if (computedWeekday !== weekdayText) {
      throw new Error(
        `Day-block "${dd}/${mm}/${year}" states weekday "${weekdayText}", but real Gregorian calendar arithmetic says "${computedWeekday}" — self-contradictory source data, not guessed past`,
      );
    }

    const performers = performerLines(rawParagraph);
    if (performers.length === 0) {
      throw new Error(`Day-block "${dd}/${mm}/${year}" has no performer text — cannot derive a title without guessing`);
    }

    const dateIso = `${year}-${monthNumber}-${dd}`;
    if (seenDates.has(dateIso)) {
      throw new Error(`Duplicate day-block for derived date ${dateIso} — this source's own 1:1 date invariant does not hold`);
    }
    seenDates.add(dateIso);

    records.push({
      source_record_id: `${VENUE_KEY}:${dateIso}`,
      title: performers.join(" | "),
      date_iso: dateIso,
      weekday_text: weekdayText,
      performers_text: performers,
      time_text: timeText,
      opens_time_text: opensTimeText,
      raw_day_block_text: rawDayBlockText,
    });
  }

  if (records.length === 0) {
    throw new Error("Found a page-level month/year heading but zero day-blocks — malformed/unexpected page shape");
  }

  return records;
}
