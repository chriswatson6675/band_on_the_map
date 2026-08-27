// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — L'Olympia (Paris)'s own
// bespoke public JSON API adapter — see
// research/source-investigations/olympia-paris-01/.
//
// L'Olympia's own official "Upcoming events" page
// (https://www.olympiahall.com/en/upcoming-events/) is client-rendered: the
// initial HTML response ships an EMPTY `.c-calendar__days` container and a
// `.t-programmation.loading--` state, so Level 1 (PASSIVE_STATIC) alone is
// genuinely insufficient. Escalating to Level 2 (STRUCTURAL) — fetching the
// page's own referenced JS bundle
// (wp-content/themes/olympia/dist/app.js) and reading the plain endpoint
// URLs it constructs (`window.location.origin + "/wp-json/..."`) — reveals
// a real, public, unauthenticated REST route this WordPress theme exposes
// under its own custom namespace:
// `/wp-json/df-elastic-search/v1/search-evenements/?lang=en`. Called
// directly with a `filter_periods[0][begin_date]=YYYY-MM-DD` query
// parameter (also read directly from the same JS bundle's
// `formatPeriods()` function — never guessed), it returns the venue's own
// real event records: title, permalink, a genre taxonomy, and a `meta`
// object with `begin_date`/`end_date` (full local date+time) and a real
// price-range string (`gamme_de_prix`).
//
// This is genuinely bespoke to this one source's own plugin
// (`df-elastic-search`) response shape — no existing collector family in
// this project matches it — so this module is intentionally a fresh,
// small, source-agnostic-contract-respecting adapter, not a widening of
// any shared/generic module.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "olympia-paris";

const PERMALINK_SLUG_RE = /\/upcoming-events\/([a-z0-9-]+)\/?$/i;

const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):\d{2}$/;

/**
 * Derive one `start`/`end`-shaped datetime from this source's own
 * `meta.begin_date`/`meta.end_date` strings (e.g. "2026-09-03 20:30:00").
 * No explicit UTC offset or timezone name is ever present in this field —
 * a genuinely floating local value, never upgraded to a UTC instant by
 * assuming Europe/Paris.
 */
export function deriveDateTimeFromMeta(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;
  if (typeof rawValue !== "string") {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const match = DATE_TIME_RE.exec(rawValue);
  if (!match) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  dt.date = match[1];
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

/**
 * True when at least one of the record's own `genre` taxonomy terms is
 * NOT the single non-music value this source itself uses ("Comedy") —
 * i.e. this source's own classification is used directly, never a
 * keyword guess. A record with zero genre terms is neither included nor
 * excluded by this helper (returns false; caller decides how to treat an
 * unclassified record, never silently guessed here).
 */
const NON_MUSIC_GENRES = new Set(["Comedy"]);

/**
 * This source's own REAL, live `/wp-json/df-elastic-search/v1/search-
 * evenements/` response nests each record's genre taxonomy terms as
 * `record.terms.genre[].name` (an array of term objects) — a bounded,
 * disclosed EXCERPT retained in this investigation's own evidence
 * flattened this to a plain top-level `record.genre` array of strings for
 * readability, which this module was originally written (and offline
 * -tested) against exclusively. Both shapes are honoured here: a
 * top-level `genre` array of strings (matching the retained fixture/
 * existing offline tests) is preferred when present; otherwise this falls
 * back to reading the real nested `terms.genre[].name` shape live
 * acquisition actually returns. Never a guess — both are the source's own
 * literal classification, read directly.
 */
function genreNames(record) {
  if (Array.isArray(record?.genre)) return record.genre;
  const termGenres = record?.terms?.genre;
  if (Array.isArray(termGenres)) {
    return termGenres.map((term) => term?.name).filter((name) => typeof name === "string" && name.trim() !== "");
  }
  return [];
}

export function isMusicRecord(record) {
  const genres = genreNames(record);
  return genres.length > 0 && genres.some((g) => !NON_MUSIC_GENRES.has(g));
}

export function toObservation(record, { retrievedAt, fixturePath } = {}) {
  if (!record?.ID) {
    throw new Error("toObservation requires record.ID");
  }

  const slugMatch = typeof record.permalink === "string" ? PERMALINK_SLUG_RE.exec(record.permalink) : null;

  return createObservation({
    source_id: SOURCE_ID,
    // This source's own numeric WordPress post ID ('ID') is its own
    // stable database identity for this 'evenement' custom post type —
    // directly present on every record, distinct from the human-readable
    // permalink slug (also captured below in source_fields for
    // provenance).
    source_record_id: String(record.ID),
    retrieved_at: retrievedAt ?? null,

    source_url: record.permalink ?? null,
    content_type: "application/json",

    title: record.post_title ?? null,
    description: null,

    start: deriveDateTimeFromMeta(record?.meta?.begin_date),
    end: deriveDateTimeFromMeta(record?.meta?.end_date),

    // Single-venue source: this source's own record never repeats its own
    // venue name/address per event (site-level identity only — see this
    // investigation's identity.notes) — resolved by source_id at
    // activation time, matching the badehaus-berlin-01/zenner-berlin-01
    // precedent.
    venue_name: "L'Olympia",
    location_text: null,

    price_text: record?.meta?.gamme_de_prix ?? null,
    event_url: record.permalink ?? null,

    source_fields: {
      post_name: record.post_name ?? null,
      genre: genreNames(record),
      sales_status: record?.meta?.global_sales_status ?? null,
      permalink_slug: slugMatch ? slugMatch[1] : null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false, // this source's own real JSON response, bounded/re-serialized as a retained subset — see this investigation's evidence description
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
