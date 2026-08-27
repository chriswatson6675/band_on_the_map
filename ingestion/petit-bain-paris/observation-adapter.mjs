// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Observation mapping for
// Petit Bain's bespoke agenda-page cards (see ./discovery.mjs). Never
// fabricates a year: this source's own pages never state one anywhere
// (agenda list or per-event detail — see
// research/source-investigations/petit-bain-paris-01/), so `start.date`
// is deliberately left null and `start.certainty` is "TEXT_ONLY" rather
// than guessing a year from today's date or from upload-folder paths.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { parseCardDateText } from "./discovery.mjs";

const SOURCE_ID = "petit-bain-paris";
const VENUE_NAME = "Petit Bain";

function deriveStartDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.dateText ?? null;
  const parsed = parseCardDateText(card.dateText);
  // Deliberately NOT promoted to `date` even when day+month parse cleanly:
  // `date` per the Observation contract means a genuinely known calendar
  // date "YYYY-MM-DD" — a year is required to honestly populate it, and
  // this source never states one. Preserving only `raw` + certainty
  // "TEXT_ONLY" is the honest representation here.
  dt.certainty = parsed ? "TEXT_ONLY" : (card.dateText ? "TEXT_ONLY" : "UNKNOWN");
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.sourceRecordId) throw new Error("toObservation requires card.sourceRecordId");
  if (!card?.eventUrl) throw new Error("toObservation requires card.eventUrl");

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.sourceRecordId, // this theme's own WordPress post ID (the "post-{ID}" class token on the card's own root element)
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: card.supportActs && card.supportActs.length > 0 ? `with ${card.supportActs.join(", ")}` : null,

    start: deriveStartDateTime(card),
    end: emptyDateTime(), // NOT_PRESENT — never shown on this theme's card or detail page

    venue_name: VENUE_NAME,
    location_text: "7 Port de la Gare, 75013 Paris",

    price_text: null, // NOT_PRESENT on this source's own first-party pages (ticketing sold via a third-party widget, e.g. billetterie.seetickets.fr)
    event_url: card.eventUrl,

    source_fields: {
      sold_out: card.soldOut ?? false,
      support_acts: card.supportActs ?? [],
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
