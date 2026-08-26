// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Bi Nuu's own
// bespoke field mapping, layered on the EXISTING generic
// ingestion/sveltekit-data/decode.mjs decoder (this source's own event
// list shape, per research/source-investigations/bi-nuu-berlin-01/).
// Bespoke because no other source in this trial shares this exact field
// shape — the underlying devalue decoder itself is reused/generic.
//
// source_record_id: this source's own opaque 'id'/'dbId' field — PARTIAL,
// not PROVEN, per the investigation's own honest field assessment (looks
// platform-stable, but not independently empirically re-verified within
// the bounded investigation). Used here as the best available identifier
// (an engineering decision, not a re-litigation of that governance
// finding), with that caveat preserved in source_fields.
//
// venue: 'locationNew' is an EXPLICIT per-record override (e.g. one real
// sampled event is genuinely relocated to Festsaal Kreuzberg) — when
// present, it is preserved honestly rather than forced to Bi Nuu.
// venue_name itself is left null either way (this source resolves to a
// fixed default venue by source_id, exactly like Village Underground/
// MEO Arena/Casa da Música in ingestion/venue/resolver.mjs — an override
// present here must stop that fixed-venue resolution, not silently lose
// the fact of relocation).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "bi-nuu-berlin";

const SPACE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/**
 * This source's own 'start' field shape: "YYYY-MM-DD HH:MM:SS.mmmZ" — a
 * space instead of "T", but otherwise a genuine, explicit UTC instant
 * (trailing "Z", zero-padded numeric components) — mechanically
 * equivalent to the standard ISO 8601 shape, not an inference.
 */
export function deriveDateTimeFromSpaceUtc(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const match = SPACE_DATE_RE.exec(rawValue);
  if (!match) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  const [, y, mo, d, h, mi, s] = match;
  dt.iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  dt.date = `${y}-${mo}-${d}`;
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

/**
 * Convert one decoded Bi Nuu event record (from
 * ingestion/sveltekit-data/decode.mjs's decodeSvelteKitData()) into an
 * Observation.
 */
export function toObservation(record, { retrievedAt, sourceUrl, fixturePath } = {}) {
  if (!record?.id) {
    throw new Error("toObservation requires record.id");
  }

  const hasOverride = typeof record.locationNew === "string" && record.locationNew.trim() !== "";

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.id),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: "application/json",

    title: record.title ?? null,
    description: null,

    start: deriveDateTimeFromSpaceUtc(record.start),
    end: emptyDateTime(), // NOT_PRESENT on this source's own event shape

    // venue_name is always left null (this source never states its own
    // venue name per record) — see module doc comment. When a genuine
    // override is present, it is surfaced in location_text so the
    // DATA-DRIVEN venue-mapping table's own key-derivation
    // (deriveCandidateKey: venue_name > location_text > source_id)
    // naturally prefers LOCATION_TEXT over the default SOURCE_ID mapping
    // for exactly that record, leaving it correctly UNRESOLVED (no
    // registered mapping for this ad hoc override text) rather than
    // silently forcing Bi Nuu. A record with NO override falls straight
    // through to the SOURCE_ID key, which resolves to Bi Nuu.
    venue_name: null,
    location_text: hasOverride ? `${record.locationArticle ?? ""} ${record.locationNew}`.trim() : null,

    price_text: null, // NOT_PRESENT on this source's own event shape
    event_url: null, // this source's own listing carries no per-event permalink field

    source_fields: {
      db_id: record.dbId ?? null,
      location_override: hasOverride ? `${record.locationArticle ?? ""} ${record.locationNew}`.trim() : null,
      sold_out: record.soldout ?? null,
      event_status: record.eventStatus ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false, // decoded from devalue's flat-array encoding, not byte-identical
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
