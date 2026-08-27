// PARIS-VENUE-POPULATION-01 — Glazart's own bespoke static-HTML card
// parser — see research/source-investigations/glazart-paris-01/. WordPress
// with a custom "portfolio" post-type (no JSON-LD Event/MusicEvent block,
// no ICS link, no calendar-plugin REST route); the venue's own agenda
// page (/agenda-concerts/) is a static grid of ~21 real event cards, each
// one repeating the identical
//   <div class="portfolio-item ..." data-portfolio-item-id="{id}"
//        data-terms="{concert|after}">
//     ...
//     <h3><a href="{eventUrl}" class="item-link" aria-label="...">
//       DD.MM.YY <Title>
//     </a></h3>
//   </div>
// structure — genuinely bespoke to this exact markup, not shared by any
// other source in this project.
//
// Date: this venue's own card title states its date as a leading
// "DD.MM.YY" prefix (a two-digit year, never a full four-digit year on
// this listing page). Expanding "YY" to "20YY" is a direct, literal
// transcription of exactly what the source states — the SAME established
// convention already used for ausland-berlin, admiralspalast-berlin, and
// galeria-ze-dos-bois (see ingestion/admiralspalast/observation-adapter.mjs's
// own doc comment) — not an inference about "today"; this project's live
// listings only ever run in the 2020s, and the two digits are read exactly
// as printed. Certainty is honestly DATE_ONLY (no confirmed time-of-day on
// this listing page); see this investigation's own field_assessment.time
// for why: individual event detail pages sometimes carry a free-text
// "Ouverture des portes: HH.MM" or "Horaires: HH → HH" note, but format is
// inconsistent between "concert" and "after" cards and this adapter
// deliberately stays bounded to the one list page (matching the
// admiralspalast-berlin precedent's "don't fetch every detail page"
// judgement) rather than harvesting that per-event, freely-formatted text.
//
// Category: this venue's agenda page carries only two portfolio
// categories, both genuinely music-relevant — "concert" (live bands) and
// "after" (the venue's own club/DJ "After O'Clock" series) — so every
// card on this one page is accepted; no music-relevance filter is applied
// (unlike ingestion/json-ld/parse.mjs's filterMusicEventNodes(), which
// exists for sources that also list non-music content).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "glazart-paris";

const CARD_RE =
  /data-terms="([^"]*)">[\s\S]*?<h3>\s*<a href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>\s*<\/h3>/g;

const TITLE_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{2})\s*(?:[–—-]\s*)?(.*)$/;

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#35;/g, "#")
    .replace(/&#8211;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Extract every event card from the venue's own /agenda-concerts/ page
 * HTML. Never throws on zero matches — a genuinely empty listing is
 * legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Glazart agenda HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, category, eventUrl, rawTitleText] = match;
    const decoded = decodeEntities(rawTitleText);
    const dateMatch = TITLE_DATE_RE.exec(decoded);
    if (!dateMatch) continue; // a card whose title doesn't carry the venue's own date prefix is skipped, never guessed
    const [, dd, mm, yy, title] = dateMatch;
    cards.push({
      date: `20${yy}-${mm}-${dd}`,
      eventUrl,
      title: title.trim(),
      category,
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.date;
  dt.date = card.date;
  // No time-of-day is stated on this listing page itself — honestly
  // DATE_ONLY, never upgraded by assuming a typical doors time.
  dt.certainty = "DATE_ONLY";
  return dt;
}

const SLUG_RE = /^https?:\/\/[^/]+\/([a-z0-9-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected https://www.glazart.com/{slug}/ shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress post slug, its canonical permalink path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Glazart", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own list-page card shape
    event_url: card.eventUrl,

    source_fields: { category: card.category ?? null },

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
