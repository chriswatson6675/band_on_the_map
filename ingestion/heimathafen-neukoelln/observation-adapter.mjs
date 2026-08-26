// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Heimathafen
// Neukölln's own bespoke field mapping over its own generic WordPress
// wp/v2 REST 'events' custom-post-type response, enriched with Advanced
// Custom Fields (ACF) — see
// research/source-investigations/heimathafen-neukoelln-berlin-01/. This
// is NOT the same response shape as ingestion/events-calendar-api/ (that
// family is written specifically for the Tribe 'The Events Calendar'
// plugin's own tribe/events/v1 shape); wp/v2 + ACF field NAMES are
// entirely site-specific (a different WordPress site's own ACF field
// group would use different key names), so this adapter is genuinely
// bespoke to this source, not a new generic family.
//
// Date parsing: this source's own 'performance_date_time' field is a
// free-text "<A>/<B>/<YYYY> h:mm a.m./p.m." string. The governed
// investigation mechanically proved (DETERMINISTIC_CONTEXT, citing three
// other retained sample values whose first number exceeds 12) that this
// field's own consistent convention is <month>/<day>/<year> — see
// research/source-investigations/heimathafen-neukoelln-berlin-01/investigation.json's
// field_assessment.start_date.derivation. This module implements exactly
// that proven rule, not a new guess.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "heimathafen-neukoelln-berlin";

const PERFORMANCE_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) (a\.m\.|p\.m\.)$/i;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Parse this source's own "<month>/<day>/<year> h:mm a.m./p.m." free-text
 * field into a DATE_ONLY certainty datetime (never upgraded to a UTC/
 * local instant — no timezone is stated by the source, only a local
 * wall-clock hour). Returns TEXT_ONLY for anything not matching this
 * exact, source-proven shape rather than guessing.
 */
export function deriveDateTimeFromPerformanceText(rawValue) {
  const dt = emptyDateTime();
  dt.raw = rawValue ?? null;
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  const match = PERFORMANCE_DATE_RE.exec(rawValue.trim());
  if (!match) {
    dt.certainty = "TEXT_ONLY";
    return dt;
  }
  const [, month, day, year, hour12Raw, minute, meridiem] = match;
  let hour = Number(hour12Raw) % 12;
  if (meridiem.toLowerCase() === "p.m.") hour += 12;
  dt.date = `${year}-${pad2(month)}-${pad2(day)}`;
  // A floating local wall-clock time (no stated timezone) — recorded
  // honestly as FLOATING_LOCAL, never assumed to be UTC or CET/CEST.
  dt.certainty = "FLOATING_LOCAL";
  dt.raw = `${rawValue} (parsed as ${dt.date}T${pad2(hour)}:${minute} local)`;
  return dt;
}

function stripHtmlEntitiesAndTags(value) {
  if (typeof value !== "string") return null;
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .trim() || null;
}

/**
 * Convert one raw wp/v2 'events' post-type record into ONE Observation
 * per performance date (a WordPress event post may list more than one
 * performance in acf.event_performances[] — each is a genuinely distinct
 * occurrence, not a duplicate).
 */
export function toObservations(record, { retrievedAt, fixturePath } = {}) {
  if (!record?.id) {
    throw new Error("toObservations requires record.id");
  }
  const performances = Array.isArray(record.acf?.event_performances) ? record.acf.event_performances : [];
  const title = stripHtmlEntitiesAndTags(record.title?.rendered);
  const price = record.acf?.event_prices?.[0]
    ? `${record.acf.event_prices[0].event_prices_label ?? ""} ${record.acf.event_prices[0].event_prices_price ?? ""}`.trim()
    : null;

  return performances.map((performance, index) =>
    createObservation({
      source_id: SOURCE_ID,
      // Composite id: this source's own stable WordPress post id, plus a
      // 0-based performance index — necessary because one post may state
      // more than one real performance date, each a distinct occurrence.
      source_record_id: `${record.id}-${index}`,
      retrieved_at: retrievedAt ?? null,

      source_url: record.link ?? null,
      content_type: "application/json",

      title,
      description: stripHtmlEntitiesAndTags(record.content?.rendered)?.slice(0, 500) ?? null,

      start: deriveDateTimeFromPerformanceText(performance.performance_date_time),
      end: emptyDateTime(), // NOT_PRESENT on this source's own field shape

      venue_name: "Heimathafen Neukölln",
      location_text: null,

      price_text: price,
      event_url: performance.performance_ticket ?? record.link ?? null,

      source_fields: {
        wp_post_id: record.id,
        slug: record.slug ?? null,
        performance_description: performance.performance_description ?? null,
        performance_status: performance.performance_status ?? null,
      },

      raw_evidence: {
        fixture_path: fixturePath ?? null,
        evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
        content_type: "application/json",
        byte_faithful: true,
      },
    }),
  );
}

/**
 * Adapt every record from one wp/v2/events page fetch into Observations,
 * flattening each record's own possibly-multiple performances.
 */
export function toObservationsBatch(records, options = {}) {
  return (records ?? []).flatMap((record) => toObservations(record, options));
}
