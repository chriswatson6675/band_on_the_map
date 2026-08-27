// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — bespoke collector for Petit
// Bain's own official agenda page (https://petitbain.org/agenda/), a
// bespoke WordPress theme ("petitbain") with a custom post type
// "evenement". Each event is a static, repeated card:
//
//   <div class="unevt post-{ID} evenement type-evenement status-publish
//        has-post-thumbnail hentry[ billetterie-complet] categorie-...">
//     <a href="https://petitbain.org/evenement/{slug}/">
//       ...
//       <div id="ladatevtmin"> {weekday-abbrev} {day} {month-name-fr} </div>
//       <div class="titevtprog">
//         <span class="titartprog"> {headliner} </span>
//         [<span class="titartprog"> {support act} </span> ...]
//       </div>
//     </a>
//   </div>
//
// Genuinely distinct from the shared ingestion/wp-evenement-cards/ family
// (Le Trianon / Élysée Montmartre): this theme's own card markup
// ("unevt"/"ladatevtmin"/"titevtprog"/"titartprog") never matches that
// family's ("bloc_extrait evenement"/"date"/"titre"), and — critically —
// this source's own card date text NEVER includes a year anywhere, on
// either the agenda list or a per-event detail page (confirmed by
// research/source-investigations/petit-bain-paris-01/), unlike Le
// Trianon/Élysée Montmartre which always state a full day-name + day +
// month + FULL YEAR string. This module performs no network I/O; it only
// parses already-fetched HTML text.

const MONTH_NAMES_FR = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

/**
 * Parse this theme's own card date text (e.g. "dim 18 octobre" or
 * "mar 20 octobre") into { dayOfMonth, month } — day and month ONLY.
 * Deliberately never returns/guesses a year: this source's own pages
 * never state one anywhere (see investigation.json), so inventing one
 * here would violate the project's no-fabrication rule. Returns null if
 * the text does not match the expected shape.
 */
export function parseCardDateText(dateText) {
  if (typeof dateText !== "string") return null;
  const trimmed = dateText.trim().replace(/\s+/g, " ");
  const match = /^\S+\s+(\d{1,2})\s+([A-Za-zÀ-ſ]+)$/.exec(trimmed);
  if (!match) return null;
  const [, dayStr, monthName] = match;
  const month = MONTH_NAMES_FR[monthName.toLowerCase()];
  if (!month) return null;
  const day = Number(dayStr);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return { day, month };
}

/**
 * Extract every event card from one already-fetched agenda page
 * (https://petitbain.org/agenda/). Never throws on zero matches — a
 * genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Petit Bain agenda page HTML");
  }
  const blocks = html.split(/(?=<div class="unevt )/);
  const cards = [];
  for (const block of blocks.slice(1)) {
    const classMatch = /^<div class="unevt post-(\d+) evenement ([^"]*)"/.exec(block);
    const hrefMatch = /<a href="(https:\/\/petitbain\.org\/evenement\/[^"]+)">/.exec(block);
    const dateMatch = /<div id="ladatevtmin">\s*([\s\S]*?)<\/div>/.exec(block);
    if (!classMatch || !hrefMatch || !dateMatch) continue; // not a well-formed card — skip, never fabricate

    // Two card sub-templates observed on this theme: a "concert" template
    // (repeated <span class="titartprog"> — headliner + support acts) and
    // a "soirée/club" template (a single <div id="nomsoiree"> party name,
    // no separate support-act list). Both are handled honestly; neither
    // is invented if absent.
    const titleSpans = [...block.matchAll(/<span class="titartprog">\s*([^<]*?)\s*<\/span>/g)].map((m) => m[1].trim());
    const nomSoireeMatch = /<div id="nomsoiree">\s*([^<]*?)\s*<\/div>/.exec(block);

    let title = null;
    let supportActs = [];
    if (titleSpans.length > 0) {
      title = titleSpans[0];
      supportActs = titleSpans.slice(1);
    } else if (nomSoireeMatch) {
      title = nomSoireeMatch[1].trim();
    }
    if (!title) continue; // neither template matched — skip, never fabricate a title

    const rawClasses = classMatch[2];
    const dateText = dateMatch[1].replace(/\s+/g, " ").trim();

    cards.push({
      sourceRecordId: classMatch[1],
      eventUrl: hrefMatch[1],
      title,
      supportActs,
      dateText,
      soldOut: /\bbilletterie-complet\b/.test(rawClasses),
    });
  }
  return cards;
}
