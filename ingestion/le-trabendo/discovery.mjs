// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Trabendo's own bespoke
// static-HTML card parser — see
// research/source-investigations/le-trabendo-paris-01/. WordPress with no
// queryable REST route for its own "programmation" custom post type
// (confirmed via /wp-json/ and /sitemap.xml during that investigation);
// every event card on the venue's own /programmation/ listing page
// repeats the identical structure:
//
//   <a href="URL" class="link-act event ...">
//     ...
//     <div class="flex">
//       <h2 class="date-event">DD <span>―</span> MONTH_FR YYYY</h2>
//       <h5 class="style">genre</h5>
//     </div>
//     <h3 class="name-event ...">TITLE</h3>
//   </a>
//
// Genuinely bespoke to this exact markup, not shared with any other Paris
// venue in this batch. This module performs no network I/O — it only
// parses already-fetched HTML text.

const MONTH_NAMES_FR = {
  janvier: 1,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
};

// The venue's own page renders every event TWICE — once in the main
// chronological grid (plain class="link-act event") and again, byte-for-
// byte the same event, inside a server-rendered "Votre sélection" filter
// section whose anchor carries extra classes/attributes for client-side
// JS filtering (class="link-act event bl-filt <month> <year> <type>"
// data-month="..."). `[^>]*` after the class attribute tolerates that
// extra `data-month` attribute; de-duplication by event URL below keeps
// only one Observation per real event.
const CARD_RE =
  /<a href="([^"]+)" class="link-act event[^"]*"[^>]*>[\s\S]*?<h2 class="date-event">\s*(\d{1,2})\s*<span>[^<]*<\/span>\s*([a-zûéèê]+)\s+(\d{4})\s*<\/h2>[\s\S]*?<h3 class="name-event[^"]*">([^<]+)<\/h3>/g;

function decodeEntities(text) {
  return text
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .trim();
}

/**
 * Extract every event card from the venue's own /programmation/ listing
 * page HTML. Never throws on zero matches — a genuinely empty listing is
 * legitimate. Skips (never fabricates) a card whose month name is not
 * recognised.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Le Trabendo programmation-page HTML");
  }
  const cards = [];
  const seenUrls = new Set();
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, url, day, monthName, year, title] = match;
    if (seenUrls.has(url)) continue; // this page renders every real event twice (grid + filter section) — keep one
    const month = MONTH_NAMES_FR[monthName.toLowerCase()];
    if (!month) continue; // never guess an unrecognised month name
    const dayNum = Number(day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) continue;
    seenUrls.add(url);
    cards.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
      eventUrl: url,
      title: decodeEntities(title),
    });
  }
  return cards;
}
