// BEATMAPPED-BERLIN-SECOND-PASS-30-40 — Admiralspalast Berlin's own bespoke
// static-HTML card parser — see
// research/source-investigations/admiralspalast-berlin-01/. Contao Open
// Source CMS with no JSON-LD Event/MusicEvent block, ICS link, WordPress
// signal, or public JSON API; the venue's own events-overview page
// (veranstaltungsuebersicht.html) is a static grid of 100+ real event
// cards, each stating its own title, a `<a href="/veranstaltung/{slug}
// .html#go">` detail-page link, and an "ab DD.MM.YY" run-start date in a
// `<span class="text">` — genuinely bespoke to this exact markup, not
// shared by any other source in this project.
//
// This source's own event *detail* pages additionally expose an exact
// local time-of-day (and a redundant, differently-formatted date) via
// Contao's semantic `evDay`/`evMJ`/`evWdT` spans in a "Termine & Tickets"
// block — already independently confirmed by this investigation's own
// field assessment (field_assessment.time, PROVEN, DIRECT_SOURCE) for one
// sampled event. This adapter deliberately does not fetch all 100+
// individual detail pages to harvest that per-event time-of-day: evidence
// retention is meant to stay bounded (see docs/SOURCE_INVESTIGATION_
// POLICY.md, "What counts as evidence?"), and the venue's own events-
// overview page alone already exposes the full, current programme (every
// real upcoming event, one row each) with a genuine, honestly-DATE_ONLY
// start date. A future refinement could add a second, detail-page-based
// enrichment pass for exact time-of-day; that is out of scope here.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "admiralspalast-berlin";

const CARD_RE =
  /<a href="\/veranstaltung\/([a-z0-9-]+)\.html#go">[\s\S]*?<p>([^<]+)<\/p>[\s\S]*?ab <span class="text">(\d{2})\.(\d{2})\.(\d{2})<\/span>/g;

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#35;/g, "#")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Extract every event card from the venue's own events-overview page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Admiralspalast events-overview HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, slug, title, dd, mm, yy] = match;
    cards.push({
      // This source's own event cards state a run-start date as
      // "ab DD.MM.YY" — a fixed, source-own two-digit-year convention
      // (never a full four-digit year on this page), expanded here as
      // 20YY. This is a mechanical decode of the source's own literal
      // formatting, not a plausibility guess about "today" — the same
      // convention already established for ausland-berlin
      // (ingestion/ausland/observation-adapter.mjs).
      date: `20${yy}-${mm}-${dd}`,
      eventUrl: `https://www.admiralspalast.theater/veranstaltung/${slug}.html`,
      title: decodeEntities(title),
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.date;
  dt.date = card.date;
  // The events-overview page states a calendar date only ("ab DD.MM.YY")
  // — no time-of-day and no timezone anywhere on this page. Honestly
  // DATE_ONLY, never upgraded to a time or a UTC instant this page does
  // not state.
  dt.certainty = "DATE_ONLY";
  return dt;
}

const SLUG_RE = /\/veranstaltung\/([a-z0-9-]+)\.html$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /veranstaltung/{slug}.html shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own detail-page URL slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Admiralspalast Berlin", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own card shape
    event_url: card.eventUrl,

    source_fields: {},

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
