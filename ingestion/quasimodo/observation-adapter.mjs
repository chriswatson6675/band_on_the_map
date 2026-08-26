// Quasimodo (Berlin, Charlottenburg) — bespoke static-HTML card parser
// plus optional detail-page price enrichment — see
// research/source-investigations/quasimodo-berlin-01/. WordPress 7.1 with
// a custom 'events' post type. The events LIST page states a FULL date +
// time directly per event card (no month/year-heading combination needed,
// unlike some other sources this project has investigated) — every card's
// own `<div class="date">DD.MM.YYYY - HH:MM</div>` (the 'visible-xs'
// variant) is a complete, directly-stated instant-less local date/time.
// Each event's own DETAIL page additionally states a starting/presale
// price and a separate door ("Einlass") time not present on the list
// page — genuinely reliable, sampled across multiple real events during
// investigation, so this adapter optionally merges it in when a detail
// page has been fetched, without ever requiring it.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "quasimodo-berlin";

// Matches one <a class="event-item"> card block on the events list page,
// skipping over the earlier 'hidden-xs' <div class="date"> (day/month
// only, in <span> children) to the 'visible-xs' variant that states the
// complete DD.MM.YYYY - HH:MM directly.
const CARD_RE =
  /<a href="([^"]+)" class="event-item">[\s\S]*?<div class="date">(\d{2})\.(\d{2})\.(\d{4}) - (\d{2}):(\d{2})<\/div>[\s\S]*?<h4 class="event-title">([^<]+)<\/h4>/g;

const NAMED_ENTITIES = {
  amp: "&",
  "#038": "&",
  "#8211": "–", // en dash
  "#8212": "—", // em dash
  "#8217": "’", // right single quote
  "#8220": "“",
  "#8221": "”",
};

/**
 * Decode the small, fixed set of numeric/named HTML entities this
 * source's own event titles are genuinely observed to use (WordPress's
 * default `wptexturize` output: en/em dashes, curly quotes, `&#038;` for
 * a literal `&`). Deliberately narrow and mechanical — not a general
 * HTML-entity decoder — so it never silently mangles unrelated text.
 */
export function decodeSourceEntities(text) {
  if (typeof text !== "string") return text;
  return text.replace(/&(#?[a-zA-Z0-9]+);/g, (whole, code) => {
    const key = code.toLowerCase() === "amp" ? "amp" : code;
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : whole;
  });
}

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Quasimodo events-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, url, day, month, year, hour, minute, title] = match;
    cards.push({
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
      eventUrl: url,
      title: decodeSourceEntities(title.trim()),
    });
  }
  return cards;
}

const START_RE = /<td width="95">Start:<\/td>\s*<td>([^<]+)<\/td>/;
const EINLASS_RE = /<td>Einlass:<\/td>\s*<td>([^<]+)<\/td>/;
const PRESALE_RE = /<td>Presale:<\/td>\s*<td>([\s\S]*?)<\/td>/;

/**
 * Extract the optional enrichment fields present only on an event's own
 * DETAIL page: door ("Einlass") time and a starting/presale price. Never
 * throws — a detail page that lacks one of these rows (e.g. no price yet
 * published) legitimately yields a null for that field rather than an
 * error, since this is enrichment on top of an already-sufficient list
 * -page card, not a required extraction step.
 */
export function extractDetailFields(detailHtml) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("Expected non-empty Quasimodo event-detail HTML");
  }
  const start = START_RE.exec(detailHtml)?.[1]?.trim() ?? null;
  const doorTime = EINLASS_RE.exec(detailHtml)?.[1]?.trim() ?? null;
  const presaleRaw = PRESALE_RE.exec(detailHtml)?.[1] ?? null;
  // Strip the nested "(plus fee)" <small> tag's own markup, but keep its
  // text — the source's own qualifier, not fabricated.
  const priceText = presaleRaw
    ? presaleRaw.replace(/<\/?small>/g, "").replace(/\s+/g, " ").trim()
    : null;
  return { start, doorTime, priceText };
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  // No timezone/offset is stated anywhere on the list or detail page — a
  // floating local time, never upgraded to a UTC instant (matches this
  // investigation's own honest field assessment: DIRECT_SOURCE for the
  // full date+time, but no confirmed UTC instant).
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

const SLUG_RE = /\/events\/([a-z0-9-]+)\/?$/;

/**
 * `card` — from extractEventCards(). `detailFields` — optional, from
 * extractDetailFields() applied to that same event's already-fetched
 * detail page; when omitted, price_text stays null and source_fields
 * carries no door-time — this is genuinely OPTIONAL enrichment, never
 * required to produce a valid Observation.
 */
export function toObservation(card, { retrievedAt, fixturePath, detailFields } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /events/{slug} shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Quasimodo", // single-venue source, resolved by source_id
    location_text: null,

    price_text: detailFields?.priceText ?? null,
    event_url: card.eventUrl,

    source_fields: detailFields?.doorTime ? { door_time: detailFields.doorTime } : {},

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
