// Converts genuinely retrieved Câmara Municipal de Odivelas "RSS de
// Eventos" items (ingestion/rss/parse.mjs) into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Câmara Municipal de Odivelas — Agenda Municipal / Cultura,
// registry id "cm-odivelas-agenda-cultura". Acquisition path: RSS, the
// "RSS de Eventos" feed found via ingestion/odivelas/discovery.mjs.
//
// This is a municipal CITY_FEED, not a single fixed venue (unlike Village
// Underground/BOTA/MEO Arena) — its items span many different council
// venues/departments, and are NOT filtered to a "music" taxonomy the way
// AgendaLX's adapter filters by category, because this feed's own
// `<category>` values (observed: "Evento", "Agenda Municipal", "Áreas de
// Intervenção | Cultura", etc.) do not expose a comparable music/genre
// classification to filter on — inventing one would mean guessing, not
// observing. Every feed item becomes an Observation; genre-level curation
// is explicitly out of scope for this adapter.
//
// `pubDate` (important, deliberate mapping, not an oversight): this feed
// has no separate "event start" field distinct from `pubDate` — cross-
// checking retained live samples (e.g. an evening theatre performance
// item with `pubDate` reading 21:00) shows the feed reuses RSS's
// publish-date element to carry the actual event date/time, not a
// separate publication timestamp. This adapter honestly maps `pubDate`
// to `start`, recording that decision here rather than inventing a
// second, unevidenced "publish time" concept this feed does not expose.
//
// Venue: no structured venue field exists in this feed. Retained samples'
// `description` HTML commonly (not always) contains a "Contacto: {name}"
// line naming a department or venue (e.g. "Centro Cultural Malaposta", or
// — genuinely, for other items — a municipal department rather than a
// venue at all, mirroring the "Fado na Rua"/"Junta de Freguesia" case in
// docs/VENUE_RESOLUTION.md). This adapter extracts that text verbatim
// into `location_text` when present (a real, if imprecise, source fact —
// not fabricated) and leaves it null otherwise. It is deliberately NOT
// split, normalised, or asserted to be a venue name — canonical Venue
// resolution (ingestion/venue/resolver.mjs) decides, per its own explicit
// mapping table, whether any given retained text is confidently a known
// Venue; an unmapped one is honestly UNRESOLVED, not guessed.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "cm-odivelas-agenda-cultura";

const DEFAULT_CONTENT_TYPE = "application/rss+xml; charset=utf-8";

const CONTACT_RE = /Contacto:\s*<\/strong>\s*<a[^>]*>([^<]*)<\/a>/i;

/**
 * Extract the "Contacto: {name}" anchor text from a retained item's raw
 * (already XML/HTML-entity-decoded) description, or null if the pattern
 * is not present — never guessed from surrounding text.
 */
export function extractContactText(description) {
  if (typeof description !== "string") return null;
  const match = CONTACT_RE.exec(description);
  if (!match) return null;
  const text = match[1].trim();
  return text === "" ? null : text;
}

/**
 * Parse an RFC 822 date (as used by RSS `<pubDate>`, e.g.
 * "Sat, 19 Dec 2026 10:00:00 +0000") into this project's honest
 * DateTime shape. Computes a real UTC instant only when the value
 * carries an explicit numeric `+HHMM`/`-HHMM` offset or literal "GMT"/
 * "UT" — arithmetic on a stated offset, never a timezone-name database
 * lookup. Any other shape is preserved as `raw` only, certainty
 * `TEXT_ONLY`, exactly like every other adapter's "never fabricate an
 * instant" rule.
 */
export function dateTimeFromPubDate(pubDate) {
  const dt = emptyDateTime();
  if (typeof pubDate !== "string" || pubDate.trim() === "") return dt;
  dt.raw = pubDate;

  const match =
    /^\s*(?:[A-Za-z]+,\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(GMT|UT|[+-]\d{4})\s*$/.exec(
      pubDate,
    );
  if (!match) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }

  const MONTHS = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const [, day, monAbbr, year, hh, mm, ss, offsetToken] = match;
  const month = MONTHS[monAbbr];
  if (!month) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }

  let offsetMinutes = 0;
  if (offsetToken === "+HHMM" || offsetToken.startsWith("+") || offsetToken.startsWith("-")) {
    const sign = offsetToken[0] === "-" ? -1 : 1;
    const offH = Number(offsetToken.slice(1, 3));
    const offM = Number(offsetToken.slice(3, 5));
    offsetMinutes = sign * (offH * 60 + offM);
  } // GMT/UT: offsetMinutes stays 0

  const localMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), Number(ss));
  const utcMs = localMs - offsetMinutes * 60_000;
  const iso = new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, "Z");

  dt.iso = iso;
  dt.date = iso.slice(0, 10);
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

/**
 * Convert one retained/retrieved "RSS de Eventos" item into an
 * Observation. `retrievedAt`/`sourceUrl`/`fixturePath` describe the feed
 * fetch this item came from (shared across every item in that fetch).
 */
export function toObservation(item, { retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  const recordId = item?.guid ?? item?.link ?? null;
  if (!recordId) {
    throw new Error("toObservation requires an item with a non-empty guid or link");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: recordId,
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: item?.title ?? null,
    description: item?.description ?? null,
    start: dateTimeFromPubDate(item?.pubDate),
    end: emptyDateTime(), // this feed exposes no separate end field

    venue_name: null, // never a separable venue name from free description text — see module doc comment
    location_text: extractContactText(item?.description),

    price_text: null, // not exposed by this feed
    event_url: item?.link ?? null,

    source_fields: {
      guid: item?.guid ?? null,
      pub_date_raw: item?.pubDate ?? null,
      categories: Array.isArray(item?.categories) ? item.categories : [],
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: true,
    },
  });
}

/**
 * Convert every item already parsed from one "RSS de Eventos" fetch
 * (ingestion/rss/parse.mjs's `parseRSS(text).items`) into Observations,
 * sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(items, options = {}) {
  return (items ?? []).map((item) => toObservation(item, options));
}
