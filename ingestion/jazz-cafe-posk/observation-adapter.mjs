// BEATMAPPED-LONDON-ALL-VENUE-RECOVERY-AND-FIRST-LIVE-TRANCHE-01 — Jazz
// Cafe Posk own bespoke static-HTML card parser — see
// research/source-investigations/beatmapped-london-all-venue-recovery-01/.
//
// The venue's own gig guide (https://jazzcafeposk.org/gig-guide/, an
// Oxygen Builder page) server-renders every event as a genuinely static
// card: a "Weekday Dth Month" date string, an image, a title, a price/
// note line, and a "Read more" link to the detail page — all directly in
// the raw HTML, no JS required. See fixtures/jazz-cafe-posk/gig-guide.html.
//
// Deliberate honesty limitation: the gig-guide list page's own date
// string NEVER states a year (confirmed by inspecting every card on the
// retained fixture: "Thu 1st October", "Sat 21st November", etc. — no
// year anywhere on this page, not even in a page heading or section
// context). A year IS present on each event's own detail page (e.g.
// "Date: 21/11/2026" / "Saturday 21 November 2026"), but that is a
// separate document this adapter does not read — per
// docs/SOURCE_INVESTIGATION_POLICY.md, a fact may only be derived from
// context retained on the SAME page, and inferring "this November must be
// 2026" purely from today's date would be AI_INFERENCE, never PROVEN.
// This adapter therefore honestly leaves `date`/`iso` null and reports
// `certainty: "TEXT_ONLY"` for every card — the day-of-week/day-of-
// month/month text is retained verbatim in `raw` instead of being guessed.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "jazz-cafe-posk-london";

const CARD_RE =
  /<span id="span-15-21" class="ct-span" >([^<]+)<\/span><\/h1>[\s\S]{0,600}?<span id="span-19-21" class="ct-span" >([^<]+)<\/span><\/h1>[\s\S]{0,300}?<span id="span-21-21" class="ct-span" >([^<]*)<\/span><\/h3><a id="link_button-22-21-\d+" class="ct-link-button" href="([^"]+)"/g;

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/**
 * Extract every event card from the venue's own gig-guide page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Jazz Cafe Posk gig-guide page HTML");
  }
  const cards = [];
  const seen = new Set();
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, dateText, rawTitle, priceText, detailUrl] = match;
    if (seen.has(detailUrl)) continue;
    seen.add(detailUrl);
    cards.push({
      title: decodeHtmlEntities(rawTitle.trim()),
      dateText: dateText.trim(),
      priceText: priceText ? decodeHtmlEntities(priceText.trim()) : null,
      detailUrl,
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.dateText;
  // No year is stated anywhere on this list page (see module header) —
  // date/iso stay honestly null rather than guessed from today's date.
  dt.certainty = "TEXT_ONLY";
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
    source_record_id: slugMatch[1], // this source's own WordPress post slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.detailUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Jazz Cafe Posk", // single-venue source, resolved by source_id
    location_text: null,

    price_text: card.priceText ?? null,
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
