// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — a genuinely
// reusable collector family for a recurring web pattern this project had
// not previously supported: a venue's own server-rendered event LIST page
// links to per-event DETAIL pages, and each detail page itself links a
// per-event downloadable ".ics" ("Add to Calendar") file — no JSON-LD, no
// public JSON API, no WordPress REST endpoint. First observed live on two
// distinct Berlin venues sharing the same underlying venue-management CMS
// (see research/source-investigations/uber-arena-berlin-01/ and
// research/source-investigations/verti-music-hall-berlin-01/ — the same
// list/detail page markup, the same "Zum Kalender hinzufügen" per-event
// ICS link pattern, differing only by domain and venue name), but this
// module never references either venue by name: it is source-agnostic,
// matching ingestion/json-ld/parse.mjs and ingestion/ics/parse.mjs's own
// "generic, source-agnostic parsing layer" convention.
//
// This module ONLY does link/card discovery and category-based music
// filtering from already-fetched HTML — it performs no network I/O
// itself (matching ingestion/sala-apolo/discovery.mjs's precedent) and
// produces no canonical Observation (that is
// ingestion/per-event-ics/observation-adapter.mjs's job, layered on top
// of the EXISTING, unmodified ingestion/ics/parse.mjs — the actual ICS
// text itself is parsed by that already-proven generic parser, never a
// second one).
//
// Deliberately regex/string-based (no DOM dependency), matching every
// other HTML-discovery module in this project.

const CARD_START_RE =
  /<div data-date="([^"]*)" data-category="([^"]*)"(?: data-categoryname="([^"]*)")? class="active-date entry[^"]*">/g;

const EVENT_TITLE_LINK_RE = /<h3 class="event-title">\s*<a href="([^"]+)"[^>]*>([^<]*)<\/a>\s*<\/h3>/;

/**
 * Parse an event-list page's HTML into a list of event "cards" — one per
 * `data-date="..." data-category="..." [data-categoryname="..."]
 * class="active-date entry..."` block, this platform's own per-event
 * wrapper. Each card's detail URL and title are read from its own
 * `<h3 class="event-title"><a href="...">Title</a></h3>` element, present
 * identically on every real retained sample from both venues. A card
 * missing that element is skipped (not thrown on) — one malformed card
 * must never abort discovery of the others, matching this project's
 * existing JSON-LD extraction precedent (ingestion/json-ld/parse.mjs).
 *
 * `categoryName` is the platform's own `data-categoryname` attribute,
 * lower-cased, or `null` when the page does not carry one at all (one of
 * the two real retained venues — a dedicated, single-purpose concert hall
 * — never emits this attribute; the other — a general-purpose arena also
 * hosting basketball/ice hockey/comedy — always does).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty event-list HTML");
  }

  const starts = [];
  let match;
  CARD_START_RE.lastIndex = 0;
  while ((match = CARD_START_RE.exec(html)) !== null) {
    starts.push({
      index: match.index,
      blockStart: match.index + match[0].length,
      dateBucket: match[1] || null,
      categoryId: match[2] || null,
      categoryName: match[3] ? match[3].toLowerCase() : null,
    });
  }

  const cards = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const blockEnd = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const block = html.slice(start.blockStart, blockEnd);

    const titleLinkMatch = EVENT_TITLE_LINK_RE.exec(block);
    if (!titleLinkMatch) continue;

    cards.push({
      detailUrl: titleLinkMatch[1],
      title: titleLinkMatch[2].trim() || null,
      categoryName: start.categoryName,
      dateBucket: start.dateBucket,
    });
  }

  return cards;
}

// Bounded, explainable, German-language category allow-list — this
// platform's own `data-categoryname` values observed live so far
// ("konzert" is genuinely music; "basketball"/"eishockey"/"comedy"/"show"/
// "sport" are genuinely not). Never a music-relevance guess from a title
// keyword the way filterMusicEventNodes() works for JSON-LD — this
// platform's own explicit category attribute is stronger, first-party
// evidence than a keyword match would be, so this stays a plain allow-list
// rather than inventing a second keyword heuristic. Extend deliberately if
// a future venue on this same platform uses a different music-relevant
// category name (never silently widened without evidence).
const MUSIC_CATEGORY_NAMES = new Set(["konzert"]);

/**
 * Filter already-extracted cards (extractEventCards()) down to genuinely
 * music-relevant ones. A card with NO categoryName at all (the page
 * itself carries no category attribute) always passes — this platform's
 * observed behaviour is that a venue only bothers to tag categories once
 * it hosts more than one kind of event; a single-purpose concert venue's
 * own list page has nothing to filter. A card WITH a categoryName passes
 * only if that name is in MUSIC_CATEGORY_NAMES. Returns
 * `{ musicCards, rejectedCards }` so a caller can honestly report what was
 * excluded and why, matching filterMusicEventNodes()'s own return shape.
 */
export function filterMusicEventCards(cards) {
  const musicCards = [];
  const rejectedCards = [];
  for (const card of cards ?? []) {
    if (card.categoryName === null || MUSIC_CATEGORY_NAMES.has(card.categoryName)) {
      musicCards.push(card);
    } else {
      rejectedCards.push(card);
    }
  }
  return { musicCards, rejectedCards };
}

const ICAL_LINK_RE = /<a href="([^"]+)"\s+class="ical"[^>]*>/;

/**
 * Extract the per-event downloadable ".ics" ("Add to Calendar") link from
 * one already-fetched event DETAIL page's HTML. Throws if genuinely
 * absent — unlike a list-page card (where "no category" is a legitimate,
 * common outcome), a detail page on this platform family is only ever
 * acquired via this family because this exact link was already confirmed
 * present during investigation; an absent link on a live re-fetch is a
 * genuine acquisition failure worth surfacing loudly, not silently
 * skipping.
 */
export function extractIcalLink(detailHtml) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("Expected non-empty event-detail HTML");
  }
  const match = ICAL_LINK_RE.exec(detailHtml);
  if (!match) {
    throw new Error("No per-event ical link (class=\"ical\") found on this event detail page");
  }
  return match[1];
}

const DETAIL_PATH_RE = /\/events\/detail\/(.+)$/;

/**
 * Derive this source's own stable per-event identity from a detail page's
 * URL — the slug+date path segment this platform's own routing uses as
 * its canonical permalink (e.g. "bryan-adams-berlin/2026-10-02-2000" from
 * ".../events/detail/bryan-adams-berlin/2026-10-02-2000"). This is the
 * SAME "a permalink URL slug the source uses as its own canonical path"
 * stability rule already accepted for Sala Apolo/Moog/Konzerthaus in this
 * project — never a hash this collector invented — chosen over the ICS's
 * own UID because every real retained sample from both venues carries NO
 * UID property at all (confirmed absent, not merely unobserved).
 */
export function deriveSourceRecordIdFromDetailUrl(detailUrl) {
  if (typeof detailUrl !== "string" || detailUrl.trim() === "") {
    throw new Error("Expected a non-empty event detail URL");
  }
  const match = DETAIL_PATH_RE.exec(detailUrl);
  if (!match) {
    throw new Error(`Detail URL does not match the expected /events/detail/{slug} shape: ${detailUrl}`);
  }
  return match[1];
}
