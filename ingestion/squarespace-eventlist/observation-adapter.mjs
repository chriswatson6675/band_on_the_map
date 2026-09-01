// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — a small,
// generic collector for Squarespace's own "Events List" and "Summary
// Block (event record type)" layouts — real, common, server-rendered
// markup shared verbatim across multiple independent London sites this
// package live-verified (Downstairs at The Dome, Night Tales Loft, The
// Roxy Soho all serve one of these two exact block shapes; see
// research/source-investigations/beatmapped-london-first-tranche-main-
// rebase-and-music-gate-01/evidence/live-verify-tranche-candidates-
// output.json for the retained live fetches this was built and tested
// against). Never a per-venue bespoke parser, and never a guess at
// Squarespace's markup — every selector below is taken directly from
// real, retained HTML.
//
// Two block shapes, both server-rendered (no JS execution required):
//
//   (a) "Events List" block: <article class="eventlist-event ...">
//       wraps a title link (.eventlist-title-link) and a machine-
//       readable <time class="event-date" datetime="YYYY-MM-DD">.
//
//   (b) "Summary Block" (event record type): <div class="summary-item
//       ... summary-item-record-type-event ..." data-upcoming-event-
//       start="<ms>" data-upcoming-event-end="<ms>"> wraps a link whose
//       data-title attribute is the event's own title. The two data-
//       upcoming-event-* attributes are genuine millisecond Unix
//       timestamps Squarespace itself computes server-side — a real,
//       machine-readable UTC instant, not a derived/guessed one.
//
// Both shapes are extracted into the same small card shape:
//   { eventUrl, title, dateOnly, startMs }
// (`dateOnly` XOR `startMs` is set, matching which shape the card came
// from) so toObservation() can build one honest DateTime for either.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

function absoluteUrl(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "’");
}

const EVENTLIST_ARTICLE_RE = /<article class="eventlist-event\b[^"]*"[\s\S]*?(?=<article class="eventlist-event\b|$)/g;
const EVENTLIST_TITLE_RE = /<a href="([^"]+)" class="eventlist-title-link">([^<]+)<\/a>/;
const EVENTLIST_DATE_RE = /<time class="event-date" datetime="(\d{4}-\d{2}-\d{2})"/;

const SUMMARY_ITEM_RE = /<div class="\s*summary-item\b[^"]*summary-item-record-type-event[^"]*"\s*data-upcoming-event-end="(\d+)"[\s\S]*?(?=<div class="\s*summary-item\b|$)/g;
const SUMMARY_HREF_RE = /href="([^"]+)"/;
const SUMMARY_TITLE_RE = /data-title="([^"]*)"/;

/**
 * Extract every event card from one Squarespace events page's HTML
 * (either block shape, or both mixed on one page). `baseUrl` resolves
 * each card's own relative href to an absolute, first-party event_url.
 */
export function extractEventCards(html, { baseUrl } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Squarespace events-page HTML");
  }
  if (!baseUrl) {
    throw new Error("extractEventCards requires baseUrl to resolve relative event links");
  }

  const cards = [];

  for (const block of html.match(EVENTLIST_ARTICLE_RE) ?? []) {
    const titleMatch = EVENTLIST_TITLE_RE.exec(block);
    const dateMatch = EVENTLIST_DATE_RE.exec(block);
    if (!titleMatch || !dateMatch) continue;
    const eventUrl = absoluteUrl(titleMatch[1], baseUrl);
    if (!eventUrl) continue;
    cards.push({
      eventUrl,
      title: decodeHtmlEntities(titleMatch[2].trim()),
      dateOnly: dateMatch[1],
      startMs: null,
    });
  }

  for (const block of html.match(SUMMARY_ITEM_RE) ?? []) {
    const hrefMatch = SUMMARY_HREF_RE.exec(block);
    const titleMatch = SUMMARY_TITLE_RE.exec(block);
    const endMsMatch = /data-upcoming-event-end="(\d+)"/.exec(block);
    if (!hrefMatch || !titleMatch || !titleMatch[1] || !endMsMatch) continue;
    const eventUrl = absoluteUrl(hrefMatch[1], baseUrl);
    if (!eventUrl) continue;
    // The block only carries data-upcoming-event-end reliably in the
    // cases live-verified; the event's own detail page (not fetched by
    // this listing-page collector) is the authoritative start time. This
    // module never invents a start from the end timestamp — it records
    // end as the one honestly-known machine instant.
    cards.push({
      eventUrl,
      title: decodeHtmlEntities(titleMatch[1].trim()),
      dateOnly: null,
      startMs: null,
      endMs: Number(endMsMatch[1]),
    });
  }

  // De-duplicate by event_url — a card can legitimately appear once per
  // shape scan; never trust position for identity.
  const seen = new Set();
  return cards.filter((c) => {
    if (seen.has(c.eventUrl)) return false;
    seen.add(c.eventUrl);
    return true;
  });
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  if (card.dateOnly) {
    dt.raw = card.dateOnly;
    dt.date = card.dateOnly;
    dt.certainty = "DATE_ONLY";
  } else if (typeof card.endMs === "number") {
    // A real end-of-event instant only; recorded honestly as an end
    // bound, never repurposed as a fabricated start.
    dt.raw = String(card.endMs);
    dt.date = new Date(card.endMs).toISOString().slice(0, 10);
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

export function toObservation(card, { sourceId, venueName, retrievedAt, fixturePath } = {}) {
  if (!sourceId) throw new Error("toObservation requires sourceId");
  if (!card?.eventUrl) throw new Error("toObservation requires card.eventUrl");

  return createObservation({
    source_id: sourceId,
    source_record_id: card.eventUrl,
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: venueName ?? null,
    location_text: null,

    price_text: null,
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

export function toObservations(cards, options = {}) {
  return (cards ?? []).filter((card) => card.title && card.eventUrl).map((card) => toObservation(card, options));
}
