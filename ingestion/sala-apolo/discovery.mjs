// BARCELONA-30-VENUE-POPULATION-01 — Sala Apolo (Barcelona)'s own public
// schedule page contains real, statically-crawlable `/en/event/{slug}`
// links (no JS rendering required to discover them) — each individual
// event page then embeds its own schema.org Event JSON-LD block, parsed
// by the reusable ingestion/json-ld/ family. This module only does link
// discovery; per-page fetching + JSON-LD extraction is orchestrated by
// the collector (see ingestion/barcelona/run.mjs), matching this
// project's existing Capitólio-style "discover links, then fetch each"
// precedent (ingestion/capitolio/discovery.mjs).
//
// Covers the venue's own club-night sub-brands programmed at the same
// physical building (Nitsa, La [2] de Apolo) — these are not fetched
// differently, they are simply other events on the same schedule page.

const EVENT_LINK_RE = /\/en\/event\/([a-z0-9-]+)/g;

/**
 * Parse the schedule page's HTML into a deduplicated list of absolute
 * event detail-page URLs, in first-appearance order. Throws for empty
 * input; returns `[]` (never throws) if the page is genuinely well
 * -formed but has no matching links at all — a legitimate "nothing
 * currently scheduled" result, distinct from a malformed fetch.
 */
export function parseSalaApoloScheduleLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Sala Apolo schedule HTML");
  }

  const seen = new Set();
  const urls = [];
  let match;
  EVENT_LINK_RE.lastIndex = 0;
  while ((match = EVENT_LINK_RE.exec(html)) !== null) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    urls.push(`https://www.sala-apolo.com/en/event/${slug}`);
  }
  return urls;
}
