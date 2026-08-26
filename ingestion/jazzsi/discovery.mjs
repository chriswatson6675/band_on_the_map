// BARCELONA-30-VENUE-POPULATION-02 — JazzSí Club (Taller de Músics),
// Barcelona. This venue's own official RSS feed
// (https://www.jazzsi.com/concerts/feed/) exists purely as a LINK
// -DISCOVERY step (its own `pubDate` is the WordPress post-PUBLISH
// timestamp, not the event date — the real date lives only on each
// individual concert page's own schema.org MusicEvent JSON-LD block).
// Reuses ingestion/rss/parse.mjs (generic RSS 2.0 parsing) and
// ingestion/json-ld/ (generic JSON-LD Event extraction) completely
// unchanged — this module adds only the small, venue-specific "which RSS
// items are real concert pages" filter, matching this project's existing
// Sala Apolo precedent (crawl a listing/feed for links, then fetch each
// page for its own JSON-LD). Proven live in
// research/source-investigations/jazzsi-barcelona-01/.

import { parseRSS } from "../rss/parse.mjs";

const CONCERT_LINK_RE = /^https:\/\/www\.jazzsi\.com\/concerts\/[a-z0-9-]+\/$/;

/**
 * Parse this source's own RSS feed body into a deduplicated list of real
 * concert-page URLs — excludes the feed's own self-referential
 * "/concerts/feed/" link and anything not matching the site's own real
 * concert-permalink shape.
 */
export function parseJazzsiConcertLinks(rssBody) {
  const { items } = parseRSS(rssBody);
  const urls = [];
  const seen = new Set();
  for (const item of items) {
    if (!item.link || !CONCERT_LINK_RE.test(item.link)) continue;
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    urls.push(item.link);
  }
  return urls;
}
