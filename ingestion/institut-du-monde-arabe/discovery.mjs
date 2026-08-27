// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Institut du Monde Arabe's
// "Les Escales musicales du musée" series (a genuine, recurring monthly
// music series — see
// research/source-investigations/institut-du-monde-arabe-paris-01/) is
// plain, server-rendered static HTML: a listing page whose own
// '.cards-grid' carries one dated card per upcoming instance, each linking
// to its own detail page whose sidebar accordions state exact time/
// duration ('Dates & horaires') and location ('Lieu') as plain text. No
// JSON-LD Event, no REST API, no ICS feed exists for this content — see
// the governed investigation's own site_classification.
//
// This module performs NO network I/O. It never decides what counts as
// "music" (the listing page investigated here IS already the venue's own
// music-specific agenda category, unlike a mixed-discipline listing).

const FRENCH_MONTHS = Object.freeze({
  janvier: "01",
  février: "02",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  août: "08",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  décembre: "12",
  decembre: "12",
});

const CARD_RE = /<div class="card card-default[\s\S]*?<div class="dates">\s*([^<]+?)\s*<\/div>[\s\S]*?<h3>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;

/**
 * Extract every event card from one retained "Les Escales musicales du
 * musée" (or similarly structured) listing page: `{ title, href, dateText
 * }` per card, in page order. Throws for empty input; returns `[]` (never
 * throws) for a well-formed page with genuinely no cards — a legitimate
 * "nothing currently scheduled" result.
 */
export function extractEscaleCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("extractEscaleCards requires non-empty HTML");
  }
  const cards = [];
  const re = new RegExp(CARD_RE.source, CARD_RE.flags);
  let match;
  while ((match = re.exec(html)) !== null) {
    cards.push({ dateText: match[1].trim(), href: match[2].trim(), title: match[3].trim() });
  }
  return cards;
}

/**
 * Parse this source's own French "D month YYYY" full-date text (e.g. "16
 * septembre 2026") into an ISO "YYYY-MM-DD" calendar date. This is the
 * card's OWN directly-stated date — day, month, AND year are all present
 * in this one string, so this is plain parsing, not context-derivation.
 * Returns null (never throws) if the text does not match this exact shape.
 */
export function parseFrenchFullDate(dateText) {
  if (typeof dateText !== "string") return null;
  const match = /^(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})$/i.exec(dateText.trim());
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = FRENCH_MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function findCompleteDiv(html, anchorId) {
  const anchor = `id="${anchorId}"`;
  const anchorIdx = html.indexOf(anchor);
  if (anchorIdx === -1) return null;
  const divStart = html.lastIndexOf("<div", anchorIdx);
  if (divStart === -1) return null;

  let depth = 0;
  let pos = divStart;
  while (true) {
    const nextOpen = html.indexOf("<div", pos + 1);
    const nextClose = html.indexOf("</div>", pos + 1);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen;
    } else if (depth > 0) {
      depth--;
      pos = nextClose;
    } else {
      return html.slice(divStart, nextClose + "</div>".length);
    }
  }
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract this event's own "Dates & horaires" sidebar accordion text from
 * one retained detail page — this source's own plain-text statement of
 * time-of-day and duration for the specific event the page describes.
 * Returns `{ dateTimeText, durationText }`, each `null` if not found.
 */
export function extractDatesHorairesText(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("extractDatesHorairesText requires non-empty HTML");
  }
  const block = findCompleteDiv(html, "accordion-content-field_dates_text_sidebar");
  if (!block) return { dateTimeText: null, durationText: null };
  const paragraphs = [...block.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1]));
  return {
    dateTimeText: paragraphs[0] ?? null,
    durationText: paragraphs[1] ?? null,
  };
}

/**
 * Extract this event's own "Lieu" sidebar accordion text from one retained
 * detail page — this source's own plain-text statement of WHERE, within
 * the institute's own building, the event takes place. Returns the
 * stripped text, or `null` if not found.
 */
export function extractLocationText(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("extractLocationText requires non-empty HTML");
  }
  const block = findCompleteDiv(html, "accordion-content-field_location_text");
  if (!block) return null;
  const match = /<p>([\s\S]*?)<\/p>/.exec(block);
  return match ? stripTags(match[1]) : null;
}

/**
 * Parse this source's own "<Weekday> <D> <month> à <H>h[MM]" time text
 * (e.g. "Mercredi 16 septembre à 19h") into `{ hour, minute }` (minute
 * defaults to "00" when the source states only the hour, e.g. "19h").
 * Returns null (never throws) if no time is present in the text.
 */
export function parseFrenchTimeOfDay(dateTimeText) {
  if (typeof dateTimeText !== "string") return null;
  const match = /à\s+(\d{1,2})h(\d{2})?/i.exec(dateTimeText);
  if (!match) return null;
  return { hour: match[1].padStart(2, "0"), minute: match[2] ?? "00" };
}

/**
 * Parse this source's own "Durée : <H>h[MM]" duration text (e.g. "Durée :
 * 1h") into total minutes. Returns null (never throws) if not present.
 */
export function parseFrenchDurationMinutes(durationText) {
  if (typeof durationText !== "string") return null;
  const match = /(\d{1,2})h(\d{2})?/.exec(durationText);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}
