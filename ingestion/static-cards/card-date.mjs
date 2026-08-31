// BEATMAPPED-STATIC-CARD-TEXT-DATE-ACQUISITION-01 — generic, hostname-free
// date resolution for static event cards.
//
// WHY THIS EXISTS. ingestion/static-cards/collector.mjs previously accepted
// a card's date ONLY from a machine-readable <time datetime="YYYY-MM-DD">.
// The Berlin zero-event triage (research/source-investigations/
// berlin-zero-event-failure-triage-01/) measured five governed sources whose
// cards are correctly detected and correctly titled, and on which NOT ONE
// card contains a <time> element at all — while the same cards visibly carry
// their date in text. Every candidate was therefore rejected and the source
// terminated SUPPORTED_COLLECTOR_NO_VALID_EVENTS with zero records.
//
// THE SAFETY RULE THIS MODULE EXISTS TO ENFORCE. A missing year must NEVER
// be supplied by today's date, the current calendar year, plausibility, or
// "obvious" human inference. That is the single worst failure mode this
// project has (docs/SOURCE_INVESTIGATION_POLICY.md, "The date/time rule").
// So this module resolves a date from exactly three sources, in order, and
// otherwise returns null — a rejected card, never a guessed one:
//
//   1. MACHINE_READABLE_DATETIME  — the card's own <time datetime="ISO">.
//                                   Unchanged, and still first.
//   2. COMPLETE_TEXT_DATE         — the card's own text already states a
//                                   full day+month+year.
//   3. DETERMINISTIC_CONTEXT_YEAR — the card states day+month, and the
//                                   nearest preceding first-party heading
//                                   states that SAME month plus a year.
//                                   Policy v1.2 `DETERMINISTIC_CONTEXT`.
//
// NOTHING HERE READS THE CLOCK. There is deliberately no `new Date()`,
// `Date.now()`, or current-year reference anywhere in this file, and
// tests/static-card-date-text.test.mjs asserts that both statically and
// behaviourally (same fixture, different mocked system clocks, identical
// result). The collector's pre-existing past-event cutoff is a separate,
// unchanged concern driven by the retained document's own retrieval
// timestamp — never by this module.

/** English + German month names (full and common abbreviations), lowercased. */
const MONTHS = new Map(Object.entries({
  jan: 1, january: 1, januar: 1, jän: 1, jaen: 1,
  feb: 2, february: 2, februar: 2,
  mar: 3, march: 3, mär: 3, maer: 3, marz: 3, "märz": 3, mrz: 3,
  apr: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, okt: 10, october: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, dez: 12, december: 12, dezember: 12,
}));

const pad = (value) => String(value).padStart(2, "0");
const iso = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

/** A month token only counts when the WHOLE token is a known month name — never a prefix match. */
function monthFromWord(word) {
  return MONTHS.get(String(word ?? "").toLowerCase().replace(/\.$/, "")) ?? null;
}

function validDay(month, day, year) {
  if (!(day >= 1 && day <= 31) || !(month >= 1 && month <= 12)) return false;
  const lengths = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

const YEAR = "(20[0-9]{2})";
const DAY = "([0-9]{1,2})";
// Deliberately anchored on word boundaries so "1926" or a phone number can
// never be read as a date.
const ISO_RE = new RegExp(`\\b${YEAR}-([0-9]{2})-([0-9]{2})\\b`);
const NUMERIC_RE = new RegExp(`\\b${DAY}[.\\-/ ]${DAY}[.\\-/ ]${YEAR}\\b`);
const DAY_MONTHNAME_YEAR_RE = new RegExp(`\\b${DAY}\\.?\\s*([A-Za-zÄÖÜäöüéè]{3,9})\\.?\\s+${YEAR}\\b`);
const MONTHNAME_DAY_YEAR_RE = new RegExp(`\\b([A-Za-zÄÖÜäöüéè]{3,9})\\.?\\s+${DAY}(?:st|nd|rd|th)?,?\\s+${YEAR}\\b`);

/**
 * Resolve a COMPLETE date the card's own text already states — day, month
 * and a four-digit year, all present. Returns null (never a guess) when the
 * text is incomplete, malformed, or genuinely ambiguous.
 *
 * AMBIGUITY IS REJECTED, NOT RESOLVED. A purely numeric "05.06.2026" could
 * be 5 June or 6 May and this module has no first-party evidence saying
 * which, so it returns null. A numeric form is only accepted when one
 * component is >= 13 and therefore can only be the day (e.g. "26 08 2026").
 */
export function parseCompleteCardDate(text, { numericOrder = null, numericOrderEvidence = [] } = {}) {
  const value = String(text ?? "").replace(/\s+/g, " ");

  const isoMatch = ISO_RE.exec(value);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (!validDay(Number(month), Number(day), Number(year))) return null;
    return { iso: iso(year, Number(month), Number(day)), basis: "COMPLETE_TEXT_DATE", inputs: [isoMatch[0]] };
  }

  const dmy = DAY_MONTHNAME_YEAR_RE.exec(value);
  if (dmy) {
    const month = monthFromWord(dmy[2]);
    if (month && validDay(month, Number(dmy[1]), Number(dmy[3]))) {
      return { iso: iso(dmy[3], month, Number(dmy[1])), basis: "COMPLETE_TEXT_DATE", inputs: [dmy[0]] };
    }
  }

  const mdy = MONTHNAME_DAY_YEAR_RE.exec(value);
  if (mdy) {
    const month = monthFromWord(mdy[1]);
    if (month && validDay(month, Number(mdy[2]), Number(mdy[3]))) {
      return { iso: iso(mdy[3], month, Number(mdy[2])), basis: "COMPLETE_TEXT_DATE", inputs: [mdy[0]] };
    }
  }

  const numeric = NUMERIC_RE.exec(value);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    // A component >= 13 can only be the day, so the reading is settled by
    // the card's own text.
    if (first >= 13) return validDay(second, first, year) ? { iso: iso(year, second, first), basis: "COMPLETE_TEXT_DATE", inputs: [numeric[0]] } : null;
    if (second >= 13) return validDay(first, second, year) ? { iso: iso(year, first, second), basis: "COMPLETE_TEXT_DATE", inputs: [numeric[0]] } : null;
    // Identical components ("09 09 2026") read the same either way, so
    // there is nothing to disambiguate.
    if (first === second) return validDay(first, second, year) ? { iso: iso(year, first, second), basis: "COMPLETE_TEXT_DATE", inputs: [numeric[0]] } : null;
    // Genuinely ambiguous. Accept ONLY when the document itself proves its
    // own ordering convention (see inferNumericDateOrder) — never by
    // locale assumption, convention, or plausibility.
    if (numericOrder === "DAY_FIRST" && validDay(second, first, year)) {
      return { iso: iso(year, second, first), basis: "DETERMINISTIC_CONTEXT_NUMERIC_ORDER", inputs: [numeric[0]], derivation: numericOrderDerivation(numeric[0], numericOrder, numericOrderEvidence) };
    }
    if (numericOrder === "MONTH_FIRST" && validDay(first, second, year)) {
      return { iso: iso(year, first, second), basis: "DETERMINISTIC_CONTEXT_NUMERIC_ORDER", inputs: [numeric[0]], derivation: numericOrderDerivation(numeric[0], numericOrder, numericOrderEvidence) };
    }
    return null;
  }

  return null;
}

function numericOrderDerivation(matched, order, evidence) {
  return {
    rule: "This numeric date's day/month order is not settled by the value itself (both components are <= 12). It is settled by the SAME document's own unambiguous numeric dates — instances where one component is >= 13 and therefore can only be the day. Every such instance in the document agrees on one order, so that order is applied. If the document contained no unambiguous instance, or its instances disagreed, the card is rejected instead. No locale, convention, calendar or clock input participates.",
    inputs: [matched, `document numeric order proven ${order} by: ${evidence.join(", ")}`],
  };
}

/**
 * Prove a document's own numeric day/month ordering from its own
 * unambiguous instances — a date containing a component >= 13 can only be
 * read one way. Returns "DAY_FIRST", "MONTH_FIRST", or null when the
 * document offers no unambiguous instance, or offers contradictory ones.
 * Null means "reject the ambiguous cards", never "pick a convention".
 */
export function inferNumericDateOrder(html) {
  const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const dayFirst = [];
  const monthFirst = [];
  for (const match of text.matchAll(new RegExp(`\\b${DAY}[.\\-/ ]${DAY}[.\\-/ ]${YEAR}\\b`, "g"))) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first >= 13 && second <= 12) dayFirst.push(match[0]);
    else if (second >= 13 && first <= 12) monthFirst.push(match[0]);
  }
  if (dayFirst.length && monthFirst.length) return { order: null, evidence: [...dayFirst.slice(0, 3), ...monthFirst.slice(0, 3)] };
  if (dayFirst.length) return { order: "DAY_FIRST", evidence: [...new Set(dayFirst)].slice(0, 3) };
  if (monthFirst.length) return { order: "MONTH_FIRST", evidence: [...new Set(monthFirst)].slice(0, 3) };
  return { order: null, evidence: [] };
}

/**
 * Every first-party heading on the page that states a month AND a year —
 * e.g. `<h2>September 2026</h2>` — in document order, with the byte offset
 * it occupies. This is the only year context this module recognises: a
 * heading the source itself wrote, not an incidental year in a footer,
 * a copyright line, or a script blob.
 */
export function extractMonthYearHeadings(html) {
  const body = String(html ?? "");
  const headings = [];
  for (const match of body.matchAll(/<(h[1-4])\b[^>]*>([\s\S]{0,300}?)<\/\1>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const found = /\b([A-Za-zÄÖÜäöüéè]{3,9})\.?\s+(20[0-9]{2})\b/.exec(text);
    if (!found) continue;
    const month = monthFromWord(found[1]);
    if (!month) continue;
    headings.push({ index: match.index, month, year: Number(found[2]), text });
  }
  return headings;
}

/**
 * Derive a card's full date from the card's own day+month plus the nearest
 * PRECEDING month/year heading — policy v1.2 `DETERMINISTIC_CONTEXT`.
 *
 * Two guards make this a mechanical combination rather than an assumption:
 *
 *  - the card must state its own MONTH, not merely a day, and that month
 *    must EQUAL the governing heading's month. A card filed under a heading
 *    whose month it contradicts is rejected outright rather than silently
 *    re-dated. (This is deliberately stricter than the policy's minimum,
 *    which permits day-only inheritance: requiring the month gives the
 *    combination an independent cross-check, and the real sources this was
 *    built for supply it.)
 *  - only headings BEFORE the card count, and only the nearest one governs,
 *    so a later section can never reach backwards.
 *
 * Returns null when no preceding month/year heading exists, when the card
 * states no day+month, or when the months disagree.
 */
export function deriveContextualCardDate(cardText, { headings = [], cardIndex = 0 } = {}) {
  const text = String(cardText ?? "").replace(/\s+/g, " ");

  // Both orders are considered, and the EARLIEST match whose word is a real
  // month name wins. Committing to whichever pattern merely matched first
  // would let a title word stand in for a month — "Aug 29 Trio Night"
  // otherwise reads as day 29 + month "Trio".
  const dayThenMonth = [...text.matchAll(/\b([0-9]{1,2})\.?\s*([A-Za-zÄÖÜäöüéè]{3,9})\b/g)]
    .map((match) => ({ index: match.index, matched: match[0], month: monthFromWord(match[2]), day: Number(match[1]) }));
  const monthThenDay = [...text.matchAll(/\b([A-Za-zÄÖÜäöüéè]{3,9})\.?\s+([0-9]{1,2})\b/g)]
    .map((match) => ({ index: match.index, matched: match[0], month: monthFromWord(match[1]), day: Number(match[2]) }));
  const candidates = [...dayThenMonth, ...monthThenDay]
    .filter((candidate) => candidate.month && candidate.day >= 1 && candidate.day <= 31)
    .sort((a, b) => a.index - b.index);

  const dayMonth = candidates[0];
  if (!dayMonth) return null;
  const { month, day } = dayMonth;

  let governing = null;
  for (const heading of headings) {
    if (heading.index < cardIndex) governing = heading;
    else break;
  }
  if (!governing) return null;
  if (governing.month !== month) return null;
  if (!validDay(month, day, governing.year)) return null;

  return {
    iso: iso(governing.year, month, day),
    basis: "DETERMINISTIC_CONTEXT_YEAR",
    derivation: {
      rule: "The nearest preceding first-party <h1>-<h4> heading stating a month and a four-digit year governs every event card that follows it until the next such heading. The card must state its own day and month; that month must equal the governing heading's month, otherwise the card is rejected. Combine the heading's year with the card's own month and day as <Year>-<MM>-<DD>. No calendar, clock or plausibility input participates.",
      inputs: [governing.text, dayMonth.matched],
    },
  };
}

/**
 * The full, ordered date-resolution hierarchy for one static card.
 * Returns null when no source establishes a complete date — the card is
 * then rejected by the collector, exactly as before this package.
 */
export function resolveCardDate({ machineReadable = null, cardText = "", headings = [], cardIndex = 0, numericOrder = null, numericOrderEvidence = [] } = {}) {
  if (machineReadable) return { iso: machineReadable.slice(0, 10), raw: machineReadable, basis: "MACHINE_READABLE_DATETIME" };
  const complete = parseCompleteCardDate(cardText, { numericOrder, numericOrderEvidence });
  if (complete) return { iso: complete.iso, raw: complete.iso, basis: complete.basis, inputs: complete.inputs, ...(complete.derivation ? { derivation: complete.derivation } : {}) };
  const contextual = deriveContextualCardDate(cardText, { headings, cardIndex });
  if (contextual) return { iso: contextual.iso, raw: contextual.iso, basis: contextual.basis, derivation: contextual.derivation };
  return null;
}
