// Generic, source-agnostic mapping from one normalized Events Calendar API
// record (ingestion/events-calendar-api/client.mjs's normalizeEventRecord())
// into the project's generic Observation contract
// (ingestion/observation/contract.mjs). See ingestion/ccb/config.mjs for
// the one concrete, proven per-source config this family currently ships.
//
// Deliberately generic: this module never references Lisbon, Porto, CCB,
// a Portuguese venue name, or a specific event category. The only
// per-source input is `config.source_id` (and, for provenance only,
// whatever `source_url`/`content_type` the caller supplies) — venue name,
// address, price, and every other fact come straight from the record
// itself, because the Tribe Events REST API already supplies them
// per-record (unlike, e.g., ingestion/super-bock-arena's fixed-single-venue
// HTML listing, which supplies no venue field at all and is resolved by
// source_id instead — see ingestion/venue/resolver.mjs). A record without
// venue information (see client.mjs's normalizeVenue()) simply carries
// null here, exactly like any other missing source fact.
//
// Date/time certainty (see docs/OBSERVATION_PIPELINE.md's certainty
// model): the API's own `utc_start_date`/`utc_end_date` fields are already
// server-converted to UTC (confirmed, for CCB specifically, against every
// sampled detail page's own explicit-UTC-offset schema.org JSON-LD
// `startDate`/`endDate` — see research/source-investigations/
// ccb-lisbon-01/investigation.json's field_assessment.start_date). When
// present, this is used directly as a genuine UTC_INSTANT — not
// re-derived, not combined with anything, not downgraded out of
// unwarranted caution. When the UTC field is absent but a local
// `start_date`/`end_date` and a `timezone` are both present, certainty is
// honestly TZID_QUALIFIED_UNRESOLVED (a named timezone, not resolved
// against a timezone database here). When only a local date/time is
// present with no timezone at all, certainty is FLOATING_LOCAL. When
// nothing parses as a full date-time but a raw string exists, TEXT_ONLY.
// Never UNKNOWN unless genuinely nothing is present.
//
// Multi-day / umbrella events (an honest, NOT specially handled, nuance):
// some records' own start/end genuinely span more than one calendar day
// (e.g. a festival umbrella entry) — this adapter maps start/end exactly
// as the source states them, with no judgement about whether a record
// represents one performance or a multi-day series; see
// ccb-lisbon-01/investigation.json's field_assessment.end.notes for the
// real example this was proven against.
//
// Price: the API's own `cost` field is used directly, verbatim, when
// non-empty. For CCB specifically, this field is empty for every sampled
// record (ticketing is external) — this adapter does not fetch or scrape
// any HTML detail page to recover it; price_text is honestly null in that
// case, not fabricated or backfilled from a second acquisition mechanism.
// See docs/events-calendar-api.md for this known limitation.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

const DEFAULT_CONTENT_TYPE = "application/json";

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/;

function toIsoUtc(localLikeString) {
  const match = LOCAL_DATETIME_RE.exec(localLikeString ?? "");
  if (!match) return null;
  return `${match[1]}T${match[2]}Z`;
}

function dateOnly(localLikeString) {
  const match = LOCAL_DATETIME_RE.exec(localLikeString ?? "");
  return match ? match[1] : null;
}

/**
 * Derive one `start`/`end`-shaped datetime (ingestion/observation/contract.mjs's
 * emptyDateTime() shape) from a normalized record's local/UTC/timezone
 * fields for one edge ("start" or "end"). Exported for direct unit testing
 * of every certainty tier independently of the full Observation-building
 * path.
 */
export function deriveDateTime(record, edge) {
  const local = record?.[`${edge}_local`] ?? null;
  const utc = record?.[`${edge}_utc`] ?? null;
  const timezone = record?.timezone ?? null;

  const dt = emptyDateTime();
  dt.raw = local ?? utc ?? null;
  dt.tzid = timezone;

  const iso = toIsoUtc(utc);
  if (iso) {
    dt.iso = iso;
    dt.is_utc = true;
    dt.date = dateOnly(utc);
    dt.certainty = "UTC_INSTANT";
    return dt;
  }

  const localDate = dateOnly(local);
  if (localDate) {
    dt.date = localDate;
    dt.is_utc = false;
    dt.certainty = timezone ? "TZID_QUALIFIED_UNRESOLVED" : "FLOATING_LOCAL";
    return dt;
  }

  dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
  return dt;
}

function deriveVenueFields(venue) {
  if (!venue) return { venue_name: null, location_text: null };

  const rawParts = [venue.address, venue.city, venue.province, venue.zip, venue.country].filter(
    (part) => typeof part === "string" && part.trim() !== "",
  );
  // Deduplicate only immediately-repeated identical values — e.g. the
  // source's own `city` and `province` fields are genuinely the same
  // string for CCB ("Lisboa"/"Lisboa"), a real feature of the source data,
  // not a parsing bug — but repeating it verbatim in one human-readable
  // address string ("..., Lisboa, Lisboa, ...") reads as broken. This is a
  // generic, deterministic formatting rule (adjacent-equal-string
  // collapsing), never a source-specific special case.
  const addressParts = rawParts.filter((part, index) => index === 0 || part !== rawParts[index - 1]);

  return {
    venue_name: venue.name ?? null,
    location_text: addressParts.length > 0 ? addressParts.join(", ") : null,
  };
}

/**
 * Convert one normalized Events Calendar API record into an Observation.
 *
 * `config` — `{ source_id }` at minimum; the same config object used to
 * fetch the record is safe to pass here unchanged.
 * `options` — `{ retrievedAt, sourceUrl, contentType, fixturePath }`,
 * matching every other observation-adapter's convention in this project.
 */
export function toObservation(record, config, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }
  if (!config?.source_id) {
    throw new Error("toObservation requires config.source_id");
  }

  const { venue_name, location_text } = deriveVenueFields(record.venue);

  return createObservation({
    source_id: config.source_id,
    source_record_id: record.source_record_id,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: record.description ?? null,

    start: deriveDateTime(record, "start"),
    end: deriveDateTime(record, "end"),

    venue_name,
    location_text,

    price_text: record.cost_text ?? null,
    event_url: record.event_url ?? null,

    source_fields: {
      wp_post_id: record.source_record_id,
      slug: record.slug ?? null,
      rest_url: record.rest_url ?? null,
      categories: record.categories ?? [],
      tags: record.tags ?? [],
      all_day: record.all_day ?? null,
      global_id: record.global_id ?? null,
      venue_id: record.venue?.id ?? null,
      venue_phone: record.venue?.phone ?? null,
      venue_url: record.venue?.url ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // normalized/re-shaped from the API's own JSON, not a byte-identical copy
    },
  });
}

/**
 * Convert every record from one fetchAllEvents() run (or any array of
 * already-normalized records) into Observations, sharing one retrieval
 * timestamp/source URL/fixture path.
 */
export function toObservations(records, config, options = {}) {
  return (records ?? []).map((record) => toObservation(record, config, options));
}
