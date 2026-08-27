// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Truskel (Paris)'s own
// bespoke discovery step. See
// research/source-investigations/truskel-paris-01/.
//
// Truskel (Wix) does NOT expose one bulk JSON-LD array like Tempodrom
// Berlin or Waldbühne Berlin — it exposes exactly one schema.org Event
// JSON-LD block PER individual /event-details/<slug> page, and the
// task-given official events URL (truskel.fr/copie-de-concerts-4) is
// stale (confirmed HTTP 404 — see the investigation's probe_history).
// The only genuinely new code this source needs is: enumerate the current
// event-details URLs from the site's own Wix-generated sitemap.xml ->
// event-pages-sitemap.xml (a plain, publicly-referenced static XML file),
// then fetch each page and hand its HTML to the EXISTING, unmodified
// ingestion/json-ld/ family (extractEventNodes/normaliseJsonLdEvent) —
// exactly the same "list page links to detail pages, each with its own
// JSON-LD" shape ingestion/html-link-discovery/discovery.mjs already
// generalises, just sourced from a sitemap instead of an HTML <a> list.
//
// This module performs no network I/O itself and no JSON-LD parsing — it
// only extracts <loc> URLs from an already-fetched sitemap XML body. Pure,
// dependency-free, and easily unit-tested against a retained fixture.

const LOC_RE = /<loc>([^<]+)<\/loc>/g;
const EVENT_DETAILS_RE = /\/event-details\//;

/**
 * Extract every distinct `/event-details/<slug>` URL from an already-
 * fetched `event-pages-sitemap.xml` (or the root `sitemap.xml`, if a
 * caller ever points this at a differently-shaped Wix sitemap) response
 * body, in document order, deduplicated. Never throws on zero matches —
 * a genuinely empty/non-event sitemap is a legitimate (if unlikely)
 * result, matching every other discovery module's convention in this
 * project.
 */
export function extractEventDetailUrls(xml) {
  if (typeof xml !== "string" || xml.trim() === "") {
    throw new Error("extractEventDetailUrls requires non-empty sitemap XML");
  }

  const seen = new Set();
  const urls = [];
  let match;
  LOC_RE.lastIndex = 0;
  while ((match = LOC_RE.exec(xml)) !== null) {
    const url = match[1].trim();
    if (!url || !EVENT_DETAILS_RE.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

const SLUG_RE = /\/event-details\/([^/?#]+)\/?$/;

/**
 * Derive this source's own stable `source_record_id` from an
 * event-details page's own JSON-LD node — the site's own permanent
 * `/event-details/{slug}` permalink slug (read from the Event's nested
 * `location.url`, since this source places the canonical page URL there
 * rather than on the Event node itself), matching the same "URL slug is
 * this source's own canonical, stable identity" judgement already
 * documented for moog-barcelona-01/LAV and tempodrom-berlin-01. Returns
 * `null` (never a fabricated fallback) if the shape does not match.
 */
export function deriveSourceRecordId(node) {
  const url = node?.location?.url;
  if (typeof url !== "string") return null;
  const match = SLUG_RE.exec(url);
  return match ? match[1] : null;
}
