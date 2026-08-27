// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Duc des Lombards (42 rue
// des Lombards, 75001 Paris), a Drupal install (theme path
// /sites/all/themes/t_ducdeslombards/) whose own "L'Agenda" page
// (https://ducdeslombards.com/fr/l-agenda) server-renders a genuine,
// static event-card listing directly in the initial HTML — see
// research/source-investigations/duc-des-lombards-paris-01/. No JSON-LD
// Event data anywhere (only a generic Article/Organization block); a
// separate "sonic-tickets-app" booking widget exists for the checkout flow
// but is not this source's own acquisition path.
//
// Each event card (`<article class="... mosaique-evt-item-container ...">`)
// states its own title, day-name + day-number + month-abbreviation (e.g.
// "01 sept."), and one or more showtimes, each with its own time text
// (e.g. "19H30") and a distinct Drupal node id (`data-nid="(NNNNN)"`) — a
// multi-night run (e.g. "Du mar. 1 au jeu. 3 sept.") repeats this
// day+time+nid structure once per night, each night's own node id
// genuinely distinct. This project treats each (day, time, nid) triple as
// one observation (multiple Observations may later resolve to one Event —
// see docs/ARCHITECTURE.md), matching how a run of nightly showtimes is
// already handled for other bespoke sources in this project.
//
// The card's own date text never states a YEAR — only day + month
// abbreviation. This page's own month/year separator headings
// (`<div id="YYYY-MM" ... aria-label="<month name> <year>">`) are a
// directly machine-readable `id` attribute (not just human-readable text)
// stating the year+month every event card between it and the next
// separator belongs to — the exact DETERMINISTIC_CONTEXT pattern
// documented in docs/SOURCE_INVESTIGATION_POLICY.md's "Field-value basis
// (v1.2)" section: the nearest PRECEDING separator governs every card
// until the next one. This module performs that combination mechanically;
// it never guesses a year from "today's date" or any other assumption.

const SEPARATOR_OR_ARTICLE_RE =
  /<div id="(\d{4}-\d{2})" class="col-xs-12[^"]*separateur-mois-jour[^"]*" aria-label="[^"]+">|<article class="[^"]*mosaique-evt-item-container[^"]*">([\s\S]*?)<\/article>/g;

const SLUG_RE = /<a href="\/fr\/l-agenda\/([a-z0-9-]+)"/;
const TITLE_RE = /<h3 class="mosaique-evt-titre mb-xxs">\s*([^<]+?)\s*<\/h3>/;
const DATE_HEADER_RE =
  /<div class="mosaique-evt-date-header h4"\s*>\s*<div class="evt-date-jour">([^<]*)<\/div>\s*<div>([^<]*)<\/div>\s*<\/div>([\s\S]*?)(?=<div class="mosaique-evt-date-header h4"|$)/g;
const NID_TIME_RE = /data-nid="\((\d+)\)">\s*<div class="evt-date-heure">([^<]*)<\/div>/g;
const DAY_MONTH_RE = /^(\d{1,2})\s+(\S+)/;
const TIME_RE = /^(\d{1,2})H(\d{2})?$/i;

function foldMonth(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\.$/, "");
}

// French month abbreviations (as this site's own cards spell them) to
// two-digit numbers. Longer/more-specific prefixes checked first so
// "juil" (juillet) is never mistaken for "juin".
const MONTH_PREFIXES = [
  ["janv", "01"],
  ["fevr", "02"],
  ["mars", "03"],
  ["avr", "04"],
  ["mai", "05"],
  ["juin", "06"],
  ["juil", "07"],
  ["aout", "08"],
  ["sept", "09"],
  ["oct", "10"],
  ["nov", "11"],
  ["dec", "12"],
];

function monthNumberFromAbbrev(text) {
  const folded = foldMonth(text);
  const hit = MONTH_PREFIXES.find(([prefix]) => folded.startsWith(prefix));
  return hit ? hit[1] : null;
}

/**
 * Extract every (title, date, time, node-id) occurrence from the venue's
 * own "L'Agenda" listing HTML, combining each card's own day+month with
 * the nearest PRECEDING month/year separator's `id="YYYY-MM"` attribute
 * (DETERMINISTIC_CONTEXT — see this module's own doc comment above).
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 * An occurrence whose year cannot be determined (no separator precedes it
 * at all) is returned with `yearMonth: null` rather than guessed.
 */
export function extractEventOccurrences(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Le Duc des Lombards agenda HTML");
  }

  const occurrences = [];
  let currentYearMonth = null;
  let match;
  SEPARATOR_OR_ARTICLE_RE.lastIndex = 0;
  while ((match = SEPARATOR_OR_ARTICLE_RE.exec(html)) !== null) {
    const [, separatorYearMonth, articleBody] = match;
    if (separatorYearMonth) {
      currentYearMonth = separatorYearMonth;
      continue;
    }

    const slugMatch = SLUG_RE.exec(articleBody);
    const titleMatch = TITLE_RE.exec(articleBody);
    if (!slugMatch || !titleMatch) continue; // not a genuine event card — skip rather than guess

    const slug = slugMatch[1];
    const title = titleMatch[1].trim();

    DATE_HEADER_RE.lastIndex = 0;
    let headerMatch;
    while ((headerMatch = DATE_HEADER_RE.exec(articleBody)) !== null) {
      const [, , dayMonthText, rest] = headerMatch;
      const dayMonthMatch = DAY_MONTH_RE.exec(dayMonthText.trim());
      if (!dayMonthMatch) continue;
      const [, day, monthAbbrev] = dayMonthMatch;
      const monthNumber = monthNumberFromAbbrev(monthAbbrev);

      NID_TIME_RE.lastIndex = 0;
      let nidMatch;
      while ((nidMatch = NID_TIME_RE.exec(rest)) !== null) {
        const [, nid, timeText] = nidMatch;
        const timeMatch = TIME_RE.exec(timeText.trim());
        occurrences.push({
          slug,
          title,
          eventUrl: `https://ducdeslombards.com/fr/l-agenda/${slug}`,
          nodeId: nid,
          day,
          monthNumber,
          yearMonth: monthNumber ? currentYearMonth : null,
          date:
            monthNumber && currentYearMonth
              ? `${currentYearMonth.slice(0, 4)}-${monthNumber}-${day.padStart(2, "0")}`
              : null,
          hour: timeMatch ? timeMatch[1].padStart(2, "0") : null,
          minute: timeMatch ? timeMatch[2] ?? "00" : null,
          rawDateText: dayMonthText.trim(),
          rawTimeText: timeText.trim(),
        });
      }
    }
  }
  return occurrences;
}
