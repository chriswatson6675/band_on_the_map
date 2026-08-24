// Parses genuinely retrieved Altice/MEO Arena agenda-listing HTML
// (https://arena.meo.pt/agenda-completa) into small, structured per-event
// discovery/source records.
//
// Bounded, source-specific (per sources/lisbon.json's "meo-arena" entry
// and this task's brief: "MEO Arena may have a bounded source-specific
// HTML extractor... Do not invent a speculative universal HTML scraper
// from one source"). Each event is rendered as a repeating
// `agendaDestaquesUn` card on this one listing page — this module reads
// only that page, not each event's own sub-page, deliberately bounding
// network use to the single listing fetch this proof needs.
//
// Stable identifier: no numeric ID is printed as plain text anywhere on
// the page, but every card's own first-party "Info" link
// (`/agenda/{slug}_pt/{id}`) embeds MEO Arena's own numeric event id —
// independently corroborated by the same id appearing in that card's
// ticketing link (`blueticket.pt/Event/{id}`) and poster image query
// (`eventId={id}`). This module reads it from the Info link only (the
// genuine first-party per-event page reference), never from the
// ticketing/image URLs.
//
// Cards routinely link a third-party ticketing CTA ("comprar") — Blueticket,
// Ticketline, SeeTickets. That URL is captured here for provenance only
// (see ingestion/meo-arena/observation-adapter.mjs: it becomes
// `source_fields.ticket_url`, never `event_url` and never followed to
// acquire data from the ticketing site itself, per this task's Live-
// network safety rules).

const CARD_SPLIT_RE = /(?=class="agendaDestaquesUn)/;
const INFO_LINK_RE = /<a href="(\/agenda\/([a-z0-9-]+)_pt\/(\d+))" class="destaquesNome">([^<]*)<\/a>/;
const DATE_RE = /class="data-abrev">\s*([\s\S]*?)\s*<\/div>/;
const TICKET_RE = /<a href="([^"]+)"\s+target="_blank"\s+class="comprar"/;

/**
 * Parse one MEO Arena agenda-listing HTML document into discovery
 * records, one per distinct event id (deduplicated; first occurrence
 * order kept — the page can repeat a "destaque" card in more than one
 * listing section).
 *
 * Each record: `{ source_record_id, title, date_text, event_url,
 * ticket_url }`. `date_text` is the page's own "DD MON YYYY" abbreviated
 * text, preserved verbatim for the adapter to parse — never pre-parsed
 * here, matching every other discovery module's "discovery finds records,
 * adapters interpret fields" split. Returns an empty array (never throws)
 * if no cards are present.
 */
export function parseMeoArenaAgenda(html, { baseUrl = "https://arena.meo.pt" } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty MEO Arena agenda HTML");
  }

  const seen = new Set();
  const records = [];

  for (const block of html.split(CARD_SPLIT_RE)) {
    const infoMatch = INFO_LINK_RE.exec(block);
    if (!infoMatch) continue;

    const [, path, , id, title] = infoMatch;
    if (seen.has(id)) continue;
    seen.add(id);

    const dateMatch = DATE_RE.exec(block);
    const ticketMatch = TICKET_RE.exec(block);

    records.push({
      source_record_id: id,
      title: title.trim() || null,
      date_text: dateMatch ? dateMatch[1].trim() : null,
      event_url: `${baseUrl}${path}`,
      ticket_url: ticketMatch ? ticketMatch[1] : null,
    });
  }

  return records;
}
