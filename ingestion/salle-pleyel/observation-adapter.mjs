// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Salle Pleyel observation
// mapping. See ./discovery.mjs and
// research/source-investigations/salle-pleyel-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "salle-pleyel-paris";

function deriveDateTime(detail) {
  const dt = emptyDateTime();
  if (!detail?.date) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  dt.raw = detail.time ? `${detail.date}UTC${detail.time}` : detail.date;
  dt.date = detail.date;
  // This source's own attribute literally spells "UTC", but this was NOT
  // independently confirmed to be a genuine UTC instant within this
  // bounded investigation (a French concert at 20:00 local is far more
  // consistent with Europe/Paris local time than true UTC) — recorded
  // honestly as FLOATING_LOCAL rather than trusting the source's own
  // label at face value, matching this project's documented precedent for
  // exactly this kind of site-side offset/label quirk.
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

function derivePriceText(detail) {
  if (!detail?.lowPrice && !detail?.highPrice) return null;
  const currency = detail.priceCurrency === "EURO" ? "EUR" : detail.priceCurrency ?? "";
  if (detail.lowPrice && detail.highPrice && detail.lowPrice !== detail.highPrice) {
    return `${detail.lowPrice}-${detail.highPrice} ${currency}`.trim();
  }
  return `${detail.lowPrice ?? detail.highPrice} ${currency}`.trim();
}

const SLUG_RE = /\/evenement\/([a-z0-9-]+)\/?$/;

export function toObservation({ pageUrl, detail }, { retrievedAt, fixturePath } = {}) {
  if (typeof pageUrl !== "string" || pageUrl.trim() === "") {
    throw new Error("toObservation requires pageUrl");
  }
  const slugMatch = SLUG_RE.exec(pageUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /evenement/{slug}/ shape: ${pageUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own WordPress permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: pageUrl,
    content_type: "text/html",

    title: detail?.title ?? null,
    description: null,

    start: deriveDateTime(detail),
    end: emptyDateTime(), // NOT_PRESENT — this source's own detail page never distinguishes a separate end time

    venue_name: "Salle Pleyel", // single-venue source, resolved by source_id
    location_text: null,

    price_text: derivePriceText(detail),
    event_url: pageUrl,

    source_fields: {
      ticket_url: detail?.ticketUrl ?? null, // the venue's own first-party ticketing subdomain, tickets.sallepleyel.com
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
