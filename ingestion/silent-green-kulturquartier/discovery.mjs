// BEATMAPPED-BERLIN-SECOND-PASS-30-40-VENUE-COMPLETION-01 — silent green
// Kulturquartier (Berlin). See
// research/source-investigations/silent-green-kulturquartier-berlin-01/.
//
// TYPO3 CMS ('news' extension / tx_news) renders the venue's own official
// programme as a server-rendered, month-by-month calendar grid
// (https://www.silent-green.net/en/programme/2026/8, .../2026/9, ...).
// Each calendar day cell carries a hidden tooltip block with one <p> per
// event occupying that day, e.g.:
//
//   <a class="d-block" href="/en/programme/detail/htrk?tx_news_pi1[day]=2
//       &tx_news_pi1[month]=8&tx_news_pi1[year]=2026&cHash=...">
//     <span class="cat">Concert</span>
//     <span class="title">HTRK + Loraine James – sold out</span>
//   </a>
//
// This module is discovery-layer ONLY, matching this project's existing
// two-step "discover-then-fetch-detail" convention already used for
// ingestion/hot-clube and ingestion/per-event-ics (both list-page
// discovery.mjs + detail-driven observation-adapter.mjs) — the exact
// pattern this venue's own investigation record already anticipated in
// its collector_assessment.blockers: "a collector needs a two-step
// discover-then-fetch-detail pattern". This module intentionally does
// NOT parse `time`, `end`, `venue_location`, or the canonical `event_url`
// — those genuinely only exist on each event's own detail page (confirmed
// live, 2026-08-26: the calendar-grid HTML contains no time-of-day
// anywhere), so inventing them here from calendar context alone would be
// exactly the kind of guessing docs/SOURCE_INVESTIGATION_POLICY.md
// prohibits. See ingestion/silent-green-kulturquartier/observation-adapter.mjs
// for the detail-page parse + Observation construction.
//
// The `day`/`month`/`year` query-string parameters on each card's own
// href ARE genuine first-party source data (the exact calendar cell the
// venue's own CMS filed the event under) and are retained here for
// discovery/reporting purposes only (`dateHint`) — this module never
// promotes that alone to an Observation-level `start` value; that value
// is drawn from the detail page's own <span class="event-detail-date-begin">
// (already the PROVEN, DIRECT_SOURCE evidence path in this venue's
// field_assessment), so both signals stay independently corroborating
// rather than one silently standing in for the other.
//
// Deliberately regex/string-based (no DOM dependency), matching every
// other HTML-discovery module in this project (e.g.
// ingestion/per-event-ics/discovery.mjs, ingestion/json-ld/parse.mjs).

const CARD_RE =
  /<a class="d-block" href="\/en\/programme\/detail\/([a-z0-9-]+)\?tx_news_pi1%5Bday%5D=(\d{1,2})&amp;tx_news_pi1%5Bmonth%5D=(\d{1,2})&amp;tx_news_pi1%5Byear%5D=(\d{4})[^"]*">\s*(?:<span class="cat">([^<]*)<\/span>)?\s*<span class="title">([^<]*)<\/span>/g;

function unescapeHtml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Parse one month's calendar-grid HTML
 * (https://www.silent-green.net/en/programme/{year}/{month}) into a list
 * of discovery cards, one per distinct event slug — the same event can
 * legitimately render under more than one day cell (a multi-day
 * installation/exhibition/festival is listed under every day it spans),
 * so cards are deduplicated by slug, keeping the FIRST (earliest-day)
 * occurrence, which is always that event's own start-day cell (the
 * calendar renders it beginning on that cell, matching this venue's own
 * detail-page date-begin for every sampled record).
 *
 * Each card: { slug, title, category, eventUrl, dateHint } — `category`
 * is the site's own `<span class="cat">` text, or `null` when the page
 * genuinely carries none for that card (a real, observed case — e.g. the
 * "Historische Führungen..." and "silent green Sommerfest 2026" cards
 * carry no `cat` span at all). `dateHint` is `{ year, month, day }` taken
 * directly from that first occurrence's own href query parameters —
 * genuine first-party data, but see module doc comment for why it is
 * never itself promoted to an Observation's proven `start` value.
 *
 * Never throws on zero matches — a genuinely empty month is legitimate
 * (this venue's own live 2027/1 and 2027/2 pages, confirmed 2026-08-26).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty silent green programme calendar-grid HTML");
  }

  const seen = new Set();
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, slug, day, month, year, category, title] = match;
    if (seen.has(slug)) continue;
    seen.add(slug);
    cards.push({
      slug,
      title: unescapeHtml(title),
      category: category ? unescapeHtml(category) : null,
      eventUrl: `https://www.silent-green.net/en/programme/detail/${slug}`,
      dateHint: { year: Number(year), month: Number(month), day: Number(day) },
      dateHintRaw: `${year}-${pad2(month)}-${pad2(day)}`,
    });
  }
  return cards;
}

// Bounded, explainable, keyword-based music-relevance filter — mirrors
// filterMusicEventNodes()'s (ingestion/json-ld/parse.mjs) own style and
// return shape: a card whose own site-assigned category is exactly
// "Concert" always passes (the source's own classification is stronger
// evidence than any keyword match, matching filterMusicEventNodes()'s
// `MusicEvent`-type shortcut). Every other card (including one with NO
// category at all — this venue, unlike Badehaus, genuinely hosts many
// non-music disciplines, so an absent category is never auto-passed the
// way ingestion/per-event-ics/discovery.mjs's filterMusicEventCards()
// does for a single-purpose venue) is checked against a small keyword
// list over its own title text. Never a frozen ontology — extend
// deliberately, on evidence, not by guessing.
const MUSIC_KEYWORDS = ["concert", "music", "sonic", "sound", "band", "orchestra", "ensemble", "dj "];

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Filter already-extracted cards (extractEventCards()) down to genuinely
 * music-relevant ones. Returns `{ musicCards, rejectedCards }` so a caller
 * can honestly report what was excluded and why, matching
 * filterMusicEventNodes()/filterMusicEventCards()'s own return shape.
 */
export function filterMusicEventCards(cards) {
  const musicCards = [];
  const rejectedCards = [];
  for (const card of cards ?? []) {
    if (card.category === "Concert") {
      musicCards.push(card);
      continue;
    }
    const haystack = foldText(`${card.title ?? ""} ${card.category ?? ""}`);
    if (MUSIC_KEYWORDS.some((k) => haystack.includes(k))) {
      musicCards.push(card);
    } else {
      rejectedCards.push(card);
    }
  }
  return { musicCards, rejectedCards };
}
