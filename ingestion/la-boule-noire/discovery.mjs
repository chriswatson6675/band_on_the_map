// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — La Boule Noire (120
// Boulevard de Rochechouart, 75018 Paris), a genuinely bespoke WordPress +
// Elementor "Posts" widget install — see
// research/source-investigations/la-boule-noire-paris-01/. No JSON-LD
// Event/MusicEvent data anywhere on this site (Yoast SEO's own JSON-LD is
// present but only describes WebPage/WebSite/Organization), and this
// site's own wp-json REST API returns 401 ("Only authenticated users can
// access the REST API") — so, like
// ingestion/badehaus/observation-adapter.mjs, this is a bespoke static-HTML
// card parser, not a reusable family.
//
// The site's own homepage IS its live "programmation" listing (the
// /en/programmation/162 URL supplied for investigation 301-redirects here
// via the Polylang plugin) — every current/upcoming show is one
// `<article class="elementor-post ...">` card with its own title, full
// French date+time text (day name, day number, month name, year, hour),
// and permalink. Each event's own permalink page separately states its own
// price (a numeric heading in a `class="prix-event"` element, with the "€"
// currency symbol supplied purely by this site's own CSS
// `.prix-event p:after{content:"€"}` rule rather than printed in the page
// text — see extractEventPrice() below) — a second, optional fetch, not
// required for title/date/time/url.

const CARD_RE =
  /<h2 class="elementor-post__title">\s*<a href="([^"]+)"\s*>\s*([^<]+?)\s*<\/a>\s*<\/h2>\s*<div class="elementor-post__excerpt">\s*<p>([^<]+)<\/p>/g;

const SLUG_RE = /^https?:\/\/laboule-noire\.fr\/([a-z0-9-]+)\/?$/i;

// French month names (lowercase, diacritics stripped by foldText() below)
// to two-digit numbers. This site's own date text always spells the month
// out in full (never abbreviated), per every sampled card.
const MONTH_NUMBERS = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

// The day number may carry a French ordinal suffix on the 1st of the month
// only ("1ER" = "1er", "first") — every other day is a plain cardinal
// number on this site's own retained cards.
const DATE_TEXT_RE = /^\S+\s+(\d{1,2})(?:ER)?\s+(\S+)\s+(\d{4})\s*(?:&#8211;|[-–—])\s*(\d{1,2})H(\d{2})?$/i;

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function decodeMinimalEntities(value) {
  return String(value ?? "")
    .replace(/&#8211;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");
}

/**
 * Parse this site's own "<DAYNAME> <DD> <MONTH> <YYYY> – <HH>H<MM>?" date
 * text (e.g. "MERCREDI 30 SEPTEMBRE 2026 – 19H30") into
 * `{ date: "YYYY-MM-DD", hour: "HH", minute: "MM" }`, or `null` if the
 * text does not match this exact shape — never a partial/guessed result.
 */
export function parseCardDateText(rawText) {
  const text = decodeMinimalEntities(rawText).trim();
  const match = DATE_TEXT_RE.exec(text);
  if (!match) return null;
  const [, day, monthName, year, hour, minute] = match;
  const monthNumber = MONTH_NUMBERS[foldText(monthName)];
  if (!monthNumber) return null;
  return {
    date: `${year}-${monthNumber}-${day.padStart(2, "0")}`,
    hour: hour.padStart(2, "0"),
    minute: minute ?? "00",
  };
}

/**
 * Extract every event card from the venue's own homepage/"programmation"
 * listing HTML. Never throws on zero matches — a genuinely empty listing
 * is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty La Boule Noire homepage HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, eventUrl, rawTitle, rawDateText] = match;
    const slugMatch = SLUG_RE.exec(eventUrl);
    if (!slugMatch) continue; // a non-event link (e.g. the "billetterie" page) never matches this card shape anyway
    cards.push({
      eventUrl,
      slug: slugMatch[1],
      title: decodeMinimalEntities(rawTitle).trim(),
      dateText: decodeMinimalEntities(rawDateText).trim(),
      parsedDate: parseCardDateText(rawDateText),
    });
  }
  return cards;
}

const PRICE_RE = /class="[^"]*\bprix-event\b[^"]*"[\s\S]{0,400}?<p[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)\s*<\/p>/;

/**
 * Extract this event's own numeric price from its detail page HTML, or
 * `null` if genuinely absent. The page's own text never prints a currency
 * symbol (it is supplied purely by this site's own CSS
 * `.prix-event p:after{content:"€"}` rule) — this function honestly
 * returns the bare number; a caller combines it with that separately-cited
 * CSS rule (a DETERMINISTIC_CONTEXT combination of two retained inputs —
 * see research/source-investigations/la-boule-noire-paris-01/investigation.json's
 * field_assessment.price) to arrive at a currency-qualified value.
 */
export function extractEventPrice(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty La Boule Noire event detail page HTML");
  }
  const match = PRICE_RE.exec(html);
  return match ? match[1] : null;
}
