// Parses genuinely retrieved Village Underground Lisboa events-index HTML
// (https://vulisboa.com/eventos) into small, structured per-event
// discovery records.
//
// Discovery-layer only, matching ingestion/hot-clube/discovery.mjs's
// scope: it never decides canonical identity (that is the ICS UID, read
// by ingestion/village-underground/observation-adapter.mjs from the
// downloaded .ics itself — see that module's doc comment for why this
// source's ICS UID, unlike Hot Clube's, is genuinely stable) and it never
// guesses a URL. Every returned `icsUrl`/`eventUrl` is built only from a
// slug this module actually found rendered as a Squarespace
// `?format=ical` export link on the events index page itself.

const ICAL_LINK_RE = /href="\/eventos\/([a-z0-9-]+)\?format=ical"/g;

/**
 * Parse one Village Underground events-index HTML document into discovery
 * records, one per distinct event slug (the live page can render the same
 * `?format=ical` link more than once — e.g. list and calendar views — so
 * records are deduplicated by slug; first occurrence order is kept).
 *
 * Each record: `{ slug, event_url, ics_url }`. Returns an empty array
 * (never throws) if no such links are present, since "this page currently
 * lists nothing" is a legitimate discovery result, not a parse failure.
 */
export function parseVillageUndergroundDiscovery(html, { baseUrl = "https://vulisboa.com" } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Village Underground events-index HTML");
  }

  const seen = new Set();
  const records = [];
  const re = new RegExp(ICAL_LINK_RE);
  let match;

  while ((match = re.exec(html))) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    seen.add(slug);

    records.push({
      slug,
      event_url: `${baseUrl}/eventos/${slug}`,
      ics_url: `${baseUrl}/eventos/${slug}?format=ical`,
    });
  }

  return records;
}
