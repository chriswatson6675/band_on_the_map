// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — a small, reusable family
// for the shared WordPress "evenement" custom-post-type archive theme
// (child theme family "vkd_tem" / "vkdchild_*") observed live, byte-
// identically in structure, at BOTH Le Trianon
// (research/source-investigations/le-trianon-paris-01/) and Élysée
// Montmartre (research/source-investigations/elysee-montmartre-paris-01/)
// — co-managed venues sharing the same ticketing back-office ("Hubber")
// and, more importantly for acquisition purposes, the exact same
// WordPress theme markup for their own events archive page:
//
//   <div class="bloc_extrait evenement ..." data-id="12345">
//     <a href="https://.../en/event/{slug}/" title="TITLE" class="link"></a>
//     ...
//     <div class="date">Sunday 30 August 2026</div>   (or French: "mardi 01 septembre 2026")
//     <div class="titre">TITLE</div>
//     [<div class="flag"><span>Sold out</span></div>]
//   </div>
//
// Genuinely reusable, not a coincidence: both sources' own "date" text
// ALWAYS includes day-name + day + month-name + FULL YEAR directly on the
// card itself (English on Le Trianon, French on Élysée Montmartre) — no
// month/year-heading inheritance is needed here (unlike the v1.2
// DETERMINISTIC_CONTEXT scenario), because every card already states its
// own complete date as DIRECT_SOURCE. This module performs no network
// I/O; it only parses already-fetched HTML text.

const MONTH_NAMES = {
  // English
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // French
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
};

/**
 * Parse this theme's own card date text (e.g. "Sunday 30 August 2026" or
 * "mardi 01 septembre 2026") into a "YYYY-MM-DD" calendar date. Returns
 * null if the text does not match the expected shape — never guesses.
 */
export function parseCardDateText(dateText) {
  if (typeof dateText !== "string") return null;
  const trimmed = dateText.trim().replace(/\s+/g, " ");
  const match = /^\S+\s+(\d{1,2})\s+([A-Za-zÀ-ſ]+)\s+(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, dayStr, monthName, yearStr] = match;
  const month = MONTH_NAMES[monthName.toLowerCase()];
  if (!month) return null;
  const day = Number(dayStr);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${yearStr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Extract every event card from one already-fetched "evenement" archive
 * page (Le Trianon's /en/event/, Élysée Montmartre's /fr/programmation/).
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty wp-evenement-cards archive page HTML");
  }
  const blocks = html.split(/(?=<div class="bloc_extrait evenement)/);
  const cards = [];
  for (const block of blocks.slice(1)) {
    const idMatch = /data-id="(\d+)"/.exec(block);
    const hrefMatch = /href="([^"]+)" title="([^"]*)"/.exec(block);
    const dateMatch = /<div class="date">([^<]*)<\/div>/.exec(block);
    const titreMatch = /<div class="titre">([^<]*)<\/div>/.exec(block);
    const flagMatch = /<div class="flag"><span>([^<]*)<\/span><\/div>/.exec(block);
    if (!idMatch || !hrefMatch || !dateMatch || !titreMatch) continue; // not a well-formed card — skip, never fabricate
    cards.push({
      sourceRecordId: idMatch[1],
      eventUrl: hrefMatch[1],
      title: titreMatch[1]
        .trim()
        .replace(/&#8211;/g, "–")
        .replace(/&#038;/g, "&")
        .replace(/&amp;/g, "&"),
      dateText: dateMatch[1].trim(),
      soldOut: flagMatch ? /sold out/i.test(flagMatch[1]) : false,
    });
  }
  return cards;
}
