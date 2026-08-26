// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Badehaus
// Berlin's own bespoke static-HTML card parser — see
// research/source-investigations/badehaus-berlin-01/. WordPress with no
// queryable events REST route; every event card repeats the identical
// `<p class="eventinfo">DAY DD.MM.YYYY | HH:MM UHR ...</p><h2><a
// href="...">TITLE</a></h2>` structure on the one events listing page —
// genuinely bespoke to this exact markup, not shared by any other source
// in this trial.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "badehaus-berlin";

const CARD_RE =
  /<p class="eventinfo">\s*\w+ (\d{2})\.(\d{2})\.(\d{4}) \| (\d{2}):(\d{2}) UHR[\s\S]*?<h2><a href="([^"]+)">([^<]+)<\/a><\/h2>/g;

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Badehaus events-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, day, month, year, hour, minute, url, title] = match;
    cards.push({
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
      eventUrl: url,
      title: title.trim(),
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  // No timezone/offset is stated anywhere on the page — a floating local
  // time, never upgraded to a UTC instant (matches this investigation's
  // own honest PARTIAL/FLOATING_LOCAL field assessment).
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

const SLUG_RE = /\/events\/([a-z0-9-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /events/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress post slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Badehaus Berlin", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own card shape
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
  return (cards ?? []).map((card) => toObservation(card, options));
}
