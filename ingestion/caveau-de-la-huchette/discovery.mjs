// caveau-de-la-huchette-paris-01 — Le Caveau de la Huchette's own bespoke
// free-text residency-block parser. See
// research/source-investigations/caveau-de-la-huchette-paris-01/. A
// "simply-website.net"-hosted site with month-by-month pages
// (/1/concerts_{month}_{year}_{id}.html, discoverable from the homepage's
// own nav links). Each month page states its own month/year ONCE
// ("Septembre 2026"), then one compact summary paragraph listing every
// booking as one <br />-separated line: a French date phrase (a single
// day, an "et"-joined pair of days, or a "(Du) ... au ..." day range —
// the month name itself is repeated on most, but not all, lines) followed
// by " : " and the performing act's name.
//
// This module performs NO network I/O. It never fabricates a value —
// a date phrase this project's fixed rule set cannot parse deterministic-
// ally is skipped (reported, never guessed at).

const FR_MONTHS = {
  janvier: "01",
  "février": "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  "août": "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  "décembre": "12",
};

/** Parse a "<span style="font-family: 'comic sans ms', ...">Septembre 2026</span>"-style page heading into { month: "09", year: "2026" }. */
export function parsePageMonthHeading(headingText) {
  const cleaned = headingText.replace(/\s+/g, " ").trim();
  const match = /^(\p{L}+)\s+(\d{4})$/u.exec(cleaned);
  if (!match) {
    throw new Error(`Page month heading did not match the expected "Month YYYY" shape: "${headingText}"`);
  }
  const month = FR_MONTHS[match[1].toLowerCase()];
  if (!month) {
    throw new Error(`Unrecognised French month name "${match[1]}" in page heading "${headingText}"`);
  }
  return { month, year: match[2] };
}

const RANGE_RE = /^(?:Du\s+)?\S+\s+(\d{1,2})(?:er)?\s+au\s+\S+\s+(\d{1,2})(?:er)?(?:\s+(\p{L}+))?$/iu;
const TWO_RE = /^\S+\s+(\d{1,2})(?:er)?\s+et\s+\S+\s+(\d{1,2})(?:er)?(?:\s+(\p{L}+))?$/iu;
const SINGLE_RE = /^\S+\s+(\d{1,2})(?:er)?(?:\s+(\p{L}+))?$/iu;

/**
 * Parse one French date-phrase ("Mardi 1er et mercredi 2 septembre",
 * "Du lundi 21 au jeudi 24 septembre", "Samedi 5 septembre",
 * "Dimanche 13" [no month — falls back to the page's own month/year
 * context]) into { startDate, endDate } ("YYYY-MM-DD" strings; endDate ===
 * startDate for a single-day phrase). `pageContext` supplies { month,
 * year } for a phrase that omits the month itself — the SAME
 * DETERMINISTIC_CONTEXT combination this project's policy already
 * documents (a page-level heading governing every line beneath it).
 * Throws (never guesses) on a phrase this fixed rule set cannot resolve.
 */
export function parseDatePhrase(phraseText, pageContext) {
  const cleaned = phraseText.replace(/\s+/g, " ").trim();

  const monthFor = (capturedMonth) => {
    if (capturedMonth) {
      const key = capturedMonth.toLowerCase();
      const resolved = FR_MONTHS[key];
      if (resolved) return { month: resolved, year: pageContext.year };
    }
    return pageContext;
  };

  let match = RANGE_RE.exec(cleaned);
  if (match) {
    const { month, year } = monthFor(match[3]);
    return {
      startDate: `${year}-${month}-${match[1].padStart(2, "0")}`,
      endDate: `${year}-${month}-${match[2].padStart(2, "0")}`,
    };
  }

  match = TWO_RE.exec(cleaned);
  if (match) {
    const { month, year } = monthFor(match[3]);
    return {
      startDate: `${year}-${month}-${match[1].padStart(2, "0")}`,
      endDate: `${year}-${month}-${match[2].padStart(2, "0")}`,
    };
  }

  match = SINGLE_RE.exec(cleaned);
  if (match) {
    const { month, year } = monthFor(match[2]);
    const date = `${year}-${month}-${match[1].padStart(2, "0")}`;
    return { startDate: date, endDate: date };
  }

  throw new Error(`Date phrase did not match any known pattern: "${phraseText}"`);
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&ecirc;/g, "ê")
    .replace(/&agrave;/g, "à")
    .replace(/&acirc;/g, "â")
    .replace(/&ocirc;/g, "ô")
    .replace(/&icirc;/g, "î")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Extract every real booking line from one month page's own HTML: the
 * page's own month/year heading, plus each "DatePhrase : Title" line from
 * the single summary paragraph immediately following it. A line whose
 * date phrase cannot be deterministically parsed is reported in
 * `unparsed` (never silently dropped, never guessed).
 */
export function extractResidencyCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Caveau de la Huchette month-page HTML");
  }

  const headingMatch = /<span style="font-family: 'comic sans ms', sans-serif;">([^<]+)<\/span>/.exec(html);
  if (!headingMatch) {
    throw new Error("Could not find the page's own month/year heading");
  }
  const pageContext = parsePageMonthHeading(headingMatch[1]);

  const afterHeading = html.slice(headingMatch.index + headingMatch[0].length);
  const summaryMatch = /<p>([\s\S]*?)<\/p>/.exec(afterHeading);
  if (!summaryMatch) {
    throw new Error("Could not find the summary paragraph following the month/year heading");
  }

  const lines = summaryMatch[1]
    .split(/<br\s*\/?>/i)
    .map((line) => decodeHtmlEntities(line.replace(/<[^>]+>/g, "")))
    .filter((line) => line !== "");

  const cards = [];
  const unparsed = [];

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length < 2) {
      unparsed.push(line);
      continue;
    }
    const phraseText = parts[0].trim();
    const title = parts.slice(1).join(":").trim();
    try {
      const { startDate, endDate } = parseDatePhrase(phraseText, pageContext);
      cards.push({ startDate, endDate, title });
    } catch {
      unparsed.push(line);
    }
  }

  return { cards, unparsed };
}
