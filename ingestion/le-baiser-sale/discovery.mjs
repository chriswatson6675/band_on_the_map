// le-baiser-sale-paris-01 — Le Baiser Salé's own bespoke static-HTML card
// parser. See research/source-investigations/le-baiser-sale-paris-01/.
// A custom CMS (no WordPress/Drupal signal detected) server-renders every
// upcoming show directly into the "/fr/agenda" page (and paginated
// "/fr/agenda/page-N" siblings — same markup, not fetched by this
// investigation, see its README.md): one "date-timeline" heading per
// calendar date, each stating the FULL date (day-of-week + day + month +
// YEAR) directly — no page-level month/year context is needed at all,
// unlike this project's usual DETERMINISTIC_CONTEXT worked example — and
// one or more "artist-wrapper" cards immediately following it (until the
// next date-timeline heading) for that date's show(s).
//
// This module performs NO network I/O. It never fabricates a value, never
// invents a venue name/coordinate, and never decides Venue/Event identity
// — see ingestion/observation/contract.mjs for that boundary.

const DATE_HEADING_RE =
  /col-3 col-md-2 agenda-line date-timeline">[\s\S]*?<div class="h5[^>]*>\s*([^<]+?)\s*<\/div>/g;

const CARD_RE =
  /class="artist-wrapper rounded-2 position-relative">[\s\S]*?<i class="far fa-clock me-1"><\/i>\s*(\d{2}:\d{2})[\s\S]*?<h2 class="artist-name[^>]*>\s*<div class="text-editor"><p>([\s\S]*?)<\/p>[\s\S]*?<a class="button button-white button-to-pink button-sm link-concert" href="([^"]+)">/g;

// French day-name/month abbreviations as genuinely observed on this
// site's own date-timeline headings ("Lun. 7 sept. 2026", "Jeu. 27 août
// 2026" — note "août" carries no trailing dot on this source, unlike
// every other abbreviated month). Extended with the remaining standard
// French month abbreviations for robustness across other months of the
// year this bounded investigation's single fetch did not happen to
// sample — never a source-specific guess, just the standard French
// calendar abbreviation set.
const FR_MONTHS = {
  "janv.": "01",
  "févr.": "02",
  mars: "03",
  "avr.": "04",
  mai: "05",
  juin: "06",
  "juil.": "07",
  août: "08",
  "sept.": "09",
  "oct.": "10",
  "nov.": "11",
  "déc.": "12",
};

const FULL_DATE_RE = /^[A-Za-zéû.]+\.?\s+(\d{1,2})\s+([A-Za-zéû]+\.?)\s+(\d{4})$/u;

/**
 * Parse this source's own "Jeu. 27 août 2026" / "Lun. 7 sept. 2026"
 * heading text into a "YYYY-MM-DD" calendar date. Throws on a heading
 * that does not match the expected shape, or an unrecognised month
 * abbreviation — never silently guesses.
 */
export function parseDateHeading(headingText) {
  const cleaned = headingText.replace(/\s+/g, " ").trim();
  const match = FULL_DATE_RE.exec(cleaned);
  if (!match) {
    throw new Error(`Date heading did not match the expected "Day. D month. YYYY" shape: "${headingText}"`);
  }
  const [, dayRaw, monthRaw, year] = match;
  const month = FR_MONTHS[monthRaw.toLowerCase()];
  if (!month) {
    throw new Error(`Unrecognised French month abbreviation "${monthRaw}" in heading "${headingText}"`);
  }
  const day = dayRaw.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&ccedil;/g, "ç")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&ecirc;/g, "ê")
    .replace(/&ugrave;/g, "ù")
    .replace(/&ucirc;/g, "û")
    .replace(/&agrave;/g, "à")
    .replace(/&acirc;/g, "â")
    .replace(/&ocirc;/g, "ô")
    .replace(/&icirc;/g, "î")
    .replace(/&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Extract every event card from the venue's own "/fr/agenda" page HTML,
 * each associated with the nearest PRECEDING date-timeline heading —
 * this source's own structural convention (one heading, one-or-more
 * cards until the next heading), proven by direct positional/structural
 * containment in the retained fixture, not assumed from visual layout.
 * Never throws on zero matches — a genuinely empty page is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Le Baiser Salé agenda-page HTML");
  }

  const headings = [];
  let match;
  DATE_HEADING_RE.lastIndex = 0;
  while ((match = DATE_HEADING_RE.exec(html)) !== null) {
    headings.push({ index: match.index, date: parseDateHeading(match[1]) });
  }

  const cards = [];
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const cardIndex = match.index;
    // The nearest preceding heading (last one whose index < cardIndex).
    let governingDate = null;
    for (const heading of headings) {
      if (heading.index < cardIndex) {
        governingDate = heading.date;
      } else {
        break;
      }
    }
    if (!governingDate) {
      throw new Error(`Event card at offset ${cardIndex} has no preceding date-timeline heading`);
    }

    const [, time, titleHtml, eventUrl] = match;
    cards.push({
      date: governingDate,
      time,
      title: decodeHtmlEntities(titleHtml.replace(/<[^>]+>/g, "")),
      eventUrl,
    });
  }

  return cards;
}
