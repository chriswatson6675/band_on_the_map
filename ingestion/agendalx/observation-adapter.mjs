// Converts retained AgendaLX MUSIC records into the generic Observation
// contract (ingestion/observation/contract.mjs).
//
// Source: Agenda Cultural de Lisboa, registry id "agendalx". See
// docs/sources/AGENDALX.md for the full source contract and
// fixtures/agendalx/music-sample.json for the retained, music-classified
// sample this adapter is proven against (BOTM-OBSERVATION-01).
//
// Deliberately conservative:
//   - no coordinates, ticket URL, venue address, or artist are manufactured
//     (none are present in the retained fixture);
//   - no canonical Event identity is generated;
//   - `price_val` is PHP-serialized source data (e.g. an
//     `a:1:{i:0;a:1:{s:5:"value";s:1:"5";}}`-shaped string). This adapter
//     does not hand-roll a PHP deserializer for one field — that would
//     mean trusting a parse this project cannot verify. It derives
//     `price_text` only for the unambiguous "free" case and otherwise
//     leaves `price_text` null while preserving `price_cat`/`price_val`
//     verbatim in `source_fields`.
//   - the fixture is parsed-and-reserialized JSON (see
//     ingestion/agendalx/probe.mjs), not a byte-identical HTTP response,
//     so `raw_evidence.byte_faithful` is honestly recorded as `false`.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "agendalx";

// docs/sources/AGENDALX.md's Live Probe Result records this content type
// for the confirmed live endpoint. fixtures/agendalx/music-sample.json's
// own metadata does not repeat it per-batch, so it is used as a governed
// fallback rather than re-derived or guessed here.
const DEFAULT_CONTENT_TYPE = "application/json; charset=UTF-8";

function firstVenue(record) {
  const venues = record?.venue;
  if (!venues || typeof venues !== "object") return null;
  const [slug, venue] = Object.entries(venues)[0] ?? [];
  if (!venue) return null;
  return { slug: slug ?? null, id: venue.id ?? null, name: venue.name ?? null };
}

function termNames(list) {
  if (!list || typeof list !== "object" || Array.isArray(list)) return [];
  return Object.values(list)
    .map((term) => term?.name)
    .filter(Boolean);
}

function derivePriceText(record) {
  const priceCat = Array.isArray(record?.price_cat) ? record.price_cat : [];
  if (priceCat.includes("free")) return "Free";
  return null;
}

function deriveStart(record) {
  const start = emptyDateTime();
  start.raw = [record?.string_dates, record?.string_times].filter(Boolean).join(" | ") || null;
  start.date = typeof record?.StartDate === "string" ? record.StartDate : null;
  start.certainty = start.date ? "DATE_ONLY" : start.raw ? "TEXT_ONLY" : "UNKNOWN";
  return start;
}

/**
 * Convert one retained AgendaLX record into an Observation.
 *
 * `end` is deliberately left empty: AgendaLX's `LastDate` is the last date
 * of a recurring occurrence schedule, not the end time of a single dated
 * event — conflating the two would fabricate a fact the source never
 * stated. The full occurrence schedule is preserved honestly in
 * `source_fields` instead.
 */
export function toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath }) {
  const venue = firstVenue(record);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: record?.id != null ? String(record.id) : null,
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: record?.title?.rendered ?? (typeof record?.title === "string" ? record.title : null),
    description: Array.isArray(record?.description)
      ? record.description[0] ?? null
      : record?.description ?? null,
    start: deriveStart(record),
    end: emptyDateTime(),

    venue_name: venue?.name ?? null,
    location_text: null, // no address in the retained fixture; must not be invented

    price_text: derivePriceText(record),
    event_url: record?.link ?? null,

    source_fields: {
      subject: record?.subject ?? null,
      categories: termNames(record?.categories_name_list),
      tags: termNames(record?.tags_name_list),
      string_dates: record?.string_dates ?? null,
      string_times: record?.string_times ?? null,
      occurences: Array.isArray(record?.occurences) ? record.occurences : [],
      start_date: record?.StartDate ?? null,
      last_date: record?.LastDate ?? null,
      venue_id: venue?.id ?? null,
      venue_slug: venue?.slug ?? null,
      price_cat: Array.isArray(record?.price_cat) ? record.price_cat : [],
      price_val: record?.price_val ?? null,
      featured_media_large: record?.featured_media_large ?? null,
      type: record?.type ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false,
    },
  });
}

/**
 * Convert a whole retained AgendaLX fixture (the shape written by
 * ingestion/agendalx/probe.mjs, e.g. fixtures/agendalx/music-sample.json)
 * into an array of Observations.
 */
export function toObservations(
  fixture,
  { fixturePath = "fixtures/agendalx/music-sample.json" } = {},
) {
  const records = Array.isArray(fixture?.records) ? fixture.records : [];
  const retrievedAt = fixture?.metadata?.retrieved_at ?? null;
  const sourceUrl = fixture?.metadata?.request_url ?? fixture?.metadata?.endpoint ?? null;
  const contentType = fixture?.metadata?.content_type ?? DEFAULT_CONTENT_TYPE;

  return records.map((record) =>
    toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath }),
  );
}
