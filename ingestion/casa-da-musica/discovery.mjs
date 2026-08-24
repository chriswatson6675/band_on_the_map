// Parses genuinely retrieved Casa da Música public agenda-listing HTML
// (https://casadamusica.com/agenda/) into small, structured per-session
// discovery records.
//
// LISBON-PORTO-OVERNIGHT-COVERAGE-01: proven live. Each session is
// server-rendered as its own `itemscope itemtype="https://schema.org/Event"`
// microdata card (NOT JSON-LD — genuine HTML microdata embedded directly
// in the response body). This module reads only that one listing page per
// call; pagination (a `<link rel="next">` in the document head) is
// discovered separately by parseCasaDaMusicaNextPageUrl() below so a
// caller can decide, per this task's "considerate low-concurrency client"
// rule, how many pages (if any) to follow — this module never follows a
// link itself.
//
// Stable identifier: no numeric id is printed as plain text, but every
// card's own first-party title/image link
// (`/event/{slug}/?selected_session={id}`) embeds Casa da Música's own
// numeric WordPress "session" custom-post-type id — independently
// corroborated against `wp-json/wp/v2/session/{id}` during this task's
// research (see fixtures/casa-da-musica/metadata.json). Read from that
// link only, never guessed.

const CARD_SPLIT_RE = /(?=<div itemscope itemtype="https:\/\/schema\.org\/Event")/;
const SESSION_LINK_RE = /href="(https:\/\/casadamusica\.com\/event\/[a-z0-9-]+\/)\?selected_session=(\d+)"/;
const DATETIME_RE = /datetime="(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"/;
const ROOM_RE = /text-right text-sm font-regular uppercase flex-grow flex flex-col gap-1">\s*<div>([^<]*)<\/div>/;
const TITLE_RE = /itemprop="name">\s*([^<]*?)\s*<\/a>/;
const SUBTITLE_RE = /<\/h2>\s*<div class="text-black text-base font-normal font-regular leading-snug uppercase mt-xs">\s*([^<]*?)\s*<\/div>/;
const DESCRIPTION_RE = /itemprop="description"\s*>\s*([\s\S]*?)\s*<\/div>/;
const PRICE_RE = /&euro;\s*([\d,.]+)\s*<\/span>/;
const NEXT_PAGE_RE = /<link rel="next" href="([^"]+)"\s*\/>/;

/**
 * Parse one Casa da Música /agenda/ (or /agenda/page/N/) HTML document
 * into discovery records, one per distinct session id (deduplicated;
 * first occurrence order kept).
 *
 * Each record: `{ source_record_id, title, subtitle, description,
 * datetime_text, room, price_text, event_url }`. Returns an empty array
 * (never throws) if no cards are present — a legitimate "nothing
 * currently listed" result, not a parse failure.
 */
export function parseCasaDaMusicaAgenda(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Casa da Música agenda HTML");
  }

  const seen = new Set();
  const records = [];

  for (const block of html.split(CARD_SPLIT_RE)) {
    const linkMatch = SESSION_LINK_RE.exec(block);
    if (!linkMatch) continue;

    const [, eventUrl, sessionId] = linkMatch;
    if (seen.has(sessionId)) continue;
    seen.add(sessionId);

    const datetimeMatch = DATETIME_RE.exec(block);
    const roomMatch = ROOM_RE.exec(block);
    const titleMatch = TITLE_RE.exec(block);
    const subtitleMatch = SUBTITLE_RE.exec(block);
    const descriptionMatch = DESCRIPTION_RE.exec(block);
    const priceMatch = PRICE_RE.exec(block);

    records.push({
      source_record_id: sessionId,
      title: titleMatch ? titleMatch[1].trim() : null,
      subtitle: subtitleMatch && subtitleMatch[1].trim() !== "" ? subtitleMatch[1].trim() : null,
      description: descriptionMatch ? descriptionMatch[1].trim() : null,
      datetime_text: datetimeMatch ? datetimeMatch[1] : null,
      room: roomMatch && roomMatch[1].trim() !== "" ? roomMatch[1].trim() : null,
      price_text: priceMatch ? `${priceMatch[1]}€` : null,
      event_url: eventUrl,
    });
  }

  return records;
}

/**
 * Read the document's own `<link rel="next" href="...">` pagination
 * pointer, or null if absent (the last page carries none). Never
 * constructs a page-N URL itself — only reads what the page states.
 */
export function parseCasaDaMusicaNextPageUrl(html) {
  if (typeof html !== "string") return null;
  const match = NEXT_PAGE_RE.exec(html);
  return match ? match[1] : null;
}
