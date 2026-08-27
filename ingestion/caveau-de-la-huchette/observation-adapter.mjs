// caveau-de-la-huchette-paris-01 — adapts extractResidencyCards() output
// (discovery.mjs) into this project's canonical Observation shape. See
// ingestion/observation/contract.mjs and
// research/source-investigations/caveau-de-la-huchette-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "caveau-de-la-huchette-paris";

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveDateTime(dateStr) {
  const dt = emptyDateTime();
  dt.raw = dateStr;
  dt.date = dateStr;
  // This source states no time-of-day per booking at all — only a
  // page-level, generically-recurring set-time schedule that differs by
  // weekday/weekend (see investigation.json's field_assessment.time
  // notes) — never promoted to a precise per-record value here.
  dt.certainty = "DATE_ONLY";
  return dt;
}

/**
 * `monthPageUrl` is this booking's own month page (the only page/URL this
 * source ever exposes for it — there is no per-booking detail page or
 * permalink).
 */
export function toObservation(card, { retrievedAt, fixturePath, monthPageUrl } = {}) {
  if (!card?.title || !card?.startDate) {
    throw new Error("toObservation requires card.title and card.startDate");
  }
  if (!monthPageUrl) {
    throw new Error("toObservation requires options.monthPageUrl");
  }

  return createObservation({
    source_id: SOURCE_ID,
    // This source declares no ID for a booking at all (no per-event
    // permalink, no data attribute) — an alternative, deterministic
    // identity strategy is used instead: a slug of the act's own stated
    // name combined with its own start date, both directly retained
    // fields. Documented honestly as NOT PROVEN by the source itself; see
    // investigation.json's field_assessment.source_record_id.notes.
    source_record_id: `${slugify(card.title)}-${card.startDate}`,
    retrieved_at: retrievedAt ?? null,

    source_url: monthPageUrl,
    content_type: "text/html",

    title: card.title,
    description: null,

    start: deriveDateTime(card.startDate),
    end: card.endDate && card.endDate !== card.startDate ? deriveDateTime(card.endDate) : emptyDateTime(),

    // NOT_PRESENT — this single-venue source never states its own name or
    // address as a discrete field anywhere on the month page; matches
    // this project's existing single-venue-per-source precedent (see
    // research/source-investigations/badehaus-berlin-01/).
    venue_name: null,
    location_text: null,

    // NOT_PRESENT — no price/tarif/"gratuit" text appears anywhere on
    // this page.
    price_text: null,
    event_url: monthPageUrl, // no per-booking detail URL exists on this source

    source_fields: {},

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
