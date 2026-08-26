// Kater Blau (now operating as "Kater") — bespoke static-HTML parser for
// this venue's own WordPress custom-post-type ('event') markup, rendered
// fully server-rendered inside the homepage's own '#Program' accordion
// section — see research/source-investigations/kater-blau-berlin-01/.
// Genuinely bespoke to this exact markup: no calendar plugin, no JSON-LD
// Event schema, no per-event detail page — every field this adapter reads
// comes from the one retained homepage.
//
// source_record_id: this source's own WordPress post ID, stated directly
// in each <article id="event-NNNN"> element — PROVEN per the investigation
// (a platform-documented, deterministic numeric ID scheme), not invented.
//
// start/end: each event states its own day-of-week + DD.MM + HH:MM range
// directly (e.g. "Fr. 28.08 22:00 — So. 30.08 10:00"), but — unlike
// Badehaus — NO YEAR is stated anywhere in or near the Program section.
// Per docs/SOURCE_INVESTIGATION_POLICY.md, a plausible year based on
// today's date is AI_INFERENCE and can never be promoted to a resolved
// date. This adapter therefore NEVER fabricates a year: `date` stays
// null and `certainty` is honestly "TEXT_ONLY", carrying the full raw
// day/month/time text for a later, explicitly-governed resolution step
// (matching this investigation's own PARTIAL field_assessment for
// start_date/end).
//
// event_url: NOT_PRESENT on this source (events render inline only, no
// first-party detail page) — left null. Where a ticket link exists it is
// a third-party outbound URL (Resident Advisor or similar), preserved
// honestly in source_fields.ticket_url rather than misrepresented as this
// record's own event_url.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "kater-blau-berlin";

const EVENT_RE =
  /<article id="event-(\d+)"[^>]*>[\s\S]*?<span class="date-header">\s*([^<]+?)\s*<\/span>\s*<span class="date-title">\s*([^<]*?)\s*<\/span>[\s\S]*?<\/h2>\s*<\/header>\s*<div class="entry-summary">\s*<p>([^<]*)<\/p>[\s\S]*?<\/article>/g;

const RSVP_RE = /<a class="rsvp" href="([^"]+)"/;

const RANGE_RE =
  /^\S+\.?\s*(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})\s*[—-]\s*\S+\.?\s*(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/;

/** Decode the small, fixed set of numeric HTML entities this source uses. */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

/**
 * Extract every event article from the venue's own homepage Program
 * section HTML. Never throws on zero matches — a genuinely empty
 * programme is legitimate; only a missing/empty HTML document throws.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Kater homepage HTML");
  }
  const cards = [];
  let match;
  EVENT_RE.lastIndex = 0;
  while ((match = EVENT_RE.exec(html)) !== null) {
    const [whole, postId, dateHeader, title, rangeText] = match;
    const rsvpMatch = RSVP_RE.exec(whole);
    cards.push({
      postId,
      dateHeader: dateHeader.trim(),
      title: decodeEntities(title.trim()),
      rangeText: rangeText.trim(),
      ticketUrl: rsvpMatch ? rsvpMatch[1] : null,
    });
  }
  return cards;
}

/**
 * Derive an honest start/end DateTime pair from this source's own
 * "Fr. 28.08 22:00 — So. 30.08 10:00" range text. Day and month and
 * clock time are directly stated; year is never stated anywhere on this
 * source, so `date`/`iso` stay null and `certainty` is "TEXT_ONLY" — the
 * raw text is fully preserved for provenance.
 */
export function deriveDateTimes(rangeText) {
  const start = emptyDateTime();
  const end = emptyDateTime();
  start.raw = rangeText ?? null;
  end.raw = rangeText ?? null;

  if (typeof rangeText !== "string" || rangeText.trim() === "") {
    return { start, end };
  }

  const match = RANGE_RE.exec(rangeText.trim());
  if (!match) {
    start.certainty = "TEXT_ONLY";
    end.certainty = "TEXT_ONLY";
    return { start, end };
  }

  // Day/month/time are directly stated (captured only to prove the range
  // text genuinely parses into two well-formed halves); year is
  // genuinely unknown from this source alone (no page/section context
  // states it either) — never fabricated. `raw` keeps the source's own
  // exact text; `date`/`iso` stay null; TEXT_ONLY is the honest
  // certainty for a partial (year-less) date.
  void match; // day/month/time components validated, not otherwise used
  start.certainty = "TEXT_ONLY";
  end.certainty = "TEXT_ONLY";
  return { start, end };
}

export function toObservation(card, { retrievedAt, fixturePath, sourceUrl } = {}) {
  if (!card?.postId) {
    throw new Error("toObservation requires card.postId");
  }

  const { start, end } = deriveDateTimes(card.rangeText);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.postId, // this source's own stable WordPress post ID
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? "https://www.katerclub.de/",
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start,
    end,

    venue_name: "Kater", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own event shape
    event_url: null, // NOT_PRESENT — no first-party per-event detail page exists

    source_fields: {
      date_header: card.dateHeader ?? null,
      range_text: card.rangeText ?? null,
      ticket_url: card.ticketUrl ?? null, // third-party outbound link (e.g. Resident Advisor), never event_url
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
