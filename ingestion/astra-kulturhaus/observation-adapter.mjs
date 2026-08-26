// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Astra
// Kulturhaus. EXISTING_FAMILY_WITH_SMALL_FIX (not a new bespoke family,
// not zero-code reuse) — see
// research/source-investigations/astra-kulturhaus-berlin-01/.
//
// The venue's own homepage (a Rails/Turbolinks site) server-renders every
// upcoming event as a static `<article class="event ...">` card carrying
// its own `data-realdate="YYYY-MM-DD HH:MM:SS +ZZZZ"` attribute (this is
// the card's Doors datetime, WITH a correct UTC offset) plus a separate,
// unadorned "Start" time-value element (the true performance start clock
// time, no offset of its own). Title and the event's own detail-page URL
// are also directly present on every card.
//
// CONFIRMED, REPRODUCIBLE BUG (re-verified live 2026-08-26, see
// investigation.json field_assessment.time / collector_assessment.blockers
// and research/source-investigations/astra-kulturhaus-berlin-01/evidence/
// event-detail-fkj-reverify-20260826.html): each event detail page's own
// schema.org MusicEvent JSON-LD `startDate` field always states the
// correct local wall-clock Start time but with a fixed, WRONG `+00:00`
// offset suffix instead of the venue's true Europe/Berlin offset (e.g.
// "2026-10-21T20:00:00+00:00" for an actual 20:00 CEST / 18:00Z show).
// This adapter's own `deriveStart()` NEVER reads JSON-LD startDate for
// timing, for exactly this reason — it derives the true UTC instant
// purely from the homepage card's own data-realdate + Start time-value
// fields, per the investigation's documented DETERMINISTIC_CONTEXT
// derivation rule.
//
// `extractEventCards()`/`toObservation()`/`toObservations()` operate
// entirely on the homepage's own retained HTML — no per-event JSON-LD
// detail-page fetch is required for the real collector, since the
// homepage cards alone already carry title + date + true start time + the
// event's own canonical detail-page URL. `extractDetailIdentity()` is
// still provided, genuinely reusing this project's shared
// ingestion/json-ld/parse.mjs module (extractEventNodes/
// normaliseJsonLdEvent, unmodified) purely for title/url/venue identity
// cross-validation against a retained detail-page fixture — proving this
// is a small, deliberate fix on top of the existing JSON_LD collector
// family, not a fully bespoke new one. It deliberately never reads
// startDate either.

import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "astra-kulturhaus-berlin";

// This is a single-venue source. The venue's own identity (name + postal
// address) is proven directly from retained JSON-LD evidence (see
// extractDetailIdentity() below and investigation.json field_assessment
// .venue_location) and is constant across every event on this source —
// matching this project's existing single-venue-per-source precedent
// (e.g. ingestion/badehaus/observation-adapter.mjs's own VENUE_NAME
// constant).
const VENUE_NAME = "Astra Berlin";
const VENUE_ADDRESS = "Revaler Str. 99, 10245 Berlin";

const CARD_RE = /<article class="event[^"]*"[^>]*data-realdate="(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2} ([+-]\d{4})"[\s\S]*?<\/article>/g;
const TITLE_RE = /<a class="event__title-link" href="([^"]+)">([^<]*)<\/a>/;
const START_RE = /event__time--start">[\s\S]*?event__time-value">([^<]*)</;
const STATUS_RE = /event__status">([^<]*)</;

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

/**
 * Extract every real event card from the venue's own homepage HTML. Never
 * throws on zero matches (a genuinely empty listing is legitimate) but
 * does throw on empty/non-string input, matching this project's other
 * static-card adapters. A card with no Start time-value (e.g. a cancelled
 * listing, or a bare festival announcement) is still returned — its
 * `startTime` is `null` rather than fabricated; see deriveStart() below.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Astra Kulturhaus homepage HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [block, date, offset] = match;
    const titleMatch = TITLE_RE.exec(block);
    if (!titleMatch) continue; // an "event" article with no title link is not a real event card

    const startMatch = START_RE.exec(block);
    const statusMatch = STATUS_RE.exec(block);

    cards.push({
      date, // "YYYY-MM-DD", from data-realdate
      offset, // "+ZZZZ", from data-realdate — the venue's own correct UTC offset for this date
      startTime: startMatch ? startMatch[1].trim() : null, // "HH:MM", the true Start clock time (no offset)
      eventUrl: `https://www.astra-berlin.de${titleMatch[1]}`,
      title: decodeEntities(titleMatch[2].trim()),
      status: statusMatch ? statusMatch[1].trim() : null, // e.g. "cancelled", "sold out", "postponed", "new venue"
    });
  }
  return cards;
}

function formatOffsetColon(offset) {
  // "+0200" -> "+02:00"
  return `${offset.slice(0, 3)}:${offset.slice(3)}`;
}

/**
 * Derive this card's true start `DateTime` per the investigation's own
 * documented derivation rule: substitute the card's own Start clock time
 * into data-realdate's time-of-day slot, keeping data-realdate's own date
 * and UTC offset unchanged. Deliberately never reads this source's own
 * JSON-LD startDate field — that field is confirmed to always carry a
 * fixed, wrong +00:00 offset (see module header). When no Start
 * time-value is present on the card, the date alone is retained honestly
 * as DATE_ONLY rather than fabricating a start clock time.
 */
function deriveStart(card) {
  const dt = emptyDateTime();
  dt.date = card.date;

  if (!card.startTime) {
    dt.raw = `data-realdate date=${card.date} offset=${card.offset}; no Start time-value present on this card`;
    dt.certainty = "DATE_ONLY";
    return dt;
  }

  const localIso = `${card.date}T${card.startTime}:00${formatOffsetColon(card.offset)}`;
  const instant = new Date(localIso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Failed to derive a UTC instant for card: ${JSON.stringify(card)}`);
  }

  dt.raw = `data-realdate date+offset=${card.date} ${card.offset} (Doors) combined with Start time-value=${card.startTime}`;
  dt.iso = instant.toISOString().replace(/\.\d{3}Z$/, "Z");
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

const SLUG_RE = /\/events\/([a-z0-9-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /events/{slug} shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own detail-page URL slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveStart(card),
    end: emptyDateTime(),

    venue_name: VENUE_NAME,
    location_text: VENUE_ADDRESS,

    price_text: null, // NOT present on homepage cards; only on individual detail pages, out of scope for this homepage-only collector
    event_url: card.eventUrl,

    source_fields: {
      status: card.status ?? null, // e.g. "cancelled", "sold out", "postponed", "new venue" — retained honestly, never filtered out silently
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

/**
 * Cross-validation helper only — NOT part of the real collector's
 * runtime path (see module header: the homepage cards alone already
 * carry everything toObservation() needs). Genuinely reuses this
 * project's shared ingestion/json-ld/parse.mjs (extractEventNodes/
 * normaliseJsonLdEvent, unmodified) to read title/url/venue identity from
 * one retained event detail page's own schema.org MusicEvent JSON-LD
 * block. Deliberately never reads/returns startDate — that field is
 * confirmed buggy on this source (see module header) and must never be
 * trusted, even for cross-validation.
 */
export function extractDetailIdentity(detailHtml) {
  const nodes = extractEventNodes(detailHtml);
  const eventNode = nodes.find((node) => {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return types.includes("MusicEvent") || types.includes("Event");
  });
  if (!eventNode) {
    throw new Error("No Event/MusicEvent JSON-LD node found in detail page HTML");
  }

  const normalised = normaliseJsonLdEvent(eventNode, {
    deriveId: (node) => {
      const match = SLUG_RE.exec(node.url ?? "");
      return match ? match[1] : null;
    },
  });

  return {
    source_record_id: normalised.source_record_id,
    title: normalised.title,
    event_url: normalised.event_url,
    venue_name: normalised.location_name,
    // This source's own JSON-LD states location.address as a plain string
    // (not a nested schema.org PostalAddress object), so
    // normaliseJsonLdEvent's own location_address field is null here —
    // read the raw string directly instead.
    venue_address: typeof eventNode.location?.address === "string" ? eventNode.location.address : null,
  };
}
