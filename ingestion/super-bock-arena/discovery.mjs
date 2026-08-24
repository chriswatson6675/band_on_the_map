// Parses genuinely retrieved Super Bock Arena — Pavilhão Rosa Mota public
// agenda-listing HTML (https://www.superbockarena.pt/agenda/) into small,
// structured per-event discovery records.
//
// LISBON-PORTO-P1-SOURCE-AUTOMATION-01: proven live. The venue runs "The
// Events Calendar" WordPress plugin's list view: every event is a
// `<div id="post-{id}" class="type-tribe_events post-{id} ...">` block,
// carrying the plugin's own first-party taxonomy classes
// (`tribe-events-category-{slug}`, e.g. "pop-rock", "fado",
// "concertos-en", but also "gaming"/"circo"/"stand-up-comedy" for the
// venue's genuinely non-music programming), grouped under repeating
// `<h2 class='tribe-events-list-separator-month'><span>{Month} {Year}</span></h2>`
// section headers. This module reads only this one listing page — no
// `<link rel="next">` pagination pointer was found live (the list already
// runs from "now" through the venue's furthest-booked date, currently
// late 2027), so no follow-on pages are fetched.
//
// Stable identifier: the WordPress post id embedded directly in the
// block's own `id="post-{id}"` attribute — never guessed, never derived
// from the event's own title/slug.
//
// Date text shape (important — see
// ingestion/super-bock-arena/observation-adapter.mjs's own doc comment
// for how this is combined into a full calendar date): each event's own
// `<span class="tribe-event-date-start">` carries "D Month[, YYYY],
// HH:MM" — the plugin's own date formatter OMITS the year whenever the
// event falls in the SAME calendar year as the page's own current-year
// context (observed live: every 2026 event's date-start text has no
// year at all; every 2027+ event's date-start text DOES carry its own
// explicit year, e.g. "6 Janeiro 2027, 20:30"). Retained verbatim here;
// never reshaped in this module.

const CARD_SPLIT_RE = /(?=<div id="post-\d+" class="type-tribe_events)/;
const MONTH_HEADER_RE = /<h2 class='tribe-events-list-separator-month'><span>([^<]*)<\/span><\/h2>/;
const ID_AND_CATEGORIES_RE = /<div id="post-(\d+)" class="type-tribe_events\s+post-\d+\s+([^"]*)"/;
const CATEGORY_SLUG_RE = /tribe-events-category-([a-z0-9-]+)/g;
const TITLE_RE = /tribe-event-url" href="([^"]*)" title="([^"]*)"/;
const DATE_START_RE = /tribe-event-date-start">([^<]*)</;
const COST_RE = /ticket-cost">([^<]*)</;

/**
 * Parse one Super Bock Arena /agenda/ HTML document into discovery
 * records, one per distinct WordPress post id (deduplicated; first
 * occurrence order kept). Each record carries every category class the
 * source itself applied (`categories`) and the governing month/year
 * section header text it was found under (`month_header_text`) — both
 * read directly from the page, never inferred from anything outside it.
 *
 * Each record: `{ source_record_id, title, categories, date_text,
 * month_header_text, price_text, event_url }`. Returns an empty array
 * (never throws) if no event blocks are present. Throws only on empty/
 * non-string input, matching every other discovery module's convention.
 */
export function parseSuperBockArenaAgenda(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Super Bock Arena agenda HTML");
  }

  const seen = new Set();
  const records = [];
  let currentMonthHeader = null;

  for (const block of html.split(CARD_SPLIT_RE)) {
    // IMPORTANT: because CARD_SPLIT_RE splits right at the START of each
    // event's own `<div id="post-...">`, a month/year `<h2>` separator
    // that this venue's own markup renders BETWEEN two events' cards
    // ends up as TRAILING content inside the PRECEDING event's block,
    // not leading content in the following one (confirmed live: e.g. the
    // "Outubro 2026" separator that governs Simone Mendes' card is
    // physically emitted right after Placebo's own card markup, still
    // inside Placebo's own — genuinely September — block). So a header
    // found inside THIS block governs the NEXT event, never this one:
    // this event's own record is pushed first, using whatever header was
    // already current, and only then does this block's own trailing
    // header (if any) update currentMonthHeader for the following
    // iteration.
    const idMatch = ID_AND_CATEGORIES_RE.exec(block);
    if (idMatch) {
      const [, id, classAttr] = idMatch;
      if (!seen.has(id)) {
        seen.add(id);

        const categories = [...classAttr.matchAll(CATEGORY_SLUG_RE)].map((m) => m[1]);
        const titleMatch = TITLE_RE.exec(block);
        const dateMatch = DATE_START_RE.exec(block);
        const costMatch = COST_RE.exec(block);

        records.push({
          source_record_id: id,
          title: titleMatch ? titleMatch[2].trim() : null,
          categories,
          date_text: dateMatch ? dateMatch[1].trim() : null,
          month_header_text: currentMonthHeader,
          price_text: costMatch ? costMatch[1].trim() : null,
          event_url: titleMatch ? titleMatch[1] : null,
        });
      }
    }

    const headerMatch = MONTH_HEADER_RE.exec(block);
    if (headerMatch) currentMonthHeader = headerMatch[1].trim();
  }

  return records;
}

// Every first-party genre/format category slug this venue's own taxonomy
// uses for genuine music performances, confirmed against the live listing
// (LISBON-PORTO-P1-SOURCE-AUTOMATION-01). Deliberately excludes this same
// venue's own non-music categories actually observed live — "gaming"
// (esports), "stand-up-comedy", "danca" (dance), "infantil-2" (children's
// entertainment), "musical" (stage musical/theatre), "circo" (circus).
// "concertos-en" is the venue's own general "Concerts" tag (English-slug
// artifact of a bilingual WordPress install) and is retained alongside
// the genre-specific tags because several genuine concerts (e.g. Il Volo,
// Lisbon Film Orchestra) carry only "classica"/"concertos-en", while
// others (e.g. David Fonseca) carry only a genre tag with no
// "concertos-en" at all — this project's rule is deterministic
// first-party categories, not a single required tag.
export const MUSIC_CATEGORY_SLUGS = new Set([
  "concertos-en",
  "pop-rock",
  "musica-brasileira",
  "musica-portuguesa",
  "eletronica",
  "fado",
  "classica",
  "forro",
  "sertanejo",
]);

/**
 * Keep only records carrying at least one of this venue's own
 * MUSIC_CATEGORY_SLUGS categories — deterministic, first-party,
 * never AI/heuristic classification. A record with no music category at
 * all (e.g. "gaming", "circo", "stand-up-comedy" only) is excluded even
 * when it also carries an unrelated non-music tag alongside a music one
 * only if NEITHER tag is in the music set; a record carrying a mix of a
 * music tag and a non-music tag (e.g. "Canta-me uma História" — carries
 * both "concertos-en"/"musica-portuguesa" AND "stand-up-comedy") is kept,
 * since the venue's own taxonomy already asserts it is (among other
 * things) a music event.
 */
export function filterMusicRecords(records) {
  return (records ?? []).filter((record) => (record.categories ?? []).some((slug) => MUSIC_CATEGORY_SLUGS.has(slug)));
}
