// BOTM-BERLIN-SECOND-PASS-30-40-VENUE-COMPLETION-01 — Frannz Club Berlin's
// own bespoke static-HTML card parser — see
// research/source-investigations/frannz-club-berlin-01/. WordPress with a
// bespoke 'events' custom post type rendered directly into the homepage;
// no calendar plugin REST route, no JSON-LD. Every real event is its own
// <article id="post-{WP_POST_ID}" ...> block containing day-of-week,
// day-of-month, month NAME (not number), a "Beginn" (start) time always,
// an optional "Einlass" (door) time, a title, an optional subtitle/DJ-
// lineup text, an optional internal room label ("Ort: Club" /
// "Biergarten" / "Lounge" / "Salon", singly or combined), an optional
// "Abendkasse" (door) price, and a third-party ticket link (never a
// frannz.eu permalink of its own).
//
// IMPORTANT parsing note: the homepage ALSO repeats a subset of these
// same events (roughly the next 7) a second time, earlier in the page, as
// short "highlight" swiper-carousel teaser stubs that reuse the exact
// same WordPress post id but use a different, much shorter markup shape
// (`<span class="title">...</span>`, no day/month/time/h2 fields of their
// own). extractEventCards() below deliberately only accepts an article
// chunk that itself contains the full day/month/start-time/h2-title
// field set, so those teaser stubs are correctly skipped rather than
// double-counted or (worse) cross-matched against a later article's
// fields — see this investigation's evidence for why a naive single
// whole-document regex is unsafe here.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "frannz-club-berlin";

const MONTH_NAME_DE = {
  Januar: "01",
  Februar: "02",
  März: "03",
  April: "04",
  Mai: "05",
  Juni: "06",
  Juli: "07",
  August: "08",
  September: "09",
  Oktober: "10",
  November: "11",
  Dezember: "12",
};

function decodeEntities(str) {
  if (str == null) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8222;/g, "„")
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
}

function cleanText(str) {
  const decoded = decodeEntities(str);
  if (decoded == null) return null;
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed;
}

const DAY_MONTH_RE =
  /<div class="event-dayname">([^<]+)<\/div>\s*<div class="event-day">([^<]+)<\/div>\s*<div class="event-month">([^<]+)<\/div>/;
const START_RE = /<div class="event-start"><strong>([^<]*)<\/strong> Beginn<\/div>/;
const ENTRANCE_RE = /<div class="event-entrance"><strong>([^<]*)<\/strong> Einlass<\/div>/;
const TITLE_RE = /<h2 class="event-title">([^<]+)<\/h2>/;
const OTITLE_RE = /<h4 class="event-otitle">([^<]+)<\/h4>/;
const UTITLE_RE = /<h4 class="event-utitle">([\s\S]*?)<\/h4>/;
const ORT_RE =
  /<span class="sidebar-key">Ort:<\/span>\s*<span class="sidebar-val"><strong>([^<]+)<\/strong><\/span>/;
const PRICE_RE = /<div class="event-vvk"><strong>([^<]*)<\/strong> ([^<]+)<\/div>/;
const TICKET_URL_RE = /<a href="(https?:\/\/[^"]+)" target="_blank">/;
const EVENT_TYP_RE = /<div class="event-typ">([^<]+)<\/div>/;

/**
 * Extract every real event card from the venue's own homepage HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 *
 * Splits the document into per-article chunks first (each chunk running
 * from one `<article id="post-{id}"` up to the next), then requires the
 * full day/month + start-time + h2-title field set to be present *within
 * that same chunk* before accepting it as a real event card. This is
 * deliberate: a single whole-document regex with a non-greedy middle
 * section can silently jump across article boundaries and pair one
 * article's id with a later, unrelated article's fields (this happened
 * during this adapter's own development against the real retained
 * fixture — see the investigation's evidence). Splitting first makes
 * that class of bug structurally impossible.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Frannz Club homepage HTML");
  }

  const chunks = html.split(/(?=<article id="post-\d+")/);
  const cards = [];

  for (const chunk of chunks) {
    const idMatch = /^<article id="post-(\d+)"/.exec(chunk);
    if (!idMatch) continue;

    const dayMatch = DAY_MONTH_RE.exec(chunk);
    const startMatch = START_RE.exec(chunk);
    const titleMatch = TITLE_RE.exec(chunk);
    // A real event card always carries its own day/month, its own Beginn
    // (start) time, and its own <h2> title. The homepage's separate
    // "highlight" teaser stub (see module comment above) never carries
    // this full field set, so it is correctly skipped here rather than
    // mismatched against a later chunk.
    if (!dayMatch || !startMatch || !titleMatch) continue;

    const entranceMatch = ENTRANCE_RE.exec(chunk);
    const otitleMatch = OTITLE_RE.exec(chunk);
    const utitleMatch = UTITLE_RE.exec(chunk);
    const ortMatch = ORT_RE.exec(chunk);
    const priceMatch = PRICE_RE.exec(chunk);
    const ticketMatch = TICKET_URL_RE.exec(chunk);
    const typMatch = EVENT_TYP_RE.exec(chunk);

    cards.push({
      wpPostId: idMatch[1],
      dayname: cleanText(dayMatch[1]),
      day: dayMatch[2].trim(),
      month: cleanText(dayMatch[3]),
      entranceTime: entranceMatch ? entranceMatch[1].trim() || null : null,
      startTime: startMatch[1].trim(),
      title: cleanText(titleMatch[1]),
      subtitle: cleanText((otitleMatch && otitleMatch[1]) ?? (utitleMatch && utitleMatch[1]) ?? null),
      location: ortMatch ? cleanText(ortMatch[1]) : null,
      // priceMatch[1] is the amount ("10 €", "27,00€ €" — the latter is a
      // genuine, unaltered artifact of the source's own markup, retained
      // verbatim rather than "corrected"); priceMatch[2] is the source's
      // own label, always observed as "Abendkasse" (door price) in this
      // retained sample — never a VVK/advance price, despite the CSS
      // class name "event-vvk".
      priceText: priceMatch ? cleanText(`${priceMatch[1]} ${priceMatch[2]}`) : null,
      ticketUrl: ticketMatch ? ticketMatch[1] : null,
      eventTyp: typMatch ? cleanText(typMatch[1]) : null,
    });
  }

  return cards;
}

function deriveStartDateTime(card) {
  const dt = emptyDateTime();
  const monthNumber = MONTH_NAME_DE[card.month] ?? null;
  const timeText = card.entranceTime
    ? `Einlass ${card.entranceTime} / Beginn ${card.startTime}`
    : `Beginn ${card.startTime}`;
  dt.raw = `${card.dayname} ${card.day}. ${card.month} (Monat ${monthNumber ?? "?"}) — ${timeText} Uhr`;
  // Day-of-week, day-of-month, month name, and start time are all
  // directly stated on every real event card — but no year is stated
  // anywhere on this source's homepage (confirmed both in the original
  // investigation and its re-verification fetches for this adapter).
  // Per docs/SOURCE_INVESTIGATION_POLICY.md's date/time rule, inferring
  // the year from today's date would be AI_INFERENCE and can never be
  // PROVEN, so `date`/`iso` stay null — only the raw day/month/time text
  // is retained, honestly, as TEXT_ONLY.
  dt.certainty = "TEXT_ONLY";
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.wpPostId) {
    throw new Error("toObservation requires card.wpPostId");
  }
  if (!card?.title) {
    throw new Error("toObservation requires card.title");
  }

  return createObservation({
    source_id: SOURCE_ID,
    // This source's own WordPress post id (the "post-{ID}" value emitted
    // by post_class(), also independently echoed in an
    // "<!-- #post-{ID} -->" HTML comment after each article) — empirically
    // confirmed identical across two independent unauthenticated fetches
    // of the homepage; see
    // research/source-investigations/frannz-club-berlin-01/evidence/frannz-post-id-stability-check.txt.
    source_record_id: card.wpPostId,
    retrieved_at: retrievedAt ?? null,

    source_url: "https://frannz.eu/",
    content_type: "text/html",

    title: card.title,
    description: card.subtitle,

    start: deriveStartDateTime(card),
    end: emptyDateTime(),

    venue_name: "Frannz Club", // single-venue source, resolved by source_id
    location_text: card.location, // the source's own internal room/area label(s) ("Club", "Biergarten", "Lounge", "Salon", or a combination) — not a full venue name/address

    price_text: card.priceText, // present on some cards ("Abendkasse" door price), null on most — never invented when absent
    event_url: null, // no first-party per-event permalink exists on frannz.eu itself; every ticket link points to a third-party seller

    source_fields: {
      wp_post_id: card.wpPostId,
      event_typ: card.eventTyp,
      third_party_ticket_url: card.ticketUrl,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
