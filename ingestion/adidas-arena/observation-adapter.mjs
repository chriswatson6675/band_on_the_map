// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — adidas arena observation
// mapping. See ./discovery.mjs and
// research/source-investigations/adidas-arena-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "adidas-arena-paris";

// French full month names, uppercase, as this source's own card date
// strings spell them (e.g. "9 SEPTEMBRE 2026 À 20h00") — a fixed,
// deterministic lookup table, never a guess.
const MONTHS_FR = {
  "JANVIER": 1,
  "FÉVRIER": 2, "FEVRIER": 2,
  "MARS": 3,
  "AVRIL": 4,
  "MAI": 5,
  "JUIN": 6,
  "JUILLET": 7,
  "AOÛT": 8, "AOUT": 8,
  "SEPTEMBRE": 9,
  "OCTOBRE": 10,
  "NOVEMBRE": 11,
  "DÉCEMBRE": 12, "DECEMBRE": 12,
};

const DATE_TIME_RE = /(\d{1,2})\s+([A-ZÉÛ]+)\s+(\d{4})\D+(\d{1,2})h(\d{2})/i;

function foldMonth(token) {
  return token
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * This source's own card date+time string (e.g. "9 SEPTEMBRE 2026 à
 * 20h00") is a French day/full-month-name/year plus a 24h time — no
 * timezone/offset is stated anywhere, so this is recorded as a floating
 * local time, never upgraded to a confirmed UTC instant.
 */
function deriveDateTime(dateText) {
  const dt = emptyDateTime();
  dt.raw = dateText ?? null;
  if (!dateText) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const m = DATE_TIME_RE.exec(dateText);
  if (!m) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  const [, day, monthToken, year, hour, minute] = m;
  const month = MONTHS_FR[monthToken.toUpperCase()] ?? MONTHS_FR[foldMonth(monthToken)];
  if (!month) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  dt.date = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
  dt.certainty = "FLOATING_LOCAL";
  // This generic Observation shape has no separate time-only field beyond
  // `raw` — the parsed local HH:MM is appended to `raw`, alongside the
  // source's own original text, for any downstream consumer that wants it
  // without re-parsing.
  dt.raw = `${dateText} (parsed local time ${hour.padStart(2, "0")}:${minute})`;
  return dt;
}

const SLUG_RE = /\/programmation\/([a-z0-9-]+--\d+)$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /programmation/{slug}--{id} shape: ${card.eventUrl}`);
  }
  const eventUrl = `https://www.adidasarena.com${card.eventUrl}`;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own permalink slug (incl. its own numeric id suffix), its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card.dateText),
    end: emptyDateTime(), // NOT_PRESENT — this list view never shows an end date/time

    venue_name: "adidas arena", // single-venue source, resolved by source_id
    location_text: null,

    price_text: card.priceText ? `From ${card.priceText}` : null,
    event_url: eventUrl,

    source_fields: {
      category: card.category ?? null,
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
