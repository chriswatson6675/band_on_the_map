// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — La Gaîté Lyrique (Paris)'s
// own bespoke, source-agnostic-in-spirit schema.org MICRODATA card parser.
// See research/source-investigations/gaite-lyrique-paris-01/.
//
// Unlike every other JSON-LD source already handled by
// ingestion/json-ld/parse.mjs, this venue's own agenda pages
// (/agenda/ and its own "Musique" category filter, /agenda/concerts/)
// embed schema.org data as plain MICRODATA attributes directly on static
// HTML elements (`itemprop=name`/`url` on the title link, `<meta
// itemprop=startDate>`/`<meta itemprop=endDate>`, an optional nested
// `itemtype=https://schema.org/Place itemprop=location` block naming a
// room) rather than a `<script type="application/ld+json">` block. No
// existing collector family in this repository parses microdata directly
// — this is a new, small, reusable-in-shape (though currently used by
// only this one venue) parsing module, kept separate from
// ingestion/json-ld/ rather than bolted onto it, since the two encodings
// share no actual markup in common.
//
// This module performs no network I/O — it only parses an already-fetched
// HTML string. Each event card on this source is a single, non-nested
// `<article class="event ...">...</article>` element (verified against
// the retained fixture: 15 open tags, 15 matching close tags, no
// nesting), so cards are split on that boundary before per-field
// extraction — a safer approach than one giant regex spanning multiple
// cards.

const CARD_RE = /<article class="event[^"]*">([\s\S]*?)<\/article>/g;
const TITLE_LINK_RE = /<a href=([^ >]+)[^>]*itemprop=url>([^<]+)<\/a>/;
const START_DATE_RE = /<meta itemprop=startDate content="([^"]+)">/;
const END_DATE_RE = /<meta itemprop=endDate content="([^"]+)">/;
const ROOM_RE = /itemtype=https:\/\/schema\.org\/Place itemprop=location[^>]*>[\s\S]*?<span itemprop=name>([^<]+)<\/span>/;
const CATEGORY_RE = /<a href=[^ >]+>([^<]+)<\/a>/g;
const CATEGORIES_BLOCK_RE = /<ul class=event-categories[^>]*>([\s\S]*?)<\/ul>/;

/**
 * Extract every event card from one already-fetched agenda (or
 * category-filtered agenda) page. Never throws on zero matches — a
 * genuinely empty listing is a legitimate result, matching every other
 * discovery module's convention in this project.
 *
 * Returns `{ eventUrl, title, startRaw, endRaw, room, categories }` per
 * card. `room` is the per-card room name (e.g. "Grande Salle") when
 * present, else `null` — this is a sub-location WITHIN the venue, never a
 * different venue. `categories` is the card's own listed category names
 * (e.g. ["Musique"]).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("extractEventCards requires non-empty Gaîté Lyrique agenda HTML");
  }

  const cards = [];
  let cardMatch;
  CARD_RE.lastIndex = 0;
  while ((cardMatch = CARD_RE.exec(html)) !== null) {
    const cardHtml = cardMatch[1];

    const titleMatch = TITLE_LINK_RE.exec(cardHtml);
    if (!titleMatch) continue; // a card with no title/url link is not usable — skip, never fabricate

    const startMatch = START_DATE_RE.exec(cardHtml);
    const endMatch = END_DATE_RE.exec(cardHtml);
    const roomMatch = ROOM_RE.exec(cardHtml);

    const categories = [];
    const categoriesBlock = CATEGORIES_BLOCK_RE.exec(cardHtml);
    if (categoriesBlock) {
      let catMatch;
      const catRe = new RegExp(CATEGORY_RE.source, CATEGORY_RE.flags);
      while ((catMatch = catRe.exec(categoriesBlock[1])) !== null) {
        categories.push(catMatch[1].trim());
      }
    }

    cards.push({
      eventUrl: titleMatch[1],
      title: titleMatch[2].trim(),
      startRaw: startMatch ? startMatch[1] : null,
      endRaw: endMatch ? endMatch[1] : null,
      room: roomMatch ? roomMatch[1].trim() : null,
      categories,
    });
  }

  return cards;
}

// Most events are a single `/agenda/{year}/{slug}/` path; some (e.g. a
// multi-part "Rêve Party" programme) nest a child event under a parent
// slug as `/agenda/{year}/{parent-slug}/{child-slug}/`. Either shape's
// full remaining path segment(s) form this source's own stable permalink
// identity — captured as one group, slashes included, rather than only
// the first segment.
const SLUG_RE = /\/agenda\/\d{4}\/([^?#]+?)\/?$/;

/**
 * Derive this source's own stable `source_record_id` from one card's
 * `eventUrl` — the site's own permanent `/agenda/{year}/{slug}/` (or
 * nested parent/child) permalink path, matching the same "URL path is
 * this source's own canonical, stable identity" judgement already
 * documented for moog-barcelona-01/LAV, tempodrom-berlin-01, and
 * truskel-paris-01. Returns `null` (never a fabricated fallback) if the
 * shape does not match.
 */
export function deriveSourceRecordId(card) {
  if (typeof card?.eventUrl !== "string") return null;
  const match = SLUG_RE.exec(card.eventUrl);
  return match ? match[1] : null;
}
