// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Maison de la Radio et de la
// Musique's own bespoke static-HTML card parser over its /agenda listing
// (a plain, paginated Drupal View). See
// research/source-investigations/maison-de-la-radio-et-de-la-musique-paris-01/
// for the governed investigation this is built on.
//
// IMPORTANT, investigation-documented caveat: this source ALSO exposes a
// per-event JSON-LD 'MusicEvent' block on each detail page, but that
// block's own 'startDate' was found to disagree with the corroborated
// list-card time on a real sampled record (14:00 vs the real 20:30). This
// module therefore deliberately parses ONLY the /agenda list card's own
// fields — it never consumes the per-event JSON-LD.
//
// Genuinely bespoke to this exact markup; not shared by any other source
// in this project.

const CARD_START_RE = /<div class="position-relative observable-event[^"]*"\s+data-date="(\d{4}-\d{2}-\d{2})"/g;
const EVENT_TYPE_RE = /<div class="SurTitre mb-1 field_event_type">\s*([^<]*?)\s*<\/div>/;
const TITLE_RE = /<h2 class="Bolder-XXL mb-5">\s*([^<]*?)\s*<\/h2>/;
const LOCATION_RE = /<div class="Small location">\s*([^<]*?)\s*<\/div>/;
const WEEKDAY_TIME_RE = /<div class="Small">\s*([\s\S]*?)<\/div>\s*\n\s*<\/div>\s*\n\s*<\/div>/;
const HREF_RE = /<a href="(\/evenement\/[a-z0-9-]+\?s=(\d+))" title="voir">/;
const MORE_INFO_RE = /<div class="more-info animated-transform-450">([\s\S]*?)<\/div>\s*\n\s*<\/div>/;

function textOf(match) {
  return match ? match[1].replace(/&amp;/g, "&").trim() : null;
}

/**
 * Split the /agenda page's raw HTML into one chunk per event card (from
 * one card's own opening wrapper div up to, but not including, the next
 * one). Never throws on zero matches — a genuinely empty page is
 * legitimate.
 */
function splitCardChunks(html) {
  const starts = [];
  let match;
  CARD_START_RE.lastIndex = 0;
  while ((match = CARD_START_RE.exec(html)) !== null) {
    starts.push({ index: match.index, dataDate: match[1] });
  }
  return starts.map((start, i) => ({
    dataDate: start.dataDate,
    html: html.slice(start.index, i + 1 < starts.length ? starts[i + 1].index : html.length),
  }));
}

/**
 * Parse the two weekday+time text lines out of the card's own combined
 * "Small" div (e.g. "Mercredi" and "20h30" as two separate, whitespace-
 * separated text nodes in one div). Returns { weekday, time } — either
 * may be null if genuinely absent.
 */
function parseWeekdayTime(chunk) {
  const match = WEEKDAY_TIME_RE.exec(chunk);
  if (!match) return { weekday: null, time: null };
  const lines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return { weekday: lines[0] ?? null, time: lines[1] ?? null };
}

/**
 * Extract every event card from the venue's own /agenda listing page HTML
 * (one page's worth — pagination across ?page=0..N is the caller's
 * concern, matching every other multi-page collector in this project).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Maison de la Radio /agenda page HTML");
  }
  return splitCardChunks(html)
    .map((card) => {
      const hrefMatch = HREF_RE.exec(card.html);
      if (!hrefMatch) return null;
      const { weekday, time } = parseWeekdayTime(card.html);
      const moreInfoMatch = MORE_INFO_RE.exec(card.html);
      const moreInfoText = moreInfoMatch ? moreInfoMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";

      return {
        date: card.dataDate,
        eventType: textOf(EVENT_TYPE_RE.exec(card.html)),
        title: textOf(TITLE_RE.exec(card.html)),
        location: textOf(LOCATION_RE.exec(card.html)),
        weekday,
        time,
        eventUrl: hrefMatch[1],
        sourceRecordId: hrefMatch[2],
        // "Gratuit" (free) is the ONLY price signal this source's own list
        // card ever states directly; anything else in this block is
        // typically a performer/ensemble name, not a price — never
        // fabricated into a numeric price here.
        isFree: /\bGratuit\b/.test(moreInfoText),
      };
    })
    .filter((card) => card !== null);
}

/**
 * Bounded, source-provided category filter: this complex's /agenda mixes
 * music concerts with non-music content (radio-show recordings,
 * masterclasses, generic events). Selects only cards whose own
 * 'eventType' is exactly "Concert" (case-insensitive) — the source's own
 * classification, never a keyword guess. Returns { musicCards,
 * rejectedCards } so a caller can honestly report what was excluded.
 */
export function filterMusicCards(cards) {
  const musicCards = [];
  const rejectedCards = [];
  for (const card of cards ?? []) {
    if (typeof card.eventType === "string" && card.eventType.trim().toLowerCase() === "concert") {
      musicCards.push(card);
    } else {
      rejectedCards.push(card);
    }
  }
  return { musicCards, rejectedCards };
}
