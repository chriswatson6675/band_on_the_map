// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Urban Spree's
// own bespoke static-HTML card parser — see
// research/source-investigations/urban-spree-berlin-01/. MODX/pdoTools
// server-side-rendered cards; genuinely bespoke to this exact markup
// (data-dateStart attribute + card-text title + list-group-item price),
// not shared by any other source in this trial.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "urban-spree-berlin";

const CARD_START_RE = /<a data-slidertype="slider-typegrid" href="(program\/concerts\/[a-z0-9-]+\.html)"[\s\S]*?data-dateStart="(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})"/g;
const TITLE_RE = /<p class="card-text mb-0 title">([^<]+)<\/p>/;

function decodeHtmlEntities(value) {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&amp;/g, "&");
}
const PRICE_RE = /<li class="list-group-item price[^"]*">\s*([\d.,]+\s?€)\s*<\/li>/;

/**
 * Extract every event card from the venue's own program page HTML. Each
 * card's own href/date are captured by CARD_START_RE; title/price are
 * read from the block of markup between this card's start and the next
 * one (or end of document).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Urban Spree program-page HTML");
  }

  const starts = [];
  let match;
  CARD_START_RE.lastIndex = 0;
  while ((match = CARD_START_RE.exec(html)) !== null) {
    starts.push({ index: match.index, blockStart: match.index, relativeUrl: match[1], date: match[2], time: match[3] });
  }

  return starts.map((start, i) => {
    const blockEnd = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const block = html.slice(start.blockStart, blockEnd);
    const titleMatch = TITLE_RE.exec(block);
    const priceMatch = PRICE_RE.exec(block);
    return {
      eventUrl: `https://www.urbanspree.com/${start.relativeUrl}`,
      date: start.date,
      time: start.time,
      title: titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null,
      priceText: priceMatch ? priceMatch[1].trim() : null,
    };
  });
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  dt.certainty = "FLOATING_LOCAL"; // no timezone stated anywhere on the page
  return dt;
}

const SLUG_RE = /\/([a-z0-9-]+)\.html$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected {slug}.html shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1],
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Urban Spree", // single-venue source, resolved by source_id
    location_text: null,

    price_text: card.priceText,
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
  return (cards ?? []).filter((card) => card.title).map((card) => toObservation(card, options));
}
