// Wilde Renate / Salon zur wilden Renate — bespoke static-HTML parser for
// this venue's own WordPress custom-theme markup, which renders the ENTIRE
// programme as a server-rendered accordion directly inside the homepage's
// own '#program' section — see
// research/source-investigations/wilde-renate-berlin-01/. No wp-json event
// endpoint, no calendar plugin signature, no Event/MusicEvent JSON-LD, and
// no dedicated per-event page exist on this domain at all: every field
// this adapter reads comes from the one retained homepage.
//
// start/end: each row states only a weekday abbreviation + "DD.MM." — no
// year anywhere in or near the programme section (confirmed by this
// investigation's own retained evidence). Per
// docs/SOURCE_INVESTIGATION_POLICY.md, a plausible year inferred from
// today's date is AI_INFERENCE and can never be promoted to a resolved
// date. This adapter therefore NEVER fabricates a year: `date` stays null
// and `certainty` is honestly "TEXT_ONLY", carrying the raw day/date text
// for a later, explicitly-governed resolution step — matching this
// investigation's own PARTIAL field_assessment for start_date.
//
// source_record_id: Renate's own site exposes NO per-row id, slug, or
// permalink of any kind (confirmed: no id/data-* attribute distinguishes
// one <div class="prog-row"> from another). The only identifier anywhere
// near a row is the numeric event id embedded in its outbound "Tickets"
// link, which points to a THIRD-PARTY platform (Resident Advisor / RA,
// e.g. "https://de.ra.co/events/2355667") — this is RA's own id, not
// Renate's, and per this investigation's field_assessment.source_record_id
// (honestly NOT_PRESENT, not PROVEN) must never be presented as a proven
// first-party identifier. It is used here ONLY as a practical,
// non-canonical de-duplication key so this adapter can still construct
// schema-valid Observations (createObservation requires a non-empty
// source_record_id) — never as a source of first-party fact. Genuinely
// distinct programme rows sometimes share one RA ticket link (e.g. a main
// "Klubnacht" row and a companion "Renate Garden" sub-listing for the same
// night/event) — this adapter disambiguates those with a stable numeric
// suffix based on first-seen order within one extraction pass, and
// documents this honestly rather than silently colliding or inventing a
// fake unique id.
//
// event_url: NOT_PRESENT on this source — left null. The only outbound
// link is the third-party RA ticket link, preserved honestly in
// source_fields.ticket_url rather than misrepresented as this record's
// own event_url.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "wilde-renate-berlin";

const VENUE_NAME = "Wilde Renate / Salon zur wilden Renate";

const ROOM_NAMES = ["GARDEN", "GREEN", "BLACK", "RED"];

const RA_EVENT_ID_RE = /\/events\/(\d+)/;

/** Decode the small, fixed set of HTML entities this source's markup uses. */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&raquo;/g, "»")
    .trim();
}

/**
 * Extract every event row from the venue's own homepage '#program'
 * accordion HTML. Never throws on zero matches — a genuinely empty
 * programme is legitimate; only a missing/empty HTML document throws.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Wilde Renate homepage HTML");
  }

  const accordionStart = html.indexOf('class="program-accordion"');
  if (accordionStart === -1) {
    throw new Error("Expected a '#program' accordion (class=\"program-accordion\") in the retained homepage HTML");
  }
  const accordionHtml = html.slice(accordionStart);

  const rowChunks = accordionHtml.split('<div class="prog-row">').slice(1);

  const cards = [];
  const seenRaIds = new Map(); // raEventId -> count seen so far, for disambiguation

  for (const chunk of rowChunks) {
    const dayMatch = /<div class="prog-day">([^<]*)<\/div>/.exec(chunk);
    const dateMatch = /<div class="prog-date">([^<]*)<\/div>/.exec(chunk);
    const titleMatch = /<div class="prog-title">([^<]*)<\/div>/.exec(chunk);
    if (!dayMatch || !dateMatch || !titleMatch) {
      // Not a genuine event row (e.g. trailing accordion markup after the
      // last real row) — skip rather than fabricate a partial card.
      continue;
    }

    const categories = [...chunk.matchAll(/<span class="cat-btn">([^<]*)<\/span>/g)].map((m) =>
      decodeEntities(m[1]),
    );

    // Room headers are explicit <strong>...</strong> blocks naming one of
    // this venue's own known named spaces (e.g. "GARDEN (from 14:00)
    // hosted by ..."), NOT every incidental mention of the word "garden"
    // elsewhere in the row's free text.
    const rooms = [];
    for (const strongMatch of chunk.matchAll(/<strong>([^<]*)<\/strong>/g)) {
      const roomHit = ROOM_NAMES.find((room) => new RegExp(`\\b${room}\\b`, "i").test(strongMatch[1]));
      if (roomHit && !rooms.includes(roomHit)) rooms.push(roomHit);
    }

    const ticketMatch = /<a href="([^"]+)" class="no-underline h2 ticket-link/.exec(chunk);
    const ticketUrl = ticketMatch ? ticketMatch[1] : null;
    const raIdMatch = ticketUrl ? RA_EVENT_ID_RE.exec(ticketUrl) : null;
    const raEventId = raIdMatch ? raIdMatch[1] : null;

    let dedupeId = raEventId;
    if (raEventId != null) {
      const seenCount = seenRaIds.get(raEventId) ?? 0;
      seenRaIds.set(raEventId, seenCount + 1);
      if (seenCount > 0) dedupeId = `${raEventId}-${seenCount + 1}`;
    }

    cards.push({
      day: decodeEntities(dayMatch[1]),
      date: decodeEntities(dateMatch[1]), // "DD.MM." — no year stated by the source
      title: decodeEntities(titleMatch[1]),
      categories,
      rooms,
      ticketUrl,
      raEventId,
      dedupeId,
    });
  }

  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.day} ${card.date}`.trim();
  // No year is stated anywhere in or near the programme section — never
  // fabricated. date/iso stay null; certainty is honestly TEXT_ONLY.
  dt.certainty = "TEXT_ONLY";
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.title) {
    throw new Error("toObservation requires card.title");
  }
  if (!card?.dedupeId) {
    throw new Error(
      "toObservation requires card.dedupeId — this source exposes no first-party per-event identifier " +
        "(see field_assessment.source_record_id.notes in research/source-investigations/wilde-renate-berlin-01/investigation.json); " +
        "a card with no RA ticket link at all cannot be safely deduplicated and must not be silently assigned a fabricated id",
    );
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.dedupeId, // NOT first-party — see module header notes
    retrieved_at: retrievedAt ?? null,

    source_url: "https://www.renate.cc/",
    content_type: "text/html",

    title: card.title,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: VENUE_NAME,
    location_text: card.rooms.length > 0 ? card.rooms.join(", ") : null,

    price_text: null, // NOT_PRESENT on this source's own row shape
    event_url: null, // NOT_PRESENT — only a third-party ticket link exists

    source_fields: {
      day: card.day,
      date_text: card.date,
      categories: card.categories,
      rooms: card.rooms,
      ticket_url: card.ticketUrl,
      ra_event_id: card.raEventId,
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
