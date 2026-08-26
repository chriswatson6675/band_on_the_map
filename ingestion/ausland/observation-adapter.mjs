// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Ausland's own
// bespoke static-HTML card parser — see
// research/source-investigations/ausland-berlin-01/. TYPO3 CMS 'news'
// extension; genuinely bespoke to this exact markup (datum/uhrzeit spans
// + h2 title + /event/{slug} permalink), not shared by any other source
// in this trial.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "ausland-berlin";

const CARD_RE =
  /<section class="event grid-item listitem"><a itemprop="url" title="[^"]*" href="(\/event\/[a-z0-9-]+)">[\s\S]*?<span class="datum">(\d{2})\/(\d{2})\/(\d{2})<\/span>[\s\S]*?<span class="uhrzeit">(\d{2}:\d{2})<\/span>[\s\S]*?<h2>([^<]+)<\/h2>/g;

export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Ausland program-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, path, dd, mm, yy, time, title] = match;
    cards.push({
      eventUrl: `https://ausland.berlin${path}`,
      date: `20${yy}-${mm}-${dd}`, // this source's own DD/MM/YY short form, a fixed 21st-century convention
      time,
      title: title.trim(),
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  // The investigation's own cross-check found this structured time is a
  // rounded/"doors" approximation, not always the precise show start —
  // recorded as PARTIAL-equivalent honesty via FLOATING_LOCAL certainty
  // (never UTC_INSTANT), matching the governed field assessment.
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

const SLUG_RE = /\/event\/([a-z0-9-]+)$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /event/{slug} shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1],
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Ausland", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT as a discrete structured field on this source
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
