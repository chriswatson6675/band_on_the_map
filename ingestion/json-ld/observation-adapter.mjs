// BARCELONA-30-VENUE-POPULATION-01 — generic mapping from one normalised
// schema.org JSON-LD Event record (ingestion/json-ld/parse.mjs's
// normaliseJsonLdEvent()) into the project's generic Observation contract
// (ingestion/observation/contract.mjs).
//
// Deliberately generic, matching ingestion/events-calendar-api/
// observation-adapter.mjs's own convention: this module never references
// a specific venue, city, or country. The only per-source input is
// `config.source_id` — venue name/address, performers, and price come
// straight from the record itself wherever the source's own JSON-LD
// supplies them.
//
// Date/time certainty (see docs/OBSERVATION_PIPELINE.md's certainty
// model): schema.org's `startDate`/`endDate` are ISO 8601 strings that
// may or may not carry an explicit UTC offset. When one is present
// (`Z` or `+HH:MM`/`-HH:MM`), converting it to a UTC instant is a
// mechanical, deterministic operation (not inference) — certainty is
// honestly UTC_INSTANT. When the string has a date and time but no
// offset at all, that is a genuinely floating local value — certainty
// FLOATING_LOCAL, never upgraded by assuming a timezone. When only a
// bare calendar date is present, certainty is DATE_ONLY. Anything else
// falls back to TEXT_ONLY (non-empty but unparseable) or UNKNOWN.
//
// BARCELONA-30-VENUE-POPULATION-01: one real source (Sala Apolo) emits a
// non-standard shape, "YYYY-MM-DD CEST HH:MM" / "YYYY-MM-DD CET HH:MM"
// — a named Central European (Summer) Time abbreviation in place of a
// numeric offset, no "T" separator. "CEST"/"CET" are FIXED, universally
// -defined offset abbreviations (+02:00 / +01:00 respectively, by
// definition — never a seasonal guess, unlike inferring a bare date's
// year from "today's date"), so converting this shape to a UTC instant
// is exactly as mechanical/deterministic as the numeric-offset case
// above, and handled as a second, explicit pattern rather than folded
// into the primary regex.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

const DEFAULT_CONTENT_TYPE = "application/ld+json";

// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01: seconds are now optional
// (`(?::\d{2})?`) — Les Trois Baudets' own real JSON-LD emits
// "2026-09-03T20:00"/"2026-09-03T20:00+02:00" (no ":00" seconds
// component at all), which the original seconds-mandatory regex silently
// failed to match (falling through to TEXT_ONLY, losing the date
// entirely). A strictly backward-compatible widening: any timestamp this
// already matched (with explicit seconds) still matches identically,
// since `(?::\d{2})?` is satisfied either way.
const ISO_WITH_OFFSET_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_NO_OFFSET_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})$/;
const NAMED_CET_OFFSET_RE = /^(\d{4}-\d{2}-\d{2}) (CEST|CET) (\d{2}:\d{2})$/;
const NAMED_CET_OFFSETS = Object.freeze({ CEST: "+02:00", CET: "+01:00" });

// BARCELONA-30-VENUE-POPULATION-01: one real source (Harlem Jazz Club)
// emits non-zero-padded ISO components and no seconds — e.g.
// "2026-8-27T22:30+2:00" instead of "2026-08-27T22:30:00+02:00". Every
// component is still unambiguous (a single digit "8" always means month
// 8; there is no other legitimate reading), so reconstructing the
// strictly-padded equivalent before parsing is mechanical zero-padding,
// not inference — the same principle already applied to the CEST/CET
// named-offset case above.
const LOOSE_ISO_WITH_OFFSET_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{1,2}:\d{2})$/;

function pad2(value) {
  return value.padStart(2, "0");
}

function normaliseLooseIsoOffset(rawValue) {
  const match = LOOSE_ISO_WITH_OFFSET_RE.exec(rawValue);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offset] = match;
  const normalisedOffset = offset === "Z" ? "Z" : `${offset[0]}${pad2(offset.slice(1).split(":")[0])}:${offset.split(":")[1]}`;
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${minute}:${second ?? "00"}${normalisedOffset}`;
}

/**
 * Derive one `start`/`end`-shaped datetime (emptyDateTime() shape) from a
 * raw schema.org date/time string. Exported for direct unit testing of
 * every certainty tier independently of the full Observation-building
 * path.
 */
export function deriveDateTimeFromIso(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    dt.certainty = "UNKNOWN";
    return dt;
  }

  const namedOffset = NAMED_CET_OFFSET_RE.exec(rawValue);
  if (namedOffset) {
    const [, date, abbreviation, time] = namedOffset;
    const rewritten = `${date}T${time}:00${NAMED_CET_OFFSETS[abbreviation]}`;
    const parsed = new Date(rewritten);
    if (!Number.isNaN(parsed.getTime())) {
      const iso = parsed.toISOString();
      dt.iso = iso;
      dt.is_utc = true;
      dt.date = iso.slice(0, 10);
      dt.certainty = "UTC_INSTANT";
      return dt;
    }
  }

  const withOffset = ISO_WITH_OFFSET_RE.exec(rawValue);
  if (withOffset) {
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      const iso = parsed.toISOString();
      dt.iso = iso;
      dt.is_utc = true;
      dt.date = iso.slice(0, 10);
      dt.certainty = "UTC_INSTANT";
      return dt;
    }
  }

  const loosePadded = normaliseLooseIsoOffset(rawValue);
  if (loosePadded) {
    const parsed = new Date(loosePadded);
    if (!Number.isNaN(parsed.getTime())) {
      const iso = parsed.toISOString();
      dt.iso = iso;
      dt.is_utc = true;
      dt.date = iso.slice(0, 10);
      dt.certainty = "UTC_INSTANT";
      return dt;
    }
  }

  const noOffset = ISO_NO_OFFSET_RE.exec(rawValue);
  if (noOffset) {
    dt.date = noOffset[1];
    dt.is_utc = false;
    dt.certainty = "FLOATING_LOCAL";
    return dt;
  }

  const dateOnly = DATE_ONLY_RE.exec(rawValue);
  if (dateOnly) {
    dt.date = dateOnly[1];
    dt.certainty = "DATE_ONLY";
    return dt;
  }

  dt.certainty = "TEXT_ONLY";
  return dt;
}

function addressToText(address) {
  if (!address) return null;
  const parts = [address.streetAddress, address.postalCode, address.addressLocality, address.addressRegion].filter(
    (part) => typeof part === "string" && part.trim() !== "",
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Convert one normalised JSON-LD Event record into an Observation.
 *
 * `config` — `{ source_id }` at minimum.
 * `options` — `{ retrievedAt, sourceUrl, contentType, fixturePath,
 * venueNameOverride }`, matching every other observation-adapter's
 * convention in this project. `venueNameOverride` lets a single-venue
 * source (the common case — a venue's own site JSON-LD often omits its
 * own name from `location`, or names a room rather than the venue) supply
 * its own known name rather than leaving `venue_name` null when the
 * record's own `location.name` is absent — this is the SAME judgement
 * call already made for LAV (ingestion/lav/observation-adapter.mjs
 * leaves venue_name null and resolves by source_id instead); a caller
 * for a single-venue Barcelona source should prefer that same pattern
 * (resolve by source_id) UNLESS the record's own location_name already
 * provides it directly.
 */
export function toObservation(record, config, options = {}) {
  if (!record?.source_record_id) {
    throw new Error("toObservation requires a record with a non-empty source_record_id");
  }
  if (!config?.source_id) {
    throw new Error("toObservation requires config.source_id");
  }

  return createObservation({
    source_id: config.source_id,
    source_record_id: String(record.source_record_id),
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,

    title: record.title ?? null,
    description: record.description ?? null,

    start: deriveDateTimeFromIso(record.start_raw),
    end: deriveDateTimeFromIso(record.end_raw),

    venue_name: record.location_name ?? options.venueNameOverride ?? null,
    location_text: addressToText(record.location_address),

    price_text: record.price_text ?? null,
    event_url: record.event_url ?? record.ticket_url ?? null,

    source_fields: {
      types: record.types ?? [],
      performers: record.performers ?? [],
      ticket_url: record.ticket_url ?? null,
      event_status: record.event_status ?? null,
      event_attendance_mode: record.event_attendance_mode ?? null,
      location_address: record.location_address ?? null,
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: options.contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // extracted/re-shaped from an embedded JSON-LD block, not a byte-identical copy
    },
  });
}

/**
 * Convert every record from one page's worth of extracted JSON-LD Events
 * into Observations, sharing one retrieval timestamp/source URL/fixture
 * path.
 */
export function toObservations(records, config, options = {}) {
  return (records ?? []).map((record) => toObservation(record, config, options));
}
