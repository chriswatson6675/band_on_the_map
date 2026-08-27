// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — La Machine du Moulin
// Rouge's own bespoke static-HTML card parser — see
// research/source-investigations/la-machine-du-moulin-rouge-paris-01/.
// WordPress with no schema.org Event JSON-LD anywhere; every event card
// on the venue's own /agenda/ listing page repeats the identical
// structure:
//
//   <article class="evenement-item ...">
//     <a href="URL" class="lkagenavt">
//       ...
//       <time datetime="2026-08-28T23:59:00+00:00">Ven 28/08</time>
//       ...
//       <h2 class="titevtagenda">TITLE</h2>
//       ...
//       <div id="lieuevtagenda"><span>ROOM</span>[<span>ROOM2</span>]</div>
//     </a>
//   </article>
//
// Genuinely bespoke to this exact markup, not shared with any other Paris
// venue in this batch. This module performs no network I/O — it only
// parses already-fetched HTML text.

const CARD_RE =
  /<article class="evenement-item[^"]*">[\s\S]*?<a href="([^"]+)" class="lkagenavt">[\s\S]*?<time datetime="([^"]+)">[^<]*<\/time>[\s\S]*?<h2 class="titevtagenda">([^<]+)<\/h2>[\s\S]*?<div id="lieuevtagenda">((?:<span>[^<]*<\/span>)+)<\/div>[\s\S]*?<\/article>/g;

const ROOM_RE = /<span>([^<]*)<\/span>/g;

function decodeEntities(text) {
  return text
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .trim();
}

function extractRooms(roomsBlock) {
  const rooms = [];
  let m;
  ROOM_RE.lastIndex = 0;
  while ((m = ROOM_RE.exec(roomsBlock)) !== null) {
    if (m[1]) rooms.push(m[1].trim());
  }
  return rooms;
}

/**
 * Extract every event card from the venue's own /agenda/ listing page
 * HTML. Never throws on zero matches — a genuinely empty listing is
 * legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty La Machine du Moulin Rouge agenda-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, url, isoDatetime, title, roomsBlock] = match;
    cards.push({
      eventUrl: url,
      isoDatetime, // e.g. "2026-08-28T23:59:00+00:00" — the trailing +00:00 is NOT a genuine UTC offset, see observation-adapter.mjs
      title: decodeEntities(title),
      rooms: extractRooms(roomsBlock),
    });
  }
  return cards;
}
