// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Bataclan's own bespoke
// field mapping over its decoded Nuxt payload event records (see
// ./discovery.mjs). See research/source-investigations/le-bataclan-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "le-bataclan-paris";
export const VENUE_NAME = "Bataclan";

function deriveStartDateTime(attributes) {
  const dt = emptyDateTime();
  dt.raw = attributes?.date ?? null;
  if (typeof attributes?.date !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(attributes.date)) {
    dt.certainty = attributes?.date ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.iso = attributes.date;
  dt.date = attributes.date.slice(0, 10);
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

function derivePriceText(meetings) {
  const meeting = Array.isArray(meetings) ? meetings[0] : null;
  if (!meeting || meeting.price_min == null || meeting.price_max == null) return null;
  const min = Number(meeting.price_min);
  const max = Number(meeting.price_max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  // Currency is not carried on a dedicated field on this source's own
  // record — EUR is corroborated (not merely assumed) by this exact
  // record's own free-text description repeating the same numeric amounts
  // next to a "€" symbol (see investigation.json field_assessment.price).
  return min === max ? `${min.toFixed(2)} EUR` : `${min.toFixed(2)}-${max.toFixed(2)} EUR`;
}

export function toObservation(record, { retrievedAt, fixturePath } = {}) {
  const attributes = record?.attributes;
  if (record?.id == null) {
    throw new Error("toObservation requires record.id");
  }
  if (!attributes) {
    throw new Error("toObservation requires record.attributes");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.id), // this source's own CMS record primary key, directly exposed on every record
    retrieved_at: retrievedAt ?? null,

    source_url: attributes.ticketingUrl ?? null,
    content_type: "application/json",

    title: attributes.title ?? null,
    description: null,

    start: deriveStartDateTime(attributes),
    // 'dateEnd' is present but, per this investigation's own honest
    // assessment (comparing single-day vs. multi-meeting records), was
    // found to duplicate 'date' for the overwhelming majority of records
    // and its meaning for the remainder is unproven — never promoted to a
    // claimed performance 'end' fact.
    end: emptyDateTime(),

    venue_name: VENUE_NAME,
    location_text: null,

    price_text: derivePriceText(attributes.meetings),
    // This source's own 'ticketingUrl' is hosted at billetterie.bataclan.fr
    // — a first-party subdomain of this same venue's own official domain,
    // stated directly on every record; not a third-party aggregator.
    event_url: attributes.ticketingUrl ?? null,

    source_fields: {
      cms_uid: attributes.uid ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/json",
      byte_faithful: false,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
