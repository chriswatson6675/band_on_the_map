// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Backstage By The Mill
// (Paris). See research/source-investigations/backstage-btm-paris-01/ and
// ingestion/backstage-btm-paris/discovery.mjs (list-page discovery layer
// this module is paired with).
//
// Converts one already-fetched event DETAIL page
// (https://www.backstage-btm.com/en/calendar/{slug}/) into the generic
// Observation contract. This is where the venue's own address is
// genuinely available — it is NOT present on the calendar list page (see
// discovery.mjs's own doc comment). No time-of-day is present anywhere in
// this source's retained evidence (list OR detail page) for any sampled
// event — honestly recorded as NOT_PRESENT, never invented.
//
// Every sampled detail page (2 real, live, retained 2026-08-26: atlas,
// south-arcade) renders the same consistent markup:
//   <div class="agenda-booking"><p>{DD/MM/YYYY}</p></div>
//   <div class="agenda-adresse"><p>{VENUE_ADDRESS_TEXT}</p></div>
//   <div class="link-agenda">...<a class="button black" href="{ticketUrl}">Ticketing</a></div>
//
// Both sampled detail pages state the identical address text —
// "O’Sullivans By The Mill, 92 bis bd de Clichy - Paris" — confirming
// this is a single-venue source (this exact venue is physically accessed
// via/behind O'Sullivans By The Mill, matching the venue's own separate
// "information" page, which additionally states the full postal address
// with postcode: "92 Boulevard de Clichy 75018 Paris", plus a distinct
// "Concert Access: Face au 7 Cité Véron 75018 Paris" note — see
// research/source-investigations/backstage-btm-paris-01/investigation.json
// field_assessment.venue_location for the full, honest reconciliation of
// these two address renderings).
//
// No price value is ever printed on a detail page — only a "Ticketing"
// button linking to a third-party platform (e.g. aegpresents.fr) — so
// `price_text` is honestly null (NOT_PRESENT).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "backstage-btm-paris";
export const VENUE_NAME = "Backstage By The Mill";
export const VENUE_ADDRESS =
  "Backstage By The Mill (accessed via O’Sullivans By The Mill / O’Sullivans Pigalle), 92 Bis Boulevard de Clichy, 75018 Paris";

const AGENDA_BOOKING_RE = /<div class="agenda-booking\s*">\s*<p>\s*([^<]*?)\s*<\/p>\s*<\/div>/;
const AGENDA_ADRESSE_RE = /<div class="agenda-adresse">\s*<p>\s*([^<]*?)\s*<\/p>\s*<\/div>/;
const H1_RE = /<h1>\s*([^<]*?)\s*<\/h1>/;

const FULL_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function decodeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

function isoDateFromDdMmYyyy(text) {
  if (typeof text !== "string") return null;
  const m = FULL_DATE_RE.exec(text.trim());
  if (!m) return null;
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
}

/**
 * Parse one event detail page's HTML into a small, structured record.
 * Throws if the page's own required fields (title, date) are absent —
 * every real sampled detail page carries both, so an absent one signals a
 * genuinely broken/unexpected page, not a legitimate gap to silently
 * paper over.
 */
export function extractEventDetail(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Backstage By The Mill event-detail HTML");
  }

  const titleMatch = H1_RE.exec(html);
  const dateMatch = AGENDA_BOOKING_RE.exec(html);
  if (!titleMatch || !dateMatch) {
    throw new Error("Backstage By The Mill event-detail page is missing its <h1> title or agenda-booking date");
  }
  const addressMatch = AGENDA_ADRESSE_RE.exec(html);

  const dateRaw = dateMatch[1].trim();
  return {
    title: decodeHtmlEntities(titleMatch[1]),
    dateRaw,
    date: isoDateFromDdMmYyyy(dateRaw),
    address: addressMatch ? decodeHtmlEntities(addressMatch[1]) : null,
  };
}

/**
 * Prefer the detail page's own date; fall back to the list card's date
 * only if the detail page's failed to resolve. Both are the exact same
 * source's own stated value (never combined/derived from each other) —
 * this is a fallback between two independently DIRECT_SOURCE readings of
 * the same fact, never a DETERMINISTIC_CONTEXT combination.
 */
function deriveStart({ date, dateRaw }) {
  const dt = emptyDateTime();
  if (!date) return dt;
  dt.date = date;
  dt.raw = dateRaw;
  // No time-of-day is stated anywhere in this source's retained
  // evidence — DATE_ONLY, never upgraded.
  dt.certainty = "DATE_ONLY";
  return dt;
}

const SLUG_RE = /\/en\/calendar\/([a-z0-9-]+)\/?$/;

/**
 * Convert one event's { card, detailHtml } pair into an Observation.
 * `card` is a discovery.mjs card (used for `eventUrl`/`slug`/`genre`
 * cross-check and passthrough); `detailHtml` is that same event's
 * already-fetched detail-page HTML — the source of `venue_location`
 * (never present on the list page).
 */
export function toObservation({ card, detailHtml, retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("toObservation requires detailHtml (this source's own address only exists on the event detail page)");
  }
  const detail = extractEventDetail(detailHtml);

  const slugMatch = SLUG_RE.exec(card.eventUrl);
  const slug = slugMatch ? slugMatch[1] : card.slug ?? null;
  if (!slug) {
    throw new Error(`event URL does not match the expected /en/calendar/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slug, // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: detail.title ?? card.title ?? null,
    description: null,

    start: deriveStart(detail.date ? { date: detail.date, dateRaw: detail.dateRaw } : { date: card.date, dateRaw: card.dateRaw }),
    end: emptyDateTime(), // NOT_PRESENT on this source's own card/detail shape

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: detail.address ?? null,

    price_text: null, // NOT_PRESENT — only a "Ticketing" button linking to a third-party platform, never a first-party price value
    event_url: card.eventUrl,

    source_fields: {
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

export function toObservations(entries, { retrievedAt } = {}) {
  return (entries ?? []).map(({ card, detailHtml, fixturePath }) => toObservation({ card, detailHtml, retrievedAt, fixturePath }));
}
