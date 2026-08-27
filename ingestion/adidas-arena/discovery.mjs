// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — adidas arena's own bespoke
// static-HTML card parser — see
// research/source-investigations/adidas-arena-paris-01/. This is a Nuxt
// (Vue) server-side-rendered application whose initial plain HTTP
// response ALREADY contains every visible event card fully rendered
// (a category tag, a French-language date+time string, a title, and an
// indicative "from" price) — no client-side JS execution required.
// Genuinely bespoke markup, not shared by any other family this project
// already supports.

const CARD_START_RE = /<div class="app-programmation-card ([a-z0-9_-]+)"/g;
const TITLE_RE = /<h2 class="H2 bold"[^>]*>\s*([^<]*?)\s*<\/h2>/;
const DATE_RE = /<h3 class="P2 date medium"[^>]*>\s*([^<]*?)\s*<br>/;
const PRICE_RE = /app-programmation-card__from-price[^"]*"[^>]*>\s*[^<]*?\s*([\d.,]+\s*€)\s*<\/p>/;
const URL_RE = /href="(\/programmation\/[a-z0-9-]+--\d+)"/;

/**
 * Extract every event card from the venue's own programmation page HTML.
 * Never throws on zero matches. `category` comes directly from the card's
 * own wrapper class (e.g. "concert") — a directly retained classification
 * signal, not a keyword guess. A card missing its own title/date/url is
 * skipped rather than fabricated.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty adidas arena programmation-page HTML");
  }
  const starts = [];
  let m;
  CARD_START_RE.lastIndex = 0;
  while ((m = CARD_START_RE.exec(html)) !== null) starts.push({ index: m.index, category: m[1] });

  const cards = [];
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i].index, starts[i + 1]?.index ?? html.length);
    const title = TITLE_RE.exec(block);
    const url = URL_RE.exec(block);
    if (!title || !url) continue;
    const date = DATE_RE.exec(block);
    const price = PRICE_RE.exec(block);

    cards.push({
      category: starts[i].category,
      title: title[1].trim(),
      dateText: date ? date[1].trim() : null,
      priceText: price ? price[1].replace(/\s+/g, "") : null,
      eventUrl: url[1],
    });
  }
  return cards;
}

/**
 * This source's own card wrapper class IS the music-relevance signal
 * (e.g. "concert") — a directly retained classification, stronger than a
 * keyword guess over free-text titles. Returns { musicCards, rejectedCards }
 * so a caller can honestly report what was excluded, never silently.
 */
export function filterMusicEventCards(cards) {
  const musicCards = [];
  const rejectedCards = [];
  for (const card of cards ?? []) {
    if (card.category === "concert") musicCards.push(card);
    else rejectedCards.push(card);
  }
  return { musicCards, rejectedCards };
}
