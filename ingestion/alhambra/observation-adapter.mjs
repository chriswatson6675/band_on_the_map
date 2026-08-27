// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Alhambra (Paris)
// observation adapter. See ingestion/alhambra/discovery.mjs and
// research/source-investigations/alhambra-paris-01/ for the source
// investigation this is built against.
//
// Unlike the other three Paris venues in this batch, this source's own
// homepage/listing is NOT used as the fact source for start_date/time/
// price/venue — see discovery.mjs's own doc comment for the demonstrated
// homepage card-ordering hazard. Every field below is parsed from the
// EVENT'S OWN detail page HTML only.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "alhambra-paris";

const VENUE_NAME = "Alhambra";
const VENUE_ADDRESS = "21 rue Yves Toudic, 75010 Paris";

const MONTH_NAMES_FR = {
  janvier: 1,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
};

const TITLE_RE = /<div class='categorie'>[^<]*<\/div>\s*<h2>([^<]+)<\/h2>/;
// Two genuine, live-confirmed markup variants of this same date badge:
// (1) a sold-out ("COMPLET") event's own page inserts an extra trailing
// "<br>" inside the <strong> tag that a still-on-sale event's page does
// not; (2) a numbered-seating ("PLACEMENT NUMÉROTÉ") event's own page
// omits the <strong> wrapper around the date text entirely. Both are
// tolerated here as optional, non-capturing tags so every shape matches
// identically; the captured date text itself is unaffected either way.
const DATE_RE = /<div class='chapo'><p style="text-align: center;">(?:<strong>)?([^<]+?)(?:<br\s*\/?>)?(?:<\/strong>)?<\/p><\/div>/;
const DOORS_RE = /Ouverture des portes au public une heure avant le d(?:é|&eacute;)but du concert\s*\((\d{1,2})h\)/;
const PRICE_RE = /<p>([\d,]+)\s*&euro;\s*([^<]*)<\/p>/;
const RECORD_ID_RE = /-lo(\d+)\.html$/;

function decodeEntities(text) {
  return text
    .replace(/&Auml;/g, "Ä")
    .replace(/&auml;/g, "ä")
    .replace(/&Eacute;/g, "É")
    .replace(/&eacute;/g, "é")
    .replace(/&Egrave;/g, "È")
    .replace(/&egrave;/g, "è")
    .replace(/&Agrave;/g, "À")
    .replace(/&agrave;/g, "à")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&ccedil;/g, "ç")
    .replace(/&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Parse the DD MONTH_FR YYYY portion of this source's own directly-stated
 * "WEEKDAY DD MONTH YYYY" date text (e.g. "VENDREDI 16 OCTOBRE 2026") into
 * a "YYYY-MM-DD" calendar date. Returns null if the text does not match
 * the expected shape or names an unrecognised month — never guesses.
 */
export function parseDateBadge(dateText) {
  if (typeof dateText !== "string") return null;
  const match = /^\S+\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/.exec(dateText.trim().replace(/\s+/g, " "));
  if (!match) return null;
  const [, dayStr, monthName, yearStr] = match;
  const month = MONTH_NAMES_FR[monthName.toLowerCase()];
  if (!month) return null;
  const day = Number(dayStr);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${yearStr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse one event's own detail page HTML into a plain record. Throws if
 * the page does not match this platform's expected shape for the fields
 * this policy requires (title, start_date) — never fabricates a value the
 * page does not genuinely contain.
 */
export function parseEventDetailPage(html, eventUrl) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Alhambra event detail-page HTML");
  }
  if (typeof eventUrl !== "string" || eventUrl.trim() === "") {
    throw new Error("parseEventDetailPage requires eventUrl");
  }

  const titleMatch = TITLE_RE.exec(html);
  if (!titleMatch) {
    throw new Error(`could not find this platform's own <h2> title on ${eventUrl}`);
  }
  const dateMatch = DATE_RE.exec(html);
  if (!dateMatch) {
    throw new Error(`could not find this platform's own date badge on ${eventUrl}`);
  }
  // This platform's own date badge text carries genuine live-observed HTML
  // entities for accented uppercase month names (e.g. "D&Eacute;CEMBRE",
  // "F&Eacute;VRIER") that must be decoded BEFORE month-name matching, not
  // after — the entity's own "&"/";" characters otherwise fall outside
  // parseDateBadge()'s own [A-Za-zÀ-ÿ]+ month-token character class and the
  // date is wrongly reported as unparseable.
  const decodedDateText = decodeEntities(dateMatch[1]);
  const date = parseDateBadge(decodedDateText);
  if (!date) {
    throw new Error(`date badge did not match the expected 'WEEKDAY DD MONTH YYYY' shape on ${eventUrl}: "${decodedDateText}"`);
  }

  const recordIdMatch = RECORD_ID_RE.exec(eventUrl);
  if (!recordIdMatch) {
    throw new Error(`event URL does not match the expected '<slug>-lo<id>.html' shape: ${eventUrl}`);
  }

  const doorsMatch = DOORS_RE.exec(html);
  const priceMatch = PRICE_RE.exec(html);

  return {
    eventUrl,
    sourceRecordId: recordIdMatch[1],
    title: decodeEntities(titleMatch[1]),
    date,
    startHour: doorsMatch ? Number(doorsMatch[1]) : null, // concert start, per the doors sentence's own "(19h)"
    priceText: priceMatch ? `${priceMatch[1]} EUR${priceMatch[2] ? ` ${decodeEntities(priceMatch[2])}` : ""}` : null,
  };
}

function deriveDateTime(record) {
  const dt = emptyDateTime();
  if (record.startHour != null) {
    dt.raw = `${record.date} ${String(record.startHour).padStart(2, "0")}:00`;
    dt.date = record.date;
    // No UTC offset or IANA timezone is stated anywhere — floating local.
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = record.date;
    dt.date = record.date;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

export function toObservation(record, { retrievedAt, fixturePath } = {}) {
  if (!record?.eventUrl) {
    throw new Error("toObservation requires record.eventUrl");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record.sourceRecordId,
    retrieved_at: retrievedAt ?? null,

    source_url: record.eventUrl,
    content_type: "text/html",

    title: record.title ?? null,
    description: null,

    start: deriveDateTime(record),
    end: emptyDateTime(), // NOT_PRESENT — no end time/date is stated anywhere sampled

    venue_name: VENUE_NAME,
    location_text: VENUE_ADDRESS,

    price_text: record.priceText ?? null,
    event_url: record.eventUrl,

    source_fields: {},

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}
