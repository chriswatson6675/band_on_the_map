// Converts discovery records from ingestion/hot-five-porto/discovery.mjs
// (parsed from retained Hot Five Jazz & Blues Club /shows/ page HTML) into
// the generic Observation contract (ingestion/observation/contract.mjs).
//
// Source: Hot Five Jazz & Blues Club, Porto. Registry id "hot-five-porto"
// (a NEW sources/porto.json entry someone else is adding separately — this
// module never edits any registry itself).
//
// Built ENTIRELY from the READY_FOR_ACTIVATION investigation at
// research/source-investigations/hot-five-porto-01/investigation.json.
// Two honesty-critical decisions, both taken directly from that
// investigation's own field_assessment and never second-guessed here:
//
// 1. start_date (PARTIAL, not PROVEN — see investigation.json
//    field_assessment.start_date.notes): every card gives only a
//    day + Portuguese-month-abbreviation string ("28 ago", "03 set"); NO
//    calendar year is stated anywhere in hotfive.pt's own first-party
//    evidence. This adapter therefore NEVER parses `date_text` into a
//    day/month number, and NEVER invents, infers, or backfills a year —
//    not even a plausible-looking one. `start` is built as
//    `{ raw: date_text, date: null, iso: null, is_utc: null, tzid: null,
//    certainty: "TEXT_ONLY" }` for every single Observation this module
//    produces — see emptyDateTime() in ingestion/observation/contract.mjs
//    for the certainty vocabulary this mirrors (the same honest
//    "raw-text-only, no derived date" shape already used for a genuinely
//    unresolvable date by ingestion/hot-clube and ingestion/bota when
//    their own source data does not resolve further). A third-party
//    lebillet.eu page does independently state a year, but per
//    docs/SOURCE_INVESTIGATION_POLICY.md's "Third-party sources" rule
//    that never becomes authority for this first-party field, and is not
//    used here.
// 2. source_record_id (PARTIAL, not PROVEN — see investigation.json
//    field_assessment.source_record_id.notes): the lebillet.eu numeric
//    ticketing id on 47/52 cards is a THIRD-PARTY vendor id, observed via
//    only a single snapshot, never documented by hotfive.pt itself as its
//    own stable identifier — it cannot be treated as this source's own
//    PROVEN id. Per that investigation's own documented "ALTERNATIVE
//    IDENTITY STRATEGY", this adapter instead uses a composite,
//    entirely-first-party key of (event title text + the source's own
//    "DD mon" date text) — mechanically proven unique across all 52
//    retained /shows/ cards by that investigation's own
//    evidence/offline-proof.mjs. This mirrors the same style already used
//    for fama-dalfama-lisbon-01's own similar gap (a composite key built
//    only from retained first-party fields, documented as NOT proven
//    stable by the source itself). The third-party ticketing id, where
//    present, is preserved for provenance only in
//    `source_fields.ticketing_numeric_id`/`source_fields.ticketing_url` —
//    NEVER used as `source_record_id`.
//
// time/end/event_url/price: all NOT_PRESENT per investigation.json — left
// null/empty here, never fabricated.
//
// venue_location: single-address venue: field_assessment.venue_location is
// PROVEN at the exact address text
// "R. de Guerra Junqueiro 495, 4150-098 Porto" (identical on both retained
// pages per that investigation's evidence/offline-proof.mjs). Used
// verbatim as `location_text` below.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "hot-five-porto";

export const VENUE_LOCATION_TEXT = "R. de Guerra Junqueiro 495, 4150-098 Porto";

const DEFAULT_CONTENT_TYPE = "text/html; charset=UTF-8";
const DEFAULT_SOURCE_URL = "https://hotfive.pt/shows/";

function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The documented alternative identity strategy: a composite, entirely
 * first-party (title + date_text) key. See module doc comment above and
 * investigation.json field_assessment.source_record_id.notes.
 */
export function compositeSourceRecordId(title, dateText) {
  if (typeof title !== "string" || title.trim() === "") {
    throw new Error("compositeSourceRecordId requires a non-empty title");
  }
  if (typeof dateText !== "string" || dateText.trim() === "") {
    throw new Error("compositeSourceRecordId requires a non-empty dateText");
  }
  return `${slugify(title)}-${slugify(dateText)}`;
}

/**
 * Build the honest, never-fabricated `start` DateTime for one card. Raw
 * text is always retained; `date`/`iso` stay null forever for this source
 * because no first-party evidence states a year — see module doc comment.
 */
function startFromDateText(dateText) {
  const dt = emptyDateTime();
  dt.raw = dateText ?? null;
  dt.certainty = "TEXT_ONLY";
  return dt;
}

/**
 * Convert one discovery record (from parseHotFiveShows()) into an
 * Observation. `retrievedAt` and `sourceUrl` come from the caller's own
 * retrieval metadata (e.g. fixtures/hot-five-porto/metadata.json in
 * tests).
 */
export function toObservation(record, { retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  if (!record || typeof record !== "object") {
    throw new Error("toObservation requires a discovery record");
  }
  const { title, date_text: dateText, ticketing_url: ticketingUrl, ticketing_numeric_id: ticketingNumericId } = record;

  if (typeof title !== "string" || title.trim() === "") {
    throw new Error("toObservation requires a non-empty title");
  }
  if (typeof dateText !== "string" || dateText.trim() === "") {
    throw new Error("toObservation requires a non-empty date_text");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: compositeSourceRecordId(title, dateText),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? DEFAULT_SOURCE_URL,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title,
    description: null,
    start: startFromDateText(dateText),
    end: emptyDateTime(), // NOT_PRESENT — no per-event end anywhere in retained evidence

    venue_name: null, // single fixed venue for this source; not stated per-card
    location_text: VENUE_LOCATION_TEXT,

    price_text: null, // NOT_PRESENT — no price/currency text anywhere in retained evidence
    event_url: null, // NOT_PRESENT — hotfive.pt exposes no first-party per-event permalink

    source_fields: {
      date_text: dateText, // verbatim "DD mon" (or "DD & DD mon") text, no year — provenance only
      ticketing_url: ticketingUrl ?? null, // third-party lebillet.eu href, if any — NEVER used as event_url
      ticketing_numeric_id: ticketingNumericId ?? null, // third-party vendor id — NEVER used as source_record_id
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
 * Convert a list of discovery records into Observations, sharing one
 * retrieval-metadata object across all of them.
 */
export function toObservations(records, options = {}) {
  return records.map((record) => toObservation(record, options));
}
