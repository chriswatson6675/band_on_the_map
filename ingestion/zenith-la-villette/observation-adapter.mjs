// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Zénith Paris - La Villette
// observation mapping. See ./discovery.mjs and
// research/source-investigations/zenith-la-villette-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "zenith-la-villette-paris";

// French abbreviated month names as they appear on this source's own date
// strings ("05 sept. 2026") — a fixed, deterministic lookup table, never a
// guess. Both the trailing-period and no-period spellings are accepted.
const MONTHS_FR = {
  "janv": 1, "janvier": 1,
  "févr": 2, "fevr": 2, "février": 2, "fevrier": 2,
  "mars": 3,
  "avr": 4, "avril": 4,
  "mai": 5,
  "juin": 6,
  "juil": 7, "juillet": 7,
  "août": 8, "aout": 8,
  "sept": 9, "septembre": 9,
  "oct": 10, "octobre": 10,
  "nov": 11, "novembre": 11,
  "déc": 12, "dec": 12, "décembre": 12, "decembre": 12,
};

const DATE_RE = /(\d{1,2})\s+([A-Za-zéû]+)\.?\s+(\d{4})/i;

function foldMonth(token) {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * This source's own date string (e.g. "Samedi 05 sept. 2026") is a French
 * day-name + day + abbreviated month + year, with NO time-of-day exposed
 * on the list view — a calendar date only.
 */
function deriveDateTime(dateRaw) {
  const dt = emptyDateTime();
  dt.raw = dateRaw ?? null;
  if (!dateRaw) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const m = DATE_RE.exec(dateRaw);
  if (!m) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  const [, day, monthToken, year] = m;
  // Look up both the accented and diacritic-folded spelling — MONTHS_FR
  // already lists both forms explicitly, this just tries the raw token
  // first before falling back to a folded match.
  const month = MONTHS_FR[monthToken.toLowerCase()] ?? MONTHS_FR[foldMonth(monthToken)];
  if (!month) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  dt.date = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
  dt.certainty = "DATE_ONLY";
  return dt;
}

const SLUG_RE = /\/shows\/(.+)$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /shows/{slug} shape: ${card.eventUrl}`);
  }
  const eventUrl = `https://le-zenith.com${card.eventUrl}`;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: decodeURIComponent(slugMatch[1]), // this source's own permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card.dateRaw),
    end: emptyDateTime(), // NOT_PRESENT — this list view never shows an end date/time

    venue_name: "Zénith Paris - La Villette", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT on this source's own card shape
    event_url: eventUrl,

    source_fields: {
      cancelled: card.cancelled === true,
      state_text: card.stateText ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

/**
 * Adapt every real card, EXCLUDING a card this source itself marks
 * cancelled ("Annulé") — such cards carry a struck-through date with no
 * replacement printed anywhere, so publishing that date as a still-valid
 * PROVEN fact would misrepresent what the source actually says. Never
 * silently dropped from extractEventCards() itself (see ./discovery.mjs) —
 * only excluded from the published Observation set here.
 */
export function toObservations(cards, options = {}) {
  return (cards ?? []).filter((card) => !card.cancelled).map((card) => toObservation(card, options));
}
