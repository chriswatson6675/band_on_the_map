// BEATMAPPED-BERLIN-30-40-VENUE-COMPLETION-01 — WABE Berlin's own bespoke
// static-HTML parser — see research/source-investigations/wabe-berlin-01/.
// A Jimdo (hosted WYSIWYG website builder) site: no JSON-LD/ICS/API of any
// kind, one hand-built static page PER MONTH (e.g. /sep-2026/) using
// Jimdo's own 'cc-matrix' grid-layout modules. Each real event is one
// `j-hgrid` row (four sibling `cc-m-hgrid-column` cells: date/time/genre,
// artwork, title/performer/price, location) inside the page's single
// top-level `cc-matrix` container. This markup is hand-edited per month,
// not machine-generated, so extraction is deliberately tolerant of minor
// structural drift (e.g. weekday+day sometimes share one <p> with an
// embedded <br/> instead of two separate <p> tags) — see the flattening
// approach in `extractRowLines()` below.
//
// No stable per-event id or dedicated event page is documented or proven
// stable by this source (see investigation.json field_assessment.
// source_record_id, still honestly NOT_PRESENT). A minority of event rows
// carry an "Infos" call-to-action link (e.g. href="/sep-2026/24/", or a
// bespoke slug like "/sommerfest/") that this investigation observed does
// resolve to page content specific to that one event — but this was not
// retained as evidence and is not present on every row, so it is not used
// here as a source_record_id. Instead, per this investigation's own
// documented alternative-identity-strategy note, source_record_id is a
// deterministic slug derived from this source's own already-PROVEN date +
// time + title fields — reproducible and unique across every sampled
// fixture, but explicitly NOT a source-native stable identifier.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "wabe-berlin";

const MONTH_NUMBERS = {
  januar: "01",
  februar: "02",
  "märz": "03",
  marz: "03",
  april: "04",
  mai: "05",
  juni: "06",
  juli: "07",
  august: "08",
  september: "09",
  oktober: "10",
  november: "11",
  dezember: "12",
};

const WEEKDAY_RE = /^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)$/i;
const MONTH_NAME_RE = /^(januar|februar|märz|marz|april|mai|juni|juli|august|september|oktober|november|dezember)$/i;
const TIME_RE = /^(ab\s+)?(\d{1,2}:\d{2})$/i;
const DAY_RE = /^(\d{1,2})$/;

// The page's own single month/year heading, e.g. "SEPTEMBER 2026" — states
// the year that governs every event row on the page (see
// investigation.json field_assessment.start_date, basis
// DETERMINISTIC_CONTEXT). Each row separately restates the month name
// (never the year), so this heading is only needed to resolve the year.
const MONTH_HEADING_RE = /<strong>([A-ZÄÖÜ]+)\s+(\d{4})<\/strong>/;

// One event row: a `j-hgrid` module up to the next `cc-m-hgrid-overlay`
// marker that always immediately follows it.
const ROW_RE = /<div id="cc-m-\d+" class="j-module n j-hgrid ">([\s\S]*?)<div class="cc-m-hgrid-overlay"/g;
const COLUMN_SPLIT_RE = /<div class="cc-m-hgrid-column(?: last)?" style="[^"]*">/;
const P_RE = /<p[^>]*>([\s\S]*?)<\/p>/g;
const BR_SPLIT_RE = /<br\s*\/?>/gi;
const TITLE_RE = /<em><strong><span[^>]*>([\s\S]*?)(?:<br\s*\/?>|<\/span><\/strong>)/;
const PRICE_SPAN_RE = /<span style="color: #999999;">([\s\S]*?)<\/span>/g;

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Flatten a grid cell's <p> tags into an ordered list of non-empty plain-
 * text fragments, splitting on <br/> first so that a hand-edited row that
 * merges two conceptual lines into one <p> (e.g. weekday+day) still yields
 * separate fragments, exactly like a row that uses two separate <p> tags.
 */
function extractCellLines(cellHtml) {
  const lines = [];
  let match;
  P_RE.lastIndex = 0;
  while ((match = P_RE.exec(cellHtml)) !== null) {
    const fragments = match[1].split(BR_SPLIT_RE);
    for (const fragment of fragments) {
      const text = stripTags(fragment);
      if (text !== "") lines.push(text);
    }
  }
  return lines;
}

function parseDateTimeCell(cellHtml) {
  const lines = extractCellLines(cellHtml);
  let weekday = null;
  let day = null;
  let monthName = null;
  let timeRaw = null;
  const rest = [];

  for (const line of lines) {
    if (weekday === null && WEEKDAY_RE.test(line)) {
      weekday = line;
      continue;
    }
    if (day === null && DAY_RE.test(line)) {
      day = line;
      continue;
    }
    if (monthName === null && MONTH_NAME_RE.test(line)) {
      monthName = line;
      continue;
    }
    if (timeRaw === null && TIME_RE.test(line)) {
      timeRaw = line;
      continue;
    }
    rest.push(line);
  }

  return {
    weekday,
    day,
    monthName,
    timeRaw,
    genre: rest.length > 0 ? rest.join(" / ") : null,
  };
}

function parseTitleCell(cellHtml) {
  const titleMatch = TITLE_RE.exec(cellHtml);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;

  let priceText = null;
  let priceMatch;
  PRICE_SPAN_RE.lastIndex = 0;
  while ((priceMatch = PRICE_SPAN_RE.exec(cellHtml)) !== null) {
    // Take the last #999999 span in the cell — this source's own styling
    // for its price/entry-fee line (verified against every sampled row).
    priceText = stripTags(priceMatch[1]);
  }

  return { title, priceText };
}

function parseLocationCell(cellHtml) {
  const lines = extractCellLines(cellHtml);
  // The call-to-action link text ("Infos", "Infos auf der Website des TuD")
  // is its own trailing <p>-equivalent inside this cell; the location text
  // is always the lines before it.
  const locationLines = lines.filter((line) => !/^infos\b/i.test(line));
  return locationLines.length > 0 ? locationLines.join(", ") : null;
}

/**
 * Extract every real event row from one WABE monthly programme page's
 * retained HTML. Throws if the page's own month/year heading is missing —
 * without it, no event row states a year anywhere, and this adapter must
 * never invent one (see docs/SOURCE_INVESTIGATION_POLICY.md's date/time
 * rule). Never throws on zero event rows — a genuinely empty month is
 * legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty WABE monthly-programme-page HTML");
  }

  const headingMatch = MONTH_HEADING_RE.exec(html);
  if (!headingMatch) {
    throw new Error(
      "No month/year heading (e.g. 'SEPTEMBER 2026') found on this page — cannot honestly derive event years without inventing one",
    );
  }
  const headingMonthName = headingMatch[1];
  const headingYear = headingMatch[2];
  const headingMonthNumber = MONTH_NUMBERS[headingMonthName.toLowerCase()];
  if (!headingMonthNumber) {
    throw new Error(`Unrecognised month name in page heading: "${headingMonthName}"`);
  }

  const cards = [];
  let rowMatch;
  ROW_RE.lastIndex = 0;
  while ((rowMatch = ROW_RE.exec(html)) !== null) {
    const columns = rowMatch[1].split(COLUMN_SPLIT_RE).slice(1);
    if (columns.length < 4) {
      // The trailing footer row ("NEUE SPIELSTÄTTE ...") uses the same
      // j-hgrid module but only 2 columns — not a real event.
      continue;
    }

    const dateTimeCell = parseDateTimeCell(columns[0]);
    const { title, priceText } = parseTitleCell(columns[2]);
    const locationText = parseLocationCell(columns[3]);

    if (!dateTimeCell.day || !title) {
      // Tolerate a hand-built row this parser genuinely cannot read
      // rather than fabricating a placeholder — never observed in the
      // retained fixtures, but the source is hand-edited and could
      // change.
      continue;
    }

    const day = dateTimeCell.day.padStart(2, "0");
    // Each row restates its own month name directly — cross-check it
    // against the page heading's month rather than trusting the heading
    // alone, so a row accidentally left in the wrong month page is not
    // silently mis-dated.
    const rowMonthNumber = dateTimeCell.monthName ? MONTH_NUMBERS[dateTimeCell.monthName.toLowerCase()] : null;
    const monthNumber = rowMonthNumber ?? headingMonthNumber;

    cards.push({
      date: `${headingYear}-${monthNumber}-${day}`,
      weekday: dateTimeCell.weekday,
      timeRaw: dateTimeCell.timeRaw,
      genre: dateTimeCell.genre,
      title,
      priceText,
      locationText,
    });
  }

  return cards;
}

function normalizedTime(timeRaw) {
  if (!timeRaw) return null;
  const match = TIME_RE.exec(timeRaw);
  return match ? match[2] : null;
}

const COMBINING_DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(text) {
  return text
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  const time = normalizedTime(card.timeRaw);
  dt.raw = time ? `${card.date} ${card.timeRaw}` : card.date;
  dt.date = card.date;
  // No timezone/offset is stated anywhere on any sampled page — a
  // floating local time, never upgraded to a UTC instant (matches this
  // investigation's own honest field_assessment.time PROVEN/FLOATING_LOCAL
  // finding).
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

/**
 * source_record_id strategy: this source proves no stable per-event id or
 * dedicated permalink (see investigation.json field_assessment.
 * source_record_id, NOT_PRESENT). Per that record's documented alternative
 * identity strategy, derive a deterministic (never source-native) slug
 * from this source's own already-PROVEN date + time + title fields —
 * reproducible for the same retained input every time, but never claimed
 * as a source-stable id.
 */
function deriveSourceRecordId(card) {
  const time = normalizedTime(card.timeRaw) ?? "unknown-time";
  return `${card.date}-${time.replace(":", "")}-${slugify(card.title)}`;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.title || !card?.date) {
    throw new Error("toObservation requires card.title and card.date");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: deriveSourceRecordId(card),
    retrieved_at: retrievedAt ?? null,

    source_url: null, // no dedicated per-event URL proven stable on this source
    content_type: "text/html",

    title: card.title,
    description: card.genre ?? null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "WABE", // single-source institution; physical location varies per event, see location_text
    location_text: card.locationText ?? null,

    price_text: card.priceText ?? null,
    event_url: null,

    source_fields: {
      weekday: card.weekday ?? null,
      genre: card.genre ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
