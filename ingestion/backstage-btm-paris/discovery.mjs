// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Backstage By The Mill
// (Paris). See research/source-investigations/backstage-btm-paris-01/.
//
// WordPress with a custom "agenda" post type (post-type-archive-agenda) —
// no calendar plugin, no schema.org Event JSON-LD (the page's own single
// JSON-LD block is Yoast SEO boilerplate: CollectionPage/BreadcrumbList/
// WebSite only). The venue's own official calendar list page
// (https://www.backstage-btm.com/en/calendar/) repeats:
//
//   <div class="event-type">{GENRE}</div>
//   <div class="event-title">{TITLE}</div>
//   <div class="see-event"><a class="button white" href="{eventUrl}">See More</a></div>
//   ...
//   <div class="event-booking">{DD/MM/YYYY}</div>
//
// Matches this project's existing two-step "discover-then-fetch-detail"
// convention (ingestion/silent-green-kulturquartier/discovery.mjs et al.):
// this module is discovery-layer ONLY. No time-of-day and no venue
// address are ever present on this list page — the address only exists
// on each event's own detail page (see ./observation-adapter.mjs), and no
// time-of-day exists ANYWHERE in this source's retained evidence at all
// (confirmed live, 2026-08-26, across every sampled detail page).
//
// Honest date-format caveat: this source's list page is observed
// (2026-08-26) to state the year as 4 digits on 28 of 30 real sampled
// cards ("18/03/2027"), but as a bare 2-digit year on 2 of them
// ("07/11/26", "23/10/26") — inconsistent formatting on the source's own
// page, not a separate data field. This module NEVER expands a 2-digit
// year to a 4-digit one (doing so would depend on an assumed century —
// exactly the kind of guessing docs/SOURCE_INVESTIGATION_POLICY.md
// prohibits, even though "20" + "26" looks obviously right) — a card
// whose date does not match the strict DD/MM/YYYY (4-digit year) shape
// is returned with `date: null` (dateRaw preserved) rather than invented.

const CARD_RE =
  /<div class="event-type">\s*([^<]*?)\s*<\/div>\s*<div class="event-title">\s*([^<]*?)\s*<\/div>\s*<div class="see-event">\s*<a class="button white" href="([^"]+)">See More<\/a>\s*<\/div>\s*<\/div>\s*<div class="content-events-list">\s*<div class="event-booking">\s*([^<]*?)\s*<\/div>/g;

const FULL_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const SLUG_RE = /\/en\/calendar\/([a-z0-9-]+)\/?$/;

function decodeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

/** "18/03/2027" -> "2027-03-18". Returns null for anything else (see module doc comment on the 2-digit-year caveat) — never a partial guess. */
function isoDateFromDdMmYyyy(text) {
  if (typeof text !== "string") return null;
  const m = FULL_DATE_RE.exec(text.trim());
  if (!m) return null;
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
}

/**
 * Extract every event card from the venue's own calendar list page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 * Each card: { eventUrl, slug, title, genre, dateRaw, date }.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Backstage By The Mill calendar-page HTML");
  }

  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, genre, title, eventUrl, dateRaw] = match;
    const slugMatch = SLUG_RE.exec(eventUrl);
    cards.push({
      eventUrl,
      slug: slugMatch ? slugMatch[1] : null,
      title: decodeHtmlEntities(title),
      genre: genre.trim() === "" ? null : decodeHtmlEntities(genre),
      dateRaw: dateRaw.trim(),
      date: isoDateFromDdMmYyyy(dateRaw),
    });
  }
  return cards;
}
