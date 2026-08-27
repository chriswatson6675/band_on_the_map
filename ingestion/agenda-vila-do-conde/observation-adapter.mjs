// Converts genuinely retrieved Agenda Vila do Conde repeater-fetch event
// records (ingestion/agenda-vila-do-conde/client.mjs's
// filterConcertoRecords()/parseFetchResponse()) into the generic
// Observation contract (ingestion/observation/contract.mjs).
//
// Source: Agenda Vila do Conde, a NEW candidate — sources/porto.json's
// existing "agenda-vila-do-conde" entry is not edited by this module; per
// docs/SOURCE_INVESTIGATION_POLICY.md, turning this READY_FOR_ACTIVATION
// investigation into an active registry entry is a separate, explicitly-
// authorised action outside this collector-building task's scope.
//
// Built ENTIRELY from the already-retained, READY_FOR_ACTIVATION
// investigation at
// research/source-investigations/agenda-vila-do-conde-01/investigation.json.
// Every mapping decision below cites that investigation's own
// field_assessment rather than inventing a stronger guarantee:
//
//   - start: `datetime_start_date` carries a trailing "Z" (UTC) suffix
//     that this investigation's own retained evidence PROVES is NOT a
//     genuine UTC instant — it is a floating Europe/Lisbon wall-clock
//     time (cross-confirmed 4/4 against the independent free-text
//     `text_datas_em_texto` field; Portugal is UTC+1/WEST in August, so a
//     literal Z-as-UTC reading would be one hour later than the
//     independently-stated local time). This adapter therefore NEVER sets
//     `is_utc: true` / `certainty: "UTC_INSTANT"` for this field, no
//     matter how "obviously UTC" the trailing Z looks. Per-record, it
//     independently re-runs the same cross-check this investigation used
//     (never blanket-trusting the whole source): when the ISO field's own
//     hour:minute matches the free-text field's stated hour:minute, the
//     full floating local date+time is honestly `certainty:
//     "FLOATING_LOCAL"` (matching field_assessment.time's own "floating
//     local (Europe/Lisbon wall-clock time)" language and
//     collector_assessment.blockers' instruction to treat it as such);
//     when it does not (or the free-text field is absent/malformed), only
//     the calendar date is trusted (`certainty: "DATE_ONLY"`) — the same
//     degrade this investigation itself would apply to a record it could
//     not cross-confirm (see its own contrasting "messy" non-Concerto
//     record). `iso` is always left null (never a fabricated resolved-UTC
//     instant); `is_utc` is explicitly `false` once the "Z" suffix is
//     read (a positively-proven negative, not an unknown). `tzid` is left
//     null: Europe/Lisbon is this investigation's own cross-confirmed
//     reading, but the source itself never declares a machine-readable
//     timezone identifier anywhere on the record, so none is invented
//     here either.
//   - end: field_assessment.end.state is "NOT_PRESENT" — the source's own
//     `datetime_end_date` field is proven to be an unreliable "listing
//     still active until"/creation-adjacent bookkeeping value, not a real
//     event-end time (one Concerto record even carries end == start). This
//     adapter deliberately does NOT derive an `end` datetime from it; the
//     raw value is retained only as informational provenance in
//     `source_fields.datetime_end_date_raw`, never promoted into `end`.
//   - venue_name / location_text: field_assessment.venue_location is
//     PROVEN but honestly only a free-text label (`text_local`) — no
//     structured venue reference, address, or coordinates exist on the
//     record (`ref_local` is null, `text_morada` is empty on every
//     sampled record). `venue_name` therefore stays null; `location_text`
//     is set to `text_local.all` directly, with no canonical venue name
//     invented. Venue resolution is this project's own separate
//     venue-matching step (docs/ARCHITECTURE.md), not this adapter's job.
//   - source_record_id: this source's own permalink slug (`_slug.all`),
//     matching field_assessment.source_record_id's own chosen value
//     (proven empirically stable two independent ways: a repeat
//     repeater-fetch request, and a live permalink resolution) — NOT the
//     internal `id` field, which is retained only as provenance in
//     `source_fields.internal_id`.
//   - event_url: deterministically constructed as
//     https://agenda.cm-viladoconde.pt/en/evento/{slug}/, the exact
//     pattern field_assessment.event_url proved resolves live (200 OK,
//     matching page <title>).
//   - price_text: derived honestly from TWO real, direct fields, in the
//     order this investigation itself established provenance for: (1)
//     `text_price` when genuinely non-empty (a direct first-party amount
//     string, e.g. "3€" — used verbatim, never reformatted/parsed into a
//     number this project cannot verify), else (2) "FREE" only when the
//     separate, independent `ref_tags_2o_nivel` admission-type field
//     resolves (via the response's own `related` map) to the literal
//     "Entrada Gratuita" title — deliberately NOT inferred from an empty
//     `text_price` alone (see field_assessment.price's own explicit
//     warning against that AI-plausibility trap). Anything else is
//     honestly null, never guessed.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";
import { FREE_ADMISSION_TAG_TITLE, resolveTagTitle } from "./client.mjs";

export const SOURCE_ID = "agenda-vila-do-conde";

const DEFAULT_CONTENT_TYPE = "application/json; charset=utf-8";
const EVENT_DETAIL_BASE_URL = "https://agenda.cm-viladoconde.pt/en/evento/";

// Matches "2026-08-28T22:00:00.000Z" / "2026-08-28T22:00:00Z" style
// values — this source's own `datetime_start_date` shape, whose trailing
// "Z" this investigation proved is NOT genuine UTC (see module doc
// comment above). Captures the calendar date and the hour:minute this
// field itself states, for the independent free-text cross-check below.
const SOURCE_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d+)?Z$/;

// Matches this source's own free-text local-time field shape, e.g.
// "22h00" (evidence/body-repeater-fetch.json's `text_datas_em_texto`).
const LOCAL_TEXT_TIME_RE = /^(\d{1,2})h(\d{2})$/;

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function localizedText(field) {
  return field && typeof field === "object" ? nonEmptyString(field.all) : null;
}

/**
 * Parse this source's own `datetime_start_date` text against the
 * confirmed-NOT-UTC shape, independently cross-checking it against the
 * record's own `text_datas_em_texto` free-text field (the exact
 * per-record cross-check this investigation used to prove the "Z" suffix
 * is not genuine UTC — see module doc comment). Exported for direct unit
 * testing.
 *
 * Returns `{ date, hour, minute, crossConfirmed }`, or null if
 * `datetime_start_date` does not match the source's own proven shape at
 * all (never guessed).
 */
export function parseFloatingLocalStart(record) {
  const raw = record?.datetime_start_date;
  if (typeof raw !== "string") return null;
  const match = SOURCE_DATETIME_RE.exec(raw.trim());
  if (!match) return null;

  const [, date, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);

  const localText = localizedText(record?.text_datas_em_texto);
  const localMatch = localText ? LOCAL_TEXT_TIME_RE.exec(localText) : null;
  const crossConfirmed = localMatch !== null && Number(localMatch[1]) === hour && Number(localMatch[2]) === minute;

  return { date, hour, minute, crossConfirmed };
}

function deriveStart(record) {
  const dt = emptyDateTime();
  dt.raw = record?.datetime_start_date ?? null;

  const parsed = parseFloatingLocalStart(record);
  if (!parsed) {
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }

  dt.date = parsed.date;
  // Positively proven NOT a genuine UTC instant (this investigation's own
  // retained evidence disproves the trailing "Z") — an established
  // negative, not an unknown, so `false` rather than leaving this null.
  dt.is_utc = false;
  // `iso` deliberately stays null: no confirmed-UTC resolved instant
  // exists to report, and this adapter does not fabricate one.
  dt.certainty = parsed.crossConfirmed ? "FLOATING_LOCAL" : "DATE_ONLY";
  return dt;
}

function derivePriceText(record, related) {
  const priceText = localizedText(record?.text_price);
  if (priceText) return priceText;

  const admissionTitle = resolveTagTitle(record?.ref_tags_2o_nivel, related);
  return admissionTitle === FREE_ADMISSION_TAG_TITLE ? "FREE" : null;
}

/**
 * Convert one retrieved (and already Concerto-tag-filtered) repeater
 * record into an Observation. `related` must be the SAME response's own
 * `related` lookup map (ingestion/agenda-vila-do-conde/client.mjs's
 * parseFetchResponse() return value) so tag titles resolve correctly.
 */
export function toObservation(record, { related, retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  const slug = localizedText(record?._slug);
  if (!slug) {
    throw new Error("toObservation requires a record with a non-empty _slug.all");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slug,
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: localizedText(record?._title),
    description: null, // not requested/promoted by this adapter — text_sinopse is retained in source_fields only

    start: deriveStart(record),
    // Deliberately NOT derived from datetime_end_date — see module doc
    // comment. field_assessment.end is NOT_PRESENT; the raw value is
    // retained only as informational provenance in source_fields below.
    end: emptyDateTime(),

    venue_name: null, // no structured venue reference on this record (ref_local is null) — never fabricated
    location_text: localizedText(record?.text_local),

    price_text: derivePriceText(record, related),

    event_url: `${EVENT_DETAIL_BASE_URL}${slug}/`,

    source_fields: {
      internal_id: nonEmptyString(record?.id),
      slug,
      text_datas_em_texto: localizedText(record?.text_datas_em_texto),
      text_price: localizedText(record?.text_price),
      text_morada: localizedText(record?.text_morada),
      ref_tags_1o_nivel_title: resolveTagTitle(record?.ref_tags_1o_nivel, related),
      ref_tags_2o_nivel_title: resolveTagTitle(record?.ref_tags_2o_nivel, related),
      datetime_end_date_raw: nonEmptyString(record?.datetime_end_date),
      link_link: localizedText(record?.link_link),
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // parsed from a shared, multi-record repeater response, not a per-record raw response
    },
  });
}

/**
 * Convert every record already Concerto-filtered from one repeater-fetch
 * page (ingestion/agenda-vila-do-conde/client.mjs's
 * filterConcertoRecords()) into Observations, sharing one `related` map,
 * retrieval timestamp, source URL, and fixture path.
 */
export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
