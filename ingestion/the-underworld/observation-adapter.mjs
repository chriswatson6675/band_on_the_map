// BEATMAPPED-LONDON-ALL-VENUE-RECOVERY-AND-FIRST-LIVE-TRANCHE-01 — The
// Underworld own bespoke static-HTML card parser — see
// research/source-investigations/beatmapped-london-all-venue-recovery-01/.
// DICE-powered event listing (theunderworldcamden.co.uk/search-events/);
// every card's title `<h3 class="list-header-title">` link is immediately
// followed by a machine-readable `<time datetime="YYYY-MM-DD">` element
// plus a "Doors open at H:MM AM/PM" text — genuinely static, server-
// rendered HTML, not JS-injected. See
// fixtures/the-underworld/search-events.html.
//
// Note: the detail URL's own slug embeds a date fragment (e.g.
// "atlas-11th-sep") that this source reuses across different actual
// showings and does NOT always match the card's own <time datetime>
// value — confirmed by inspecting the retained fixture. The slug is only
// ever used here as this source's own stable identifier, never as a date
// source; the date always comes from the <time datetime> attribute.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "the-underworld-london";

const CARD_RE =
  /<h3 class="list-header-title"><a href="([^"]+)">([^<]+)<\/a><\/h3>\s*<p class="list-header-date">\s*<time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)<\/time>(?:\s*&vert;\s*Doors open at ([^<]+?))?\s*<\/header>/g;

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/**
 * Extract every event card from the venue's own search-events listing page
 * HTML. Never throws on zero matches — a genuinely empty listing is
 * legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty The Underworld search-events page HTML");
  }
  const cards = [];
  const seen = new Set();
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, detailUrl, rawTitle, isoDate, dateText, doorsText] = match;
    if (seen.has(detailUrl)) continue;
    seen.add(detailUrl);
    cards.push({
      title: decodeHtmlEntities(rawTitle.trim()),
      isoDate,
      dateText: dateText.trim(),
      doorsText: doorsText ? doorsText.trim() : null,
      detailUrl,
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.doorsText ? `${card.dateText} | Doors open at ${card.doorsText}` : card.dateText;
  // The card's own <time datetime="YYYY-MM-DD"> is a genuine, machine-
  // readable calendar date directly stated by the source. The "doors
  // open" text is a real, present time string, but it describes doors
  // opening, not a confirmed event start time — kept only in `raw`, not
  // promoted into a certainty this adapter cannot honestly claim.
  dt.date = card.isoDate;
  dt.certainty = "DATE_ONLY";
  return dt;
}

const SLUG_RE = /\/event\/([a-z0-9-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.detailUrl) {
    throw new Error("toObservation requires card.detailUrl");
  }
  const slugMatch = SLUG_RE.exec(card.detailUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /event/{slug}/ shape: ${card.detailUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own DICE/WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.detailUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "The Underworld", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own list-card shape

    event_url: card.detailUrl,

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
  return (cards ?? []).map((card) => toObservation(card, options));
}
