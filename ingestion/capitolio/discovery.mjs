// Discovers Teatro Variedades & Capitólio's own individual event pages
// from its first-party agenda index (https://teatrovariedades-
// capitolio.pt/agenda/capitolio/), and extracts each page's own bounded
// event-content block into the small factual record shape
// fixtures/capitolio/events.json already established
// (BOTM-MULTISOURCE-LINKS-01) — the same shape
// ingestion/capitolio/observation-adapter.mjs's toObservation() already
// consumes, unchanged.
//
// BOTM-MULTISOURCE-LINKS-01 hand-selected 5 candidate event pages already
// known from the Hot Clube cross-source proof. This module is the
// genuinely-automatic discovery step that finds EVERY `/evento/{slug}/`
// link the venue's own agenda index currently lists — LISBON-AUTOMATIC-
// SUBSET-01's whole point — without assuming any particular slug.

const EVENT_LINK_RE = /https:\/\/teatrovariedades-capitolio\.pt\/evento\/[a-z0-9-]+\//g;

// Every page's own bounded event-content block runs from its <h1> to the
// start of the "equipa-block-wrapper" section (directly verified: this
// window contains exactly one dd.mm.yyyy date and, where present, exactly
// one page-specific "Comprar bilhetes" CTA — never a neighbouring related-
// event's). A page without a lineup section (no equipa-block-wrapper) is
// bounded by MAX_WINDOW instead, generous enough for the fields this
// module reads but well short of a genuinely different event's own block.
const MAX_WINDOW = 8000;

/**
 * Parse the agenda index page's HTML into a deduplicated list of this
 * venue's own individual event page URLs, in document order. Returns an
 * empty array (never throws) if none are present.
 */
export function parseCapitolioAgendaLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Capitólio agenda-index HTML");
  }
  return [...new Set([...html.matchAll(EVENT_LINK_RE)].map((m) => m[0]))];
}

function field(window, label, tag) {
  const re = new RegExp(`<h2[^>]*>\\s*${label}\\s*</h2>\\s*<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const match = re.exec(window);
  if (!match) return null;
  const text = match[1].trim();
  return text === "" ? null : text;
}

function toIsoDate(ddmmyyyy) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/**
 * Extract one Capitólio event page's own bounded event-content facts —
 * the same shape as one record in fixtures/capitolio/events.json — from
 * that page's raw HTML. Every field genuinely absent from the page's own
 * bounded block is null, never guessed from a sitewide/related-event
 * fragment elsewhere on the same page.
 */
export function extractCapitolioEventFacts(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Capitólio event-page HTML");
  }

  const h1Index = html.indexOf("<h1");
  if (h1Index === -1) {
    throw new Error("Expected an <h1> hero title on a Capitólio event page");
  }
  const equipaIndex = html.indexOf("equipa-block-wrapper", h1Index);
  const windowEnd =
    equipaIndex === -1 ? Math.min(html.length, h1Index + MAX_WINDOW) : equipaIndex;
  const window = html.slice(h1Index, windowEnd);

  const titleMatch = /<h1[^>]*>([^<]*)<\/h1>/.exec(window);
  const title = titleMatch ? titleMatch[1].trim() || null : null;

  const taglineMatch = /<\/h1>\s*<p class="copy-l text-center\s*">\s*([\s\S]*?)\s*<\/p>/.exec(window);
  const seriesTagline = taglineMatch ? taglineMatch[1].trim() || null : null;

  const dateMatch = /<p class="copy-xl\s*">\s*(\d{2}\.\d{2}\.\d{4})\s*<\/p>/.exec(window);
  const dateText = dateMatch ? dateMatch[1] : null;

  const ticketMatch = /href="([^"]+)"[^>]*target="_blank">[\s\S]{0,800}?Comprar bilhetes/.exec(window);

  const durationText = field(window, "Duração", "p");
  const durationMatch = durationText ? /(\d+)/.exec(durationText) : null;

  return {
    title,
    series_tagline: seriesTagline,
    date_text: dateText,
    date_iso: toIsoDate(dateText),
    time_text: field(window, "Horários", "div"),
    venue_text: field(window, "Local", "div"),
    duration_minutes: durationMatch ? Number(durationMatch[1]) : null,
    age_rating: field(window, "Classificação etária", "p"),
    price_text: field(window, "Preço", "p"),
    ticket_url: ticketMatch ? ticketMatch[1] : null,
  };
}
