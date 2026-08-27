// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Badaboum (Paris). See
// research/source-investigations/badaboum-paris-01/ and
// ingestion/badaboum-paris/discovery.mjs (list-page discovery layer this
// module is paired with).
//
// Converts one already-fetched event DETAIL page
// (https://badaboum.paris/evenement/{slug}/) into the generic Observation
// contract. Every sampled detail page (2 real, live, retained
// 2026-08-26: club-summer-playground-18, club-la-chck-2006-2016-2026)
// renders one genuinely structured, machine-readable block the page's own
// front-end JS uses to power its "Add to Google Calendar" feature:
//
//   <div class="google-event"
//        data-title="{TITLE}"
//        data-date-start="{YYYYMMDD}"
//        data-date-end="{YYYYMMDD}"
//        data-h-start="{HHMMSS}"
//        data-h-end="{HHMMSS}"></div>
//
// This is a genuinely complete, DIRECT_SOURCE start+end instant (both a
// calendar date AND a time-of-day for both edges) — no separate
// derivation/combination needed, unlike this source's own listing-page
// date text (which carries no time-of-day at all). No UTC offset/
// timezone is stated anywhere — Paris local time is implied, never
// proven — so every start/end this module produces is FLOATING_LOCAL,
// matching this venue's own governed field_assessment exactly.
//
// No price value is ever printed on a detail page — only a booking link
// to a third-party platform (Shotgun, confirmed on both sampled pages) —
// so `price_text` is honestly null (NOT_PRESENT). Single-venue source:
// `venue_name`/`location_text` are hardcoded constants (matching this
// project's existing badehaus/zenner precedent), not re-parsed per event
// — this source's own retained evidence (agenda-page footer AND both
// sampled detail pages) consistently states "2 Rue des Taillandiers —
// 75011 Paris", not "2 bis" as a prior, unverified note assumed; recorded
// here exactly as the source itself states it.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "badaboum-paris";
export const VENUE_NAME = "Badaboum";
export const VENUE_ADDRESS = "Badaboum, 2 Rue des Taillandiers, 75011 Paris";

const GOOGLE_EVENT_RE =
  /<div class="google-event" data-title="([^"]*)" data-date-start="(\d{8})" data-date-end="(\d{8})" data-h-start="(\d{6})" data-h-end="(\d{6})">/;
const H1_RE = /<h1>\s*([^<]*?)\s*<\/h1>/;
const BOOKING_URL_RE = /<div class="links-rsvp">\s*<a href="([^"]+)" target="_blank" class="btn">/;

function decodeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

/** "20260828" -> "2026-08-28". */
function isoDateFromYyyymmdd(text) {
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** "233000" -> "23:30". */
function time24hFromHhmmss(text) {
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`;
}

/**
 * Parse one event detail page's HTML into a small, structured record.
 * Throws if the page's own required fields (title, google-event block)
 * are absent — every real sampled detail page carries both, so an absent
 * one signals a genuinely broken/unexpected page, not a legitimate gap to
 * silently paper over.
 */
export function extractEventDetail(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Badaboum event-detail HTML");
  }

  const titleMatch = H1_RE.exec(html);
  const googleEventMatch = GOOGLE_EVENT_RE.exec(html);
  if (!titleMatch || !googleEventMatch) {
    throw new Error("Badaboum event-detail page is missing its <h1> title or google-event calendar-data block");
  }
  const [, , dateStartRaw, dateEndRaw, hStartRaw, hEndRaw] = googleEventMatch;
  const bookingMatch = BOOKING_URL_RE.exec(html);

  return {
    title: decodeHtmlEntities(titleMatch[1]),
    startDate: isoDateFromYyyymmdd(dateStartRaw),
    startTime: time24hFromHhmmss(hStartRaw),
    endDate: isoDateFromYyyymmdd(dateEndRaw),
    endTime: time24hFromHhmmss(hEndRaw),
    bookingUrl: bookingMatch ? bookingMatch[1] : null,
  };
}

function deriveDateTime(date, time) {
  const dt = emptyDateTime();
  dt.date = date;
  dt.raw = `${date} ${time}`;
  // No timezone/offset is stated anywhere on the page — a floating local
  // time, never upgraded to a UTC instant.
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

const SLUG_RE = /\/evenement\/([^/]+)\/?$/;

/**
 * Convert one event's { card, detailHtml } pair into an Observation.
 * `card` is a discovery.mjs card (used for `eventUrl`/`slug`/`category`
 * cross-check and passthrough); `detailHtml` is that same event's
 * already-fetched detail-page HTML — the source of the exact start/end
 * instant (never fully present on the list page, which carries no
 * time-of-day at all).
 */
export function toObservation({ card, detailHtml, retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("toObservation requires detailHtml (this source's own start/end time only exists on the event detail page)");
  }
  const detail = extractEventDetail(detailHtml);

  const slugMatch = SLUG_RE.exec(card.eventUrl);
  const slug = slugMatch ? slugMatch[1] : card.slug ?? null;
  if (!slug) {
    throw new Error(`event URL does not match the expected /evenement/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slug, // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: detail.title ?? card.title ?? null,
    description: null,

    start: deriveDateTime(detail.startDate, detail.startTime),
    end: deriveDateTime(detail.endDate, detail.endTime),

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT — only a booking link to a third-party platform (Shotgun), never a first-party price value
    event_url: card.eventUrl,

    source_fields: {
      category: card.category ?? null,
      booking_url: detail.bookingUrl,
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
