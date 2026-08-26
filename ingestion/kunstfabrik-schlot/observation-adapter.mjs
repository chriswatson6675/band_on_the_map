// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Kunstfabrik
// Schlot's own bespoke detail-page field extraction — see
// research/source-investigations/kunstfabrik-schlot-berlin-01/. WordPress
// "Offbeat" theme's own event-info widget states the full date (with
// year) only on the per-event DETAIL page ('Datum:'/'Zeit:'/'Eintritt:'
// labelled spans) — the list page shows day+month only, no year. List
// -page LINK discovery reuses the EXISTING, unmodified
// ingestion/html-link-discovery/ module (see ingestion/berlin/run.mjs);
// this module is only the bespoke per-venue DETAIL-page field extraction,
// genuinely unique to this theme's own markup in this trial.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "kunstfabrik-schlot-berlin";

const FIELD_RE = (label) =>
  new RegExp(`<span class="offbeat-event-info-item-title">${label}:<\\/span>\\s*<span class="offbeat-event-info-item-desc">([^<]+)<\\/span>`);

const MONTHS = {
  January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
  July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
};
const DATE_RE = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Parse this source's own "Month D, YYYY" Datum field into an ISO date —
 * a fixed, unambiguous named-month format, mechanical parsing only.
 */
export function parseDatumField(rawValue) {
  const match = DATE_RE.exec(rawValue?.trim() ?? "");
  if (!match) return null;
  const [, monthName, day, year] = match;
  const month = MONTHS[monthName];
  if (!month) return null;
  return `${year}-${month}-${pad2(day)}`;
}

/**
 * Extract title/date/time/price from one already-fetched event detail
 * page's HTML.
 */
export function extractDetailFields(detailHtml) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("Expected non-empty Kunstfabrik Schlot event-detail HTML");
  }
  const datum = FIELD_RE("Datum").exec(detailHtml)?.[1]?.trim() ?? null;
  const zeit = FIELD_RE("Zeit").exec(detailHtml)?.[1]?.trim() ?? null;
  const eintritt = FIELD_RE("Eintritt").exec(detailHtml)?.[1]?.trim() ?? null;
  return { date: datum ? parseDatumField(datum) : null, time: zeit, priceText: eintritt };
}

function deriveDateTime(fields) {
  const dt = emptyDateTime();
  if (!fields.date) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  dt.date = fields.date;
  dt.raw = fields.time ? `${fields.date} ${fields.time}` : fields.date;
  // "Zeit:" is a local wall-clock time with no stated timezone; a
  // site-wide rule ("doors open one hour before") is documented
  // separately and is not a per-event fact — never folded in here.
  dt.certainty = fields.time ? "FLOATING_LOCAL" : "DATE_ONLY";
  return dt;
}

const SLUG_RE = /\/event\/([a-z0-9-]+)\/?$/;

/**
 * `card` — `{ title, eventUrl }` from list-page discovery (see
 * ingestion/berlin/run.mjs). `detailHtml` — that same event's already
 * -fetched detail page.
 */
export function toObservation({ card, detailHtml, retrievedAt, fixturePath }) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /event/{slug}/ shape: ${card.eventUrl}`);
  }
  const fields = extractDetailFields(detailHtml);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1],
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(fields),
    end: emptyDateTime(),

    venue_name: "Kunstfabrik Schlot", // single-venue source, resolved by source_id
    location_text: null,

    price_text: fields.priceText,
    event_url: card.eventUrl,

    source_fields: {},

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}
