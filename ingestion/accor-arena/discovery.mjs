// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Accor Arena's own bespoke
// static-HTML card parser — see
// research/source-investigations/accor-arena-paris-01/. This is an
// Angular Universal (SSR) application; the venue's own plain HTTP response
// already contains every visible event card fully rendered (title, an
// English-language date string, an event detail link, and — when shown —
// an indicative "From : €X" price) with no client-side JS execution
// required. Genuinely bespoke markup, not shared by any other family this
// project already supports.

const CARD_RE = /<article[^>]*class="card"[^>]*>[\s\S]*?<\/article>/g;
const HREF_RE = /href="(\/en\/events-and-tickets\/[a-z0-9-]+)"/;
const DATE_RE = /aa-sessions-dates[^>]*>\s*([^<]*?)\s*</;
const TITLE_RE = /card__label"[^>]*>\s*([^<]*?)\s*<\/h2>/;
const PRICE_RE = /From\s*:\s*<strong[^>]*>\s*([^<]*?)\s*<\/strong>/;

/**
 * Extract every event card from the venue's own events-and-tickets page
 * HTML. Never throws on zero matches — a genuinely empty listing is
 * legitimate. A card missing its own href/date/title is skipped rather
 * than fabricated.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Accor Arena events-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const block = match[0];
    const href = HREF_RE.exec(block);
    const date = DATE_RE.exec(block);
    const title = TITLE_RE.exec(block);
    if (!href || !date || !title) continue;
    const price = PRICE_RE.exec(block);
    cards.push({
      eventUrl: href[1],
      dateText: date[1].trim(),
      title: title[1].trim(),
      priceText: price ? price[1].trim() : null,
    });
  }
  return cards;
}

// A bounded, non-exhaustive keyword list of known NON-music categories
// this source's own card titles reveal (this source exposes no separate
// machine-readable category field on the list page) — mirrors
// ingestion/json-ld/parse.mjs's own bounded-keyword filterMusicEventNodes()
// approach, applied here in the opposite (reject) direction. Never itself
// a frozen ontology.
const NON_MUSIC_KEYWORDS = ["basketball", "qualifying match", "fight night", "ufc", "nba "];

/**
 * Bounded, explainable, keyword-based filter excluding known non-music
 * (sports) fixtures from this venue's own mixed programme. Returns
 * { musicCards, rejectedCards } so a caller can honestly report what was
 * excluded, never silently.
 */
export function filterMusicEventCards(cards) {
  const musicCards = [];
  const rejectedCards = [];
  for (const card of cards ?? []) {
    const haystack = card.title.toLowerCase();
    if (NON_MUSIC_KEYWORDS.some((k) => haystack.includes(k))) {
      rejectedCards.push(card);
    } else {
      musicCards.push(card);
    }
  }
  return { musicCards, rejectedCards };
}
