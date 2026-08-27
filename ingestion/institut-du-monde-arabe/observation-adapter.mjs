// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — mapping from one Institut
// du Monde Arabe "Les Escales musicales du musée" listing card + its own
// detail page's sidebar text into this project's generic Observation
// contract (ingestion/observation/contract.mjs). See
// research/source-investigations/institut-du-monde-arabe-paris-01/ for the
// governed investigation this is built against.
//
// This source states day/month/year for a listing card directly (no
// context-inheritance needed for start_date), and states time-of-day AND
// duration directly on the linked detail page's own "Dates & horaires"
// sidebar accordion — but never an explicit end time. Per
// docs/SOURCE_INVESTIGATION_POLICY.md's v1.2 DETERMINISTIC_CONTEXT model,
// `end` is mechanically derived as start + stated duration (see
// deriveEndFromDuration below) — never a guess, and never claimed UTC
// (this source states no timezone offset at all, so every derived instant
// stays FLOATING_LOCAL, honestly).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import {
  parseFrenchFullDate,
  parseFrenchTimeOfDay,
  parseFrenchDurationMinutes,
} from "./discovery.mjs";

export const SOURCE_ID = "institut-du-monde-arabe-paris";
export const BASE_URL = "https://www.imarabe.org";
export const VENUE_NAME = "Institut du Monde Arabe";

function lastPathSegment(href) {
  const trimmed = (href ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

/** Build a FLOATING_LOCAL emptyDateTime()-shaped start from a card's own full date + the detail page's own stated time-of-day. */
export function buildStart(dateText, dateTimeText) {
  const dt = emptyDateTime();
  dt.raw = `${dateText ?? ""} / ${dateTimeText ?? ""}`.trim();

  const isoDate = parseFrenchFullDate(dateText);
  const time = parseFrenchTimeOfDay(dateTimeText);
  if (!isoDate || !time) {
    dt.certainty = isoDate ? "DATE_ONLY" : dateText ? "TEXT_ONLY" : "UNKNOWN";
    if (isoDate) dt.date = isoDate;
    return dt;
  }

  dt.date = isoDate;
  dt.iso = `${isoDate}T${time.hour}:${time.minute}:00`;
  dt.is_utc = false; // no explicit UTC offset stated anywhere on this source
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

/**
 * Mechanically add `durationMinutes` to a FLOATING_LOCAL start `emptyDateTime()`
 * value, producing an `end` of the SAME certainty tier (never upgraded to
 * UTC_INSTANT — a wall-clock addition tells us nothing about a real UTC
 * offset). Returns an UNKNOWN emptyDateTime() if `start` itself is not a
 * usable FLOATING_LOCAL instant, or `durationMinutes` is not a positive
 * number.
 */
export function deriveEndFromDuration(start, durationMinutes) {
  const dt = emptyDateTime();
  if (start?.certainty !== "FLOATING_LOCAL" || !start.iso || typeof durationMinutes !== "number" || durationMinutes <= 0) {
    return dt;
  }
  const [datePart, timePart] = start.iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  const base = Date.UTC(y, m - 1, d, hh, mm, ss);
  const shifted = new Date(base + durationMinutes * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  const isoLocal = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;

  dt.raw = `${start.raw ?? ""} + ${durationMinutes}min`;
  dt.date = isoLocal.slice(0, 10);
  dt.iso = isoLocal;
  dt.is_utc = false;
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

/**
 * Convert one retained listing card + its own detail page's extracted
 * sidebar fields into an Observation.
 *
 * `card` — `{ title, href, dateText }` (extractEscaleCards()).
 * `detail` — `{ dateTimeText, durationText, locationText }`
 * (extractDatesHorairesText() + extractLocationText()).
 */
export function toObservation(card, detail, options = {}) {
  if (!card?.href) {
    throw new Error("toObservation requires card.href");
  }
  const slug = lastPathSegment(card.href);
  if (!slug) {
    throw new Error("toObservation could not derive a source_record_id slug from card.href");
  }

  const start = buildStart(card.dateText, detail?.dateTimeText);
  const durationMinutes = parseFrenchDurationMinutes(detail?.durationText);
  const end = deriveEndFromDuration(start, durationMinutes);

  const eventUrl = new URL(card.href, options.baseUrl ?? BASE_URL).toString();

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slug,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start,
    end,

    venue_name: VENUE_NAME,
    location_text: detail?.locationText ?? null,

    price_text: null, // NOT investigated for this source family — never fabricated
    event_url: eventUrl,

    source_fields: {
      card_date_text: card.dateText ?? null,
      detail_datetime_text: detail?.dateTimeText ?? null,
      detail_duration_text: detail?.durationText ?? null,
      end_derivation: durationMinutes
        ? "end = start + stated duration, both directly stated on the event's own 'Dates & horaires' sidebar accordion"
        : null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "text/html",
      byte_faithful: false,
    },
  });
}

/**
 * Convert every card from one retained listing page into Observations,
 * each paired with its own already-extracted detail-page fields (a caller
 * fetches one detail page per card in a real live run; `detailsByHref`
 * supplies that pairing here, keyed by `card.href`). A card with no
 * matching entry in `detailsByHref` is skipped, never fabricated.
 */
export function toObservations(cards, detailsByHref, options = {}) {
  return (cards ?? [])
    .filter((card) => detailsByHref?.[card.href])
    .map((card) => toObservation(card, detailsByHref[card.href], options));
}
