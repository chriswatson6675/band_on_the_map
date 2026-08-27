// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Hasard Ludique's own
// bespoke acquisition path: a single public JSON endpoint
// (`/api/events?limit=54`), discovered via a `data-api` attribute on its
// own /programmation listing page (see
// research/source-investigations/le-hasard-ludique-paris-01/). Unlike a
// conventional structured JSON API, this endpoint's own `items` array
// entries are pre-rendered HTML card fragments (title/date/sub-room/href),
// identical in shape to the static cards on /programmation itself — so
// this module still parses card HTML, just delivered inside one JSON
// response rather than paginated static HTML pages.
//
// Genuinely bespoke to this exact markup shape; not shared by any other
// source in this project.

const CARD_HREF_RE = /<a class="event_card ([a-z]+)" href="([^"]+)"/;
const TITLE_RE = /<h3>([\s\S]*?)<\/h3>/;
const DATE_RE = /<strong>([^<]*)<\/strong>/;
const PLACE_RE = /<span class="place">(?:<i[^>]*><\/i>)?\s*([^<]*)<\/span>/;

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Parse one `items[]` HTML-fragment string (already JSON-decoded, so a
 * plain HTML string, not a JSON-escaped one) into a small card record.
 * Returns null for a fragment that doesn't match the expected shape,
 * rather than throwing — a genuinely different card layout should be
 * skipped and reported by the caller, never crash the whole batch.
 */
export function parseEventCardHtml(html) {
  if (typeof html !== "string" || html.trim() === "") return null;
  const hrefMatch = CARD_HREF_RE.exec(html);
  const titleMatch = TITLE_RE.exec(html);
  const dateMatch = DATE_RE.exec(html);
  if (!hrefMatch || !titleMatch || !dateMatch) return null;
  const placeMatch = PLACE_RE.exec(html);

  return {
    category: hrefMatch[1],
    eventUrl: hrefMatch[2],
    title: decodeHtmlEntities(titleMatch[1]).trim(),
    dateText: decodeHtmlEntities(dateMatch[1]).trim(),
    place: placeMatch ? decodeHtmlEntities(placeMatch[1]).trim() || null : null,
  };
}

/**
 * Extract every event card from the venue's own `/api/events` JSON
 * response body (the full `{ meta, items: [...] }` text, exactly as
 * retrieved). Never throws on zero matches — a genuinely empty listing is
 * legitimate; a fragment that doesn't match the expected card shape is
 * silently skipped (not a fatal error for the whole batch).
 */
export function extractEventCardsFromApiResponse(jsonText) {
  if (typeof jsonText !== "string" || jsonText.trim() === "") {
    throw new Error("Expected non-empty Le Hasard Ludique /api/events response text");
  }
  const body = JSON.parse(jsonText);
  const items = Array.isArray(body?.items) ? body.items : [];
  return items.map(parseEventCardHtml).filter((card) => card !== null);
}
